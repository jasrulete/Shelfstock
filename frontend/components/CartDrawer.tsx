'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/hooks/useCart';
import { useCurrency, formatMoney } from '@/lib/currencyContext';

export default function CartDrawer() {
  const { items, updateQuantity, removeItem, subtotal } = useCart();
  const { currency, convert } = useCurrency();

  if (items.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-white p-8 text-center text-gray-500">
        <p className="mb-4">Your cart is empty.</p>
        <Link
          href="/"
          className="inline-block rounded bg-brand-500 px-4 py-2 text-white hover:bg-brand-600"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map(({ product, quantity }) => (
        <div
          key={product.id}
          className="flex items-center justify-between gap-4 rounded border border-gray-200 bg-white p-3"
        >
          <Link href={`/products/${product.id}`} className="flex items-center gap-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-gray-100">
              {product.image_url && (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              )}
            </div>
            <div>
              <p className="font-medium hover:underline">{product.name}</p>
              <p className="text-sm text-gray-500">
                {formatMoney(convert(Number(product.price)), currency)} each
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={product.stock}
              value={quantity}
              onChange={(e) => updateQuantity(product.id, Number(e.target.value))}
              className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <button
              onClick={() => removeItem(product.id)}
              className="text-sm text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between border-t pt-4 text-lg font-semibold">
        <span>Subtotal</span>
        <span>{formatMoney(convert(subtotal), currency)}</span>
      </div>

      <Link
        href="/checkout"
        className="block rounded bg-brand-500 px-4 py-2 text-center text-white hover:bg-brand-600"
      >
        Proceed to checkout
      </Link>
    </div>
  );
}
