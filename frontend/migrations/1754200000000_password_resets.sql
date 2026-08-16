-- Password reset tokens.
--
-- The token is never stored. What lands here is a SHA-256 of it, so a leaked
-- database dump cannot be used to reset anyone's password - the same reasoning
-- that puts a bcrypt hash in users.password_hash rather than the password.
-- SHA-256 rather than bcrypt because this value is 32 bytes of CSPRNG output,
-- not a human-chosen secret: there is nothing to brute-force, and the lookup
-- happens on every reset attempt.
--
-- used_at rather than deleting the row on use: a support question of the form
-- "did this reset actually happen, and when" is answerable, and a token that
-- is replayed can be told apart from one that never existed.

CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every reset attempt looks a token up by hash, and it is the only way in.
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_token_hash
  ON password_resets (token_hash);

-- Issuing a token invalidates that user's outstanding ones, which is a lookup
-- by user over the unused rows.
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id
  ON password_resets (user_id);
