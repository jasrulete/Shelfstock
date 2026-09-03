'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Button, { buttonClasses } from '@/components/ui/Button';

/**
 * The failure counterpart to not-found.tsx, and deliberately written in the
 * same visual language: a storefront that has a considered 404 and Next's
 * unbranded "Application error" for everything else looks half-finished at
 * exactly the wrong moment.
 *
 * `/` and `/products/[id]` are force-dynamic, so every render touches Neon.
 * The free tier autosuspends, which means a first click after an idle period
 * is the most likely way anyone reaches this page. "Try again" is the right
 * primary action because reset() re-runs the render, and by then the compute
 * has usually woken up.
 *
 * NOTE: this renders a fixed message and at most error.digest. Do NOT add
 * {error.message} or the stack. Next redacts message in production builds, but
 * this is a client component and a debug interpolation added locally ships to
 * production looking fine - and a pg error carries table and column names.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Storefront render failed:', error);
  }, [error]);

  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-gray-500">
        We couldn&apos;t load this page just now. Trying again usually works.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={buttonClasses({ variant: 'secondary' })}>
          Back to the store
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-gray-400">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
