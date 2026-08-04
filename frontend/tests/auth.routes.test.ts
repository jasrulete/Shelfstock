import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../server/db';
import { createApp } from '../server/app';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

// Rebuilt per test rather than once for the file. The auth endpoints are rate
// limited to 20 attempts per window, and express-rate-limit keeps its counter
// in the app instance - so with a shared app the tests near the bottom of the
// file start getting 429s once the ones above it have used the budget up.
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
  app = createApp();
});

describe('POST /api/auth/register', () => {
  it('rejects a missing password with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('email and password are required');
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Password must be at least 8 characters');
  });

  // Every order this store places sends mail to the address given here. An
  // address that cannot receive it is not a smaller problem than a missing
  // one - it fails later, silently, and forever.
  it.each([
    ['no @ at all', 'asdf'],
    ['nothing before the @', '@example.com'],
    ['nothing after the @', 'user@'],
    ['no dot in the domain', 'user@example'],
    ['a bare trailing dot', 'user@example.'],
    ['an internal space', 'us er@example.com'],
    ['two @ signs', 'user@@example.com'],
    // Both are ordinary typing slips that produce a permanently undeliverable
    // address, which is the exact failure this rule exists to prevent.
    ['a leading dot in the domain', 'user@.example.com'],
    ['a doubled dot in the domain', 'user@example..com'],
  ])('rejects an address with %s', async (_label, email) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Enter a valid email address');
    // Rejected before the duplicate-check query, like the other 400s here.
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('rejects an address longer than the 254 characters SMTP allows', async () => {
    const email = `${'a'.repeat(250)}@example.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Enter a valid email address');
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['a plain address', 'user@example.com'],
    ['a plus tag', 'user+orders@example.com'],
    ['a subdomain', 'user@mail.example.co.uk'],
    ['a hyphenated domain', 'user@my-shop.example.com'],
  ])('accepts %s', async (_label, email) => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 1, email, password_hash: 'h', role: 'customer', created_at: 'x' }],
      });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123' });

    expect(res.status).toBe(201);
  });

  it('validates the trimmed address, not the raw one', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            email: 'user@example.com',
            password_hash: 'h',
            role: 'customer',
            created_at: 'x',
          },
        ],
      });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: '   user@example.com  ', password: 'password123' });

    expect(res.status).toBe(201);
  });

  it('returns 409 when the email is already registered', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'taken@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('An account with that email already exists');
  });

  it('normalizes the email, stores a bcrypt hash, and returns a valid token', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] }) // duplicate check
      .mockResolvedValueOnce({
        rows: [
          {
            id: 12,
            email: 'new@example.com',
            password_hash: 'stored-hash',
            role: 'customer',
            created_at: '2026-01-01',
          },
        ],
      });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: '  New@Example.COM ', password: 'password123' });

    expect(res.status).toBe(201);

    // The INSERT must use the trimmed, lowercased email and a bcrypt hash,
    // never the plaintext password.
    const insertParams = poolQuery.mock.calls[1][1] as string[];
    expect(insertParams[0]).toBe('new@example.com');
    expect(insertParams[1]).not.toBe('password123');
    expect(insertParams[1]).toMatch(/^\$2[aby]\$/);

    // Response exposes only public fields and a verifiable token.
    expect(res.body.user).toEqual({ id: 12, email: 'new@example.com', role: 'customer' });
    expect(res.body.user.password_hash).toBeUndefined();
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET as string) as any;
    expect(payload).toMatchObject({ userId: 12, role: 'customer' });
  });
});

describe('POST /api/auth/login', () => {
  it('rejects non-string credentials with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com' });

    expect(res.status).toBe(400);
  });

  // Registration validates the format; login deliberately does not. Accounts
  // created before that rule existed have addresses that would fail it, and
  // locking those people out of their own order history would be a worse bug
  // than the one the rule fixes. They get the normal 401 path instead.
  it('still lets an account with a legacy malformed email sign in', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    poolQuery.mockResolvedValueOnce({
      rows: [{ id: 7, email: 'asdf', password_hash: hash, role: 'customer' }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'asdf', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 7, email: 'asdf', role: 'customer' });
  });

  it('returns the same 401 message for an unknown email as for a wrong password', async () => {
    // Unknown email
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'whatever1' });

    // Known email, wrong password
    const hash = await bcrypt.hash('correct-password', 4);
    poolQuery.mockResolvedValueOnce({
      rows: [{ id: 5, email: 'real@example.com', password_hash: hash, role: 'customer' }],
    });
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .send({ email: 'real@example.com', password: 'wrong-password' });

    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    // Identical messages so attackers can't enumerate registered emails.
    expect(unknown.body.error).toBe('Invalid email or password');
    expect(wrongPw.body.error).toBe(unknown.body.error);
  });

  it('logs in with correct credentials and never leaks the password hash', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    poolQuery.mockResolvedValueOnce({
      rows: [{ id: 5, email: 'real@example.com', password_hash: hash, role: 'admin' }],
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'Real@Example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    // Lookup uses the normalized email.
    expect(poolQuery.mock.calls[0][1]).toEqual(['real@example.com']);
    expect(res.body.user).toEqual({ id: 5, email: 'real@example.com', role: 'admin' });
    expect(res.body.user.password_hash).toBeUndefined();
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET as string) as any;
    expect(payload).toMatchObject({ userId: 5, role: 'admin' });
  });
});
