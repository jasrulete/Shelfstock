# 0005 — Auth stays stateless; the role claim is not re-read

**Status:** Accepted, with known cost

## Context

Authentication is a signed JWT with a 7-day life, carrying `userId` and `role`.
Nothing about a request touches the `users` table to check that either claim is
still true.

Two consequences surfaced independently and are really the same decision:

1. **A password reset does not invalidate existing sessions.** A stolen token
   keeps working for up to 7 days after the victim resets their password.
2. **A demoted admin keeps admin access.** `adminOnly` and `optionalAuth` trust
   the `role` claim minted at login, so a user removed from the admin role
   retains admin API reach — including the `barcode` projection — until their
   token expires.

The obvious fix for both is the same: read the user row on every authenticated
request, and compare a token-issued-at against a `sessions_valid_from` column.

## Decision

Keep auth stateless. Do not re-read the role. Do not invalidate outstanding
tokens on password reset.

## Consequences

- Both costs are recorded as [KW-3](../SECURITY.md#kw-3--role-is-read-from-the-jwt-not-the-database)
  and [KW-4](../SECURITY.md#kw-4--a-password-reset-does-not-invalidate-existing-sessions),
  and the reset route carries the note in its own comment.
- **Push notifications are the deliberate exception.** Recipients are resolved
  by joining `users` and filtering `role = 'admin'` **at send time**, because
  that channel reaches a device an ex-admin still physically holds and a lock
  screen showing order totals is the concrete harm. The general rule is
  stateless; where the harm is specific, the check is specific.
- Token lifetime is the real bound on both windows. Shortening it is the
  cheapest available mitigation if either becomes a genuine concern.
- **Do not add a database read to `requireAuth` casually.** It would put a
  round trip in front of every authenticated request on a serverless function
  with a cold-start budget, against a free-tier database that autosuspends.
  That is a real cost against a threat model of one operator.

## Alternatives considered

**Stateful sessions in Postgres.** The correct answer for a real store, and the
wrong one here: it turns every request into a database read on infrastructure
chosen for costing nothing, to defend against an insider-demotion scenario that
requires a second admin to exist.

**Short-lived access tokens with refresh.** Rejected as more moving parts —
rotation, refresh storage, and a revocation list that reintroduces the state
this decision avoids.

**A `token_version` column bumped on reset.** The cheapest real fix, and the
one to reach for first if this is ever revisited: one integer compared against
a claim. Still a read per request, which is the cost being declined.
