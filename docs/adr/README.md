# Architecture decision records

One file per decision that had a real alternative. The point is not ceremony —
it is that **most of these look like bugs until you know why**, and a future
developer (or a future agent session) will otherwise "fix" them.

Every record states its compensating control alongside any weakness it
introduces. A decision log that only lists holes reads as a liability
inventory.

| # | Decision | Status |
|---|---|---|
| [0001](0001-express-inside-nextjs.md) | The Express API runs inside the Next.js deployment | Accepted |
| [0002](0002-cod-only-no-stripe.md) | Cash on delivery only; no payment processor | Accepted |
| [0003](0003-forward-only-migrations.md) | Forward-only migrations, no down scripts | Accepted |
| [0004](0004-offline-reads-not-writes.md) | The companion caches products offline, never orders | Accepted |
| [0005](0005-stateless-jwt-auth.md) | Auth stays stateless; the role claim is not re-read | Accepted, with known cost |
| [0006](0006-forced-login-no-guest-checkout.md) | Checkout requires an account | Accepted |
| [0007](0007-server-owns-the-order-lifecycle.md) | The server owns the order lifecycle; clients must not copy it | Accepted, implemented 2026-09-05 |
| [0008](0008-apk-distribution-no-play-store.md) | The companion ships as a GitHub Release APK | Accepted |

## Writing a new one

Copy the shape of any existing record: **Context** (the forces, not the
narrative), **Decision**, **Consequences** (including what this costs), and
**Alternatives considered** with why each lost. Number sequentially. Never edit
an accepted record's decision — supersede it with a new one and mark the old
`Superseded by NNNN`.

Roadmap §4.3 proposed a `0006-known-weaknesses` record. That content lives in
[SECURITY.md §3](../SECURITY.md#3-known-weaknesses) instead, where each
weakness sits beside the control that compensates for it — a better home than a
decision record, since none of them is a decision.
