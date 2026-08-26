# Security

**Canonical.** Every weakness below states its compensating control **in the
same entry**. That rule is deliberate: a document that only lists holes is a
liability inventory, not a security posture.

Scope: a portfolio storefront with real customer data of exactly one kind —
shipping details on cash-on-delivery orders. No card data is ever handled; see
[ADR-0002](adr/0002-cod-only-no-stripe.md).

---

## 1. Trust boundaries

```
  anonymous visitor  ──▶  public endpoints  ──▶  products, categories, reviews
  authenticated user ──▶  own orders only   ──▶  404 on someone else's
  admin (role claim) ──▶  everything        ──▶  products, all orders, CRM, analytics
  Vercel Cron        ──▶  CRON_SECRET       ──▶  win-back mail
```

Three things cross a boundary and are worth naming:

- **The JWT `role` claim** is the admin gate. It is set at login and not
  re-read from the database on subsequent requests — see [KW-3](#kw-3--role-is-read-from-the-jwt-not-the-database).
- **`products.barcode`** is internal stock-keeping data on an otherwise public
  resource. Handled by `optionalAuth` — see [INV-8](ARCHITECTURE.md#inv-8--productsbarcode-is-admin-only).
- **Order shipping details** are the only real PII in the system. They reach
  the companion app, which is why [INV-10](ARCHITECTURE.md#inv-10--no-customer-pii-on-unencrypted-device-storage) exists.

## 2. Controls in place

| Control | Where | Note |
|---|---|---|
| Password hashing | `bcryptjs` | Reads `$2b$` hashes written by native bcrypt — verified before the swap. |
| JWT signing | `jsonwebtoken`, `JWT_SECRET` | 32-byte random, per-environment. Preview has its **own**, not production's. |
| Reset tokens | 32 CSPRNG bytes, stored SHA-256 hashed | Single use, 1 hour, issuing one retires the rest. The raw value exists only in the mail. |
| No account oracle | `/forgot-password`, `/reset-password` | Identical responses for known/unknown, expired/used. |
| Email validation on register | Normalized address, ≤254 chars | Probed against a running stack: plus tags, subdomains and unicode local parts accepted; `user@localhost`, doubled dots, tabs and CRLF injection refused. |
| Ownership checks | `GET /api/orders/:id`, `DELETE /api/devices/:token` | Non-owner gets **404, not 403** — a 403 confirms the id exists. |
| SQL injection | Parameterised queries throughout | `%` and `_` in a search term are escaped rather than treated as wildcards. |
| XSS in JSON-LD | `serializeJsonLd` | `JSON.stringify` does not escape `<`, and product names are admin-typed. |
| API headers | `helmet()` on `/api` | |
| Page headers | `next.config.js` `headers()` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a CSP — see [KW-1](#kw-1--the-jwt-lives-in-localstorage). |
| No internal detail in errors | Terminal handler + `error.tsx` | [INV-7](ARCHITECTURE.md#inv-7--every-api-response-is-json-and-never-carries-an-internal-message). |
| Rate limiting | 500/15min global, 20/15min auth | [KW-2](#kw-2--rate-limiting-is-per-instance). |
| Dependency audit | CI, `npm audit --omit=dev --audit-level=high` | Fails the build. |
| Secret isolation | `NEXT_PUBLIC_*` prefix discipline | [INV-11](ARCHITECTURE.md#inv-11--secrets-never-reach-the-client-bundle). |
| Push recipient scoping | Role joined at send time | [§6 of API.md](API.md#6-push-notifications). |
| Device PII | No order query persisted to AsyncStorage | [INV-10](ARCHITECTURE.md#inv-10--no-customer-pii-on-unencrypted-device-storage). |

## 3. Known weaknesses

Each is accepted, not overlooked. Change one only with an ADR.

### KW-1 — The JWT lives in `localStorage`

`lib/auth.ts`. An XSS anywhere on the origin can read it. `httpOnly` cookies
would be stronger but require CSRF handling that this codebase does not have.

**Compensating controls:** a CSP is now served on every HTML page, alongside
enforcing `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and a
`Permissions-Policy` that denies camera, microphone and geolocation outright.
The only unescaped HTML injection point, JSON-LD, goes through
`serializeJsonLd`.

**Residual, and it is real:** the CSP ships as
`Content-Security-Policy-Report-Only`, because Next needs `'unsafe-inline'` for
its bootstrap script and `next/font`'s injected styles unless every render
threads a nonce. **Report-only enforces nothing**, and there is no
`report-uri`/`report-to` directive, so violations reach only the console of
whoever triggers them. Two consequences follow:

- `frame-ancestors` in that header is inert. Clickjacking is genuinely blocked
  — by the `X-Frame-Options: DENY` beside it, which *is* enforcing.
- "Promote once the report is clean" currently has no report to read. Promotion
  needs either a reporting endpoint or a documented manual pass over the
  console on every page. **Do not promote the header without doing one of
  those first** — an unverified enforcing CSP breaks the storefront for real
  visitors.

### KW-2 — Rate limiting is per-instance

`express-rate-limit` keeps counters in one process's memory; on Vercel each
concurrent instance has its own. It blunts a naive burst and is not a
guarantee.

**Compensating controls:** every destructive endpoint is `adminOnly` with a
row-level ownership check, so the limiter is not the thing standing between a
stranger and the data. The auth endpoints carry the stricter 20/15min limit.

**Do not build anything whose safety depends on this bound.** Two roadmap items
were cut for exactly that reason: guest order tracking, and an AI Q&A endpoint
that would have spent real money per request.

### KW-3 — Role is read from the JWT, not the database

`adminOnly` and `optionalAuth` both trust the `role` claim minted at login. A
user demoted out of `admin` keeps admin API access — including the `barcode`
projection — until their token expires, up to **7 days**.

**Compensating controls:** push notifications, the one channel that reaches a
device the ex-admin still physically holds, resolve the role at send time
against the database. Admin promotion is a manual database operation on a
single-operator store, so the demotion case is close to hypothetical here.

**Why it is not simply fixed:** re-reading the role means a database round trip
on every authenticated request, turning auth from stateless to stateful. That
is the same trade already taken and recorded for [KW-4](#kw-4--a-password-reset-does-not-invalidate-existing-sessions).

### KW-4 — A password reset does not invalidate existing sessions

A stolen JWT survives a reset for up to its 7-day life. Recorded in the route's
own comment as well as here.

**Compensating controls:** the reset flow itself is sound (hashed single-use
tokens, 1-hour TTL, outstanding tokens retired on reissue), and token lifetime
is bounded. The attack requires an already-stolen token, which is
[KW-1](#kw-1--the-jwt-lives-in-localstorage)'s scenario, not a new one.

### KW-5 — `POST /api/orders` has no idempotency key

A retried create places a second order and decrements stock twice.

**Compensating control:** the design avoids generating the retry. Post-response
work is never awaited before responding, precisely so a hung Resend or Expo
cannot turn a committed order into a 504 that the client then retries. See
[INV-9](ARCHITECTURE.md#inv-9--post-response-work-goes-through-afterresponse-and-is-never-awaited-first).

### KW-6 — Transactional email may silently not arrive

`RESEND_API_KEY` is unset in every environment, so order confirmations, shipped
notices and reset links are logged no-ops. Even configured, Resend's free tier
sends from a shared `onboarding@resend.dev` address that only reliably delivers
to the account owner's own inbox unless a domain is verified.

**Compensating controls:** both demo accounts' credentials are in the README,
so no demo path depends on receiving mail. In non-production the reset link is
logged to the console, so the flow is testable by hand. `CRON_SECRET` is
deliberately absent from preview, so no preview deployment can mail a real
customer.

**Never write "order confirmations are guaranteed" anywhere.** Guarantees
extend to the push notification, not to email.

### KW-7 — The companion's persisted cache survives a force-kill

`clearPersistedCache()` runs on logout. An app killed without logging out
leaves its cache on disk for whoever opens it next.

**Compensating control:** since [INV-10](ARCHITECTURE.md#inv-10--no-customer-pii-on-unencrypted-device-storage)
that cache holds **products only** — no names, no phone numbers, no addresses.
The cache is also busted by app version, so a build with changed shapes cannot
read an older one's. Per-user isolation comes from the logout clear rather than
a user-id buster because `AuthProvider` renders inside the persist provider and
cannot feed a user id up into it.

### KW-8 — An installed APK can be stranded by an API change

`EXPO_PUBLIC_API_URL` is baked at build time, `expo-updates` is absent, and
`app.json` sets no `runtimeVersion`. A breaking API change leaves installed
builds broken with no update path.

**Compensating control:** the installed population is approximately one person,
and a buggy version-handshake comparator would brick the app more reliably than
the problem it solves. Recorded as a judgement rather than fixed —
[ADR-0008](adr/0008-apk-distribution-no-play-store.md).

### KW-9 — Bracketed IP literals pass email validation

`user@[192.168.0.1]` is accepted by `POST /api/auth/register`.

**Compensating control:** noted in the code as a deliberate non-goal. The rule
exists to stop addresses that could never receive an order, not to be an
RFC 5322 parser, and an IP literal is at least syntactically deliverable.

## 4. Handling a credential leak

The `neondb_owner` password has been rotated once already, after a leak. The
procedure and its trap are in
[OPERATIONS.md](OPERATIONS.md#rotating-a-database-credential) — read it before
touching Neon's reset endpoint, because a failed rotation script can invalidate
production's credential and discard the replacement in the same breath.

## 5. Reporting

This is a personal portfolio project with no bug bounty and no SLA. Open an
issue on [the repository](https://github.com/jasrulete/Shelfstock/issues), or
for something you would rather not post publicly, use GitHub's private security
advisory form on that repo.
