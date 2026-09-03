# Operations

**Canonical.** Deployment topology, environment variables, migrations, and the
runbook for the failures this project actually has.

| | |
|---|---|
| Live | https://shelfstock-jer2x.vercel.app |
| Host | Vercel — project `shelfstock-frontend`, org `jer2xs-projects` |
| Root directory | `frontend` |
| Database | Neon PostgreSQL, free tier, `ap-southeast-1`, database `neondb` |
| Deploys from | `main`, automatically |

**Merging to `main` deploys to production.** There is no staging gate. Treat a
merge as a release.

---

## 1. Environment variables

`NEXT_PUBLIC_*` is compiled into the browser bundle. Everything else is
server-only. See [INV-11](ARCHITECTURE.md#inv-11--secrets-never-reach-the-client-bundle).

| Variable | Prod | Preview | Local | Purpose |
|---|:--:|:--:|:--:|---|
| `DATABASE_URL` | ✅ | ✅ | ✅ | Neon **pooled** string. Preview points at the `preview` branch. |
| `JWT_SECRET` | ✅ | ✅ | ✅ | 32-byte random. Preview has **its own**, not production's. |
| `CRON_SECRET` | ✅ | ❌ | ❌ | Authorises the win-back cron. **Deliberately absent from preview** so no preview deployment can mail a real customer — the route 503s without it. |
| `NEXT_PUBLIC_EXCHANGE_RATE_API` | ✅ | ✅ | optional | Public, no key. Also feeds the CSP's `connect-src`. |
| `RESEND_API_KEY` | ❌ | ❌ | ❌ | Unset everywhere; every send is a logged no-op ([KW-6](SECURITY.md#kw-6--transactional-email-may-silently-not-arrive)). |
| `MAIL_FROM` | ❌ | ❌ | ❌ | Needs a verified domain to be useful. |
| `STORE_URL`, `CORS_ORIGIN` | ❌ | ❌ | ❌ | Win-back mail link only; both fall back sensibly. |

**There is deliberately no `NEXT_PUBLIC_API_URL`** — [INV-2](ARCHITECTURE.md#inv-2--there-is-no-next_public_api_url).
Do not add one.

Two operational facts about Vercel env vars:

- **Changes require a redeploy.** Setting a variable does nothing to the
  running deployment.
- **"Sensitive" variables cannot be read back.** `vercel env pull` writes
  `[SENSITIVE]` in place of the value, even for the account owner. You cannot
  diff what is deployed against what you think you set — verify by observing
  the running app instead.

## 2. Neon

**Always use the pooled connection string** (the host contains `-pooler`).
Serverless opens many short-lived connections and the direct endpoint runs out.

Two branches:

| Branch | Used by | Note |
|---|---|---|
| `production` | Vercel production | |
| `preview` | Vercel preview | Branched once from `production`. Its role password was reset **after** branching, so preview does not carry production's credential. |

The `preview` branch **does not auto-refresh** and will drift as production
changes. Re-branch it when preview data starts looking stale.

Preview deployments sit behind Vercel's SSO deployment protection: an
unauthenticated request to a preview URL gets a 302 to `vercel.com/sso-api`,
not the app.

## 3. Migrations

```bash
cd frontend && DATABASE_URL="postgres://..." npm run migrate:up
```

Check what a database is on before changing it:

```bash
cd frontend && DATABASE_URL="postgres://..." npm run migrate:status
```

Rules live in [DATA-MODEL.md §3](DATA-MODEL.md#3-migration-rules). The ones
that matter here:

- **Forward-only.** There is no rollback. A bad migration is fixed by writing
  another one.
- Migrations run **before** the app in Docker (a one-shot `migrate` service).
  On Vercel they are **not** automatic — run them yourself against the target
  database, before merging the code that depends on them.

**Deploy order for a schema change:** migrate first, then merge. A merge deploys
instantly; a column the new code expects must already exist.

## 4. Seeding

```bash
cd frontend && DATABASE_URL="postgres://..." node scripts/seed-demo-users.js
```

Demo logins (seeded, safe to share, and in the README):

- `admin@shelfstock.demo` / `ShelfAdmin123`
- `shopper@shelfstock.demo` / `ShelfShopper123`

The low-stock seed uses `LEAST(stock, target)` so it can lower but **never
raise**. Re-running it against a store with real sales is a no-op, and sold out
stays sold out.

## 5. Monitoring

None is configured. What exists to watch:

```bash
curl https://shelfstock-jer2x.vercel.app/api/health
```

`{"status":"ok","database":"ok"}` only when the app can actually reach
Postgres. **Watch `/api/health`, not `/health`** — the latter answers `ok`
unconditionally and went on doing so through a broken deployment.

A read-only check that the storefront's index-backed search is live:

```bash
curl "https://shelfstock-jer2x.vercel.app/api/products?search=usb"
```

It returns Wireless Mouse. The word appears only in that product's
*description*, so a hit proves the full-text path rather than the old name-only
`ILIKE`.

To check the order transition matrix without mutating anything, `PATCH` a
completed order to `completed`. The matrix refuses self-transitions, so it
answers 400 and changes nothing either way — which distinguishes it safely from
the old code, which accepted it as a no-op.

### Reading CSP reports

The page CSP is report-only ([KW-1](SECURITY.md#kw-1--the-jwt-lives-in-localstorage)).
Browsers POST violations to `/api/csp-report`, and each becomes one line in the
Vercel function log:

```
CSP violation: script-src blocked https://example.net/x.js on https://shelfstock-jer2x.vercel.app/products/6 (source https://…/app.js:42)
```

Vercel → project `shelfstock-frontend` → **Logs**, filter on `CSP violation`.
Nothing else in the log starts with that prefix.

**Promoting the header to enforcing** — do all of it, in order:

1. On production, visit every route family under `frontend/app/`: `/`,
   `/products/[id]`, `/cart`, `/checkout`, `/login`, `/register`,
   `/forgot-password`, `/reset-password`, `/orders`, and every `/admin/*` page.
   Complete a checkout and open an order, so the dynamic paths render.
2. Read the log. Every `CSP violation:` line is either a source the policy is
   missing (add it to `next.config.js`) or a genuine problem (fix it). Repeat
   from step 1 until a full pass produces none.
3. Leave it collecting for a day of ordinary traffic. Still none?
4. In `next.config.js`, rename the header key from
   `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. Update
   `tests/securityHeaders.test.ts`, which currently asserts the enforcing
   header is absent, and the residual paragraph of KW-1.

Skipping steps 1–3 ships a policy that has never been checked against the
pages it governs, and the first person to find the gap is a visitor with a
blank page.

## 6. Runbook

### The site shows an error page on first click

Almost always Neon's free-tier compute autosuspending. `app/error.tsx` offers
"Try again", and by then the compute has usually woken. Confirm with
`/api/health`.

A periodic warm-ping cron was considered and **rejected**: keeping a free-tier
database awake by polling it is a workaround pretending to be a fix.

### A valid pooled host looks wrong

The first connection to a suspended compute can hang past a 20-second timeout,
and Neon's wildcard DNS means a *wrong* hostname also resolves and accepts TCP
— so "wrong host" and "cold host" look identical. Wake the compute on the
direct host first, then retry the pooler.

Note the `c-2.` segment is part of the host. Dropping it gives a host that
answers and then fails authentication, which looks like a bad password.

### Rotating a database credential

**Read this before touching Neon's reset endpoint.**

Neon's `reset_password` returns **no `connection_uris`**. It hands back only
`role.password`; you assemble the URI yourself from
`GET /projects/{id}/endpoints` and `.../branches/{id}/databases`.

The trap: the reset takes effect **immediately**. If a script throws *after*
that call while looking for a connection string that was never in the response,
production's credential is already invalid and the replacement has been
discarded. The only way back is to reset again.

Procedure:

1. Reset the role password.
2. Assemble the pooled URI from the endpoints and databases endpoints.
3. Set `DATABASE_URL` in the Vercel environment.
4. **Redeploy** — env changes do not reach a running deployment.
5. Verify with `/api/health`. During step 3–4 the live API returns 500, which
   is itself confirmation that the environment really was using that role.

### The push notification did not arrive

In order of likelihood:

1. The recipient is no longer an `admin`. Recipients are resolved by joining
   `users` at send time — this is intended behaviour.
2. The token was pruned after a `DeviceNotRegistered` ticket, i.e. the app was
   uninstalled or the token rotated. Re-register from the app's settings.
3. The instance froze mid-send. `waitUntil()` is what prevents this; if it
   recurs, check that the route still routes its side effects through
   `afterResponse()` ([INV-9](ARCHITECTURE.md#inv-9--post-response-work-goes-through-afterresponse-and-is-never-awaited-first)).

### Email did not arrive

Expected. `RESEND_API_KEY` is unset everywhere — [KW-6](SECURITY.md#kw-6--transactional-email-may-silently-not-arrive).
In non-production, a password-reset link is logged to the console instead.

## 7. Railway is dead and not coming back

The old backend lived in Railway project `triumphant-tenderness` under a third
account. The trial expired, Railway removed every deployment, and the 108 MB
Postgres volume is unreachable without an active plan. **That data is gone;
nothing was migrated from it.** If you find a `railway` command in any
document, that document is stale.
