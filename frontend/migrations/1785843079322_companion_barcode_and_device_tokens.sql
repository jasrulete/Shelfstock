-- Companion app: barcode lookup and mobile push registrations.
--
-- barcode is nullable (not every product has been scanned in yet) but must be
-- unique when set. The name products_barcode_key is load-bearing: the 409
-- handler in server/routes/products.ts (isBarcodeConflict) matches on pg's
-- 23505 constraint name containing "barcode" to tell this conflict apart from
-- any other unique violation.
--
-- device_tokens: one row per registered device. The API upserts on token via
-- ON CONFLICT (token) so a reinstall or token rotation replaces the existing
-- row instead of accumulating duplicates.
--
-- Forward-only, per the baseline: no Down section here either - see that
-- file's header for why.

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(64);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key;
ALTER TABLE products ADD CONSTRAINT products_barcode_key UNIQUE (barcode);

CREATE TABLE IF NOT EXISTS device_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(200) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
