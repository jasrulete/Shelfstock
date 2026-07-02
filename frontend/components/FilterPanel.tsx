'use client';

import { ProductFilters } from '@/hooks/useProducts';

const CATEGORIES = ['Electronics', 'Home & Kitchen', 'Books', 'Apparel', 'Toys'];

export default function FilterPanel({
  filters,
  onChange,
}: {
  filters: ProductFilters;
  onChange: (patch: Partial<ProductFilters>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-gray-200 bg-white p-3">
      <select
        value={filters.category}
        onChange={(e) => onChange({ category: e.target.value, page: 1 })}
        className="rounded border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <input
        type="number"
        min={0}
        placeholder="Min price"
        value={filters.minPrice}
        onChange={(e) => onChange({ minPrice: e.target.value, page: 1 })}
        className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        min={0}
        placeholder="Max price"
        value={filters.maxPrice}
        onChange={(e) => onChange({ maxPrice: e.target.value, page: 1 })}
        className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
      />

      <select
        value={`${filters.sort}:${filters.order}`}
        onChange={(e) => {
          const [sort, order] = e.target.value.split(':') as [ProductFilters['sort'], ProductFilters['order']];
          onChange({ sort, order, page: 1 });
        }}
        className="rounded border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="created_at:desc">Newest first</option>
        <option value="price:asc">Price: low to high</option>
        <option value="price:desc">Price: high to low</option>
        <option value="name:asc">Name: A-Z</option>
      </select>
    </div>
  );
}
