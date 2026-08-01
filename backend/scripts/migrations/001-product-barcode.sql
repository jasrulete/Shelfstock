-- Adds barcode support for the ShelfStock Companion mobile app.
-- Apply locally:  docker compose exec -T db psql -U postgres shelfstock < backend/scripts/migrations/001-product-barcode.sql
-- Apply on Railway: psql "$DATABASE_URL" -f backend/scripts/migrations/001-product-barcode.sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(64) UNIQUE;
