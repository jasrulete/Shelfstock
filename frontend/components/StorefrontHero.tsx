'use client';

import { useEffect, useState } from 'react';
import ProductImage from './ui/ProductImage';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import Card from './ui/Card';

/** Subset of Product returned by /api/products/low-stock. */
interface LowStockItem {
  id: number;
  name: string;
  price: string;
  stock: number;
  image_url: string | null;
}

/**
 * The storefront's opening statement.
 *
 * The right-hand rail is the point: it merchandises real inventory rather than
 * a hand-picked "featured" list, which is the one thing this store can claim
 * honestly. If nothing is running low the rail renders nothing at all - an
 * empty "Low stock" box would be worse than no box.
 *
 * Every claim in the copy is backed by something the app actually does. There
 * is deliberately no returns or shipping-time promise here, because nothing in
 * the codebase implements one.
 */
export default function StorefrontHero() {
  const { currency, convert } = useCurrency();
  const [items, setItems] = useState<LowStockItem[] | null>(null);

  useEffect(() => {
    api
      .get<LowStockItem[]>('/api/products/low-stock?limit=4')
      .then(setItems)
      // The rail is decoration for the hero, not its purpose - a failed fetch
      // should leave the headline standing, not surface an error.
      .catch(() => setItems([]));
  }, []);

  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-brand-600">
            Cash on delivery
          </span>

          <h1 className="font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            If it&rsquo;s on the page,
            <br />
            it&rsquo;s on the shelf.
          </h1>

          <p className="max-w-[34ch] text-sm text-gray-600">
            Real stock counts, updated the moment someone buys. Pay the courier when your order
            reaches your door.
          </p>

          <ul className="flex flex-wrap gap-2 pt-1">
            {['Pay on delivery', 'Live stock counts', 'No card required'].map((claim) => (
              <li
                key={claim}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-600"
              >
                <span aria-hidden="true" className="text-brand-600">
                  ✓
                </span>
                {claim}
              </li>
            ))}
          </ul>
        </div>

        {/* Rail hidden entirely while loading or when nothing qualifies. */}
        {items && items.length > 0 && (
          <div className="flex flex-col gap-2.5 border-gray-200 bg-gray-50 p-5 md:border-l">
            <h2 className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-gray-500">
              Low stock right now
            </h2>
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/products/${item.id}`}
                className="flex items-center gap-3 rounded border border-gray-200 bg-white p-2 transition-colors hover:border-gray-400"
              >
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-gray-100">
                  {/* alt is empty: the product name is the adjacent text. */}
                  <ProductImage src={item.image_url} alt="" sizes="36px" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="font-mono text-[0.65rem] text-amber-700">
                    {item.stock} left
                  </span>
                </div>
                <span className="ml-auto shrink-0 font-mono text-sm font-semibold tabular-nums">
                  {formatMoney(convert(Number(item.price)), currency)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
