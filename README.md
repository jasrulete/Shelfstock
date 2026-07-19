# ShelfStock

[![CI](https://github.com/jasrulete/Shelfstock/actions/workflows/ci.yml/badge.svg)](https://github.com/jasrulete/Shelfstock/actions/workflows/ci.yml)

**🔗 Live demo: [shelfstock-jer2x.vercel.app](https://shelfstock-jer2x.vercel.app/)**

A full-stack e-commerce storefront: product browsing/search/filtering, a cart,
Cash-on-Delivery checkout with shipping details, a full order lifecycle
(pending → shipped → completed / cancelled with stock restoration), JWT auth,
and an admin area with analytics, product management, and order fulfillment.

**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind on the frontend,
Express + TypeScript + PostgreSQL on the backend. No paid services required.

## 🐳 Run with Docker

The fastest way to run the whole stack. The only prerequisite is
[Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker
Engine + the Compose plugin) — no local Node or PostgreSQL needed.

```bash
docker compose up -d --build
```

Then open **http://localhost:3000**. On the first start Docker builds both
images (a few minutes) and Postgres applies `backend/src/db/schema.sql`
automatically, so the store comes up with demo products already seeded.

### What's running

| Service | Image / build          | Container port | Host port (default) | Purpose                                              |
| ------- | ---------------------- | -------------- | ------------------- | ---------------------------------------------------- |
| `web`   | `frontend/Dockerfile`  | 3000           | `3000`              | Next.js storefront + admin UI                        |
| `api`   | `backend/Dockerfile`   | 4000           | `4000`              | Express REST API (`/health`, `/api/*`)               |
| `db`    | `postgres:17-alpine`   | 5432           | `5433`              | PostgreSQL; data persists in the `db_data` volume    |

Startup is ordered by healthchecks: `db` must pass `pg_isready` before `api`
starts, and `api` must answer `/health` before `web` starts. Check status with
`docker compose ps`, logs with `docker compose logs -f api`.

`db` is published on host port **5433** (not 5432) so it never clashes with a
locally installed Postgres. Connect to it with
`psql postgres://postgres:postgres@localhost:5433/shelfstock`.

### Environment variables

Everything works out of the box with the defaults below. Override any of them
inline (`API_PORT=4001 docker compose up -d --build`) or via a `.env` file
next to `docker-compose.yml`.

| Variable     | Default                                     | Purpose                                                                                       |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `WEB_PORT`   | `3000`                                      | Host port for the storefront. The API's `CORS_ORIGIN` follows it automatically.               |
| `API_PORT`   | `4000`                                      | Host port for the API. Baked into the frontend bundle as `NEXT_PUBLIC_API_URL` at build time — changing it requires `--build`. |
| `DB_PORT`    | `5433`                                      | Host port for Postgres (container-internal traffic always uses 5432).                         |
| `JWT_SECRET` | `dev-only-insecure-secret-change-me-please` | Signs JWTs. Fine for a local demo; set a real one (`openssl rand -hex 32`) for anything else. |

Fixed (compose-internal) settings, listed for completeness: the `db` service
uses `postgres`/`postgres`/`shelfstock` as user/password/database, and the
`api` service receives `DATABASE_URL=postgres://postgres:postgres@db:5432/shelfstock?sslmode=disable`
(`sslmode=disable` because the API enables SSL for any non-`localhost` DB host,
and the bundled Postgres doesn't use SSL). `RESEND_API_KEY` (transactional
email) is intentionally unset — the win-back email job just skips itself.

### Demo accounts

Seed two ready-to-use accounts (one per side of the app):

```bash
docker compose exec api node scripts/seed-demo-users.js
```

| Role | Email | Password |
| --- | --- | --- |
| Admin (dashboard, order fulfillment) | `admin@shelfstock.demo` | `ShelfAdmin123` |
| Customer (browse, checkout) | `shopper@shelfstock.demo` | `ShelfShopper123` |

The script is idempotent — it only resets these two accounts and never touches
real users, products, or orders. On a hosted database, run it wherever
`DATABASE_URL` points (e.g. `railway run node scripts/seed-demo-users.js`).

### Create your own admin user

Register an account normally at http://localhost:3000/register, then promote
it from inside the `api` container:

```bash
docker compose exec api node scripts/create-admin.js you@example.com
```

Log out and back in; the Dashboard / Products / Manage Orders links appear.

### Reset the database

The schema + demo seed only run on an **empty** volume. To wipe everything and
start fresh:

```bash
docker compose down -v     # -v deletes the db_data volume
docker compose up -d
```

To re-apply the (idempotent) schema after pulling updates, without losing data:

```bash
docker compose exec db psql -U postgres -d shelfstock -f /docker-entrypoint-initdb.d/schema.sql
```

### Stop

```bash
docker compose down        # stops containers; keeps the database volume
```

## Features

- **Storefront** — search (debounced), category/price filters, sorting,
  server-side pagination, product detail pages, multi-currency price display
  (USD/PHP/EUR via live exchange rates with a cached fallback).
- **Cart** — localStorage-backed, synced across tabs and components,
  quantities capped at available stock.
- **Checkout** — shipping name/phone/address/city + Cash on Delivery. Orders
  are validated and created in a single DB transaction with row locking, and
  always stored in USD (other currencies are display-only conversions).
- **Order lifecycle** — orders start `pending`; admins move them to
  `shipped`/`completed`/`cancelled`. Cancelling restores the reserved stock
  and is terminal.
- **Admin** — sales dashboard (revenue over time, top products), product
  CRUD (`/admin/products`), and order fulfillment (`/admin/orders`).
- **Security** — bcrypt password hashing, JWT auth with row-level ownership
  checks, helmet security headers, rate limiting (tight on auth endpoints),
  request body size limits, input validation on every write endpoint.

## Project layout

```
shelfstock/
  frontend/   Next.js app (Vercel)
  backend/    Express API (Railway/Render)
```

## Key engineering decisions (for interview walkthroughs)

- **Price snapshotting** — `order_items.price_at_purchase` is copied from the
  product's price at checkout time, not a live reference to `products.price`.
  See the comment block in `backend/src/db/schema.sql` and
  `backend/src/routes/orders.ts`.
- **Row-level authorization** — `GET /api/orders/:id` checks
  `req.user.id === order.user_id` in the handler itself; a valid JWT alone
  isn't enough to read someone else's order. See `backend/src/routes/orders.ts`.
- **Server-side pagination** — `LIMIT`/`OFFSET` in SQL, not "fetch everything
  and slice in JS." See `backend/src/routes/products.ts`.
- **Debounce + AbortController** — the product search box waits 400ms after
  typing stops, and cancels any in-flight request when a newer one starts, so
  a slow response for an old keystroke can't overwrite a newer result. See
  `frontend/hooks/useProducts.ts`.
- **Exchange rate caching** — live rates are fetched once and cached in
  `localStorage` for 30 minutes, with a hardcoded fallback table if the free
  API is down or rate-limited. See `frontend/hooks/useExchangeRates.ts`.
- **Row locking on checkout** — `SELECT ... FOR UPDATE` on the product row
  during order creation prevents two simultaneous checkouts from overselling
  the last unit of stock. See `backend/src/routes/orders.ts`.

## Testing

**Unit tests** — 45 Vitest + Supertest tests with the database mocked, covering
auth middleware, registration/login (including the email-enumeration defense),
pagination caps and sort-column whitelisting, and the checkout transaction:
price snapshotting (a hostile client-supplied price is ignored), stock
decrement/restore, and row-level authorization.

```bash
cd backend && npm test
```

**End-to-end smoke test** — the same invariants exercised against the real,
Dockerized stack (PostgreSQL + API, no mocks): register → checkout → stock
decrement → snapshot → cross-user 404 → admin lifecycle → cancellation stock
restore → analytics.

```bash
docker compose up -d --wait db api
PROMOTE_CMD="docker compose exec -T db psql -U postgres -d shelfstock -c \"UPDATE users SET role='admin' WHERE email='{EMAIL}'\"" \
  node backend/scripts/e2e-smoke.mjs
docker compose down -v
```

Both run in CI on every push (see the badge above): unit tests + typecheck,
the frontend build, and the E2E job, which builds the Docker images and runs
the smoke test against them.

## Local setup

### Prerequisites

- Node.js 18+
- PostgreSQL running locally (or a free instance from [Neon](https://neon.tech)
  or [Railway](https://railway.app))

### 1. Clone and install

```bash
cd shelfstock/backend
npm install

cd ../frontend
npm install
```

### 2. Configure environment variables

```bash
cd shelfstock/backend
cp .env.example .env
# edit .env: set DATABASE_URL to your local Postgres, and set JWT_SECRET
# (generate one with: openssl rand -hex 32)

cd ../frontend
cp .env.example .env.local
# defaults are fine for local dev
```

### 3. Create the database and load the schema

```bash
createdb shelfstock
cd shelfstock/backend
npm run db:setup   # runs src/db/schema.sql against DATABASE_URL
```

This also seeds a handful of demo products so the UI isn't empty. The schema
is idempotent — re-running it on an existing database is safe and applies any
new columns/constraints (it's also how you migrate a deployed DB).

> **Windows note:** `npm run db:setup` uses `psql $DATABASE_URL`, which needs
> a POSIX shell (Git Bash). Alternatively run
> `psql -d <your-database-url> -f src/db/schema.sql` directly.

### 4. Create an admin user

Register an account through the app first, then promote it:

```bash
cd shelfstock/backend
npm run create-admin -- you@example.com
```

Admins see the Dashboard, Products, and Manage Orders links in the nav.

### 5. Run both apps

```bash
# terminal 1
cd shelfstock/backend
npm run dev        # http://localhost:4000

# terminal 2
cd shelfstock/frontend
npm run dev         # http://localhost:3000
```

Visit `http://localhost:3000`.

## Deployment (free tiers)

### Backend → Railway or Render

1. Push this repo to GitHub.
2. Create a new Railway/Render project from the `backend/` directory
   (set the root directory if the platform asks).
3. Add a PostgreSQL plugin/service — both Railway and Render offer a free
   Postgres instance.
4. Set env vars: `DATABASE_URL` (from the Postgres plugin), `JWT_SECRET`,
   `CORS_ORIGIN` (your Vercel frontend URL once you have it), `PORT` (usually
   auto-set by the platform).
5. Build command: `npm run build`. Start command: `npm start`.
6. Run the schema against the hosted DB:
   `psql $DATABASE_URL -f src/db/schema.sql` (or run `npm run db:setup` with
   `DATABASE_URL` pointed at the hosted instance). Re-run it after pulling
   updates — it's idempotent and applies any new columns/constraints.

### Frontend → Vercel

1. Import the repo into Vercel, set the root directory to `frontend/`.
2. Env vars: `NEXT_PUBLIC_API_URL` = your deployed backend URL,
   `NEXT_PUBLIC_EXCHANGE_RATE_API` = `https://api.frankfurter.app/latest?from=USD`.
3. Deploy. Update the backend's `CORS_ORIGIN` to match the resulting Vercel URL.

## API summary

| Method          | Path                               | Auth             |
| --------------- | ---------------------------------- | ---------------- |
| POST            | `/api/auth/register`               | –                |
| POST            | `/api/auth/login`                  | –                |
| GET             | `/api/products`                    | –                |
| GET             | `/api/products/:id`                | –                |
| GET             | `/api/categories`                  | –                |
| POST/PUT/DELETE | `/api/products/:id`                | admin            |
| POST            | `/api/orders`                      | user             |
| GET             | `/api/orders/my`                   | user             |
| GET             | `/api/orders/:id`                  | user (own order) |
| GET             | `/api/orders`                      | admin            |
| PATCH           | `/api/orders/:id/status`           | admin            |
| GET             | `/api/analytics/summary`           | admin            |
| GET             | `/api/analytics/revenue-over-time` | admin            |
| GET             | `/api/analytics/top-products`      | admin            |
