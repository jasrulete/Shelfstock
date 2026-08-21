import { waitUntil } from '@vercel/functions';

/**
 * Runs work that must outlive the HTTP response, without letting it extend or
 * fail that response.
 *
 * The problem this exists for: routes send their response and then start the
 * confirmation email and the admin push. pages/api/[...path].ts resolves the
 * serverless handler's promise on res.once('finish'), so as far as Vercel is
 * concerned the invocation is over the moment the body flushes - and it may
 * freeze the instance mid-send. The push simply never arrives, which breaks
 * the one thing the companion app exists to do.
 *
 * waitUntil() tells the platform to keep the instance alive until the promise
 * settles. Off Vercel (local dev, Docker, vitest) it is a no-op, which is
 * correct: nothing freezes those processes, so the promise finishes on its own.
 *
 * The work is deliberately NOT awaited before responding. Awaiting a
 * third-party HTTP call after the transaction has already COMMITted would turn
 * a hung Resend or Expo into a 504 on an order that actually succeeded - and
 * POST /api/orders has no idempotency key, so the client's retry would place a
 * second order and decrement stock twice. A lost notification is a smaller
 * failure than a duplicate order.
 */
export function afterResponse(label: string, work: Promise<unknown>): void {
  // Attached here rather than at the call site so a rejection can never become
  // an unhandled rejection, which on some runtimes takes the process down.
  const guarded = work.catch((err) => {
    console.error(`${label}:`, err);
  });
  waitUntil(guarded);
}
