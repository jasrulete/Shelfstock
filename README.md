# ShelfStock

[![CI](https://github.com/jasrulete/Shelfstock/actions/workflows/ci.yml/badge.svg)](https://github.com/jasrulete/Shelfstock/actions/workflows/ci.yml)

**🔗 Live demo: [shelfstock-jer2x.vercel.app](https://shelfstock-jer2x.vercel.app/)**

A full-stack e-commerce storefront: product browsing/search/filtering, a cart,
Cash-on-Delivery checkout with shipping details, an order lifecycle enforced by
a server-side transition matrix (pending → shipped → completed, with
cancellation restoring stock only while the goods have not been handed over),
JWT auth, and an admin area with analytics, product management, and order
fulfillment.

**Stack:** Next.js 15 (App Router) + TypeScript + Tailwind on the frontend,
Express + TypeScript + PostgreSQL for the API, which runs inside the Next.js
deployment as a serverless function. No paid services required.

## 🐳 Run with Docker

The fastest way to run the whole stack. The only prerequisite is
[Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker
Engine + the Compose plugin) — no local Node or PostgreSQL needed.

```bash
docker compose up -d --build
```

Then open **http://localhost:3000**. On the first start Docker builds both
images (a few minutes) and Postgres applies `frontend/db/schema.sql`
automatically, so the store comes up with demo products already seeded.

### What's running

| Service | Image / build          | Container port | Host port (default) | Purpose                                              |
| ------- | ---------------------- | -------------- | ------------------- | ---------------------------------------------------- |
| `web`   | `frontend/Dockerfile`  | 3000           | `3000`              | Next.js storefront + admin UI                        |
| `db`    | `postgres:17-alpine`   | 5432           | `5433`              | PostgreSQL; data persists in the `db_data` volume    |

Startup is ordered by healthchecks: `db` must pass `pg_isready` before `web`
starts, and `web` must answer `/api/health` (which touches Postgres) before it
is considered ready. Check status with
`docker compose ps`, logs with `docker compose logs -f web`.

`db` is published on host port **5433** (not 5432) so it never clashes with a
locally installed Postgres. Connect to it with
`psql postgres://postgres:postgres@localhost:5433/shelfstock`.

### Environment variables

Everything works out of the box with the defaults below. Override any of them
inline (`WEB_PORT=3001 docker compose up -d --build`) or via a `.env` file
next to `docker-compose.yml`.

| Variable     | Default                                     | Purpose                                                                                       |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `WEB_PORT`   | `3000`                                      | Host port for the storefront (which also serves `/api`).               |
| `DB_PORT`    | `5433`                                      | Host port for Postgres (container-internal traffic always uses 5432).                         |
| `JWT_SECRET` | `dev-only-insecure-secret-change-me-please` | Signs JWTs. Fine for a local demo; set a real one (`openssl rand -hex 32`) for anything else. |

Fixed (compose-internal) settings, listed for completeness: the `db` service
uses `postgres`/`postgres`/`shelfstock` as user/password/database, and the
`web` service receives `DATABASE_URL=postgres://postgres:postgres@db:5432/shelfstock?sslmode=disable`
(`sslmode=disable` because the API enables SSL for any non-`localhost` DB host,
and the bundled Postgres doesn't use SSL). `RESEND_API_KEY` (transactional
email) is intentionally unset — the win-back email job just skips itself.

### Demo accounts

Seed two ready-to-use accounts (one per side of the app):

```bash
docker compose exec web node scripts/seed-demo-users.js
```

| Role | Email | Password |
| --- | --- | --- |
| Admin (dashboard, order fulfillment) | `admin@shelfstock.demo` | `ShelfAdmin123` |
| Customer (browse, checkout) | `shopper@shelfstock.demo` | `ShelfShopper123` |

The script is idempotent — it only resets these two accounts and never touches
real users, products, or orders. On a hosted database, run it wherever
`DATABASE_URL` points:

```bash
DATABASE_URL="postgres://..." node frontend/scripts/seed-demo-users.js
```

### Create your own admin user

Register an account normally at http://localhost:3000/register, then promote
it from inside the `web` container:

```bash
docker compose exec web node scripts/create-admin.js you@example.com
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

- **Storefront** — server-rendered listing and product pages, search
  (debounced, index-backed, relevance-ranked), category/price filters and
  sorting all held in the URL, server-side pagination, multi-currency price
  display (USD/PHP/EUR via live exchange rates with a cached fallback).
- **SEO** — per-product `generateMetadata` with Open Graph and Twitter cards,
  canonical URLs, JSON-LD `Product` structured data including price,
  availability and aggregate rating, plus generated `sitemap.xml` and
  `robots.txt`. A product link pasted into Messenger or LinkedIn unfurls with
  its own title, description and photo.
- **Cart** — localStorage-backed, synced across tabs and components,
  quantities capped at available stock.
- **Checkout** — shipping name/phone/address/city + Cash on Delivery. Orders
  are validated and created in a single DB transaction with row locking, and
  always stored in USD (other currencies are display-only conversions).
- **Order lifecycle** — orders start `pending`; admins move them along an
  explicit transition matrix enforced server-side while the order row is
  locked (`frontend/server/orderStatus.ts`). `pending` and `shipped` can be
  cancelled and their reserved stock comes back — under Cash on Delivery that
  is a refused parcel. `completed` and `cancelled` are both terminal: a
  delivered, cash-collected order's goods are with the customer, so putting
  them back on the shelf would make the listing disagree with the shelf.
- **Admin** — sales dashboard (revenue over time, top products), product
  CRUD (`/admin/products`), and order fulfillment (`/admin/orders`).
- **Security** — bcrypt password hashing, JWT auth with row-level ownership
  checks, helmet security headers, rate limiting (tight on auth endpoints),
  request body size limits, input validation on every write endpoint.

## Project layout

There is **one deployable**. The Express API runs inside the Next.js deployment
as a serverless function; there is no separate backend service.

```
shelfstock/
  docker-compose.yml         db + web, the whole stack locally
  frontend/                  the entire app; Vercel root directory
    app/                     App Router pages
      page.tsx               storefront, a Server Component
      products/[id]/         product page, a Server Component + client islands
      sitemap.ts robots.ts   generated from the database
    pages/api/[...path].ts   mounts the whole Express app as one function
    pages/api/cron/winback.ts
    server/                  the Express API
      app.ts                 createApp() - no listen()
      orderStatus.ts         the order transition matrix
      queries/products.ts    product reads, shared by the API and the pages
      routes/                products, orders, auth, categories,
                             customers, analytics, reviews
      db/index.ts            pg Pool, cached on globalThis
    tests/                   Vitest + Supertest
    db/schema.sql            idempotent schema + seed; doubles as the migration
    scripts/                 create-admin, seed-demo-users, e2e-smoke
```

`pages/api/[...path].ts` rather than `app/api/` is deliberate: Pages Router API
routes hand the handler Node's `req`/`res`, which is what Express middleware
expects. App Router routes use Web `Request`/`Response` and would need an
adapter. `pages/` and `app/` coexisting is intentional.

## Key engineering decisions (for interview walkthroughs)

- **Price snapshotting** — `order_items.price_at_purchase` is copied from the
  product's price at checkout time, not a live reference to `products.price`.
  See the comment block in `frontend/db/schema.sql` and
  `frontend/server/routes/orders.ts`.
- **Row-level authorization** — `GET /api/orders/:id` checks
  `req.user.id === order.user_id` in the handler itself; a valid JWT alone
  isn't enough to read someone else's order. See `frontend/server/routes/orders.ts`.
- **Server-side pagination** — `LIMIT`/`OFFSET` in SQL, not "fetch everything
  and slice in JS." See `frontend/server/routes/products.ts`.
- **Server rendering with one shared query layer** — `/` and `/products/[id]`
  are Server Components that read the database directly through
  `frontend/server/queries/products.ts`. They cannot go through the HTTP API,
  because `lib/api.ts` is deliberately relative and has no absolute base to
  fetch; rather than let the pages grow a second copy of the SQL, the Express
  routes and the pages call the same functions. Both pages are
  `force-dynamic`: a cached page would show a stock count that was true a
  minute ago, which is the one claim this store makes.
- **Filters live in the URL** — search, category, price and sort are query
  params read by the server, not `useState`. A filtered view is shareable,
  bookmarkable and back-button-able, and it server-renders. The search box
  still debounces 400ms before writing to the URL, so typing costs one history
  entry per pause rather than one per keystroke. See
  `frontend/components/StorefrontControls.tsx`.
- **The connection pool is built on first use, not on import** — the
  storefront pages are Server Components, so `next build` imports the server
  modules to collect page data. While the `pg` Pool was constructed at import
  time, that made the build itself require a `DATABASE_URL` it never connects
  to, and both CI and the Dockerfile carried a fake one. `server/db/index.ts`
  now hands back a proxy that builds the real pool the first time anything
  touches it, so every `pool.query(...)` call site is unchanged and the build
  needs no database. A missing `DATABASE_URL` still fails by name on the first
  request rather than being swallowed.
- **Search: trigrams for matching, full text for ranking** — the search box
  is a substring search, so `ILIKE '%term%'` cannot use a btree index and a
  `tsvector` index cannot serve a substring at all. Matching therefore goes
  through `pg_trgm` GIN indexes on name and description, OR'd with a full-text
  match so that word forms are found too — "board" finds "Keyboard" via
  trigrams, "keyboards" finds it via stemming. The matched rows are then ranked
  with `ts_rank`, name weighted above description, so a product *called*
  "Mechanical Keyboard" beats one that merely mentions keyboards in its blurb.
  Relevance leads the ordering only when the shopper has not picked a sort, or
  the "Price: low to high" control would quietly do nothing. Measured on 40k
  rows: **8.9ms with the indexes against 1039ms sequentially scanning** for the
  same predicate. See `frontend/server/queries/products.ts`.
- **JSON-LD escaping** — the `Product` structured data is injected with
  `dangerouslySetInnerHTML`, and its payload includes names an admin types.
  `JSON.stringify` does not escape `<`, so `serializeJsonLd`
  (`frontend/lib/jsonLd.ts`) does - otherwise a product named `</script>...`
  is stored XSS. Covered by tests.
- **Exchange rate caching** — live rates are fetched once and cached in
  `localStorage` for 30 minutes, with a hardcoded fallback table if the free
  API is down or rate-limited. See `frontend/hooks/useExchangeRates.ts`.
- **Row locking on checkout** — `SELECT ... FOR UPDATE` on the product row
  during order creation prevents two simultaneous checkouts from overselling
  the last unit of stock. See `frontend/server/routes/orders.ts`.

## Testing

**API tests** — 112 Vitest + Supertest tests with the database mocked, covering
auth middleware, registration/login (including the email-enumeration defense
and email-format validation, which login deliberately skips so accounts
predating the rule can still sign in), pagination caps and sort-column
whitelisting, the order transition matrix
(every refused edge, and that a refused cancellation restores no stock),
JSON-LD escaping against a script-tag breakout, and the checkout transaction:
price snapshotting (a hostile client-supplied price is ignored), stock
decrement/restore, and row-level authorization.

**Component tests** — 38 tests with Testing Library, aimed at the behaviour
that is easy to break silently rather than at markup:

- **Cart** (`useCart`) — quantity can never exceed the stock last seen, repeat
  adds accumulate but stay capped, dropping to zero removes the line, state is
  written through to `localStorage`, and a change made in another tab is picked
  up via the `storage` event.
- **Add-to-cart dialog** — the accessibility contract a `role="dialog"`
  attribute does not give you: focus moves in on open, Tab and Shift+Tab wrap
  inside it, Escape closes, the page behind is scroll-locked, and focus returns
  to whatever opened it.
- **Storefront filters** (`StorefrontControls`) — search is debounced to one
  navigation per pause rather than one per keystroke, filters go through
  `push` so the back button undoes them, changing a filter drops the stale page
  number while keeping the other filters, and the controls re-sync when the URL
  changes underneath them.

Vitest runs these as two projects: the API suite on Node, the component suite
on a DOM (`.ts` vs `.tsx` selects between them), so the server tests don't pay
for a DOM on every run.

```bash
cd frontend && npm test              # both
npx vitest run --project server      # or just one
```

Each behavioural claim above was checked by breaking the production code on
purpose and confirming the right tests — and only those — went red.

**End-to-end smoke test** — the same invariants exercised against the real,
Dockerized stack (PostgreSQL + the app, no mocks): refusing a malformed email →
register → checkout → stock decrement → snapshot → cross-user 404 → admin
lifecycle → refusing to cancel a completed order → cancellation stock restore →
analytics.

```bash
docker compose up -d --wait
PROMOTE_CMD="docker compose exec -T db psql -U postgres -d shelfstock -c \"UPDATE users SET role='admin' WHERE email='{EMAIL}'\"" \
  node frontend/scripts/e2e-smoke.mjs
docker compose down -v
```

Both run in CI on every push (see the badge above): unit tests + typecheck,
the frontend build, and the E2E job, which builds the Docker images and runs
the smoke test against them.

## Local setup

### Prerequisites

- Node.js 22 (what CI and the Docker images use)
- PostgreSQL running locally, or a free instance from [Neon](https://neon.tech)

### 1. Clone and install

There is only one package to install — the API lives inside the Next.js app.

```bash
cd shelfstock/frontend
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
# set DATABASE_URL to your local Postgres, and JWT_SECRET to 32+ characters
# (generate one with: openssl rand -hex 32)
```

### 3. Create the database and load the schema

```bash
createdb shelfstock
npm run db:setup   # runs db/schema.sql against DATABASE_URL
```

This also seeds a handful of demo products so the UI isn't empty. The schema
is idempotent — re-running it on an existing database is safe and applies any
new columns/constraints (it's also how you migrate a deployed DB).

> **Windows note:** `npm run db:setup` uses `psql $DATABASE_URL`, which needs
> a POSIX shell (Git Bash). In PowerShell, run
> `psql -d "<your-database-url>" -f db/schema.sql` directly.

### 4. Create an admin user

Register an account through the app first, then promote it:

```bash
npm run create-admin -- you@example.com
```

Admins see the Dashboard, Products, and Manage Orders links in the nav.

### 5. Run the app

There is only one app to start - the API is served by the same Next.js process.

```bash
npm run dev         # http://localhost:3000
```

Visit `http://localhost:3000`. The API is at `http://localhost:3000/api`.

## Deployment (free tiers)

The app deploys as a single unit: the Express API runs inside the Next.js
deployment as a serverless function, so there is no separate backend service to
host, no CORS origin to keep in sync, and no API URL baked into the browser
bundle that can outlive the server it points at.

### App → Vercel

1. Import the repo into Vercel and set the root directory to `frontend/`.
2. Env vars:
   - `DATABASE_URL` — your Postgres connection string. Use the **pooled**
     one if your provider offers it (Neon's contains `-pooler`); serverless
     opens many short-lived connections and the direct string will run out.
   - `JWT_SECRET` — 32+ characters, e.g. `openssl rand -hex 32`.
   - `CRON_SECRET` — required for the daily win-back job; without it the cron
     endpoint refuses to run rather than sitting open.
   - `RESEND_API_KEY` — optional. Unset means transactional email is a no-op.
3. Deploy. `vercel.json` registers the win-back cron.

### Database → Neon (or any Postgres)

1. Create a free project — no card required.
2. Apply the schema:
   `psql "$DATABASE_URL" -f frontend/db/schema.sql`. It is idempotent, so
   re-run it after pulling updates to pick up new columns and tables.
3. Optionally seed demo accounts, orders and reviews:
   `DATABASE_URL=... node frontend/scripts/seed-demo-users.js`.

## API summary

| Method          | Path                               | Auth             |
| --------------- | ---------------------------------- | ---------------- |
| POST            | `/api/auth/register`               | –                |
| POST            | `/api/auth/login`                  | –                |
| GET             | `/api/products`                    | –                |
| GET             | `/api/products/low-stock`          | –                |
| GET             | `/api/products/:id`                | –                |
| GET             | `/api/products/:id/reviews`        | –                |
| POST            | `/api/products/:id/reviews`        | user             |
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
