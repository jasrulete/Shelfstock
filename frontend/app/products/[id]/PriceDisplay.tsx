'use client';

import { Product } from '@/types';
import { useCurrency, formatMoney } from '@/lib/currencyContext';

/**
 * Price in the reader's chosen currency, with the USD original beneath when
 * they are not the same - orders are charged in USD, so the converted figure
 * must never be the only number on the page.
 *
 * Client-only because the currency selector is client state, but it still
 * server-renders: Next renders client components to HTML on the first
 * request too. That first pass emits USD, which is the currency the order is
 * actually placed in, so a crawler never indexes a converted approximation.
 */
export default function PriceDisplay({ product }: { product: Product }) {
  const { currency, convert } = useCurrency();

  return (
    <>
      <p className="mt-4 text-2xl font-semibold tabular-nums">
        {formatMoney(convert(Number(product.price)), currency)}
      </p>
      {currency !== 'USD' && (
        <p className="font-mono text-xs text-gray-500 tabular-nums">
          {formatMoney(Number(product.price), 'USD')} USD
        </p>
      )}
    </>
  );
}
