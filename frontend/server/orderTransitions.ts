import type { PoolClient } from 'pg';
import type { OrderStatus } from './types';
import { canTransition } from './orderStatus';
import { recordStockAdjustment } from './stockLedger';

export interface TransitionRefusal {
  status: 400 | 403 | 404 | 409;
  error: string;
}

/** A raw `orders` row, as pg hands it back. */
export type OrderRow = any;

export type TransitionResult = { ok: true; order: OrderRow } | ({ ok: false } & TransitionRefusal);

interface TransitionOptions {
  orderId: number;
  to: OrderStatus;
  /** Whose action this is - it goes on the ledger rows a cancellation writes. */
  actorUserId: number;
  /**
   * An extra gate, run against the locked row before the matrix. Returning a
   * refusal stops the transition; ownership is the customer route's use.
   */
  allowIf?: (order: OrderRow) => TransitionRefusal | null;
  /** The ledger note for a cancellation. Defaults to naming the order. */
  cancelNote?: (orderId: number) => string;
}

/**
 * The one way an order's status changes.
 *
 * The admin's PATCH and the customer's self-cancel both run through here, so
 * there is a single place where the row is locked, the matrix is consulted,
 * a cancellation puts the stock back and writes its ledger rows, and the
 * status is written. Duplicating that block for the customer route was the
 * roadmap's stated non-option: two copies of an inventory-correctness rule
 * is how the companion's lifecycle drifted.
 *
 * Runs inside a transaction the caller owns: BEGIN before, COMMIT on `ok`,
 * ROLLBACK on a refusal. That keeps the FOR UPDATE lock, the stock restore
 * and the status change atomic - INV-4 and INV-13 in one place.
 */
export async function transitionOrder(
  client: Pick<PoolClient, 'query'>,
  { orderId, to, actorUserId, allowIf, cancelNote }: TransitionOptions
): Promise<TransitionResult> {
  const found = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  const order = found.rows[0];
  if (!order) return { ok: false, status: 404, error: 'Order not found' };

  const refusal = allowIf?.(order);
  if (refusal) return { ok: false, ...refusal };

  if (!canTransition(order.status, to)) {
    return { ok: false, status: 400, error: `Cannot change an order from ${order.status} to ${to}` };
  }

  if (to === 'cancelled') {
    const restored = await client.query(
      `UPDATE products p
       SET stock = p.stock + oi.quantity
       FROM order_items oi
       WHERE oi.order_id = $1 AND oi.product_id = p.id
       RETURNING p.id AS product_id, oi.quantity, p.stock`,
      [orderId]
    );
    // One ledger row per line restored. The goods came back, and a number
    // moving up needs the same explanation as one moving down.
    const note = (cancelNote ?? ((id: number) => `Order #${id} cancelled`))(orderId);
    for (const row of restored.rows) {
      await recordStockAdjustment(client, {
        productId: row.product_id,
        delta: row.quantity,
        newStock: row.stock,
        source: 'cancel',
        userId: actorUserId,
        note,
      });
    }
  }

  const updated = await client.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [
    to,
    orderId,
  ]);
  return { ok: true, order: updated.rows[0] };
}
