import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../server/db';
import { createApp } from '../server/app';
import { tokenFor } from './helpers';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;
const poolConnect = pool.connect as unknown as ReturnType<typeof vi.fn>;

const clientQuery = vi.fn();
const client = { query: clientQuery, release: vi.fn() };

const app = createApp();
const admin = () => `Bearer ${tokenFor(7, 'admin')}`;

/** Every transaction-client call whose SQL contains `fragment`. */
function txCalls(fragment: string) {
  return clientQuery.mock.calls.filter(([sql]) => (sql as string).includes(fragment));
}

/** Answers the SELECT ... FOR UPDATE with a stock count; everything else with `rows`. */
function productWithStock(stock: number | null, rows: unknown[] = [{ id: 1 }]) {
  clientQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FOR UPDATE')) return { rows: stock === null ? [] : [{ stock }] };
    if (sql.includes('INSERT INTO stock_adjustments')) {
      return { rows: [{ id: 99, product_id: 1, delta: 0, new_stock: 0, source: 'x', user_id: 7, note: null, created_at: 'now' }] };
    }
    return { rows };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
  clientQuery.mockResolvedValue({ rows: [] });
  poolConnect.mockResolvedValue(client);
});

/**
 * The stepper on either client must move stock by a delta the server applies
 * under the row lock. "Read 12, PUT 13" silently swallows any order that
 * decremented the product in between; this endpoint is the alternative, and
 * the ledger row it writes is what lets the admin see where a number came from.
 */
describe('POST /api/products/:id/adjust-stock', () => {
  it('is admin-only', async () => {
    const anon = await request(app).post('/api/products/1/adjust-stock').send({ delta: 1, source: 'web-admin' });
    expect(anon.status).toBe(401);

    const customer = await request(app)
      .post('/api/products/1/adjust-stock')
      .set('Authorization', `Bearer ${tokenFor(2, 'customer')}`)
      .send({ delta: 1, source: 'web-admin' });
    expect(customer.status).toBe(403);
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', 0],
    ['fractional', 1.5],
    ['a string', '1'],
    ['missing', undefined],
    ['beyond the bound', 10_001],
    ['beyond the bound, negative', -10_001],
  ])('rejects a delta that is %s with 400, before touching the database', async (_label, delta) => {
    const res = await request(app)
      .post('/api/products/1/adjust-stock')
      .set('Authorization', admin())
      .send({ delta, source: 'web-admin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/delta/);
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it.each(['order', 'cancel', 'admin', '', undefined])(
    'rejects source %j - only the two client sources may be declared',
    async (source) => {
      const res = await request(app)
        .post('/api/products/1/adjust-stock')
        .set('Authorization', admin())
        .send({ delta: 1, source });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/source/);
      expect(poolConnect).not.toHaveBeenCalled();
    }
  );

  it('rejects an overlong note with 400', async () => {
    const res = await request(app)
      .post('/api/products/1/adjust-stock')
      .set('Authorization', admin())
      .send({ delta: 1, source: 'web-admin', note: 'x'.repeat(201) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/note/);
  });

  it('404s a malformed id without opening a transaction', async () => {
    const res = await request(app)
      .post('/api/products/abc/adjust-stock')
      .set('Authorization', admin())
      .send({ delta: 1, source: 'web-admin' });

    expect(res.status).toBe(404);
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it('404s an unknown product and rolls back without writing anything', async () => {
    productWithStock(null);

    const res = await request(app)
      .post('/api/products/1/adjust-stock')
      .set('Authorization', admin())
      .send({ delta: 1, source: 'web-admin' });

    expect(res.status).toBe(404);
    expect(txCalls('UPDATE products')).toHaveLength(0);
    expect(txCalls('INSERT INTO stock_adjustments')).toHaveLength(0);
    expect(clientQuery).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('refuses to take stock below zero: 409 with the current count, no update, no ledger row', async () => {
    productWithStock(3);

    const res = await request(app)
      .post('/api/products/1/adjust-stock')
      .set('Authorization', admin())
      .send({ delta: -5, source: 'companion' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/3/);
    expect(res.body.stock).toBe(3);
    // Rejected, not clamped: a floor at 0 that still logged -5 would be a lie
    // in the audit table.
    expect(txCalls('UPDATE products')).toHaveLength(0);
    expect(txCalls('INSERT INTO stock_adjustments')).toHaveLength(0);
    expect(clientQuery).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('locks the row, applies the delta, writes the ledger row, and commits - in that order', async () => {
    productWithStock(12);

    const res = await request(app)
      .post('/api/products/1/adjust-stock')
      .set('Authorization', admin())
      .send({ delta: 5, source: 'companion', note: '  Received from supplier  ' });

    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(17);
    expect(res.body.adjustment).toMatchObject({ id: 99 });

    const sql = clientQuery.mock.calls.map(([s]) => s as string);
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toContain('FOR UPDATE');
    expect(sql.at(-1)).toBe('COMMIT');

    const update = txCalls('UPDATE products')[0];
    expect(update[1]).toEqual([17, 1]);

    const ledger = txCalls('INSERT INTO stock_adjustments')[0];
    // product_id, delta, new_stock, source, user_id, note (trimmed)
    expect(ledger[1]).toEqual([1, 5, 17, 'companion', 7, 'Received from supplier']);
    expect(sql.indexOf(update[0])).toBeLessThan(sql.indexOf(ledger[0]));
  });

  it('stores a blank note as NULL', async () => {
    productWithStock(1);

    await request(app)
      .post('/api/products/1/adjust-stock')
      .set('Authorization', admin())
      .send({ delta: -1, source: 'web-admin', note: '   ' });

    expect(txCalls('INSERT INTO stock_adjustments')[0][1]).toEqual([1, -1, 0, 'web-admin', 7, null]);
  });
});

describe('GET /api/products/:id/stock-history', () => {
  it('is admin-only', async () => {
    const res = await request(app)
      .get('/api/products/1/stock-history')
      .set('Authorization', `Bearer ${tokenFor(2, 'customer')}`);
    expect(res.status).toBe(403);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('returns the most recent rows for that product, newest first, capped at 20', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [{ id: 2, delta: -1, new_stock: 11, source: 'order', note: 'Order #40', user_email: 'a@b.c', created_at: 'now' }],
    });

    const res = await request(app).get('/api/products/1/stock-history').set('Authorization', admin());

    expect(res.status).toBe(200);
    expect(res.body.adjustments).toHaveLength(1);
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain('FROM stock_adjustments');
    expect(sql).toMatch(/ORDER BY a\.created_at DESC/);
    expect(sql).toContain('LIMIT 20');
    expect(params).toEqual([1]);
  });

  it('404s a malformed id without querying', async () => {
    const res = await request(app).get('/api/products/x/stock-history').set('Authorization', admin());
    expect(res.status).toBe(404);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

/**
 * The product form can still set stock directly. That is a stock change like
 * any other, and a ledger that misses it is only a partial log.
 */
describe('PUT /api/products/:id and the ledger', () => {
  it('writes a web-admin row for the difference when stock changes', async () => {
    productWithStock(5, [{ id: 1, stock: 8 }]);

    const res = await request(app)
      .put('/api/products/1')
      .set('Authorization', admin())
      .send({ stock: 8 });

    expect(res.status).toBe(200);
    const ledger = txCalls('INSERT INTO stock_adjustments');
    expect(ledger).toHaveLength(1);
    expect(ledger[0][1]).toEqual([1, 3, 8, 'web-admin', 7, 'Set to 8 in the product form']);
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('writes nothing when the submitted stock equals the current stock', async () => {
    productWithStock(8, [{ id: 1, stock: 8 }]);

    await request(app).put('/api/products/1').set('Authorization', admin()).send({ stock: 8 });

    expect(txCalls('INSERT INTO stock_adjustments')).toHaveLength(0);
  });

  it('does not lock or log when the payload carries no stock at all', async () => {
    clientQuery.mockResolvedValue({ rows: [{ id: 1 }] });

    await request(app).put('/api/products/1').set('Authorization', admin()).send({ name: 'Renamed' });

    expect(txCalls('FOR UPDATE')).toHaveLength(0);
    expect(txCalls('INSERT INTO stock_adjustments')).toHaveLength(0);
  });
});
