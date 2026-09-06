import type { PoolClient } from 'pg';

/**
 * Which path moved products.stock. Mirrors the CHECK constraint in the
 * stock_adjustments migration - change both or the INSERT fails at runtime.
 */
export const STOCK_SOURCES = ['web-admin', 'companion', 'order', 'cancel'] as const;
export type StockSource = (typeof STOCK_SOURCES)[number];

/**
 * The sources a client may declare on POST /adjust-stock. 'order' and
 * 'cancel' are written by the server from the checkout and status routes; a
 * client claiming either would be forging a row.
 */
export const CLIENT_STOCK_SOURCES: readonly StockSource[] = ['web-admin', 'companion'];

export interface StockAdjustmentRow {
  id: number;
  product_id: number;
  delta: number;
  new_stock: number;
  source: StockSource;
  user_id: number | null;
  note: string | null;
  created_at: string;
  /** The client's idempotency key for a queued companion press; null for every other path. */
  client_request_id: string | null;
}

export interface StockAdjustmentEntry {
  productId: number;
  delta: number;
  newStock: number;
  source: StockSource;
  userId: number | null;
  note?: string | null;
  /** See StockAdjustmentRow.client_request_id. The unique index makes a duplicate an INSERT error, not a second row. */
  clientRequestId?: string | null;
}

/**
 * Writes one ledger row.
 *
 * Must be called on the same client, inside the same transaction, as the
 * UPDATE it describes. A row that commits without its stock change - or a
 * change that commits without its row - is exactly the lie an audit table
 * exists to rule out, so the caller's BEGIN/COMMIT is what makes this true.
 */
export async function recordStockAdjustment(
  client: Pick<PoolClient, 'query'>,
  entry: StockAdjustmentEntry
): Promise<StockAdjustmentRow> {
  const { rows } = await client.query(
    `INSERT INTO stock_adjustments (product_id, delta, new_stock, source, user_id, note, client_request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, product_id, delta, new_stock, source, user_id, note, created_at, client_request_id`,
    [
      entry.productId,
      entry.delta,
      entry.newStock,
      entry.source,
      entry.userId,
      entry.note ?? null,
      entry.clientRequestId ?? null,
    ]
  );
  return rows[0];
}
