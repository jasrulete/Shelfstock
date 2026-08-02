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

describe('GET /api/products/low-stock (public storefront rail)', () => {
  it('excludes sold-out products and orders by scarcity', async () => {
    poolQuery.mockResolvedValue({ rows: [{ id: 2, name: 'Keyboard', stock: 3 }] });

    const res = await request(app).get('/api/products/low-stock');

    expect(res.status).toBe(200);
    const [sql] = poolQuery.mock.calls[0];
    // A "0 left" row has nothing to sell, so it must never reach the storefront.
    expect(sql).toContain('stock > 0');
    expect(sql).toContain('ORDER BY stock ASC');
    expect(res.body).toEqual([{ id: 2, name: 'Keyboard', stock: 3 }]);
  });

  it('binds threshold and limit, capping both', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    await request(app).get('/api/products/low-stock?threshold=999&limit=999');

    // threshold caps at 20, limit at 12 - an unbounded rail would let a query
    // string dump the whole catalogue onto the homepage.
    expect(poolQuery.mock.calls[0][1]).toEqual([20, 12]);
  });

  it('is not swallowed by the /:id route', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/products/low-stock');

    // If '/:id' were declared first, parseId('low-stock') would 404 this.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/products/:id (gallery)', () => {
  it('leads the gallery with the cover image, then extra angles in order', async () => {
    poolQuery.mockImplementation(async (sql: string) =>
      sql.includes('FROM product_images')
        ? { rows: [{ url: 'https://cdn/b.jpg' }, { url: 'https://cdn/c.jpg' }] }
        : { rows: [{ id: 1, name: 'Blocks', image_url: 'https://cdn/a.jpg' }] }
    );

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(200);
    expect(res.body.images).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg', 'https://cdn/c.jpg']);
    expect(poolQuery.mock.calls.find(([s]) => (s as string).includes('FROM product_images'))![0])
      .toContain('ORDER BY position ASC');
  });

  it('omits a null cover instead of leaving a hole at the front of the gallery', async () => {
    poolQuery.mockImplementation(async (sql: string) =>
      sql.includes('FROM product_images')
        ? { rows: [{ url: 'https://cdn/b.jpg' }] }
        : { rows: [{ id: 1, name: 'Blocks', image_url: null }] }
    );

    const res = await request(app).get('/api/products/1');

    expect(res.body.images).toEqual(['https://cdn/b.jpg']);
  });
});

describe('GET /api/products/:id/related', () => {
  it('excludes the product itself and anything sold out', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/products/3/related');

    expect(res.status).toBe(200);
    const [sql, values] = poolQuery.mock.calls[0];
    expect(sql).toContain('p.id <> $1');
    expect(sql).toContain('p.stock > 0');
    // A recommendation that lands on an out-of-stock page is a dead end.
    expect(values).toEqual([3, 4]);
  });

  it('caps the limit', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    await request(app).get('/api/products/3/related?limit=999');

    expect(poolQuery.mock.calls[0][1]).toEqual([3, 8]);
  });

  it('is not swallowed by the /:id route', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/products/3/related');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('product gallery writes', () => {
  it('rejects a non-array images payload', async () => {
    const res = await request(app)
      .put('/api/products/1')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ images: 'https://cdn/a.jpg' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('images must be an array');
  });

  it('caps the number of gallery images', async () => {
    const res = await request(app)
      .put('/api/products/1')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ images: Array.from({ length: 9 }, (_, i) => `https://cdn/${i}.jpg`) });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('at most 8');
  });
});
