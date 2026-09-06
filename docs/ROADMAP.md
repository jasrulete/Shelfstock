# ShelfStock — Roadmap

Written 2026-08-21 against `main` at `902740e`. Companion app at
`shelfstock-companion` `e726113`.

> **This is the plan as it was written, kept for its reasoning — the scope
> decisions and what was cut and why. It is not a status board.** Everything
> here except §4.1 (screenshots and the scan GIF) shipped by 2026-09-06;
> [HANDOVER.md §0](../HANDOVER.md) is the status, and two decisions below were
> reversed in the building: the idempotency key in §3.1 and the offline write
> queue's "step 1 only" in §5. Both are flagged in place.

Produced by five research passes over adjacent products, three code audits of
both repositories, and three adversarial review passes. 37 candidates were
drafted; 32 survived review, 5 were cut. Every file reference below was read
before it was written down, and the ones that mattered were re-verified against
`902740e` after a stale-tree correction (see §6).

**This is a portfolio project.** Optimise for "a recruiter clicks the link and
it works and looks considered", not for scale. Every item is priced against the
real constraints: zero ongoing cost, COD only, one developer, Vercel Hobby +
Neon free tier, and no persistent process.

---

## 1. The finding that reframes the rest

`shelfstock-companion/docs/screenshots/` contains one file: `.gitkeep`.

The entire Android app — push notifications, the barcode scanner, the offline
cache — has no visual evidence anywhere, and it ships as an APK on GitHub
Releases that nobody will sideload. Three reviewers reached this independently:
**an APK-only feature with no recording is invisible to every person who
matters.**

A screen-capture GIF is worth more than any two features in §3. That is why
Phase 2 sits ahead of nine polish items rather than at the end.

---

## 2. Phase 0 — things that break the first click

Eight items, seven of them S. Every one is a verified defect reachable by a
stranger with a URL bar. Do these first; they are what a cold visit hits.

### 2.1 Error and loading boundaries

`app/` contains only `layout.tsx`, `not-found.tsx` and `page.tsx`. There is a
considered 404 page and no equivalent for failure. Neon's free tier
autosuspends, so the first click after idle can serve Next's unbranded
"Application error" to whoever opened the link in a CV.

- `app/error.tsx` — client component taking `{ error, reset }`, reusing
  `not-found.tsx`'s visual language, with a "Try again" calling `reset()`.
- `app/global-error.tsx` — layout-level failures.
- `app/loading.tsx` — a `ProductCard`-shaped skeleton grid.

`app/page.tsx` and `app/products/[id]/page.tsx` are both `force-dynamic`, so
both hit the database on every render and both need the boundary.

**Constraint:** render a fixed message plus at most `error.digest`. Never
`error.message`, never the stack. Next redacts message in production builds,
but `error.tsx` is a client component and debug interpolation gets shipped by
accident — say so in a comment so the next person does not add it back.

### 2.2 Security headers on HTML pages

`helmet` only guards the Express app mounted at `/api`. The storefront,
checkout and admin area serve with no CSP, no `X-Frame-Options` and no
`Referrer-Policy` — while `README.md:147` claims otherwise. The JWT lives in
`localStorage` (`lib/auth.ts:20-22`), which is exactly what a CSP mitigates.

`next.config.js` currently sets only `output` and `images`. Add a `headers()`
block for `source: '/((?!api/).*)'` — the negative lookahead matters, or Next's
headers and helmet's both fire on API responses. Start with
`Content-Security-Policy-Report-Only`; promote to enforcing once the report is
clean. Then correct `README.md:147`.

### 2.3 Guarantee the order push actually sends

`server/routes/orders.ts` commits, calls `res.status(201).json(order)`, and
*then* starts the confirmation email and the admin push, both explicitly
fire-and-forget. `pages/api/[...path].ts:50-54` resolves its promise on
`res.once('finish')`, so Vercel may freeze the instance mid-send. The same
shape exists on the shipped-mail path in `PATCH /:id/status`.

The phone buzzing on checkout is the entire justification for the second
repository. A flaky push breaks the one demo that pays for it.

Use `waitUntil()` on Vercel. If a zero-dependency fallback is used instead,
it must be `Promise.allSettled` **plus a hard `Promise.race` timeout (~2s)**.

**Why the timeout is not optional:** an unbounded await after `COMMIT` turns a
hung Resend or Expo call into a 504 on an order that actually succeeded. The
client retries, and there is no idempotency key on `POST /api/orders` to catch
the duplicate — so the second attempt decrements stock again. Fixing a lost
notification must not create a double-order bug.

**Scope the claim to push.** See §6 on Resend deliverability; do not write
"order confirmations are now guaranteed" in the README.

### 2.4 Stop caching customer PII in plaintext (companion)

The JWT is carefully placed in `expo-secure-store`, and 24 hours of customer
shipping details sit unencrypted in AsyncStorage beside it — and survive
logout.

`src/app/_layout.tsx:14` creates the persister with `AsyncStorage`;
`:18` sets `gcTime` to 24h. Cached `OrderDetail` rows carry `shipping_name`,
`shipping_phone`, `shipping_address` and `user_email` (`src/api/types.ts:30-39`).

Three fixes, all client-side:

- `src/auth/AuthContext.tsx` `logout()` — call `queryClient.clear()` and
  `persister.removeClient()`.
- `persistOptions={{ persister, buster: `${user?.id}:${version}` }}` so a
  different user or a new build cannot read the previous cache.
- `dehydrateOptions.shouldDehydrateQuery` excluding `['order', id]`.

### 2.5 Scope push to real admins, prune dead tokens

`server/push.ts:15` is `SELECT token FROM device_tokens` with no role check,
and the Expo error tickets from `sendPushNotificationsAsync` are discarded. A
demoted admin keeps receiving lock-screen order totals indefinitely.

- Join to `users` and filter `WHERE u.role = 'admin'`.
- Capture the tickets; on `DeviceNotRegistered`, delete that token.
- Add `AND user_id = $2` to the device-token DELETE route.

The exposure is a revoked-admin device, not an open fan-out — frame it that
way. Update `shelfstock-companion/docs/SETUP.md` to drop the tradeoff line once
this lands.

### 2.6 Stop leaking internal barcodes publicly

`server/queries/products.ts:190` explicitly selects `p.barcode` into the public
list projection, and the public by-id route returns `p.*`. Neither
`routes/products.ts:128` nor `:213` has auth middleware, so every visitor gets
the internal barcode for every SKU. The column exists only for the companion
scanner.

Dropping it from the list projection is safe — nothing renders it. For by-id,
return it only on an admin JWT, or point the mobile edit screen at an
admin-scoped detail route. **Verify the mobile `ProductForm` round-trip before
merging** or the scanner breaks.

### 2.7 Stop the admin wiping a product's gallery on save

`app/admin/products/page.tsx:79` `startEdit` seeds `form.images = ''`, then
fires an async detail fetch whose `.catch(() => {})` leaves it blank on
failure. `handleSubmit` always sends `images`, and `routes/products.ts:319-323`
documents `[]` as "clear the gallery". Open a product and save before its
images load, and every gallery row is deleted — no warning, no undo.

Do not simply disable Save. Omit the `images` key entirely while
`galleryLoaded` is false, so a failed fetch degrades to "edit everything except
the gallery" rather than a dead form. Surface the fetch failure with a retry
instead of swallowing it.

### 2.8 Make every API response JSON

`POST /api/auth/login` with a malformed body returns `text/html` today, because
`server/app.ts` has no terminal error handler.

Add a 4-arg `(err, req, res, next)` handler mapping `entity.parse.failed` and
`entity.too.large` to specific messages, and everything else to a **fixed
generic 500 string**. Never echo `err.message` — pg errors carry table and
column names and sometimes bound parameter values. Log the real error
server-side only. Register it after the `/api` 404 catch-all, or the 404
shadows it. Give the global limiter a `message: { error: … }` object to match
`authLimiter`.

Trimmed from M to S on review: the query-layer parsing fixes (`?search=a&search=b`
500ing, `?minPrice=abc` binding NaN) fold in opportunistically if
`queries/products.ts` is being touched anyway, not as a dedicated pass.

---

## 3. Phase 1 — make the two-app pairing the point

Having both a storefront and a phone app is the most under-used asset here.
These five compound into one demo: adjust stock on the phone, watch the web
admin explain where the number came from, then scan a box shut. Ship in order —
each depends on the last.

### 3.1 Stock ledger + inventory stepper — one item, not two

Turns "stock: 12" into "stock: 12 — +5 from the companion scanner, 2 minutes
ago". Small stores almost never keep an inventory ledger, and it is the
cheapest way to make the cross-surface story legible in a screenshot.

```sql
stock_adjustments(
  id SERIAL, product_id INT REFERENCES products ON DELETE CASCADE,
  delta INT NOT NULL, new_stock INT NOT NULL,
  source VARCHAR(20) CHECK (source IN ('web-admin','companion','order','cancel')),
  user_id INT REFERENCES users, note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)
-- index on (product_id, created_at DESC)
```

`POST /api/products/:id/adjust-stock {delta, note?}` doing
`UPDATE products SET stock = stock + $1 WHERE id = $2 AND stock + $1 >= 0
RETURNING stock` and the ledger INSERT in one transaction. Write ledger rows
from the existing paths too: the checkout decrement and the cancel restore.

Mobile: `-`/`+` on the inventory row at 48dp with haptics, optimistic update on
the `['products']` cache.

**All three reviewers required the merge.** The stepper alone against the
existing PUT is a read-modify-write that silently swallows a concurrent order's
decrement — a worse bug than the ergonomics problem it solves.

Bound `delta` server-side and **reject rather than clamp**: a clamped
adjustment that still logs a ledger row is a lie in an audit table. Render the
admin-supplied `note` as text only. Idempotency-key machinery was cut as
L-effort against an S-effort risk — with an atomic delta update, a replay is a
visible, correctable off-by-one.

> **Reversed 2026-09-06.** Once stepper presses could be queued offline and
> replayed after a relaunch, the replay stopped being a rare off-by-one: the
> persister's write to disk lags the live mutation state by up to a second, so
> an app killed in that window re-sends a press the server already applied.
> `adjust-stock` now takes a `requestId` and dedupes it against
> `stock_adjustments.client_request_id` under the row lock. The effort was S,
> not L, because the queue had already made the key necessary.

### 3.2 Serve the transition matrix instead of copying it

The phone carries its own copy of the order lifecycle and it has **already
drifted**:

| | |
|---|---|
| Server truth | `server/orderStatus.ts:27` — `pending: ['shipped','completed','cancelled']` |
| Web admin | imports it (`app/admin/orders/page.tsx:12`) |
| Companion | `src/api/orders.ts:9-11` omits `'completed'` |
| The test | `src/api/__tests__/orders.test.ts:5` asserts the drifted value |

A green test is pinning the drift in place, and the consequence is real: a
same-day COD handover is forced through a bogus `shipped` hop, which also fires
a customer "order shipped" email.

Add `allowed_transitions` to `GET /api/orders/:id` and the list projection,
render the mobile buttons from it, delete `statusActions` and its test. Keep
one hard-coded fallback for the offline case, marked stale in the UI. The
proposed `/api/meta/contract` endpoint and codegen script were both cut.

### 3.3 Make the push refresh the app

`src/app/_layout.tsx:22-28` registers only
`addNotificationResponseReceivedListener` and does nothing but `router.push`.
A new order arriving while the app is open changes nothing on screen.

Lead with the coercion, not the refresh — an unvalidated `orderId` straight
from a push payload into `router.push` is the actual defect:

```ts
const id = Number(response.notification.request.content.data?.orderId);
if (Number.isFinite(id) && id > 0) router.push(`/orders/${id}`);
```

Then add `addNotificationReceivedListener` invalidating `['orders']` for
foreground arrivals, and wire TanStack's `focusManager` to RN's `AppState`.
Keep a trailing debounce so several arrivals cause one refetch.

### 3.4 Seed real barcodes — a blocking precondition

Promoted out of §3.5 because without it the manual-confirm fallback *is* the
demo. Extend `scripts/seed-demo-users.js` (or add a migration) to assign valid
EAN-13s across the seeded catalogue, and produce a printable barcode sheet or
on-screen codes so the scan demo is reproducible without physical stock.

### 3.5 Scan to verify before marking an order shipped

Point the camera at each product as you pack. Lines tick off green, a wrong SKU
buzzes and refuses, and "Mark shipped" only unlocks once the box matches the
order.

Genuinely rare below WMS-tier software — Cin7 sells this as scan-to-verify. It
reuses the camera, the barcode column and the status matrix that all already
exist, and it is the single best 30-second demo this pairing can produce.

- **Server:** add `p.barcode` to the order-items projection in
  `GET /api/orders/:id` (it already joins `order_items → products` for
  `product_name`). Gate it on `req.user.role === 'admin'`, and test that a
  customer fetching their own order gets items *without* a barcode key.
- **Mobile:** `src/app/orders/[id].tsx` gains a "Pack & verify" screen —
  `CameraView` with the same `barcodeScannerSettings` as `src/app/scan.tsx:60-64`,
  per-line scanned/expected counts, `expo-haptics` Success on a match and Error
  plus a red overlay on a SKU not in this order or already fully scanned.

Keep an explicit "Ship anyway" override — without it a null-barcode product
blocks fulfilment entirely. Record the mismatch in the ledger note rather than
a new table.

**Budget the screen-capture GIF as part of this item, not after it.**

---

## 4. Phase 2 — make the work visible

Cheap, unglamorous, and higher return per hour than anything in §3.

1. **Screenshots and the scan GIF.** Fill `docs/screenshots/`: login, orders
   list, order detail, scanner, a real push on a lock screen, and a GIF of
   scan → product. Embed them in *both* READMEs — the web one is what a
   recruiter opens first.
2. **Docs that match the code.** `frontend/.git` is a second repository
   pointing at `Shelfstock-frontend` with a pre-serverless HEAD (`41b0eee`).
   Every documented workflow starts by cloning the wrong thing. Diff it against
   the monorepo, delete the nested `.git`, archive that GitHub repo. Fix the
   README URL and the SETUP.md tradeoff lines.
3. **A short decision log** in `docs/adr/`. Much of the prose already exists as
   code comments and needs moving: `0001-express-inside-nextjs` (the comment in
   `server/app.ts:21-24` is the draft), `0002-cod-only-no-stripe`,
   `0003-forward-only-migrations` (the baseline migration's header is the
   draft), `0004-offline-reads-not-writes`, `0005-no-play-store-listing`,
   `0006-known-weaknesses`.

**Any record documenting a weakness must state the compensating control in the
same paragraph** — the localStorage entry pairs with the CSP from §2.2, the
rate-limiting entry pairs with "the destructive endpoints are all `adminOnly`
with row-level ownership checks". A decision log that only lists holes reads as
a liability inventory.

A periodic warm-ping cron was proposed and cut: keeping a free-tier database
awake by polling it is a workaround pretending to be a fix, and it must not
substitute for §2.1.

---

## 5. Phase 3 — depth over breadth

Every item was scoped down on review. Build the trimmed version.

| Item | Scope after review |
|---|---|
| Offline write queue | **Step 1 only** *(scope as planned; step 2 shipped too — see below)*. `setMutationDefaults` for `['order-status']` and `['product']`, `resumePausedMutations` on the persister's `onSuccess`, and a visible `mutation.isPaused` "Queued — sends when you're back online". Drop `expo-sqlite`, the `pending_mutations` table and the background-task flush. |
| Notification preferences | Persistence fix + denied-permission state now. `(tabs)/_layout.tsx:11-15` calls `enablePush()` unconditionally on every mount, so turning it off silently re-enables. Defer per-event toggles. |
| List ergonomics | 300ms debounce + `keepPreviousData`, and real `isError`/retry states on inventory. **Infinite scroll cut** — layered on a persisted cache it is a bug factory for no demo-visible gain. |
| Accessibility | Skip link + `<main id="main">`; `scope="col"` and `sr-only` captions on 25 `<th>` across four admin tables (`grep 'scope='` returns nothing); `accessibilityLabel` on the seven ProductForm inputs; `OfflineBanner` safe-area fix. |
| Customer self-cancel | `POST /api/orders/:id/cancel`, `requireAuth` without `adminOnly`, `SELECT … FOR UPDATE`, refuse unless owner and `pending`. **Extract `transitionOrder()` into a shared service** rather than duplicating the block. |
| Reviews | "Show more reviews" only — append, don't replace, announce via the existing `role="status"`. `reviews.ts:47` limits to 10 and `ProductReviews.tsx:76` never reads `data.pagination`, so an 11th review is counted in the average and invisible. Vote table cut. |
| Storefront performance | Wrap `loadProduct` in React's `cache()`. `generateMetadata` and the page body both call it, and it issues two queries — Next dedupes `fetch()` but not raw `pool.query`, so it is 4 round trips per view, going to 2. Record the number for the README. |
| Low-stock chip | `GET /api/analytics/low-stock` already exists behind `requireAuth+adminOnly`; the inventory tab just doesn't call it. Chip only — the "today's numbers" header was cut. |
| Tests | `tests/winback.test.ts` covering the `NOT EXISTS` dedup and "a Resend failure inserts no `winback_emails` row", plus a ProductForm blank-price guard. The CRM segmentation test was cut as lower value. |

---

**Step 2 shipped as well (2026-09-06).** The stepper joined the queue in
companion #15–#17: presses queue offline, run one per product at a time in
press order, survive a relaunch, carry a `requestId` the server dedupes on,
and retry once on a dropped connection. The row shows only counts the server
has sent, with unconfirmed presses drawn beside it. The reason for going
further than planned is in the reversal note in §3.1.

## 6. Rejected, and why

Several of these died of the same cause, which is the most useful single output
of the review: **a demo catalogue of about twenty products cannot support a
feature that needs data volume.** Reorder points, frequently-bought-together,
review theme chips and faceted filter counts all reduce to an empty state on
the live demo, and filling it means seeding fabricated demand curves and review
corpora. A real retail formula fed invented inputs is worse than the honest
`stock <= 5` heuristic that ships today.

**Guest checkout — cut.** Upserting a user row by email on an unauthenticated
`POST /api/orders` collides with `server/routes/reviews.ts:118-126`, which
grants the verified-purchase badge from `o.user_id`. An unauthenticated request
could therefore mint a verified-purchase badge on a stranger's account for any
product. It also makes `password_hash` nullable on the most security-critical
table and enrolls guests into the win-back campaign without consent. Forced
login on a COD store is a defensible choice — document it in §4.3.

**Guest order tracking — cut.** No possible users once guest checkout is cut,
and it would add the only unauthenticated read path to order data, defended by
a rate limiter that `server/app.ts:29-33` already documents as per-instance and
therefore not a real bound.

**AI product Q&A — cut.** Breaks the zero-cost constraint, and the spend
control does not hold: a per-IP cap riding on that same per-instance limiter
means an unauthenticated public endpoint that spends the owner's money with no
working bound. The retrieval corpus would also be user-submitted review text on
open registration — indirect prompt injection with the store's own product page
as the delivery vehicle.

**Visual similarity search — cut.** `onnxruntime-node` plus a CLIP encoder
against Vercel Hobby's 250 MB unzipped limit is marginal at best, and
nearest-neighbour search over roughly twenty stock photographs returns
arbitrary matches. The demo would visibly return wrong answers.

**APK version handshake — hold, document instead.** The premise checks out:
`EXPO_PUBLIC_API_URL` is baked at build time, `expo-updates` is absent, and
`app.json` has no `runtimeVersion`, so a breaking API change strands installed
APKs. But the affected population is roughly one person, and a buggy semver
comparator bricks the app. An ADR entry captures the judgement at none of the
risk.

**MCP server for the store — hold, reopenable.** The one genuinely novel item.
Cut 2–1 on visibility: MCP needs a configured client and an admin JWT, so a
recruiter clicking the live link sees nothing and it only lands as a recorded
video. If there is appetite for one ambitious swing after Phase 2, this is it —
read-only tools first, writes behind an env flag, and budget the recording.

### Correction: password reset

An earlier draft of this document listed password reset as **cut**, on the
grounds that Resend's free tier only delivers from the shared
`onboarding@resend.dev` address to the account owner's own inbox, so a reset
link mailed to a stranger never arrives — leaving the account permanently
locked, which is worse than having no reset flow.

That draft was written against a stale `main`. **Password reset shipped in
PR #17** (`d61d933`), and the implementation is sound: hashed tokens, a TTL,
old links retired when a new one is issued, an identical 200 response for known
and unknown addresses, and a dev-mode console link.

The deliverability concern is still real, but it is now a **deployment
question, not a build decision**:

- If `MAIL_FROM` is left at the `onboarding@resend.dev` default with no
  verified domain, the production flow answers "a reset link is on its way" and
  nothing arrives.
- The demo path does not depend on it — both demo accounts' credentials are in
  the README — so this is not a blocker.
- Resolve it by verifying a sending domain, or by documenting the limitation in
  the ADR log. Do not remove the feature.

---

## 7. Sequencing rationale

Phase 0 is what a stranger hits. Phase 1 is what makes the project distinctive.
Phase 2 is what makes Phase 1 visible to anyone but the author. Phase 3 is
depth.

Phase 2 before Phase 3 is deliberate: unrecorded work is indistinguishable from
work not done.
