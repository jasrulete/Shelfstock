import type { Metadata } from 'next';
import Link from 'next/link';
import ProductCard from '@/components/ProductCard';
import StorefrontControls from '@/components/StorefrontControls';
import StorefrontPagination from '@/components/StorefrontPagination';
import StorefrontHero, { LowStockItem } from '@/components/StorefrontHero';
import Card from '@/components/ui/Card';
import { Product } from '@/types';
import { listCategories, listLowStock, listProducts } from '@/server/queries/products';

/**
 * Rendered per request. Stock counts are the point of this storefront - both
 * the grid's "Only N left" badges and the hero's scarcity rail - so a cached
 * copy would be showing numbers that were true a minute ago.
 */
export const dynamic = 'force-dynamic';

/**
 * Every filter permutation is a query string on this one page, so they all
 * canonicalise back to it. Without this, `?category=Books`, `?sort=price:asc`
 * and every combination of them look to a crawler like separate pages with
 * near-identical content, which is how a small catalogue gets treated as
 * duplicate content. `metadataBase` in the root layout makes this absolute.
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// One column on phones (ProductCard switches to a horizontal row at that size),
// then two/three/four as the viewport allows.
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

type SearchParams = Record<string, string | string[] | undefined>;

/** Query strings can repeat a key; take the first and let the query layer do
 *  the clamping and whitelisting. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const filters = {
    search: one(params.search),
    category: one(params.category),
    minPrice: one(params.minPrice),
    maxPrice: one(params.maxPrice),
    sort: one(params.sort),
    order: one(params.order),
    page: one(params.page),
  };

  // One round trip each, in parallel, on the server - rather than three
  // sequential client fetches after hydration.
  const [{ products, pagination }, categories, lowStock] = await Promise.all([
    listProducts(filters),
    listCategories(),
    listLowStock({ limit: '4' }),
  ]);

  // Sort/order always have a value, so they don't count as "filtering".
  const hasActiveFilters = Boolean(
    filters.search || filters.category || filters.minPrice || filters.maxPrice
  );

  return (
    <div className="space-y-8">
      {/* The page's h1 lives in the hero; browsing is a section beneath it. */}
      <StorefrontHero items={lowStock as LowStockItem[]} />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Everything in stock</h2>

        <StorefrontControls categories={categories} />

        {products.length === 0 ? (
          // An empty result is a dead end unless it offers the way out of it.
          <Card className="p-8 text-center">
            <p className="text-gray-600">
              {hasActiveFilters
                ? 'No products match your filters.'
                : 'There are no products in the store yet.'}
            </p>
            {hasActiveFilters && (
              <Link
                href="/"
                className="mt-4 inline-block rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-gray-400"
              >
                Clear filters
              </Link>
            )}
          </Card>
        ) : (
          <div className={GRID}>
            {(products as Product[]).map((product, i) => (
              // The first row is above the fold at every breakpoint (4 cards at
              // the widest); the rest stay lazy.
              <ProductCard key={product.id} product={product} priority={i < 4} />
            ))}
          </div>
        )}

        <StorefrontPagination pagination={pagination} searchParams={params} />
      </section>
    </div>
  );
}
