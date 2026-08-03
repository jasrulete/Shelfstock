import Link from 'next/link';
import { Pagination as PaginationType } from '@/types';

/**
 * Storefront pagination, rendered as real links rather than buttons.
 *
 * The admin tables keep the button-and-callback `Pagination` component: their
 * pages are behind auth and their state is local. Out here the page number is
 * in the URL, so page 2 deserves to be a URL a crawler can follow and a
 * shopper can bookmark - which a button that mutates client state is not.
 */
export default function StorefrontPagination({
  pagination,
  searchParams,
}: {
  pagination: PaginationType;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { page, totalPages } = pagination;
  if (totalPages <= 1) return null;

  function hrefForPage(target: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === 'page') continue;
      const single = Array.isArray(value) ? value[0] : value;
      if (single) params.set(key, single);
    }
    if (target > 1) params.set('page', String(target));
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  }

  const linkClass =
    'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-gray-400';
  const disabledClass =
    'rounded border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-400';

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-2">
      {page <= 1 ? (
        <span className={disabledClass}>Prev</span>
      ) : (
        <Link href={hrefForPage(page - 1)} className={linkClass} rel="prev">
          Prev
        </Link>
      )}

      <span className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </span>

      {page >= totalPages ? (
        <span className={disabledClass}>Next</span>
      ) : (
        <Link href={hrefForPage(page + 1)} className={linkClass} rel="next">
          Next
        </Link>
      )}
    </nav>
  );
}
