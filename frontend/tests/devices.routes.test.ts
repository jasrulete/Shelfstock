import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../server/db';
import { createApp } from '../server/app';
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
  // Scoped to the caller's own row. Unscoped, any admin could unregister
  // another admin's device just by presenting its token, which silently turns
  // off someone else's order alerts.
  it('deletes only the calling admin\'s copy of the token', async () => {
    const res = await request(app)
      .delete('/api/devices/ExponentPushToken%5Babc123%5D')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);

    expect(res.status).toBe(200);
    expect(poolQuery.mock.calls[0][0]).toMatch(/user_id\s*=\s*\$2/);
    expect(poolQuery.mock.calls[0][1]).toEqual(['ExponentPushToken[abc123]', 1]);
  });
});
