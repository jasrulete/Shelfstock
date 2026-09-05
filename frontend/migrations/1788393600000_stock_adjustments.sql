-- Stock ledger: every change to products.stock, and where it came from.
--
-- Turns "stock: 12" into "stock: 12 - +5 from the companion scanner, 2 minutes
-- ago". Rows are written in the SAME transaction as the stock change they
-- describe, by every path that changes stock: the checkout decrement, the
-- cancel restore, the admin product form, and the adjust-stock endpoint the
-- web and companion steppers call. A row without its change, or a change
-- without its row, is a bug (ARCHITECTURE.md INV-13).
--
-- source says which path moved the number. 'order' and 'cancel' are written by
-- the server only; 'web-admin' and 'companion' are declared by the client that
-- pressed the button. delta is never zero - a no-op is not an adjustment.
--
-- user_id is SET NULL on delete rather than CASCADE: an audit row outlives the
-- account that wrote it. product_id cascades, matching product_images - a
-- deleted product's ledger has nothing left to explain.
--
-- Idempotent, like every migration here (DATA-MODEL.md section 3).
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL CHECK (delta <> 0),
  new_stock  INTEGER NOT NULL CHECK (new_stock >= 0),
  source     VARCHAR(20) NOT NULL
             CHECK (source IN ('web-admin', 'companion', 'order', 'cancel')),
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only read is "the most recent rows for one product".
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_recent
  ON stock_adjustments (product_id, created_at DESC);
