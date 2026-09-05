# 0007 — The server owns the order lifecycle; clients must not copy it

**Status:** Accepted — implemented 2026-09-05 (Shelfstock #26, companion #5).

## Context

`server/orderStatus.ts` defines which status each order status may move into.
It is the enforcement layer: `PATCH /api/orders/:id/status` checks every change
against it **while the order row is locked**, in the same transaction that
restores stock on `cancelled`.

The matrix is an inventory-correctness rule, not a UI preference. Stock is
decremented on create and restored on cancel, so an edge that should not exist
double-counts units.

Two clients render buttons from it:

| | |
|---|---|
| Web admin | imports `ALLOWED_TRANSITIONS` directly ✅ |
| Companion | keeps its own copy in `src/api/orders.ts` ❌ |

**The copy has drifted.** The server allows `pending → completed`; the
companion's `statusActions('pending')` returns only `['shipped', 'cancelled']`.
And a passing test in that repo asserts the drifted value, so the test suite is
holding the bug in place.

The consequence is not cosmetic: a same-day cash-on-delivery handover — the
normal case for this kind of store ([ADR-0002](0002-cod-only-no-stripe.md)) —
cannot be completed from the phone. It is forced through a bogus `shipped` hop,
which also fires a customer "order shipped" email for a parcel that was handed
over in person.

## Decision

**The server is the single source of the order lifecycle, and it serves it.**

`GET /api/orders/:id` and the list projection gain an `allowed_transitions`
field. Clients render their buttons from that value. The companion's
`statusActions` and its test are deleted.

One hard-coded fallback stays in the companion for the offline case, **marked
stale in the UI** so a rendered-from-fallback button is visibly not a
rendered-from-server one.

## Consequences

- Changing the matrix becomes a one-file change again.
- Shipped: `allowed_transitions` is on `GET /`, `GET /my`, `GET /:id` and the
  `PATCH /:id/status` response; `tests/orders.routes.test.ts` pins all four.
  The companion's `statusActions` and its test are deleted; `transitionsFor()`
  renders the served field and marks the one remaining fallback as stale on
  screen. Changing the matrix is now a one-file change.
- The drift is documented rather than quietly patched. Correcting the
  companion's copy would fix today's symptom and leave the mechanism that
  produced it intact.

## Alternatives considered

**Just fix the companion's copy.** Rejected: it is the same class of change
that produced the drift. The copy would be correct until the next matrix
change, and nothing would signal that a second edit was required.

**A shared npm package for the matrix.** Rejected: publishing and versioning a
package across two repositories, for one constant, to serve one developer. The
server already answers HTTP requests — that is the delivery mechanism.

**A generated `/api/meta/contract` endpoint plus a codegen step.** Drafted and
cut on review as disproportionate. One field on a payload the client already
fetches does the job.
