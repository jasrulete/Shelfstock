import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock('../server/mail', () => ({
  sendOrderConfirmation: vi.fn(async () => true),
  sendOrderShipped: vi.fn(async () => true),
}));
vi.mock('../server/push', () => ({
  notifyAdminsNewOrder: vi.fn(async () => undefined),
}));

import { pool } from '../server/db';
import { createApp } from '../server/app';
import { ALLOWED_TRANSITIONS } from '../server/orderStatus';
import { notifyAdminsNewOrder } from '../server/push';
import type { OrderStatus } from '../server/types';
import { tokenFor } from './helpers';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;
const poolConnect = pool.connect as unknown as ReturnType<typeof vi.fn>;

const clientQuery = vi.fn();
const client = { query: clientQuery, release: vi.fn() };

const app = createApp();

const validShipping = {
  name: 'Jeric R',
  phone: '+63 912 345 6789',
  address: '123 Mango St',
  city: 'Cebu City',
};

/** Finds the first transaction-client query whose SQL contains `fragment`. */
function txCall(fragment: string) {
  return clientQuery.mock.calls.find(([sql]) => (sql as string).includes(fragment));
}

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockResolvedValue({ rows: [] });
  clientQuery.mockResolvedValue({ rows: [] });
  poolConnect.mockResolvedValue(client);
});

describe('POST /api/orders (checkout)', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [{ productId: 1, quantity: 1 }], shipping: validShipping });

    expect(res.status).toBe(401);
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it('rejects an empty cart with 400 before touching the database', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ items: [], shipping: validShipping });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Order must include at least one item');
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it('rejects missing or blank shipping fields with 400', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({
        items: [{ productId: 1, quantity: 1 }],
        shipping: { ...validShipping, phone: '   ' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Shipping name, phone, address, and city are required');
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it('rejects fractional quantities and rolls the transaction back', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ items: [{ productId: 1, quantity: 1.5 }], shipping: validShipping });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'Each item needs a valid productId and a whole-number quantity'
    );
    expect(txCall('ROLLBACK')).toBeDefined();
  });

  it('returns 404 when a cart item references a product that does not exist', async () => {
    clientQuery.mockImplementation(async (sql: string) =>
      sql.includes('FOR UPDATE') ? { rows: [] } : { rows: [] }
    );

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ items: [{ productId: 999, quantity: 1 }], shipping: validShipping });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product 999 not found');
    expect(txCall('ROLLBACK')).toBeDefined();
  });

  it('refuses to oversell: quantity above current stock is a 400 and no order is created', async () => {
    clientQuery.mockImplementation(async (sql: string) =>
      sql.includes('FOR UPDATE')
        ? { rows: [{ id: 7, name: 'Ceramic Mug', price: '19.99', stock: 1 }] }
        : { rows: [] }
    );

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ items: [{ productId: 7, quantity: 3 }], shipping: validShipping });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Insufficient stock for "Ceramic Mug" (only 1 left)');
    expect(txCall('ROLLBACK')).toBeDefined();
    expect(txCall('INSERT INTO orders')).toBeUndefined();
  });

  it('snapshots the current DB price: totals and price_at_purchase ignore client-sent prices', async () => {
    clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 7, name: 'Ceramic Mug', price: '19.99', stock: 5 }] };
      }
      if (sql.includes('INSERT INTO orders')) {
        return { rows: [{ id: 42, user_id: 1, total_amount: '39.98', status: 'pending' }] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({
        // A hostile client claims the mug costs one cent - it must be ignored.
        items: [{ productId: 7, quantity: 2, price: 0.01 }],
        shipping: validShipping,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);

    // Order total = 2 x 19.99 from the products table, not 2 x 0.01.
    const orderInsert = txCall('INSERT INTO orders')!;
    expect(orderInsert[1][0]).toBe(1); // user_id from the JWT
    expect(orderInsert[1][1]).toBe('39.98');

    // price_at_purchase is copied from the product row read in this transaction.
    const itemInsert = txCall('INSERT INTO order_items')!;
    expect(itemInsert[1]).toEqual([42, 7, 2, '19.99']);

    // Stock is decremented by the ordered quantity, and the whole thing commits.
    const stockUpdate = txCall('UPDATE products SET stock = stock - $1')!;
    expect(stockUpdate[1]).toEqual([2, 7]);
    expect(txCall('COMMIT')).toBeDefined();

    // Fire-and-forget push to admin devices, same contract as the email above.
    expect(notifyAdminsNewOrder).toHaveBeenCalledWith(res.body);
  });
});

describe('POST /api/orders and the stock ledger', () => {
  // Stock moved, so the ledger has to say so - in the same transaction, with
  // the order it belongs to, or the admin's "where did 3 come from?" has no
  // answer for the most common way stock ever moves.
  it('writes one order-sourced ledger row per line, after the order exists, before COMMIT', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 7, name: 'Ceramic Mug', price: '19.99', stock: 5 }] };
      }
      if (sql.includes('INSERT INTO orders')) {
        return { rows: [{ id: 42, user_id: 1, total_amount: '39.98', status: 'pending' }] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ items: [{ productId: 7, quantity: 2 }], shipping: validShipping });

    expect(res.status).toBe(201);
    const ledger = txCall('INSERT INTO stock_adjustments')!;
    expect(ledger).toBeDefined();
    // product_id, delta, new_stock (5 - 2, read under the lock), source, user, note
    expect(ledger[1]).toEqual([7, -2, 3, 'order', 1, 'Order #42']);

    const sql = clientQuery.mock.calls.map(([s]) => s as string);
    expect(sql.findIndex((s) => s.includes('INSERT INTO orders'))).toBeLessThan(sql.indexOf(ledger[0]));
    expect(sql.indexOf(ledger[0])).toBeLessThan(sql.indexOf('COMMIT'));
  });
});

describe('GET /api/orders/:id (row-level authorization)', () => {
  const order = { id: 9, user_id: 2, total_amount: '10.00', status: 'pending' };

  it("returns 404 - not the order - when a valid token belongs to a different user", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [order] });

    const res = await request(app)
      .get('/api/orders/9')
      .set('Authorization', `Bearer ${tokenFor(1, 'customer')}`); // user 1 asking for user 2's order

    // Deliberately 404 rather than 403 so strangers can't confirm the id exists.
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Order not found' });
  });

  it('returns the order with its items for the owner', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [order] })
      .mockResolvedValueOnce({
        rows: [{ id: 1, order_id: 9, product_id: 7, quantity: 1, price_at_purchase: '10.00', product_name: 'Mug' }],
      });

    const res = await request(app)
      .get('/api/orders/9')
      .set('Authorization', `Bearer ${tokenFor(2, 'customer')}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(9);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_name).toBe('Mug');
  });

  it('lets an admin read any order', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [order] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/orders/9')
      .set('Authorization', `Bearer ${tokenFor(99, 'admin')}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 for a malformed id without querying the database', async () => {
    const res = await request(app)
      .get('/api/orders/9abc')
      .set('Authorization', `Bearer ${tokenFor(1)}`);

    expect(res.status).toBe(404);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

describe('GET /api/orders (admin list)', () => {
  it('is forbidden for regular customers', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenFor(1, 'customer')}`);

    expect(res.status).toBe(403);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('rejects an unknown status filter with 400', async () => {
    const res = await request(app)
      .get('/api/orders?status=refunded')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid status filter');
  });

  it('binds a valid status filter and caps the page size at 100', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ total: 250 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/orders?status=pending&page=2&limit=9999')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);

    expect(res.status).toBe(200);
    // Values: [status, limit, offset]
    expect(poolQuery.mock.calls[1][1]).toEqual(['pending', 100, 100]);
    expect(res.body.pagination).toEqual({ page: 2, limit: 100, total: 250, totalPages: 3 });
  });
});

describe('PATCH /api/orders/:id/status', () => {
  it('rejects a status outside the allowed lifecycle', async () => {
    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'refunded' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('status must be one of');
  });

  /** Mocks the transaction so the locked order row reports `from`. */
  function orderInStatus(from: OrderStatus, to: OrderStatus) {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: 5, status: from, user_id: 2 }] };
      if (sql.includes('UPDATE orders SET status')) {
        return { rows: [{ id: 5, status: to, user_id: 2 }] };
      }
      return { rows: [] };
    });
  }

  it('treats cancelled as terminal', async () => {
    orderInStatus('cancelled', 'pending');

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'pending' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot change an order from cancelled to pending');
    expect(txCall('ROLLBACK')).toBeDefined();
  });

  // The bug this matrix exists to prevent: a completed order is one whose
  // goods have been handed over and whose cash has been collected. Cancelling
  // it used to run the stock-restore UPDATE, putting sold goods back on the
  // shelf. There is no returns flow in this codebase, so completed is terminal.
  it('refuses to cancel a completed order, and does not restore its stock', async () => {
    orderInStatus('completed', 'cancelled');

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot change an order from completed to cancelled');
    expect(txCall('stock = p.stock + oi.quantity')).toBeUndefined();
    expect(txCall('UPDATE orders SET status')).toBeUndefined();
    expect(txCall('ROLLBACK')).toBeDefined();
  });

  it('refuses to move a completed order back to pending', async () => {
    orderInStatus('completed', 'pending');

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'pending' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot change an order from completed to pending');
    expect(txCall('UPDATE orders SET status')).toBeUndefined();
  });

  it('refuses to move a shipped order back to pending', async () => {
    orderInStatus('shipped', 'pending');

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'pending' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot change an order from shipped to pending');
    expect(txCall('UPDATE orders SET status')).toBeUndefined();
  });

  it('refuses a no-op transition to the status the order is already in', async () => {
    orderInStatus('pending', 'pending');

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'pending' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot change an order from pending to pending');
    expect(txCall('UPDATE orders SET status')).toBeUndefined();
  });

  // Refusing delivery of a COD order is the one case where goods genuinely
  // come back, so shipped -> cancelled must still restore stock.
  it('restores stock when a shipped order is cancelled', async () => {
    orderInStatus('shipped', 'cancelled');

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(txCall('stock = p.stock + oi.quantity')![1]).toEqual([5]);
    expect(txCall('COMMIT')).toBeDefined();
  });

  it('writes a cancel-sourced ledger row for every line whose stock came back', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: 5, status: 'pending', user_id: 2 }] };
      if (sql.includes('stock = p.stock + oi.quantity')) {
        return { rows: [{ product_id: 7, quantity: 2, stock: 5 }, { product_id: 8, quantity: 1, stock: 1 }] };
      }
      if (sql.includes('UPDATE orders SET status')) {
        return { rows: [{ id: 5, status: 'cancelled', user_id: 2 }] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const ledger = clientQuery.mock.calls.filter(([s]) => (s as string).includes('INSERT INTO stock_adjustments'));
    expect(ledger.map(([, params]) => params)).toEqual([
      [7, 2, 5, 'cancel', 1, 'Order #5 cancelled'],
      [8, 1, 1, 'cancel', 1, 'Order #5 cancelled'],
    ]);
    const sql = clientQuery.mock.calls.map(([s]) => s as string);
    expect(sql.lastIndexOf(ledger[1][0] as string)).toBeLessThan(sql.indexOf('COMMIT'));
  });

  it('allows a shipped order to complete without touching stock', async () => {
    orderInStatus('shipped', 'completed');

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(txCall('stock = p.stock + oi.quantity')).toBeUndefined();
    expect(txCall('COMMIT')).toBeDefined();
  });

  it('restores reserved stock when cancelling, inside the same transaction', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: 5, status: 'pending', user_id: 2 }] };
      if (sql.includes('UPDATE orders SET status')) {
        return { rows: [{ id: 5, status: 'cancelled', user_id: 2 }] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    const restore = txCall('stock = p.stock + oi.quantity')!;
    expect(restore).toBeDefined();
    expect(restore[1]).toEqual([5]);
    expect(txCall('COMMIT')).toBeDefined();
  });

  // Locks the shape of the matrix itself: every status is covered, and the
  // two end states have no way out. Without this, a future edit could quietly
  // reopen completed -> cancelled and only the route tests above would notice.
  it('defines an exit list for every status, with completed and cancelled terminal', () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([
      'cancelled',
      'completed',
      'pending',
      'shipped',
    ]);
    expect(ALLOWED_TRANSITIONS.completed).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
  });

  it('does not touch stock for a normal pending -> shipped transition', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ id: 5, status: 'pending', user_id: 2 }] };
      if (sql.includes('UPDATE orders SET status')) {
        return { rows: [{ id: 5, status: 'shipped', user_id: 2 }] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/api/orders/5/status')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`)
      .send({ status: 'shipped' });

    expect(res.status).toBe(200);
    expect(txCall('stock = p.stock + oi.quantity')).toBeUndefined();
  });
});
