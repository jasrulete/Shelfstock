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

/** Makes pool.query answer the COUNT query and the data query for GET /api/products. */
function primeList(total: number, rows: unknown[] = []) {
  poolQuery.mockImplementation(async (sql: string) =>
    sql.includes('COUNT(*)') ? { rows: [{ total }] } : { rows }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('GET /api/products (pagination)', () => {
  it('defaults to page 1 with limit 12 and offset 0', async () => {
    primeList(30);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    const dataCall = poolQuery.mock.calls[1];
    // Last two placeholders are LIMIT then OFFSET.
    expect(dataCall[1].slice(-2)).toEqual([12, 0]);
    expect(res.body.pagination).toEqual({ page: 1, limit: 12, total: 30, totalPages: 3 });
  });

  it('caps limit at 100 and computes OFFSET from the capped value', async () => {
    primeList(500);

    const res = await request(app).get('/api/products?page=3&limit=250');

    expect(res.status).toBe(200);
    const dataCall = poolQuery.mock.calls[1];
    expect(dataCall[1].slice(-2)).toEqual([100, 200]); // limit 100, offset (3-1)*100
    expect(res.body.pagination.limit).toBe(100);
    expect(res.body.pagination.totalPages).toBe(5);
  });
});

describe('GET /api/products (filtering and sorting)', () => {
  it('passes search and category as bound parameters, never interpolated', async () => {
    primeList(1);

    await request(app).get('/api/products?search=mug&category=Kitchen');

    const [countSql, countValues] = poolQuery.mock.calls[0];
    expect(countSql).toContain('name ILIKE $1');
    expect(countSql).toContain('category = $2');
    // The route later pushes limit/offset onto this same array, so only
    // check the filter values at the front.
    expect(countValues.slice(0, 2)).toEqual(['%mug%', 'Kitchen']);
  });

  it('ignores sort columns outside the whitelist (no SQL injection via sort)', async () => {
    primeList(0);

    await request(app).get(
      `/api/products?sort=${encodeURIComponent('stock; DROP TABLE products')}&order=asc`
    );

    const dataSql = poolQuery.mock.calls[1][0] as string;
    expect(dataSql).toContain('ORDER BY created_at ASC');
    expect(dataSql).not.toContain('DROP TABLE');
  });

  it('honors a whitelisted sort column and direction', async () => {
    primeList(0);

    await request(app).get('/api/products?sort=price&order=asc');

    expect(poolQuery.mock.calls[1][0]).toContain('ORDER BY price ASC');
  });
});

describe('GET /api/products/:id', () => {
  it('returns 404 for a non-numeric id without ever querying the database', async () => {
    const res = await request(app).get('/api/products/12abc');

    expect(res.status).toBe(404);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('returns the product when found', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ id: 5, name: 'Mug', price: '9.99' }] });

    const res = await request(app).get('/api/products/5');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 5, name: 'Mug' });
    expect(poolQuery.mock.calls[0][1]).toEqual([5]);
  });
});

describe('product write endpoints (admin-gated validation)', () => {
  it('rejects an unauthenticated create with 401', async () => {
    const res = await request(app).post('/api/products').send({ name: 'X', price: 1, category: 'c' });

    expect(res.status).toBe(401);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('rejects a non-admin create with 403', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${tokenFor(3, 'customer')}`)
      .send({ name: 'X', price: 1, category: 'c' });

    expect(res.status).toBe(403);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('rejects a create missing required fields with 400', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ description: 'no name, price, or category' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name, price, and category are required');
  });

  it('rejects a negative price with 400', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ name: 'Mug', price: -5, category: 'Kitchen' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('price must be a non-negative number');
  });

  it('rejects a negative or fractional stock update with 400 (stock can never go below 0)', async () => {
    const negative = await request(app)
      .put('/api/products/5')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ stock: -3 });
    const fractional = await request(app)
      .put('/api/products/5')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ stock: 2.5 });

    expect(negative.status).toBe(400);
    expect(fractional.status).toBe(400);
    expect(negative.body.error).toBe('stock must be a non-negative whole number');
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
