'use client';

import { useState } from 'react';
import { defaultFilters, useProducts } from '@/hooks/useProducts';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import ProductCard from '@/components/ProductCard';
import Pagination from '@/components/Pagination';

export default function HomePage() {
  const [filters, setFilters] = useState(defaultFilters);
  const { data, loading, error } = useProducts(filters);

  function patchFilters(patch: Partial<typeof filters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Shop ShelfStock</h1>

      <SearchBar value={filters.search} onChange={(search) => patchFilters({ search, page: 1 })} />
      <FilterPanel filters={filters} onChange={patchFilters} />

      {error && <p className="text-red-500">{error}</p>}

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-3 aspect-square w-full rounded bg-gray-200" />
              <div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
              <div className="mb-4 h-3 w-full rounded bg-gray-100" />
              <div className="flex items-center justify-between">
                <div className="h-4 w-14 rounded bg-gray-200" />
                <div className="h-8 w-24 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : data && data.products.length === 0 ? (
        <p className="text-gray-500">No products match your filters.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
