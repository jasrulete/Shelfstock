# ShelfStock

A small, full-stack e-commerce storefront built as a portfolio project: product
browsing/search/filtering, a cart, checkout that creates real orders, JWT auth,
and an admin analytics dashboard.

**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind on the frontend,
Express + TypeScript + PostgreSQL on the backend. No paid services required.

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

This also seeds a handful of demo products so the UI isn't empty.


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
6. Run the schema once against the hosted DB:
   `psql $DATABASE_URL -f src/db/schema.sql` (or run `npm run db:setup` with
   `DATABASE_URL` pointed at the hosted instance).

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
| POST/PUT/DELETE | `/api/products/:id`                | admin            |
| POST            | `/api/orders`                      | user             |
| GET             | `/api/orders/my`                   | user             |
| GET             | `/api/orders/:id`                  | user (own order) |
| GET             | `/api/analytics/summary`           | admin            |
| GET             | `/api/analytics/revenue-over-time` | admin            |
| GET             | `/api/analytics/top-products`      | admin            |
