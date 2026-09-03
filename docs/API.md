# API contract

**Canonical.** This repository owns the API. Both the web app and the
[companion app](https://github.com/jasrulete/shelfstock-companion) are clients
of it, and **when a client disagrees with this document, the client is wrong.**

That is not a formality. The companion's order lifecycle has already drifted
from the server's, and a green test in that repo is pinning the drift in place
— see [§7](#7-known-client-drift) and
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
| POST | `/:id/adjust-stock` | admin | `{ delta, source, note? }`. Atomic delta under the row lock; writes the ledger row. See [Stock moves by delta](#stock-moves-by-delta). |
| GET | `/:id/stock-history` | admin | Last 20 ledger rows, newest first, with `user_email`. |
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

`barcode` is an internal stock-keeping code. It is **absent** from the list
projection entirely and **stripped** from `GET /:id` unless the caller presents
an admin JWT. An expired or malformed token is treated as anonymous, not
rejected: the rest of the response is public either way.

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
| GET | `/:id` | user | Own order, or any order for an admin. |
| PATCH | `/:id/status` | admin | `{ status }`, checked against the matrix. |

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

**This table is generated from nothing — it is a transcription of
`server/orderStatus.ts`.** That is a weakness, and the fix is Roadmap §3.2:
serve `allowed_transitions` on the order payload so clients render from the
server's answer instead of a copy. Until then, changing the matrix means
changing `server/orderStatus.ts`, this table, and
`shelfstock-companion/src/api/orders.ts`, in that order.

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
| GET | `/api/analytics/low-stock` | admin | Not the same as the public `/api/products/low-stock`. |
| GET | `/api/analytics/stale-orders` | admin | |
| GET | `/api/analytics/customers` | admin | |
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
| Companion | `src/api/orders.ts` `statusActions('pending')` returns `['shipped', 'cancelled']` ❌ |
| The test | `src/api/__tests__/orders.test.ts` asserts the drifted value ❌ |

**Consequence:** a same-day COD handover cannot be completed from the phone. It
is forced through a bogus `shipped` hop, which also fires a customer "order
shipped" email for a parcel that was handed over in person.

Tracked as Roadmap §3.2. Recorded here rather than silently fixed because the
fix is to stop copying the matrix at all, not to correct the copy.
