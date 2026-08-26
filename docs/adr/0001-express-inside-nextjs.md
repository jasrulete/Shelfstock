# 0001 — The Express API runs inside the Next.js deployment

**Status:** Accepted

## Context

The API originally lived in a separate `backend/` service hosted on Railway,
with the browser calling it through an absolute URL baked into the bundle at
build time as `NEXT_PUBLIC_API_URL`.

Two things happened. The Railway trial expired and every deployment was
removed, taking the 108 MB Postgres volume with it. And because the storefront
had an absolute backend host compiled into its JavaScript, the moment that host
stopped answering **the deployed storefront showed "Failed to fetch" with no
way to recover except a rebuild**.

The constraint set: zero ongoing cost, one developer, no persistent process,
and a link that has to keep working unattended.

## Decision

One deployable. The Express app is mounted as a single serverless function at
`pages/api/[...path].ts`, inside the same Vercel project that serves the pages.
The browser calls `/api` **relatively**.

Pages Router, not App Router, for that mount: Pages Router API routes hand the
handler Node's `req`/`res`, which is what Express middleware expects. App Router
routes use Web `Request`/`Response` and would need an adapter. `pages/` and
`app/` coexisting is intentional.

## Consequences

- **There is no CORS middleware**, because there is no cross-origin call.
- **There is no `NEXT_PUBLIC_API_URL`**, and reintroducing one recreates the
  exact failure above. This is [INV-2](../ARCHITECTURE.md#inv-2--there-is-no-next_public_api_url).
- Server Components therefore have no base URL to fetch during a render, so
  they read the database directly through `server/queries/` — see
  [INV-3](../ARCHITECTURE.md#inv-3--server-components-read-the-database-not-the-api).
  That is a *consequence* of this decision, not an independent one.
- The whole API shares one function's cold start and one instance's memory,
  which is why rate limiting is per-instance ([KW-2](../SECURITY.md#kw-2--rate-limiting-is-per-instance)).
- The companion app **does** use an absolute URL (`EXPO_PUBLIC_API_URL`) — it
  has no choice, it is not served from the same origin. That is the one
  sanctioned exception, and it brings [KW-8](../SECURITY.md#kw-8--an-installed-apk-can-be-stranded-by-an-api-change)
  with it.

## Alternatives considered

**Keep a separate backend service.** Rejected: it is the arrangement that
failed, it costs money to keep alive, and it doubles the deploy surface for one
developer.

**Next Route Handlers instead of Express.** Rejected at the time: it would mean
rewriting seven routers and their middleware against a different request model
for no user-visible gain. Reasonable to revisit if the Express layer ever
becomes the thing holding a Next upgrade back.
