'use client';

import { useEffect, useRef, useState } from 'react';
import { ProductsResponse } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ProductFilters {
  search: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  sort: 'price' | 'name' | 'created_at';
  order: 'asc' | 'desc';
  page: number;
  limit: number;
}

export const defaultFilters: ProductFilters = {
  search: '',
  category: '',
  minPrice: '',
  maxPrice: '',
  sort: 'created_at',
  order: 'desc',
  page: 1,
  limit: 12,
};

/**
 * Fetches products for the given filters.
 *
 * Two things worth calling out:
 * 1. Debounce: we wait 400ms after the filters stop changing before firing
 *    a request, so fast typing in the search box doesn't fire a request
 *    per keystroke.
 * 2. AbortController: each fetch gets its own controller stored in a ref.
 *    If filters change again before the previous request resolves, we
 *    abort it. Without this, a slow request for an earlier keystroke could
 *    resolve AFTER a faster request for a later keystroke and overwrite
 *    the correct results with stale ones.
 */
export function useProducts(filters: ProductFilters) {
  const [data, setData] = useState<ProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Cancel any in-flight request for a previous filter state.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.category) params.set('category', filters.category);
      if (filters.minPrice) params.set('minPrice', filters.minPrice);
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
      params.set('sort', filters.sort);
      params.set('order', filters.order);
      params.set('page', String(filters.page));
      params.set('limit', String(filters.limit));

      setLoading(true);
      setError(null);

      fetch(`${API_URL}/api/products?${params.toString()}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch products');
          return res.json();
        })
        .then((json: ProductsResponse) => setData(json))
        .catch((err) => {
          // AbortError is expected whenever we cancel a stale request -
          // it's not a real failure, so we don't surface it as one.
          if (err.name !== 'AbortError') {
            setError(err.message ?? 'Something went wrong');
          }
        })
        .finally(() => setLoading(false));
    }, 400);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    filters.search,
    filters.category,
    filters.minPrice,
    filters.maxPrice,
    filters.sort,
    filters.order,
    filters.page,
    filters.limit,
  ]);

  return { data, loading, error };
}
