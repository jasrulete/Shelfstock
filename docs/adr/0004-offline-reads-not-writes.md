# 0004 — The companion caches products offline, never orders

**Status:** Accepted

Applies to
[`shelfstock-companion`](https://github.com/jasrulete/shelfstock-companion).

## Context

The companion is for a shop admin walking around a stockroom, where signal is
unreliable. TanStack Query with an AsyncStorage persister gave offline reads
for everything, with a 24-hour `gcTime`.

The JWT was deliberately placed in `expo-secure-store` — encrypted storage. But
**AsyncStorage is not encrypted**, and every fetched order was being written to
it in plaintext, where it also survived logout.

The scope was initially read as an order-*detail* problem. It is not. The base
`Order` type carries `shipping_name`, `shipping_phone`, `shipping_address` and
`shipping_city`, and `OrderListItem` extends it with `user_email`. **The orders
list is exactly as sensitive as the order detail.** Excluding only the detail
query would have left names, phone numbers and home addresses for every order
sitting unencrypted on the device.

## Decision

**No order query is persisted to disk at all.** Offline reads cover products
only. Orders are cached in memory for the session and lost when the app closes.

Logout clears both the in-memory cache and the persisted copy. The cache is
busted by app version.

## Consequences

- **A real capability is lost**: an admin with no signal cannot review the
  order list. Stated plainly in the app's README rather than papered over.
- What remains is the better half of the trade — inventory stays readable
  offline, which is what a stockroom walk actually needs — and nobody's home
  address is written unencrypted so a shop owner can read it on a train.
- **Per-user isolation comes from the logout clear, not a user-id buster**,
  because `AuthProvider` renders *inside* the persist provider and cannot feed
  a user id up into it. The residual — an app force-killed without logging out
  leaves its cache for the next person — is [KW-7](../SECURITY.md#kw-7--the-companions-persisted-cache-survives-a-force-kill),
  and it now exposes products only.
- The clear is registered through the existing `logoutHandlers` array rather
  than imported into `AuthContext`, which would pull AsyncStorage into every
  module that touches auth — including the ones under test, where the native
  module does not exist.
- **Offline *writes* remain out of scope.** Roadmap Phase 3 keeps only the
  smallest version: paused mutations with a visible "Queued — sends when you're
  back online". A SQLite queue with a background flush was cut.
  **Superseded 2026-09-06 by [0009](0009-offline-write-queue.md):** offline
  writes are in scope and shipped, as a persisted mutation queue with an
  idempotency key for stepper presses. The decision above — products cached
  offline, orders never — is unchanged.

## Alternatives considered

**Encrypt the persisted cache.** Rejected for now: `expo-secure-store` is
key-value storage with a small size limit, not a place to put a serialized
query cache, and rolling encryption over AsyncStorage means owning key
management on a device with no server-side secret. Revisit only if offline
order access becomes a requirement someone actually has.

**Exclude only `['order', id]`, as originally specified.** Rejected once the
list's type was read — see Context. This is the reason the implementation went
deliberately wider than the audit that prompted it.
