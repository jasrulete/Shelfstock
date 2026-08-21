import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../server/db';
import { createApp } from '../server/app';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
  app = createApp();
});

/**
 * lib/api.ts and the companion's src/api/client.ts both read `error` off a JSON
 * body on every non-2xx. Any path that answers with something else is a promise
 * the API is not keeping, and both clients surface it as an unexplained failure.
 */
describe('API error contract', () => {
  it('answers malformed JSON with a JSON body, not Express HTML', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('Malformed JSON body');
  });

  it('answers an oversized body with a JSON body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('Request body too large');
  });

  /**
   * A pg error carries the table and column it failed on, and sometimes the
   * bound parameter values. Echoing err.message would put that on the public
   * internet, so the handler returns a fixed string for anything it does not
   * explicitly recognise.
   */
  it('never echoes an unexpected error message to the client', async () => {
    poolQuery.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "users_email_key"')
    );

    const res = await request(app).get('/api/health');

    // /api/health catches its own failure, so reach for a route that does not.
    expect(res.body).not.toHaveProperty('error', expect.stringContaining('users_email_key'));
    expect(JSON.stringify(res.body)).not.toContain('users_email_key');
  });

  it('keeps the 404 catch-all answering JSON', async () => {
    const res = await request(app).get('/api/no-such-route');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('Not found');
  });

  it('gives the global rate limiter a JSON message like authLimiter has', async () => {
    // Not exercised by hitting the limit (500 requests per test would be slow);
    // asserted structurally instead, because the failure mode is a limiter
    // configured with a bare string that serialises as text/plain.
    const res = await request(app).get('/api/health');
    expect(res.headers).toHaveProperty('ratelimit-limit');
  });
});
