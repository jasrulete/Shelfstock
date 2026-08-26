# Data model

**Canonical for intent; `frontend/migrations/` is canonical for truth.** If a
column here does not exist in a migration, this document is wrong — fix it.

---

## 1. Tables

```
users ──┬──< orders ──< order_items >── products ──┬──< product_images
        │                                          │
        ├──< reviews >─────────────────────────────┘
        ├──< password_resets
        ├──< device_tokens
        └──< winback_emails
```

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `email` | VARCHAR(255) UNIQUE NOT NULL | Validated on register, **not** on login. |
| `password_hash` | TEXT NOT NULL | bcrypt. Never nullable — see [ADR-0006](adr/0006-forced-login-no-guest-checkout.md). |
| `role` | VARCHAR(20) NOT NULL | `CHECK (role IN ('customer','admin'))`, default `customer`. |
| `created_at` | TIMESTAMPTZ | |

### `products`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `name` | VARCHAR(255) NOT NULL | Admin-typed — treat as untrusted in any HTML/JSON-LD context. |
| `description` | TEXT | Searched, and weighted below `name` in ranking. |
| `price` | NUMERIC(10,2) NOT NULL | `CHECK (price >= 0)`. **USD.** Display conversion is client-side only. |
| `category` | VARCHAR(100) NOT NULL | Free text, not a FK to `categories`. |
| `stock` | INTEGER NOT NULL | `CHECK (stock >= 0)` — the database is the last line against oversell. |
| `image_url` | TEXT | Cover image. Leads the gallery. |
| `barcode` | VARCHAR(64) | **Admin-only in the API** — [INV-8](ARCHITECTURE.md#inv-8--productsbarcode-is-admin-only). Nullable, unique when set. |
| `created_at` | TIMESTAMPTZ | |

The constraint name `products_barcode_key` is **load-bearing**: the 409 path
matches on a `23505` whose constraint name contains `barcode`, to tell this
conflict apart from any other unique violation. Renaming it silently turns a
clear 409 into a 500.

### `orders`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `user_id` | INTEGER NOT NULL → `users` ON DELETE CASCADE | |
| `total_amount` | NUMERIC(10,2) NOT NULL | `CHECK (>= 0)`. Computed server-side from snapshotted prices, never from the client. |
| `currency` | VARCHAR(10) NOT NULL | Default `USD`. |
| `status` | VARCHAR(20) NOT NULL | Default `pending`. **Not a CHECK constraint** — the matrix in `server/orderStatus.ts` is the enforcement layer ([INV-4](ARCHITECTURE.md#inv-4--serverorderstatusts-is-the-only-order-lifecycle)). |
| `payment_method` | VARCHAR(30) NOT NULL | Default `cod`. Only value in use. |
| `shipping_name` | TEXT | **PII** |
| `shipping_phone` | TEXT | **PII** |
| `shipping_address` | TEXT | **PII** |
| `shipping_city` | TEXT | **PII** |
| `created_at` | TIMESTAMPTZ | |

Those four `shipping_*` columns are the reason [INV-10](ARCHITECTURE.md#inv-10--no-customer-pii-on-unencrypted-device-storage)
exists. Any new consumer of an order row inherits a PII-handling obligation.

### `order_items`

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `order_id` | INTEGER NOT NULL → `orders` ON DELETE CASCADE | |
| `product_id` | INTEGER NOT NULL → `products` | **No cascade** — deleting a product must not erase order history. |
| `quantity` | INTEGER NOT NULL | `CHECK (> 0)` |
| `price_at_purchase` | NUMERIC(10,2) NOT NULL | Snapshot. A later price change must never rewrite history. |

### `product_images`

`id`, `product_id` → `products` ON DELETE CASCADE, `url`, `position` SMALLINT
default 0, `created_at`. The cover (`products.image_url`) leads; these are the
extra angles, ordered by `position`. Sent as one ready-to-render array so no
client has to stitch them together and get the order wrong.

### `reviews`

`id`, `product_id`, `user_id`, `rating` SMALLINT `CHECK (BETWEEN 1 AND 5)`,
`body`, `verified_purchase` BOOLEAN, `created_at`, and **`UNIQUE (product_id,
user_id)`** — one review per person per product, which is what makes the API's
upsert semantics safe.

`verified_purchase` is derived from `orders.user_id`. That derivation is why
guest checkout was cut: an unauthenticated order upserting a user row by email
could mint a verified badge on a stranger's account. See
[ADR-0006](adr/0006-forced-login-no-guest-checkout.md).

### `password_resets`

`id`, `user_id`, `token_hash` TEXT (SHA-256 — **never the raw token**),
`expires_at`, `used_at`, `created_at`. Unique index on `token_hash`.

### `device_tokens`

`id`, `user_id` → `users` ON DELETE CASCADE, `token` VARCHAR(200) UNIQUE,
`created_at`.

**A row here does not mean its owner is still an admin.** The cascade covers
deletion, not demotion, which is why recipients are resolved by joining `users`
at send time.

### `winback_emails`

`id`, `user_id`, `sent_at`. The dedup ledger for the win-back cron: the job's
`NOT EXISTS` check against this table is what stops a customer being mailed
repeatedly.

## 2. Indexes

| Index | On | Why |
|---|---|---|
| `idx_products_category` | `products(category)` | Filter |
| `idx_products_price` | `products(price)` | Filter and sort |
| `idx_products_name_trgm` | GIN `name gin_trgm_ops` | Substring search — "board" finds "Keyboard" |
| `idx_products_description_trgm` | GIN `description gin_trgm_ops` | Same, over descriptions |
| `idx_products_search_fts` | GIN `to_tsvector(...)` | Stemming — "keyboards" finds "Keyboard" |
| `idx_orders_user_id`, `idx_orders_status`, `idx_orders_created_at` | `orders` | Admin list filters |
| `idx_order_items_order_id`, `idx_order_items_product_id` | `order_items` | Joins |
| `idx_product_images_product_id` | `product_images` | Gallery fetch |
| `idx_reviews_product_id` | `reviews` | Product page |
| `idx_winback_emails_user_id` | `winback_emails` | Dedup check |
| `idx_password_resets_token_hash` (UNIQUE), `idx_password_resets_user_id` | `password_resets` | Lookup and retire-on-reissue |

**The three search indexes are used together in a `BitmapOr`** — measured at
8.9ms against 1039ms for the same predicate scanned sequentially, on 40k rows.
That only holds while [INV-12](ARCHITECTURE.md#inv-12--the-search-expression-must-stay-byte-identical-to-the-indexed-one)
holds.

## 3. Migration rules

1. **Forward-only. No down migrations.** One for the baseline would drop every
   table. See [ADR-0003](adr/0003-forward-only-migrations.md).
2. **Every statement idempotent** — `IF NOT EXISTS`, `DROP CONSTRAINT IF
   EXISTS` before `ADD CONSTRAINT`. This is what lets an existing database
   adopt the baseline by simply running `migrate up`, with no fake-apply step.
3. **Ordered by the numeric filename prefix**, tracked in `pgmigrations`.
4. **There is no other schema path.** Postgres' `docker-entrypoint-initdb.d`
   mount was removed on purpose so one code path applies schema everywhere.

Adding a column that a public projection might pick up? Check
[INV-8](ARCHITECTURE.md#inv-8--productsbarcode-is-admin-only) first —
`getProductById` returns `p.*`, so a new column is public by default unless it
is explicitly stripped.

Before running a migration against anything shared, read
[OPERATIONS.md](OPERATIONS.md#3-migrations).
