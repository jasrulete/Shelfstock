# ShelfStock — Session Handover

> **This is a historical session log, not a specification.**
>
> The source of truth is **[`docs/`](docs/)**. Where this file overlaps with it,
> `docs/` wins — and this file is no longer updated as the system changes.
>
> | Looking for | Read instead |
> |---|---|
> | Architecture, and the rules that must not be broken | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
> | The API contract | [docs/API.md](docs/API.md) |
> | Deployment, env vars, runbook | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
> | Local setup, workflow, gotchas | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
> | Why something is the way it is | [docs/adr/](docs/adr/) |
> | What is next | [docs/ROADMAP.md](docs/ROADMAP.md) |
>
> What is still worth reading here: **§3 and §3a**, the record of what was
> built and how each claim was verified. That is history, and history does not
> go stale.

Written 2026-08-03, last updated 2026-08-17. Point a new conversation at this
file to pick up where the last one left off.

---

## 1. What this is

A full-stack e-commerce storefront: product browsing/search/filtering, cart,
Cash-on-Delivery checkout, order lifecycle, JWT auth, reviews, and an admin area
with analytics, product management, order fulfilment and a CRM.

**It is a portfolio project.** Optimise for "a recruiter clicks the link and it
works and looks considered", not for scale.

| | |
|---|---|
| Live | https://shelfstock-jer2x.vercel.app |
| Repo | https://github.com/jasrulete/Shelfstock |
| `main` at handover | `1319fb6` |
| Tests | 177 (139 API on Node + 38 component on a DOM) |
| Stack | Next.js 15.5.22 · React 18.3.1 · Express · PostgreSQL (Neon) |

**Demo logins** (seeded, safe to share):
- `admin@shelfstock.demo` / `ShelfAdmin123`
- `shopper@shelfstock.demo` / `ShelfShopper123`

---

## 2. Architecture — read this before changing anything

**There is one deployable.** The Express API runs *inside* the Next.js
deployment as a serverless function. There is no separate backend service.

```
frontend/                  ← the entire app; Vercel root directory
  app/                     App Router pages. `/` and `/products/[id]` are
                           Server Components (force-dynamic) with client
                           islands; everything else is still a client page.
    sitemap.ts robots.ts   generated from the database
  pages/api/[...path].ts   mounts the whole Express app as one function
  pages/api/cron/winback.ts
  server/                  the Express API (was backend/src)
    app.ts                 createApp() — no listen()
    orderStatus.ts         the order transition matrix
    queries/products.ts    product reads, shared by the API AND the pages
    routes/                7 routers: products, orders, auth, categories,
                           customers, analytics, reviews
    db/index.ts            pg Pool, built on FIRST USE (proxy), not on import
  tests/                   15 vitest files, 177 tests (two Vitest projects:
                           *.test.ts on Node, *.test.tsx on a DOM)
  migrations/              ordered SQL migrations (node-pg-migrate)
  scripts/                 create-admin, seed-demo-users, e2e-smoke
```

Four decisions that will look odd unless you know why:

1. **`pages/api/[...path].ts`, not `app/api/`.** Pages Router API routes hand
   the handler Node's `req`/`res`, which is what Express middleware expects.
   App Router routes use Web `Request`/`Response` and would need an adapter.
   `pages/` and `app/` coexisting is intentional.

2. **No `NEXT_PUBLIC_API_URL`.** The browser calls `/api` relatively. An
   absolute backend host baked into the bundle at build time is precisely what
   left the storefront showing "Failed to fetch" when the old backend died.
   Do not reintroduce it. There is no CORS middleware either — same origin.

3. **Server Components read the database directly, not the API.** Because of
   decision 2 there is no absolute base URL to fetch during a server render,
   and adding one back is exactly the mistake decision 2 exists to prevent. So
   `/` and `/products/[id]` call `server/queries/products.ts` — the same
   functions the Express routes call. If you add a page that needs product
   data, extend that module rather than writing the SQL twice.

4. **`overrides` in `frontend/package.json`.** Next pins `postcss` exactly and
   declares `sharp` as `^0.34.3` (a caret can't cross a 0.x minor), both of
   which land in vulnerable ranges. The overrides force patched versions.
   npm's own advice was to *downgrade* Next, which was worse. Remove each
   override only once Next depends on a patched version itself.

---

## 3. What was done in this session

Five PRs, all merged to `main`, each green in CI.

**#1 — Design system + accessible forms.** Design tokens (`gray` remapped to a
warm stone ramp so every existing `gray-*` utility warms up for free;
`borderRadius` DEFAULT 4→8px, `lg` 8→10px so existing classes land on the new
scale). Inter + Fraunces via `next/font`. Primitives: `Button`, `Card`, `Badge`,
`Field`, `FilterPill` — replacing 31 copies of a card class string and 14 of a
button one. Every form control got a real `<label>` (there were zero),
`autoComplete`, `aria-describedby` hints, and 16px inputs on mobile so iOS
Safari stops zooming. The add-to-cart modal had `role="dialog"` with none of the
behaviour; it now traps focus, closes on Escape and restores focus.

**#3 — Storefront, photography, reviews, product page, security.**
- Homepage hero with a **live low-stock rail** (real inventory, not a curated
  "featured" list). New public `GET /api/products/low-stock` — the existing
  analytics one is `adminOnly`.
- Product cards show the converted price with the **USD original beneath**,
  because orders are charged in USD.
- Six real Unsplash photos replacing grey placeholders. **Every one was
  downloaded and viewed before committing** — the first "programming book"
  result was a laptop, the first t-shirt was on dark concrete.
- New `ProductImage` component with a real fallback (a null or broken URL used
  to leave an empty grey square in five separate files).
- **Reviews** with verified-purchase badges, `UNIQUE (product_id, user_id)`,
  upsert semantics, and reviewer names derived + masked so emails never leave
  the server.
- **Product page rebuild**: breadcrumb, gallery (`product_images` table),
  related products, 4 FAQs.
- Next 14.2.5 → 15.5.22, `bcrypt` → `bcryptjs`, ESLint added and wired into CI.

**#4 — Serverless migration.** `backend/` absorbed into `frontend/`. Win-back
job's `setInterval` became a Vercel Cron endpoint. Docker Compose dropped to two
services. CI collapsed to one job.

**#5 — Seed low stock.** Fresh installs had 60–300 stock so the scarcity UI was
invisible. Uses `LEAST(stock, target)` so it can lower but **never raise** —
re-running against a store with real sales is a no-op, and sold out stays sold
out.

---

## 3a. Done since this was written (session of 2026-08-03 / 04)

Seven PRs, #6 through #11 plus the search work, all merged to `main` and green
in CI. Each was verified against something real - a query plan, a fresh
database, a running stack, a deliberately broken mutation - rather than
asserted. In order:

- **Neon password rotated.** The `neondb_owner` password on the `production`
  branch was reset, `DATABASE_URL` replaced in Vercel production, and the
  project redeployed. The leaked credential is dead. Verified rather than
  assumed: the live API started returning 500 the moment the password changed
  — which is also what proved production really was pointing at that role —
  and came back serving the same six products after the redeploy.
- **Preview deployments have a database.** Neon branch `preview`
  (`br-curly-bonus-aoicbjaa`, endpoint `ep-broad-unit-ao63kqn6`) branched from
  `production`, wired into the Vercel *preview* environment with its own
  freshly generated `JWT_SECRET`. Its role password was reset **after**
  branching so preview does not carry production's credential; verified by
  pointing the preview credential at the production host and watching it be
  rejected. `CRON_SECRET` is deliberately left unset in preview, so the
  win-back route 503s there and no preview deployment can email real customers.
- **Order transitions enforced server-side** (PR #6) — old section 6.3, closed.
- **SSR + SEO done, and filters moved into the URL** (PR #6). `/` and
  `/products/[id]` are Server Components reading the database through a shared
  query layer (`server/queries/products.ts`) that the Express routes now use
  too — the pages cannot call the HTTP API, because `lib/api.ts` is relative by
  design and has no absolute base to fetch. Both are `force-dynamic`, so stock
  counts are never a cached approximation. Adds per-product Open Graph/Twitter
  metadata, canonical URLs, JSON-LD `Product` (with a `serializeJsonLd` escape
  step, because a product name is admin-typed and `JSON.stringify` does not
  escape `<`), `sitemap.xml` and `robots.txt`. Measured on a production build:
  three blocking client API calls became **zero** and the content is in the
  first HTML response — TTFB 64ms, DOM ready 401ms against a local database.
  `hooks/useProducts.ts`, `SearchBar` and `FilterPanel` are gone, replaced by
  `StorefrontControls`. Closes old items 1 and 5.
- **Migrations replaced schema.sql.** `node-pg-migrate`, ordered SQL under
  `frontend/migrations/`, tracked in a `pgmigrations` table, so what a database
  is on is now a question with an answer. The baseline is the old schema.sql
  verbatim; because every statement in it was already idempotent, an existing
  database adopts it by just running `migrate up` - no fake-apply step. Proved
  by dropping `pgmigrations` from a populated database and re-running: the
  baseline replayed harmlessly, recorded itself, and left all six products and
  the same six indexes. **Forward-only, no down migrations** - one for the
  baseline would drop every table. Docker's initdb mount is gone; a one-shot
  `migrate` compose service runs before `web`, so one code path applies schema
  everywhere. Closes the *no migration tool* item.
- **The pg Pool is built on first use rather than on import.** It was
  constructed on the export line, so importing `server/db` threw
  `DATABASE_URL is not set` even from code that never queries - which broke
  `next build` once the pages became Server Components, and forced a fake
  connection string into both CI and the Dockerfile. It is now a proxy that
  builds the real pool on first touch, so no call site changed and the
  `Pool` type still covers generics like `pool.query<User>()`. **Both
  placeholders are deleted**, and the build was verified with neither
  `DATABASE_URL` nor `JWT_SECRET` set. A missing URL still throws by name on
  the first request; a test pins that so deferring the failure never becomes
  swallowing it. Closes the *pool built at import* item.
- **Search is index-backed, searches descriptions, and ranks by relevance.**
  It was `ILIKE '%term%'` over `name` only, so the `to_tsvector` GIN index was
  never usable and every search sequentially scanned. Matching now goes through
  `pg_trgm` GIN indexes on name and description, OR'd with a full-text match,
  so "board" still finds "Keyboard" (trigram) *and* "keyboards" finds it
  (stemming). Matched rows are ranked with `ts_rank`, name weighted above
  description; relevance leads only when the shopper has not chosen a sort.
  Also fixes two things found while testing: `%` and `_` in a search term were
  treated as wildcards, and the ordering had no unique tiebreaker, so
  equally-ranked rows could repeat or vanish between pages. Measured on 40k
  rows with EXPLAIN ANALYZE: **8.9ms using all three indexes in a BitmapOr, vs
  1039ms sequentially scanning** the same predicate. A test asserts the query's
  full-text expression is byte-identical to the one the migrations index,
  because a one-space drift silently reverts it to a sequential scan.
- **Password reset added.** `POST /api/auth/forgot-password` and
  `/reset-password`, plus the two pages. Tokens are 32 bytes of CSPRNG output
  stored as a SHA-256 hash - never the raw value - single use, one hour, and
  issuing one retires that user's outstanding tokens. `forgot-password` returns
  the same 200 and the same body for a registered and an unregistered address,
  and `reset-password` gives one message for unknown, expired and already-used
  alike, so neither becomes an oracle. **Known gap, deliberate:** existing JWTs
  are NOT invalidated, so a stolen session survives a reset for up to its 7-day
  life. Fixing it means a database read on every authenticated request, turning
  auth from stateless to stateful; that trade was taken knowingly and is
  recorded in the route's comment too. **Email does not actually send** -
  RESEND_API_KEY is unset in every environment, so this shares the same fate as
  order confirmations. In non-production the link is logged to the console so
  the flow is testable by hand. The E2E smoke test proves the whole flow against
  real Postgres: identical answers for known/unknown, the password genuinely
  changes, the old one stops working, and a replayed token is refused.
- **Registration validates the email format.** `typeof email === 'string'` was
  the only check, so `"asdf"` registered and every order mail to it bounced
  forever. Now checked against the *normalized* address: one `@`, something
  either side, a domain of two or more non-empty dot-separated labels, no
  whitespace, and at most the 254 characters RFC 5321 allows. Deliberately not
  an RFC 5322 parser. **Login does not validate** - accounts created before the
  rule have addresses that would fail it, and locking those people out of their
  own order history would be worse than the bug being fixed; a test pins that.
  Probed against the running stack rather than assumed: plus tags, subdomains,
  apostrophes and unicode local parts are accepted; `user@localhost`, doubled
  and leading dots, tabs and CRLF-injection attempts are refused. Bracketed
  IP-literals (`user@[192.168.0.1]`) still pass - noted in the code as a
  deliberate non-goal. The E2E smoke test now opens by proving a malformed
  address is refused by the real API.
- **Frontend tests added.** 38 Testing Library tests, so the suite is 123 across
  two Vitest projects (`.test.ts` on Node, `.test.tsx` on a DOM). Covers the
  cart's stock cap and cross-tab sync, the add-to-cart dialog's focus
  trap/Escape/scroll-lock/focus-restore, and `StorefrontControls` (debounce,
  `push` not `replace`, dropping the stale page number). **Every behavioural
  claim was mutation-checked** — the production code was broken on purpose and
  the right tests, and only those, went red. Closes the *zero frontend tests* item.
- **README and `.env.example` corrected** (PR #6). Following the README did not
  work: Local setup installed in the same directory twice (a leftover from
  folding `backend/` into `frontend/`), `npm run db:setup` was documented
  against a `src/db/schema.sql` that does not exist, and `.env.example` set
  `NEXT_PUBLIC_API_URL` — the variable §2 says must never come back — while
  omitting `DATABASE_URL` and `JWT_SECRET`. Also fixed: Next 14→15, 45→82
  tests, an `api` compose service that no longer exists, a `railway run`
  command, Node 18→22. Verified by running the documented commands.

**Not this session:** `main` also contains the companion-app API (PR #12,
barcode lookup, device tokens, order push) merged by a *parallel* conversation
working in the same repository. Nothing above touched it, and nothing above was
verified against it. If something in that area looks wrong, it is not from this
work.

### Verifying production quickly

None of these write anything, so they are safe to run against the live site:

```bash
curl https://shelfstock-jer2x.vercel.app/api/health
```

```bash
curl "https://shelfstock-jer2x.vercel.app/api/products?search=usb"
```

`/api/health` reports `{"status":"ok","database":"ok"}` only when the app can
actually reach Postgres. The search returns Wireless Mouse - the word only
appears in its *description*, so a hit proves the index-backed search is live
rather than the old name-only `ILIKE`.

To check the order transition matrix without mutating anything, PATCH a
completed order to `completed`: the matrix refuses self-transitions, so it
answers 400 and changes nothing either way. The old code would have accepted it
as a no-op, so the reply distinguishes the two safely.

---

## 4. Deployment

**Vercel** — project `shelfstock-frontend`, org `jer2xs-projects`, root
directory `frontend`, Git-connected to `main`.

Production env vars:
```
DATABASE_URL                  Neon pooled connection string (production branch)
JWT_SECRET                    32-byte random
CRON_SECRET                   32-byte random (win-back cron auth)
NEXT_PUBLIC_EXCHANGE_RATE_API https://api.frankfurter.app/latest?from=USD
```

Preview env vars:
```
DATABASE_URL                  Neon pooled string for the `preview` branch
JWT_SECRET                    its own 32-byte random, not production's
NEXT_PUBLIC_EXCHANGE_RATE_API (shared with production)
```
`CRON_SECRET` is intentionally absent from preview.

Preview deployments are behind Vercel's SSO deployment protection, so they are
only reachable by someone logged into the Vercel account. An unauthenticated
request to a preview URL gets a 302 to `vercel.com/sso-api`, not the app.

**Env changes require a redeploy** to take effect.

**Neon** — free tier, region `ap-southeast-1`, database `neondb`. Always use the
**pooled** string (contains `-pooler`); serverless opens many short-lived
connections and the direct endpoint will run out.

Apply schema / seed against any database:
```bash
cd frontend && DATABASE_URL="postgres://..." npm run migrate:up
DATABASE_URL=... node frontend/scripts/seed-demo-users.js
```

**Railway is dead and not coming back.** The old backend lived in project
`triumphant-tenderness` under a *third* account (a university address, not the
tradestockapps one, not the gmail one). The trial expired, Railway removed every
deployment, and the 108 MB Postgres volume is unreachable without an active
plan. That data is gone; nothing was migrated from it.

---

## 5. Local development

```bash
docker compose up -d --wait db          # Postgres on host port 5433
cd frontend
npm install
cp .env.example .env.local              # then set DATABASE_URL + JWT_SECRET
npm run migrate:up                      # REQUIRED - the db starts empty
npm run dev                             # app AND api on :3000
npm test                                # 177 tests
npm run lint
```

**`npm run migrate:up` is not optional.** Postgres' `docker-entrypoint-initdb.d`
mount is gone (see §3a), so a fresh `db` container has no schema and no seed
until the migrations run. A storefront with no products and a login that 500s
is what forgetting this looks like.

Full stack in Docker: `docker compose up -d --wait --build` →
http://localhost:3000. That path needs no separate step - compose runs a
one-shot `migrate` service before `web` starts.

### Running two conversations at once — give each its own worktree

**One working tree cannot be shared by two agent sessions.** This was learned
the hard way, twice in one day: a batch of uncommitted work appeared in a
session that had not written it, and later a branch was switched out from under
a running command, so a `git pull` landed on somebody else's feature branch. The
failure mode is silent — if both sessions write the same file, one just wins.

The convention: **the main tree belongs to whoever is already in it.** Every
additional conversation gets its own worktree.

```bash
git worktree add .claude/worktrees/<name> -b <branch> origin/main
```

Three things worth knowing before you do:

- **Each worktree needs its own `npm install`.** `node_modules` is not shared,
  which costs a few minutes and a few hundred MB per worktree. Skip it entirely
  if the work is documentation only.
- **`.env.local` is per-worktree too**, because it is gitignored. Copy it across
  or recreate it from `.env.example`.
- **Removing one on Windows is not simply `git worktree remove`.** That fails
  with `Filename too long` on deep `node_modules` paths, leaving the worktree
  deregistered but still on disk. Clear the contents first with a robocopy
  mirror from an empty directory, then delete:

  ```bash
  robocopy "$env:TEMP\empty" ".claude\worktrees\<name>" /MIR
  git worktree remove --force ".claude\worktrees\<name>"
  git worktree prune
  ```

  A folder that will not delete even when empty is usually still some process's
  working directory - including the agent session that is trying to delete it.

---

## 6. Next steps, in the order I'd do them

Everything that was a defect, a gap or a workaround is closed. What is left is
two scale notes - neither is something a reviewer would flag on a portfolio
project.

1. **Rate limiting is per-instance.** `express-rate-limit` keeps counters in
   one process's memory; on Vercel each concurrent instance has its own. It
   blunts a naive burst but is not a guarantee. A shared store (Upstash) would
   be the upgrade.
2. **The `preview` Neon branch does not auto-refresh.** It was branched once
   from `production`; it will drift as production changes. Re-branch it when
   preview data starts looking stale. Vercel's Neon marketplace integration can
   create a branch per deployment automatically — worth it only if previews
   start needing isolation from each other, not just from production.

### Deliberately not done — don't "fix" these by accident

- **No returns policy or delivery-window copy anywhere.** Nothing in the
  codebase implements either, and inventing policy on a storefront is worse
  than staying quiet.
- **Only one product has a gallery second image.** These are stock photos, so a
  "second angle" of the keyboard is genuinely a *different keyboard*. Loose
  building bricks are generic enough that two photos honestly show the same
  product; nothing else is. The gallery renders a single image with no
  thumbnail strip, which is correct.
- **Payments are COD only.** Stripe needs the owner's own account and keys.

---

## 7. Gotchas that cost time

- **This is Windows.** The user's shell is PowerShell; `&&` is a parse error
  there. `pkill` does not kill Node servers — use
  `Get-NetTCPConnection -LocalPort N | Stop-Process`. PowerShell's
  `Set-Content -Encoding utf8` writes a **BOM**, which silently corrupts the
  first key in a `.env` file.
- **`npm audit`'s `fixAvailable` lied.** It reported `next@14.2.35,
  isSemVerMajor: false` for an advisory whose range was `9.5.0 – 15.5.20` —
  a version still inside the vulnerable range. Always re-audit after upgrading;
  don't trust the suggestion.
- **Never run `next build` while a dev server is running.** They share `.next`
  and it corrupts into misleading "syntax errors" in unrelated files.
- **Stacked PRs: retarget the child before merging the parent.** Merging with
  `--delete-branch` deletes the base branch, which **auto-closes** any PR
  pointing at it, and a closed PR's base cannot be changed. Recovery is to push
  the deleted ref back, reopen, then retarget.
- **The browser preview pane doesn't composite frames**, so screenshots fail and
  `loading="lazy"` images are never requested — they sit at `complete: false`
  forever. Verify lazy-loading behaviour on an eager/`priority` image instead.
- **A `.tsx` test file will not parse until you add the React plugin.**
  `tsconfig.json` sets `"jsx": "preserve"` because Next does its own JSX
  transform; Vite reads that and fails with *"content contains invalid JS
  syntax… make sure to not set jsx to preserve"*. Setting `esbuild.jsx` does
  nothing — Vite 8 transforms with **oxc**, not esbuild, so that option is
  silently ignored. `plugins: [react()]` in `vitest.config.ts` is what fixes
  it. Separately, JSX inside a `vi.mock` factory also fails, because Vitest
  hoists those above the imports and the JSX runtime helper does not exist
  yet — use `createElement` with `await import('react')` inside the factory.
- **Vitest's worker-start timeout is a hardcoded 60s.** On a cold Vite dep
  cache the DOM test worker took ~100s to come up on this machine and every
  run died with *"Timeout waiting for worker to respond"*, which reads like a
  broken environment rather than a slow one. It is not configurable. Run the
  suite a second time — once the cache is warm it starts in ~9s. Swapping
  jsdom for happy-dom changed nothing, so don't go down that road.
- **Neon's `reset_password` returns no `connection_uris`.** It hands back only
  `role.password`; you assemble the URI yourself from
  `GET /projects/{id}/endpoints` and `.../branches/{id}/databases`. This bites
  hard: the reset takes effect immediately, so if your script throws *after*
  the call while looking for a connection string that was never there, you have
  just invalidated production's credential and thrown away the replacement.
  Reset again — it is the only way back.
- **A cold Neon compute makes a valid pooled host look wrong.** The first
  connection to `ep-...-pooler.c-2.<region>.aws.neon.tech` hung past a 20s
  timeout while the compute was suspended, and Neon's wildcard DNS means a
  *wrong* hostname also resolves and accepts TCP — so the two are hard to tell
  apart. Wake the compute on the direct host first, then retry the pooler.
  Note the `c-2.` segment is part of the host: dropping it gives a host that
  answers and then fails authentication, which looks like a bad password.
- **Vercel "Sensitive" env vars cannot be read back.** `vercel env pull` writes
  `"[SENSITIVE]"` in place of the value, even for the account owner. You cannot
  diff what is deployed against what you think you set — verify by observing
  the running app instead.
- **Local API port vs CORS.** Docker's `CORS_ORIGIN` follows `WEB_PORT` (default
  3000). Serving the app on any other port makes every browser request fail
  while curl succeeds.

---

## 8. Verification standard used here

Every claim in the PRs was checked against something real, not assumed:
computed styles and the accessibility tree rather than "it should render";
`elementFromPoint` hit-tests for the stretched-link/z-index interaction; a
deliberately-404 image URL to prove the fallback fires; a `$2b$` hash written by
*native* bcrypt to prove `bcryptjs` reads it before swapping; a fresh database
volume to prove the seed works from nothing.

Worth keeping up. Several real bugs were found this way that a "looks right"
pass would have shipped — a leaked pool connection in the product `PUT`, an
`aria-current` on the wrong breadcrumb, and test files importing a path that no
longer existed after the migration.
