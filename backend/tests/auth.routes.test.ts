import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

vi.mock('../src/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../src/db';
import { createApp } from '../src/app';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
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
