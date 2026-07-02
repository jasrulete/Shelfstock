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
        <p className="text-gray-500">Loading products...</p>
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
