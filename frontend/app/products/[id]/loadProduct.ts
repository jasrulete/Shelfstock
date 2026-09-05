import { cache } from 'react';
import type { Product } from '@/types';
import { getProductById, parseProductId } from '@/server/queries/products';

/**
 * One product read per request, however many times the page asks.
 *
 * generateMetadata and the page body both need the product, and each call to
 * getProductById is two queries - the row, then its gallery. Next dedupes
 * fetch() automatically but not pool.query, so every product view used to
 * cost four round trips to Neon. With React's request-scoped cache() it is
 * two. tests/loadProduct.test.ts counts the calls.
 *
 * Request-scoped, not global: cache() lives for one server render, so this
 * cannot serve a stale stock count across requests. The page stays
 * force-dynamic and its "if it's on the page, it's on the shelf" promise holds.
 */
export const loadProduct = cache(async (rawId: string): Promise<Product | null> => {
  const id = parseProductId(rawId);
  if (id === null) return null;
  return (await getProductById(id)) as Product | null;
});
