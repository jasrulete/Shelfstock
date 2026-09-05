# Architecture

**Canonical.** If the code disagrees with this document, one of them is a bug —
see [README.md](README.md#when-a-doc-and-the-code-disagree).

ShelfStock is a full-stack e-commerce storefront with an Android companion app
for the shop's admins. Product browsing, cart, cash-on-delivery checkout, an
order lifecycle, JWT auth, reviews, and an admin area with analytics, product
management, order fulfilment and a CRM.

**It is a portfolio project.** Optimise for "a recruiter clicks the link and it
works and looks considered", not for scale. Every constraint below follows from
that plus: zero ongoing cost, one developer, Vercel Hobby, Neon free tier, no
persistent process.

---

## 1. The shape of the system

```
                    ┌──────────────────────────────────┐
   browser ────────▶│  Vercel deployment (ONE project) │
                    │                                  │
                    │  Next.js app/ + pages/           │
                    │    ├─ Server Components ──┐      │
                    │    └─ client pages ─┐     │      │
                    │                     ▼     │      │
   Android app ────▶│  pages/api/[...path] ─▶ Express  │
   (companion)      │                   server/    │   │
                    │                       │      │   │
                    │       server/queries/ ◀──────┘   │
                    └────────────────┬─────────────────┘
                                     ▼
                              Neon PostgreSQL
```

Two repositories, one backend:

| Repo | Contains |
|---|---|
| [`jasrulete/Shelfstock`](https://github.com/jasrulete/Shelfstock) | The web app **and** the API that both clients use. This repo. |
| [`jasrulete/shelfstock-companion`](https://github.com/jasrulete/shelfstock-companion) | The Expo/React Native Android app. Consumes this repo's API. |

**This repo is canonical for the API contract.** See [API.md](API.md). When the
companion disagrees with it, the companion is wrong — that is not hypothetical,
it has already happened (see [ADR-0007](adr/0007-server-owns-the-order-lifecycle.md)).

## 2. Layout

```
frontend/                  ← the entire app; Vercel root directory
  app/                     App Router pages
    page.tsx               storefront (Server Component, force-dynamic)
    products/[id]/         product detail (Server Component, force-dynamic)
    error.tsx              failure boundary
    global-error.tsx       root-layout failure boundary (imports nothing)
    loading.tsx            skeleton shown while Neon wakes
    not-found.tsx          404
    admin/                 client pages: products, orders, analytics, CRM
    cart/ checkout/ orders/ login/ register/
    forgot-password/ reset-password/
    sitemap.ts robots.ts   generated from the database
  pages/api/[...path].ts   mounts the whole Express app as ONE function
  pages/api/cron/winback.ts
  server/                  the Express API
    app.ts                 createApp() — no listen()
    orderStatus.ts         THE order transition matrix
    afterResponse.ts       work that must outlive the HTTP response
    db/index.ts            pg Pool, built on FIRST USE (proxy), not on import
    queries/products.ts    product reads, shared by the API AND the pages
    routes/                auth, products, categories, orders, customers,
                           devices, analytics (+ reviews, nested under products)
    middleware/            auth (requireAuth, optionalAuth), adminOnly
  migrations/              ordered SQL migrations (node-pg-migrate)
  tests/                   vitest, two projects — see DEVELOPMENT.md §7
  scripts/                 create-admin, seed-demo-users, e2e-smoke
```

## 3. Invariants

These are the rules that must not be broken without an ADR recording the
change. Each says what enforces it, because a rule with no enforcement is a
wish.

### INV-1 — There is exactly one deployable

The Express API runs *inside* the Next.js deployment as a serverless function.
There is no separate backend service and no second host to configure.

*Enforced by:* `pages/api/[...path].ts`, and by there being no other deploy
target. *Why:* the previous separate backend died with a Railway trial and took
the storefront with it. See [ADR-0001](adr/0001-express-inside-nextjs.md).

### INV-2 — There is no `NEXT_PUBLIC_API_URL`

The browser calls `/api` **relatively**. An absolute backend host baked into
the bundle at build time is exactly what left the storefront showing "Failed to
fetch" when the old backend went away. There is no CORS middleware either — it
is the same origin, so none is needed.

*Enforced by:* `lib/api.ts` having no base URL, and `.env.example` documenting
the prohibition. *If you find yourself needing one, you are about to break
INV-3.*

### INV-3 — Server Components read the database, not the API

Because of INV-2 there is no absolute base URL to fetch during a server render.
`app/page.tsx` and `app/products/[id]/page.tsx` call
`server/queries/products.ts` — the same functions the Express routes call.

*Enforced by:* the shared query module. *If you add a page that needs product
data, extend that module rather than writing the SQL twice.*

### INV-4 — `server/orderStatus.ts` is the only order lifecycle

```
pending ──▶ shipped ──▶ completed
   │           │
   └───────────┴──────▶ cancelled
```

`pending` may also go straight to `completed`. `completed` and `cancelled` are
terminal. Nothing moves backwards to `pending`. No status may move to itself.

This is an **inventory-correctness** rule, not a UI one: stock is decremented
on create and restored on `cancelled`, so an extra edge double-counts units.

*Enforced by:* `canTransition()` on the server, and `allowed_transitions`
served on every order payload — the web admin imports the map, the companion
renders the served field, and **no client keeps a copy**
([ADR-0007](adr/0007-server-owns-the-order-lifecycle.md), implemented
2026-09-05 after the companion's copy drifted). `tests/orders.routes.test.ts`
pins the field on all four order responses.

### INV-5 — Schema changes only through ordered, forward-only migrations

`frontend/migrations/`, applied by `node-pg-migrate`, tracked in a
`pgmigrations` table. **There are no down migrations** — one for the baseline
would drop every table.

*Enforced by:* the absence of any other schema path (Postgres'
`docker-entrypoint-initdb.d` mount was deliberately removed) and a one-shot
`migrate` compose service that runs before `web`. See
[ADR-0003](adr/0003-forward-only-migrations.md) and
[DATA-MODEL.md](DATA-MODEL.md).

### INV-6 — The pg Pool is built on first use, never at import

`server/db/index.ts` exports a proxy. Importing it from code that never queries
must not throw, or `next build` breaks the moment a page becomes a Server
Component — which is what forced fake connection strings into CI and the
Dockerfile before.

*Enforced by:* `tests/db.pool.test.ts` — including "can be imported with no
DATABASE_URL at all" and "still fails loudly, and by name, when something
actually uses it" — and by CI's build step running with **no** env set. *If
that step ever fails on a missing `DATABASE_URL`, something has gone back to
constructing at import time; fix that rather than adding a placeholder.*

### INV-7 — Every API response is JSON, and never carries an internal message

Both clients read `error` off a JSON body on every non-2xx. The terminal error
handler in `server/app.ts` gives specific messages to exactly two body-parser
failures and a **fixed** string to everything else.

*Why the fixed string:* `err.message` from pg carries the table and column that
failed, and sometimes bound parameter values. The real error goes to the server
log only. The same rule governs `app/error.tsx` and `app/global-error.tsx`:
fixed copy plus at most `error.digest`, never `error.message`, never a stack.

*Enforced by:* `tests/errorContract.routes.test.ts`.

### INV-8 — `products.barcode` is admin-only

It is an internal stock-keeping code that exists for the companion scanner. It
is absent from every public response and present — on the list and by id —
only for an admin JWT (`optionalAuth` on both routes). The store's own codes
are EAN-13s in GS1's internal-use prefix `200`, derived from the product id by
`lib/ean13.js`; a code that came from real packaging is never overwritten.

*Enforced by:* `tests/products.barcode.test.ts`, covering every caller shape
on both routes. *The by-id strip is a `delete` on the `p.*` result rather than
a column allowlist, so a future migration cannot silently re-widen the
projection; the list adds the column only when asked.*

### INV-9 — Post-response work goes through `afterResponse()`, and is never awaited first

Routes send the response and *then* start the confirmation email and the admin
push. `pages/api/[...path].ts` resolves on `res.once('finish')`, so without
`waitUntil()` Vercel may freeze the instance mid-send.

**Equally binding: it must not be awaited before responding.** Awaiting a
third-party call after `COMMIT` turns a hung Resend or Expo into a 504 on an
order that actually succeeded — and `POST /api/orders` has **no idempotency
key**, so the client's retry places a second order and decrements stock twice.
A lost notification is a smaller failure than a duplicate order.

*Enforced by:* `server/afterResponse.ts` and `tests/push.test.ts`.

### INV-10 — No customer PII on unencrypted device storage

Companion-side. The JWT is in `expo-secure-store`; AsyncStorage is **not**
encrypted, so no order query is persisted to it at all. Offline reads cover
products only.

*Why the whole of orders and not just the detail:* `Order` itself carries
`shipping_name`, `shipping_phone`, `shipping_address` and `shipping_city`, and
`OrderListItem` adds `user_email` — the list is as sensitive as the detail.

*Enforced by:* `src/queryClient.ts`'s `shouldDehydrateQuery`. See
[ADR-0004](adr/0004-offline-reads-not-writes.md).

### INV-11 — Secrets never reach the client bundle

Anything named `NEXT_PUBLIC_*` is compiled into JavaScript the browser
downloads. Only `NEXT_PUBLIC_EXCHANGE_RATE_API` qualifies, and it is a public
no-key endpoint. `DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET` and
`RESEND_API_KEY` are server-only and must stay unprefixed.

### INV-12 — The search expression must stay byte-identical to the indexed one

`SEARCH_VECTOR` in `server/queries/products.ts` and the GIN index in the
baseline migration are the same string. A one-space drift silently reverts
every search to a sequential scan — measured at **1039ms vs 8.9ms** on 40k rows.

*Enforced by:* `tests/products.routes.test.ts`, which asserts the emitted SQL
contains the exported constant.

### INV-13 — Every change to `products.stock` writes a ledger row in the same transaction

Four paths move stock: the checkout decrement, the cancel restore, the admin
product form, and `POST /api/products/:id/adjust-stock`. Each writes a
`stock_adjustments` row through `recordStockAdjustment()` on the **same
client, inside the same `BEGIN`/`COMMIT`** as its `UPDATE`. A row without its
change, or a change without its row, is a bug.

Two rules follow. **Clients move stock by delta, never by `PUT` of a computed
value** — "read 12, send 13" swallows a concurrent order's decrement. And **the
server rejects rather than clamps**: a −5 against a stock of 3 is a `409`, not
a floor at 0 with a ledger row that claims −5.

*Enforced by:* `tests/stockLedger.routes.test.ts`, plus one ledger test for
each order path in `tests/orders.routes.test.ts`. *A fifth path that changes
stock writes a row, or it does not merge.*

## 4. Four things that look odd until you know why

1. **`pages/api/[...path].ts`, not `app/api/`.** Pages Router API routes hand
   the handler Node's `req`/`res`, which is what Express middleware expects.
   App Router routes use Web `Request`/`Response` and would need an adapter.
   `pages/` and `app/` coexisting is intentional.
2. **`overrides` in `frontend/package.json`.** Next pins `postcss` exactly and
   declares `sharp` as `^0.34.3` (a caret cannot cross a 0.x minor), both
   landing in vulnerable ranges; `nanoid` likewise. npm's own advice was to
   *downgrade* Next, which was worse. Remove an override only once Next depends
   on a patched version itself.
3. **Two rate limiters, both with object `message`s.** A bare string is served
   as `text/plain` and breaks INV-7.
4. **`/health` and `/api/health` are different.** `/health` answers `ok`
   unconditionally; `/api/health` actually touches Postgres. Monitor the second
   one — the first went on answering `ok` through a broken deployment.

## 5. Where to go next

| Question | Document |
|---|---|
| What does the API return? | [API.md](API.md) |
| What is in the database? | [DATA-MODEL.md](DATA-MODEL.md) |
| What are we exposed to? | [SECURITY.md](SECURITY.md) |
| How do I run, deploy, or fix it? | [OPERATIONS.md](OPERATIONS.md) |
| How do I work on it? | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Why is it like this? | [adr/](adr/) |
| What is next? | [ROADMAP.md](ROADMAP.md) |
