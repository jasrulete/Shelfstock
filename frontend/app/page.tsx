'use client';

import { useState } from 'react';
import { defaultFilters, useProducts } from '@/hooks/useProducts';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import ProductCard from '@/components/ProductCard';
import Pagination from '@/components/Pagination';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

// One column on phones (ProductCard switches to a horizontal row at that size),
// then two/three/four as the viewport allows. Shared by the grid and its
// skeleton so the placeholder can never drift from the real layout.
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

export default function HomePage() {
  const [filters, setFilters] = useState(defaultFilters);
  const { data, loading, error } = useProducts(filters);

  function patchFilters(patch: Partial<typeof filters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  // Sort/order always have a value, so they don't count as "filtering".
  const hasActiveFilters =
    filters.search !== '' ||
    filters.category !== '' ||
    filters.minPrice !== '' ||
    filters.maxPrice !== '';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Shop ShelfStock</h1>

      <SearchBar value={filters.search} onChange={(search) => patchFilters({ search, page: 1 })} />
      <FilterPanel filters={filters} onChange={patchFilters} />

      {error && (
        <p role="alert" className="font-medium text-red-700">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className={GRID}>
          {Array.from({ length: 8 }, (_, i) => (
            <Card key={i} className="flex animate-pulse gap-3 p-3 sm:flex-col sm:gap-0">
              <div className="aspect-square w-24 shrink-0 rounded bg-gray-200 sm:mb-3 sm:w-full" />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
                <div className="mb-4 h-3 w-full rounded bg-gray-100" />
                <div className="mt-auto flex items-center justify-between">
                  <div className="h-4 w-14 rounded bg-gray-200" />
                  <div className="h-8 w-24 rounded bg-gray-100" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : data && data.products.length === 0 ? (
        // An empty result is a dead end unless it offers the way out of it.
        <Card className="p-8 text-center">
          <p className="text-gray-600">
            {hasActiveFilters
              ? 'No products match your filters.'
              : 'There are no products in the store yet.'}
          </p>
          {hasActiveFilters && (
            <Button variant="secondary" className="mt-4" onClick={() => setFilters(defaultFilters)}>
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <div className={GRID}>
          {data?.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {data && (
        <Pagination pagination={data.pagination} onPageChange={(page) => patchFilters({ page })} />
      )}
    </div>
  );
}
