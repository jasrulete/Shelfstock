import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../src/db';
import { createApp } from '../src/app';
import { tokenFor } from './helpers';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;
const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('POST /api/devices', () => {
  it('upserts the token for the authed admin', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ token: 'ExponentPushToken[abc123]' });

    expect(res.status).toBe(201);
    const [sql, values] = poolQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO device_tokens');
    expect(sql).toContain('ON CONFLICT');
    expect(values).toEqual([1, 'ExponentPushToken[abc123]']);
  });

  it('400s without a token string', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('403s for non-admins', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${tokenFor(2, 'customer')}`)
      .send({ token: 'ExponentPushToken[abc123]' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/devices/:token', () => {
  it('deletes the token', async () => {
    const res = await request(app)
      .delete('/api/devices/ExponentPushToken%5Babc123%5D')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);

    expect(res.status).toBe(200);
    expect(poolQuery.mock.calls[0][1]).toEqual(['ExponentPushToken[abc123]']);
  });
});
