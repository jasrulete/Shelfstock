import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// Typed arguments, so `mock.calls[0][1]` is known to be the link rather than
// an element of an empty tuple.
const sendPasswordReset = vi.fn(async (_to: string, _link: string, _minutes: number) => true);
vi.mock('../server/mail', () => ({
  sendPasswordReset: (to: string, link: string, minutes: number) =>
    sendPasswordReset(to, link, minutes),
  sendOrderConfirmation: vi.fn(async () => true),
  sendOrderShipped: vi.fn(async () => true),
  sendWinback: vi.fn(async () => true),
  sendEmail: vi.fn(async () => true),
}));

import { pool } from '../server/db';
import { createApp } from '../server/app';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

// Rebuilt per test: the auth endpoints share a 20-per-window rate limiter whose
// counter lives in the app instance.
let app: ReturnType<typeof createApp>;

const USER = { id: 7, email: 'shopper@example.com', role: 'customer' };

/** Finds the first query whose SQL contains `fragment`. */
function call(fragment: string) {
  return poolQuery.mock.calls.find(([sql]) => (sql as string).includes(fragment));
}

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
  sendPasswordReset.mockClear();
  app = createApp();
});

describe('POST /api/auth/forgot-password', () => {
  // The whole point of this endpoint is that it must not become an oracle for
  // "does this person shop here". Both answers have to be indistinguishable.
  it('answers identically whether or not the address is registered', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [USER] });
    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'shopper@example.com' });

    app = createApp();
    vi.clearAllMocks();
    poolQuery.mockResolvedValue({ rows: [] });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
  });

  it('sends no mail and writes no token for an unknown address', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(sendPasswordReset).not.toHaveBeenCalled();
    expect(call('INSERT INTO password_resets')).toBeUndefined();
  });

  it('stores only a hash of the token, never the token itself', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [USER] });

    await request(app).post('/api/auth/forgot-password').send({ email: USER.email });

    const insert = call('INSERT INTO password_resets')!;
    expect(insert).toBeDefined();

    // The link that was emailed carries the raw token.
    const link = sendPasswordReset.mock.calls[0][1] as string;
    const rawToken = new URL(link).searchParams.get('token')!;
    expect(rawToken.length).toBeGreaterThan(20);

    const stored = (insert[1] as string[])[1];
    expect(stored).not.toBe(rawToken);
    expect(stored).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
  });

  it('invalidates any outstanding tokens before issuing a new one', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [USER] });

    await request(app).post('/api/auth/forgot-password').send({ email: USER.email });

    expect(call('UPDATE password_resets')).toBeDefined();
  });

  it('normalizes the address, so a differently-cased email still resets', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [USER] });

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: '  SHOPPER@Example.COM ' });

    expect(poolQuery.mock.calls[0][1]).toEqual(['shopper@example.com']);
  });

  it('rejects a non-string email with 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 42 });

    expect(res.status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/reset-password', () => {
  const rawToken = 'a'.repeat(43);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();

  it('rejects an unknown token', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'new-password1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This reset link is invalid or has expired');
    expect(call('UPDATE users SET password_hash')).toBeUndefined();
  });

  // Same message for expired as for unknown: telling them apart would confirm
  // a token once existed.
  it('rejects an expired token with the same message as an unknown one', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, user_id: USER.id, token_hash: tokenHash, expires_at: past, used_at: null }],
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'new-password1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This reset link is invalid or has expired');
    expect(call('UPDATE users SET password_hash')).toBeUndefined();
  });

  it('refuses a token that has already been used', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          user_id: USER.id,
          token_hash: tokenHash,
          expires_at: future,
          used_at: new Date().toISOString(),
        },
      ],
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'new-password1' });

    expect(res.status).toBe(400);
    expect(call('UPDATE users SET password_hash')).toBeUndefined();
  });

  it('enforces the same minimum password length as registration', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Password must be at least 8 characters');
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('looks the token up by hash, never by the raw value', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'new-password1' });

    const lookup = poolQuery.mock.calls[0];
    expect(lookup[1]).toEqual([tokenHash]);
    expect(JSON.stringify(lookup[1])).not.toContain(rawToken);
  });

  it('stores a bcrypt hash of the new password and burns the token', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, user_id: USER.id, token_hash: tokenHash, expires_at: future, used_at: null }],
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'new-password1' });

    expect(res.status).toBe(200);

    const update = call('UPDATE users SET password_hash')!;
    const storedHash = (update[1] as string[])[0];
    expect(storedHash).not.toBe('new-password1');
    expect(storedHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('new-password1', storedHash)).toBe(true);

    // Single use.
    expect(call('SET used_at')).toBeDefined();
  });
});
