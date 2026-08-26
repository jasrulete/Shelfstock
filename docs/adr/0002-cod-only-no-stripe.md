# 0002 — Cash on delivery only; no payment processor

**Status:** Accepted

## Context

An e-commerce portfolio piece invites the question "where's the payment
integration?". Stripe is the obvious answer and there is a well-trodden path
for it.

But Stripe requires the owner's own account, real business identity
verification, and live keys held in a public-facing deployment. For a project
whose entire operating budget is zero and whose audience is people clicking a
link on a CV, that is a large amount of real-world exposure for a demo.

There is also a correctness dimension. Payments introduce refunds, partial
captures, chargebacks and a reconciliation story. None of that exists here, and
a payment flow that takes money with no refund path is worse than no payment
flow.

## Decision

Cash on delivery only. `orders.payment_method` defaults to `cod` and no other
value is in use.

## Consequences

- **No card data is ever handled**, so PCI scope is nil. The only real customer
  data in the system is shipping details on an order — which is what makes
  [INV-10](../ARCHITECTURE.md#inv-10--no-customer-pii-on-unencrypted-device-storage)
  the sharpest privacy constraint here rather than payment security.
- The order lifecycle is a **fulfilment** lifecycle, not a payment one.
  `completed` means delivered and cash collected. That is why it is terminal:
  there is no returns flow, so cancelling it would put goods that are in the
  customer's hands back on the shelf ([ADR-0007](0007-server-owns-the-order-lifecycle.md)).
- `pending → completed` must exist, because a same-day handover never passes
  through `shipped`.
- The storefront says nothing about returns or delivery windows. **That is
  deliberate** — nothing in the codebase implements either, and inventing
  policy on a storefront is worse than staying quiet. Do not "fix" it by
  writing copy.

## Alternatives considered

**Stripe in test mode.** Rejected: a checkout that visibly says "test mode"
reads as unfinished, and one that hides it is dishonest. It also still needs an
account and key handling for a flow no one can complete.

**A fake payment step with no processor.** Rejected: it is a lie in the UI, and
it invites exactly the refund/chargeback questions the decision avoids while
implementing none of the answers.
