'use client';

import { useEffect, useState } from 'react';
import { ProductFilters } from '@/hooks/useProducts';
import { api } from '@/lib/api';
import Card from './ui/Card';
import { Input, Select } from './ui/Field';

// Fallback shown until /api/categories responds (or if it fails), so the
// dropdown is never empty.
const DEFAULT_CATEGORIES = ['Electronics', 'Home & Kitchen', 'Books', 'Apparel', 'Toys'];

export default function FilterPanel({
  filters,
  onChange,
}: {
  filters: ProductFilters;
  onChange: (patch: Partial<ProductFilters>) => void;
}) {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    api
      .get<string[]>('/api/categories')
      .then((list) => {
        if (list.length > 0) setCategories(list);
      })
      .catch(() => {
        // keep the fallback list
      });
  }, []);

  // Labels are sr-only here: each control's own options/placeholder already
  // reads as its name on screen, but assistive tech still needs a real one.
  return (
    <Card className="flex flex-wrap items-end gap-3 p-3">
      <Select
        label="Category"
        hideLabel
        value={filters.category}
        onChange={(e) => onChange({ category: e.target.value, page: 1 })}
        wrapperClassName="w-44"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>

      <Input
        label="Minimum price"
        hideLabel
        type="number"
        min={0}
        placeholder="Min price"
        value={filters.minPrice}
        onChange={(e) => onChange({ minPrice: e.target.value, page: 1 })}
        wrapperClassName="w-28"
      />
      <Input
        label="Maximum price"
        hideLabel
        type="number"
        min={0}
        placeholder="Max price"
        value={filters.maxPrice}
        onChange={(e) => onChange({ maxPrice: e.target.value, page: 1 })}
        wrapperClassName="w-28"
      />

      <Select
        label="Sort by"
        hideLabel
        value={`${filters.sort}:${filters.order}`}
        onChange={(e) => {
          const [sort, order] = e.target.value.split(':') as [ProductFilters['sort'], ProductFilters['order']];
          onChange({ sort, order, page: 1 });
        }}
        wrapperClassName="w-48"
      >
        <option value="created_at:desc">Newest first</option>
        <option value="price:asc">Price: low to high</option>
        <option value="price:desc">Price: high to low</option>
        <option value="name:asc">Name: A-Z</option>
      </Select>
    </Card>
  );
}
