# 0009 — Offline writes ship as a persisted mutation queue with idempotency keys

**Status:** Accepted

Supersedes the "offline *writes* remain out of scope" consequence of
[0004](0004-offline-reads-not-writes.md). That record's decision — the
companion caches products offline and never orders — still stands.

Applies to
[`shelfstock-companion`](https://github.com/jasrulete/shelfstock-companion)
and to `POST /api/products/:id/adjust-stock` in this repository.

## Context

0004 kept writes out of scope and the roadmap kept "step 1 only": pause a
mutation made without signal, show a banner, resume on reconnect. That is
almost free, because TanStack Query already pauses a mutation when the network
is gone and the persister already writes paused mutations to disk.

Two things then made the small version insufficient. A restored mutation has
no function — a closure cannot be serialised — so without registered defaults
a queued write comes back from disk unable to run. And the stepper, the one
write a stockroom admin makes constantly, moves stock by a **delta**: a replay
is not idempotent the way a status PATCH or a product PUT is.

The replay is not hypothetical. The AsyncStorage persister throttles its write
by a second, so a press that has already continued and reached the server can
still be recorded on disk as paused. An app killed in that window relaunches,
finds the press paused, and sends it again. A review reproduced exactly that
against the real persister.

## Decision

Offline writes are in scope, as a persisted mutation queue:

- **Keyed defaults.** `offline.ts` registers `setMutationDefaults` for
  `['order-status']`, `['product']` and `['adjust-stock']`, so a mutation
  restored from disk has its function — and, for the stepper, its whole
  lifecycle — back.
- **Idempotency for the delta.** Every stepper press carries a `requestId`
  made at press time, persisted with the mutation and sent with every attempt.
  The server dedupes on `stock_adjustments.client_request_id` under the row
  lock and answers a replay with the row it already wrote. This is the
  reversal of the roadmap's "idempotency-key machinery was cut".
- **Order within a product.** Presses on one product carry a mutation scope,
  so they are sent one at a time in press order and survive a relaunch in that
  order. Different products go in parallel.
- **Honesty over optimism.** The stepper takes no optimistic snapshot. The row
  shows only counts the server has sent; unconfirmed presses are drawn beside
  it. Hydration restores a mutation's state whole, context included, so a
  persisted snapshot would roll every row to a stale count on a replayed
  `409` hours later.
- **One retry, for transport only.** A press that got no answer, or a 5xx, is
  sent once more with the same id. Anything below 500 is the server's verdict.

## Consequences

- A queued press is a request and a ledger row each: thirty presses are thirty
  rows. That is what an audit table is for, and coalescing would have to
  rewrite a paused mutation's variables.
- The dedupe key means the schema and the client ship together. The migration
  must run before the server code that reads the column — see
  [OWNER-RUNBOOK.md](../OWNER-RUNBOOK.md) task 1 for the order.
- The retry budget lives in the attempt, not the persisted state, so a press
  restored from disk may retry once more per launch. Harmless: every attempt
  carries the same id.
- Still out of scope, and named rather than fixed: the product form PUTs an
  absolute `stock`, so an edit queued alongside stepper presses on the same
  product replays in parallel with them and can land on top of what they
  moved.

## Alternatives considered

**Keep step 1 only and leave the stepper out.** Rejected: the stepper is the
write the app exists for, and leaving it out meant a press in a basement
simply failed.

**Optimistic count plus rollback.** Rejected once presses could be replayed
hours later: the snapshot is persisted with the mutation, so the rollback
target is stale by the time it is used.

**Retry without an idempotency key.** Rejected: a retried request that had
reached the server would double-write the ledger. The key came first; the
retry became safe afterwards, and shipped separately.

**A SQLite queue with a background flush.** Still rejected, as in 0004 — it
duplicates what the query cache and its persister already do.
