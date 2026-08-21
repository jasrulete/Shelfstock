/**
 * Shown while the force-dynamic storefront waits on Neon. Without it the
 * navigation just hangs on the previous page, which on a cold free-tier
 * compute is indistinguishable from the site being broken.
 *
 * The grid string is copied from app/page.tsx rather than shared: this file
 * must render even if the page module is the thing that fails to load, so it
 * deliberately imports nothing.
 */
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

export default function Loading() {
  return (
    <div className="py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading products…</span>

      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-200" aria-hidden="true" />

      <div className={GRID} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white shadow-card">
            <div className="aspect-square animate-pulse rounded-t-lg bg-gray-200" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-full animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
