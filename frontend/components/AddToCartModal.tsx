'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Product } from '@/types';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import { useCart } from '@/hooks/useCart';

export default function AddToCartModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const { currency, convert } = useCurrency();
  const { addItem } = useCart();
  const priceUsd = Number(product.price);
  const maxQty = Math.max(1, product.stock);

  function clamp(n: number) {
    return Math.min(Math.max(1, n), maxQty);
  }

  function handleAdd() {
    addItem(product, quantity);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${product.name} to cart`}
        className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-semibold">Add to cart</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-gray-100">
            {product.image_url && (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                className="object-cover"
                sizes="80px"
              />
            )}
          </div>
          <div>
            <p className="font-medium">{product.name}</p>
            <p className="text-sm text-gray-500">
              {formatMoney(convert(priceUsd), currency)} each
            </p>
            {product.stock <= 5 && (
              <p className="text-xs font-medium text-amber-600">Only {product.stock} left!</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setQuantity((q) => clamp(q - 1))}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
            className="h-9 w-9 rounded border border-gray-300 text-lg leading-none hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={maxQty}
            value={quantity}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              setQuantity(Number.isNaN(parsed) ? 1 : clamp(parsed));
            }}
            className="w-16 rounded border border-gray-300 px-2 py-1.5 text-center"
          />
          <button
            onClick={() => setQuantity((q) => clamp(q + 1))}
            disabled={quantity >= maxQty}
            aria-label="Increase quantity"
            className="h-9 w-9 rounded border border-gray-300 text-lg leading-none hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            +
          </button>
        </div>

        <button
          onClick={handleAdd}
          className="mt-4 w-full rounded bg-brand-500 px-4 py-2 text-white hover:bg-brand-600"
        >
          Add {quantity} to cart · {formatMoney(convert(priceUsd * quantity), currency)}
        </button>
      </div>
    </div>
  );
}
