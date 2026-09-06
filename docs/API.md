# API contract

**Canonical.** This repository owns the API. Both the web app and the
[companion app](https://github.com/jasrulete/shelfstock-companion) are clients
of it, and **when a client disagrees with this document, the client is wrong.**

That is not a formality. The companion's order lifecycle drifted from the
server's once, with a green test in that repo pinning the drift in place. It
was fixed by serving the lifecycle instead of copying it — see
[§7](#7-known-client-drift) and
[ADR-0007](adr/0007-server-owns-the-order-lifecycle.md).

---

## 1. Conventions

| | |
|---|---|
| Base | `/api`, same origin as the page. There is no absolute API host — see [INV-2](ARCHITECTURE.md#inv-2--there-is-no-next_public_api_url). |
| Auth | `Authorization: Bearer <jwt>`. Issued by login/register, 7-day life. |
| Errors | **Always** `{ "error": "<message>" }` with a non-2xx status. Never HTML — see [INV-7](ARCHITECTURE.md#inv-7--every-api-response-is-json-and-never-carries-an-internal-message). |
| Body limit | 100 kB (`express.json`). Over it: `413 Request body too large`. |
| Malformed JSON | `400 Malformed JSON body`. |
| Rate limits | 500 req / 15 min per instance across `/api`; 20 / 15 min on `/api/auth`. Both answer `429` with a JSON body. **Per-instance, not global** — see [SECURITY.md](SECURITY.md#kw-2--rate-limiting-is-per-instance). |

**Access levels** used in the tables below:

| Level | Meaning |
|---|---|
| public | No token needed |
| optional | Public, but a valid admin token returns **more fields** |
| user | Any valid token |
| admin | Valid token whose `role` claim is `admin` |

## 2. Auth — `/api/auth`

All four are behind the stricter `authLimiter`.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/register` | public | `{ email, password }`. Email is validated against the **normalized** address: one `@`, a domain of 2+ non-empty labels, no whitespace, ≤254 chars. Deliberately not an RFC 5322 parser. |
| POST | `/login` | public | `{ email, password }` → `{ token, user }`. **Does not** validate email format — accounts created before that rule exist, and locking them out of their own order history is worse than the bug. A test pins this. |
| POST | `/forgot-password` | public | Always `200` with the same body for a registered and an unregistered address, so it cannot be used as an account oracle. |
| POST | `/reset-password` | public | One message for unknown, expired and already-used tokens alike, for the same reason. |

**Reset tokens:** 32 bytes of CSPRNG output, stored only as a SHA-256 hash,
single use, one hour, and issuing one retires that user's outstanding tokens.

**Two deliberate gaps, both recorded in [SECURITY.md](SECURITY.md):** existing
JWTs are not invalidated by a reset, and mail does not actually send unless
`RESEND_API_KEY` is configured.

## 3. Products — `/api/products`

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/` | public | List. Query: `search`, `category`, `minPrice`, `maxPrice`, `sort`, `order`, `page`, `limit`. |
| GET | `/low-stock` | public | Merchandising rail. Excludes sold-out items. **Must stay declared above `/:id`** or Express matches `/:id` first and 404s. |
| GET | `/:id` | **optional** | Public product, **plus `barcode` for an admin token**. |
| GET | `/:id/related` | public | |
| GET | `/barcode/:code` | admin | The companion scanner's lookup. `404` when no product carries that code. |
| POST | `/` | admin | |
| PUT | `/:id` | admin | See the `images` rule below. A `stock` value also writes a ledger row. |
| POST | `/:id/adjust-stock` | admin | `{ delta, source, note?, requestId? }`. Atomic delta under the row lock; writes the ledger row. `requestId` (8–64 chars of `[A-Za-z0-9._-]`) is the companion's idempotency key for a queued press: a request whose id was already written is answered `200 { stock, adjustment, replayed: true }` with the current count and the existing row, and nothing moves. See [Stock moves by delta](#stock-moves-by-delta). |
| GET | `/:id/stock-history` | admin | Last 20 ledger rows, newest first, with `user_email`. |
| POST | `/:id/assign-barcode` | admin | Gives the product the store's own EAN-13 — GS1 internal-use prefix `200` + zero-padded id + check digit. **Never overwrites:** `409 { error, barcode }` when one exists. |
| DELETE | `/:id` | admin | |
| GET | `/:id/reviews` | public | Paginated, `limit` 10. Reviewer names are derived and masked server-side; **emails never leave the server**. |
| POST | `/:id/reviews` | user | Upsert semantics — `UNIQUE (product_id, user_id)`. Sets `verified_purchase` from a real order. |

### List response envelope

```json
{
  "products": [ /* ... */ ],
  "pagination": { "page": 1, "limit": 12, "total": 42, "totalPages": 4 }
}
```

Anything reading a bare array off this endpoint is broken.

### `barcode` is admin-only — [INV-8](ARCHITECTURE.md#inv-8--productsbarcode-is-admin-only)

`barcode` is an internal stock-keeping code. It is **absent** from every public
response — the list projection and `GET /:id` alike — and present on both for
an admin JWT, so the printable sheet at `/admin/barcodes` can cover the whole
catalogue. Both routes use `optionalAuth`: an expired or malformed token is
treated as anonymous, not rejected, since the rest of the response is public
either way.

The store's own codes are EAN-13s in GS1's internal-use prefix `200`, derived
from the product id by `lib/ean13.js` and assigned by `POST /:id/assign-barcode`
or the seed script. A code that came from real packaging is never overwritten.

Clients must therefore treat `barcode` as **possibly absent**, and must not
send a blank one back on update. The companion's `ProductForm` seeds itself
from `GET /:id`, which is the whole reason the admin case exists.

### `images` on `PUT /:id` — omission is not the same as empty

| Payload | Effect |
|---|---|
| `images` key absent | Gallery **untouched** |
| `images: []` | Gallery **cleared** |
| `images: ["url", ...]` | Gallery replaced, in order |

A client that always sends the key will wipe a gallery it never loaded. The web
admin omits the key until its gallery fetch lands, precisely because it once
did not.

### Stock moves by delta

`POST /:id/adjust-stock` is how a client nudges a count —
[INV-13](ARCHITECTURE.md#inv-13--every-change-to-productsstock-writes-a-ledger-row-in-the-same-transaction).

| Field | Rule |
|---|---|
| `delta` | Non-zero whole number, at most 10 000 either way. |
| `source` | `web-admin` or `companion` — which button was pressed. `order` and `cancel` are server-written and refused here. |
| `note` | Optional, ≤200 chars, stored trimmed; blank becomes `null`. Rendered as text only. |

| Response | Meaning |
|---|---|
| `200 { stock, adjustment }` | Applied. `stock` is the server's count — use it, a concurrent order may have moved it. |
| `409 { error, stock }` | The delta would take stock below zero. **Rejected, not clamped**, with the current count so the client can show it. |
| `404` | Unknown or malformed id. |

`PUT /:id` with a `stock` value still works, and also writes a ledger row for
the difference (source `web-admin`, note "Set to N in the product form"). But
from the client's side it is a read-modify-write, so **a stepper must use
`adjust-stock`**, never PUT.

## 4. Orders — `/api/orders`

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/` | user | Create. `{ items: [{ productId, quantity }], shipping: { name, phone, address, city } }` — all four shipping fields required. Max 100 line items. |
| GET | `/` | admin | All orders. |
| GET | `/my` | user | The caller's own orders. |
| POST | `/:id/cancel` | user | The caller cancelling their own order, only while `pending`: stock comes back and a `cancel` ledger row is written in the same transaction, through the same `transitionOrder()` as the admin's PATCH. Someone else's order answers 404 (not 403 — existence is not confirmed, as with GET); one that has shipped or finished answers 409. |
| GET | `/:id` | user | Own order, or any order for an admin. **An admin's `items[]` carry each line's `barcode`** for the companion's pack screen; a customer's never do (INV-8). |
| PATCH | `/:id/status` | admin | `{ status, note? }`, checked against the matrix. `note` (≤200 chars) is what the pack screen's "Ship anyway" skipped — **logged server-side, never stored, never echoed**; storing it needs a migration and is deferred. |

### Two behaviours worth knowing

**A non-owner gets `404`, not `403`.** Confirming that an order id exists is
itself a leak.

**`POST /` has no idempotency key.** A retried create places a second order and
decrements stock twice. This is why post-response work is never awaited before
responding — see [INV-9](ARCHITECTURE.md#inv-9--post-response-work-goes-through-afterresponse-and-is-never-awaited-first).

### The order lifecycle

The single source is `server/orderStatus.ts` —
[INV-4](ARCHITECTURE.md#inv-4--serverorderstatusts-is-the-only-order-lifecycle).

```
pending ──▶ shipped ──▶ completed
   │           │
   └───────────┴──────▶ cancelled
```

| From | May move to |
|---|---|
| `pending` | `shipped`, `completed`, `cancelled` |
| `shipped` | `completed`, `cancelled` |
| `completed` | — terminal |
| `cancelled` | — terminal |

Self-transitions are refused with `400`. The check runs **while the order row
is locked**, in the same transaction that restores stock on `cancelled`.

`pending → completed` exists on purpose: a same-day cash-on-delivery handover
never passes through `shipped`.

**Every order payload carries `allowed_transitions`** — the statuses the
matrix will accept next for that order, as an array — on `GET /`, `GET /my`,
`GET /:id`, and the `PATCH /:id/status` response (for the *new* status, so a
client can redraw without a refetch). **Clients render their buttons from that
field**, never from a copy of this table. The table above is a transcription of
`server/orderStatus.ts` for the reader; the field is the contract, and
changing the matrix is a one-file change.

## 5. Everything else

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/categories` | public | |
| GET | `/api/customers` | admin | CRM list. |
| GET | `/api/customers/:id` | admin | |
| POST | `/api/devices` | admin | Register an Expo push token. |
| DELETE | `/api/devices/:token` | admin | **Scoped to the caller** — an admin cannot unregister another admin's device. |
| GET | `/api/analytics/summary` | admin | |
| GET | `/api/analytics/revenue-over-time` | admin | |
| GET | `/api/analytics/top-products` | admin | |
| GET | `/api/analytics/low-stock` | admin | Not the same as the public `/api/products/low-stock`. Rows `{ id, name, stock }`, at or under `?threshold` (default 5, max 50), lowest first, at most 20. The companion's inventory tab counts these for its low-stock chip. |
| GET | `/api/analytics/stale-orders` | admin | |
| GET | `/api/analytics/customers` | admin | |
| POST | `/api/csp-report` | public | Browser CSP violation reports. Accepts `application/csp-report` and `application/reports+json`, 50 kB max. Always `204` with an empty body; logs one bounded `CSP violation:` line per report and never echoes anything. |
| GET | `/api/health` | public | Readiness. **Touches Postgres**: `{ "status": "ok", "database": "ok" }`. |
| GET | `/health` | public | Liveness only. Answers `ok` unconditionally — do not monitor this one. |
| GET | `/api/cron/winback` | `CRON_SECRET` | Vercel Cron. `503` when the secret is unset, so it cannot mail real customers from an environment that was never meant to. |

## 6. Push notifications

`POST /api/orders` notifies admins through Expo. Three rules the server keeps:

1. **Recipients are resolved at send time** by joining `device_tokens` to
   `users` and filtering `role = 'admin'`. A row outlives its owner's admin
   role; the join is what stops a demoted admin's phone showing order totals.
2. **`DeviceNotRegistered` tickets prune the row.** Uninstalled apps were
   otherwise retried forever.
3. **The send is registered with `waitUntil()`**, never awaited before the
   response.

## 7. Known client drift

| | |
|---|---|
| Server truth | `server/orderStatus.ts` — `pending: ['shipped', 'completed', 'cancelled']` |
| Web admin | imports it directly ✅ |
| Companion, until 2026-09-05 | `statusActions('pending')` returned `['shipped', 'cancelled']` ❌ — and its test asserted that |
| Companion, now | renders `allowed_transitions` from the payload ✅ — `statusActions` and its test are deleted |

**What it cost while it lasted:** a same-day COD handover could not be
completed from the phone. It was forced through a bogus `shipped` hop, which
also fired a customer "order shipped" email for a parcel handed over in person.

**Why it was not simply corrected:** correcting the copy fixes the day's
symptom and leaves the mechanism that produced it. The server now serves the
lifecycle ([ADR-0007](adr/0007-server-owns-the-order-lifecycle.md)); the phone
keeps one fallback for a server older than that, and marks anything drawn
from it as stale on screen. The companion's own test asserts the screen offers
only what the server listed, even when a local guess would offer more.
