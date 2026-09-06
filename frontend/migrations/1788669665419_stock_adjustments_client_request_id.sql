-- Idempotency key for POST /api/products/:id/adjust-stock.
--
-- The companion's offline write queue (step 2) persists a queued stepper
-- press to disk with an id made at press time and sends it with every
-- attempt. The persister's write lags the live state by up to a second, so an
-- app killed in that window after a reconnect relaunches with the press still
-- marked paused and replays it - and adjust-stock is a delta. With this column
-- the route answers a replay with the row it already wrote instead of moving
-- the stock again.
--
-- Nullable: the web admin's stepper and the server's own checkout/cancel rows
-- carry no id. The partial unique index therefore ignores NULLs.
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_adjustments_client_request_id
  ON stock_adjustments (client_request_id)
  WHERE client_request_id IS NOT NULL;
