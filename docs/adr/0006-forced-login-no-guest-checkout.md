# 0006 — Checkout requires an account

**Status:** Accepted

## Context

Guest checkout is standard practice and reduces abandonment. The usual
implementation upserts a user row by email on an unauthenticated
`POST /api/orders`.

It was drafted as a roadmap candidate and cut on review, for a reason specific
to this codebase rather than a general preference.

## Decision

Checkout requires an authenticated account. There is no guest order path, and
no guest order-tracking page.

## Consequences

- **`users.password_hash` stays `NOT NULL`** on the most security-critical
  table in the system.
- **The verified-purchase badge stays trustworthy.** `reviews` derives
  `verified_purchase` from `orders.user_id`. With guest checkout, an
  *unauthenticated* request could create an order against any email address and
  thereby mint a verified-purchase badge on a stranger's account for any
  product. The review system's one credibility signal would be forgeable by
  anyone with curl.
- **No one is enrolled in the win-back campaign without consent.** A guest who
  never made an account would otherwise be receiving marketing email.
- **There is no unauthenticated read path to order data.** Guest order tracking
  would have added the only one, defended by a rate limiter that
  [KW-2](../SECURITY.md#kw-2--rate-limiting-is-per-instance) already documents
  as per-instance and therefore not a real bound.
- Some conversion is lost. On a cash-on-delivery store where the customer is
  handing money to a person at their door anyway, requiring an account is a
  defensible thing to ask.

## Alternatives considered

**Guest checkout with the verified-purchase badge gated to authenticated
orders.** Technically sound, and rejected as the more complex half of a feature
whose simple version is the problem: it means two order-provenance paths, two
review-eligibility rules, and a nullable `password_hash`, to serve a demo
storefront's conversion rate.

**Guest checkout with a magic-link account created silently.** Rejected: it
depends on email actually arriving, which [KW-6](../SECURITY.md#kw-6--transactional-email-may-silently-not-arrive)
says it does not.
