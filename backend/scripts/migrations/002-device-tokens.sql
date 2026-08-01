-- Adds device token registration for the ShelfStock Companion admin app.
-- Apply locally:  docker compose exec -T db psql -U postgres shelfstock < backend/scripts/migrations/002-device-tokens.sql
-- Apply on Railway: psql "$DATABASE_URL" -f backend/scripts/migrations/002-device-tokens.sql
CREATE TABLE IF NOT EXISTS device_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(200) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
