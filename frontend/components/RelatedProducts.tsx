'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Product } from '@/types';
import ProductCard from './ProductCard';

/**
 * "More in <category>".
 *
 * Renders nothing when the category has no other in-stock product, rather than
 * an empty heading - the only thing worse than no recommendations is a
 * recommendations shelf with nothing on it.
 */
export default function RelatedProducts({
  productId,
  category,
}: {
  productId: string;
  category: string;
}) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    api
      .get<Product[]>(`/api/products/${productId}/related?limit=4`)
      .then(setItems)
      // A cross-sell shelf is not worth an error message on someone's way to
      // buying something.
      .catch(() => setItems([]));
  }, [productId]);

  if (items.length === 0) return null;

  return (
    <section className="mt-10 space-y-3">
      <h2 className="text-lg font-semibold">More in {category}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
