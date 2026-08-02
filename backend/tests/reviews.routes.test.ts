import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../src/db';
import { createApp } from '../src/app';
import { displayName } from '../src/routes/reviews';
import { tokenFor } from './helpers';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;
const app = createApp();

/** Finds the first query whose SQL contains `fragment`. */
function callWith(fragment: string) {
  return poolQuery.mock.calls.find(([sql]) => (sql as string).includes(fragment));
}

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('displayName', () => {
  it('reduces a shipping name to a first name and last initial', () => {
    expect(displayName('Maria Reyes', 'maria@example.com')).toBe('Maria R.');
  });

  it('keeps a single-word name as-is', () => {
    expect(displayName('Maria', 'maria@example.com')).toBe('Maria');
  });

  it('never returns the email when there is no shipping name', () => {
    const out = displayName(null, 'maria.reyes@example.com');
    expect(out).not.toContain('@');
    expect(out).not.toContain('reyes');
    expect(out).toBe('ma***');
  });

  it('falls back for a blank shipping name rather than rendering empty', () => {
    expect(displayName('   ', 'zoe@example.com')).toBe('zo***');
  });
});

describe('GET /api/products/:id/reviews', () => {
  it('never exposes reviewer emails in the response', async () => {
    poolQuery.mockImplementation(async (sql: string) =>
      sql.includes('COUNT(*)')
        ? { rows: [{ total: 1, average: 4 }] }
        : {
            rows: [
              {
                id: 7,
                rating: 4,
                body: 'Good',
                verified_purchase: true,
                created_at: '2026-01-01',
                email: 'private@example.com',
                shipping_name: 'Maria Reyes',
              },
            ],
          }
    );

    const res = await request(app).get('/api/products/2/reviews');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('private@example.com');
    expect(res.body.reviews[0].reviewer).toBe('Maria R.');
    expect(res.body.summary).toEqual({ total: 1, average: 4 });
  });

  it('returns 404 for a malformed product id without querying the database', async () => {
    const res = await request(app).get('/api/products/not-a-number/reviews');

    expect(res.status).toBe(404);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

describe('POST /api/products/:id/reviews', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/products/2/reviews').send({ rating: 5 });

    expect(res.status).toBe(401);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it.each([0, 6, 2.5, '5', null])('rejects an invalid rating: %s', async (rating) => {
    const res = await request(app)
      .post('/api/products/2/reviews')
      .set('Authorization', `Bearer ${tokenFor(1, 'customer')}`)
      .send({ rating });

    expect(res.status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('marks the review verified only when a non-cancelled order contains the product', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM products WHERE id')) return { rows: [{ id: 2 }] };
      if (sql.includes('FROM order_items')) return { rows: [{ '?column?': 1 }] };
      return { rows: [{ id: 1, rating: 5, verified_purchase: true }] };
    });

    const res = await request(app)
      .post('/api/products/2/reviews')
      .set('Authorization', `Bearer ${tokenFor(9, 'customer')}`)
      .send({ rating: 5, body: 'Excellent' });

    expect(res.status).toBe(201);
    // A cancelled order restored its stock, so it must not verify a purchase.
    expect(callWith('FROM order_items')![0]).toContain("status <> 'cancelled'");
    expect(callWith('INSERT INTO reviews')![1]).toContain(true);
  });

  it('records an unverified review when the user never bought the product', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM products WHERE id')) return { rows: [{ id: 2 }] };
      if (sql.includes('FROM order_items')) return { rows: [] };
      return { rows: [{ id: 1 }] };
    });

    await request(app)
      .post('/api/products/2/reviews')
      .set('Authorization', `Bearer ${tokenFor(9, 'customer')}`)
      .send({ rating: 3 });

    expect(callWith('INSERT INTO reviews')![1]).toContain(false);
  });

  it('upserts so a second review replaces the first instead of stacking', async () => {
    poolQuery.mockImplementation(async (sql: string) =>
      sql.includes('FROM products WHERE id') ? { rows: [{ id: 2 }] } : { rows: [{ id: 1 }] }
    );

    await request(app)
      .post('/api/products/2/reviews')
      .set('Authorization', `Bearer ${tokenFor(9, 'customer')}`)
      .send({ rating: 4 });

    expect(callWith('INSERT INTO reviews')![0]).toContain('ON CONFLICT (product_id, user_id)');
  });

  it('404s when the product does not exist', async () => {
    poolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/products/999/reviews')
      .set('Authorization', `Bearer ${tokenFor(1, 'customer')}`)
      .send({ rating: 5 });

    expect(res.status).toBe(404);
  });
});
