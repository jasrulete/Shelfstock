'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Product } from '@/types';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import AddToCartModal from './AddToCartModal';

export default function ProductCard({ product }: { product: Product }) {
  const { currency, convert } = useCurrency();
  const [showModal, setShowModal] = useState(false);
  const priceUsd = Number(product.price);

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <Link href={`/products/${product.id}`}>
        <div className="relative mb-3 aspect-square w-full overflow-hidden rounded bg-gray-100">
          {product.image_url && (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 25vw"
            />
          )}
        </div>
        <h3 className="line-clamp-1 font-medium">{product.name}</h3>
      </Link>
      <p className="mb-2 line-clamp-2 text-sm text-gray-500">{product.description}</p>
      <div className="mt-auto flex items-center justify-between">
        <span className="font-semibold">{formatMoney(convert(priceUsd), currency)}</span>
        <button
          onClick={() => setShowModal(true)}
          disabled={product.stock === 0}
          className="rounded bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {product.stock === 0 ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
      {showModal && <AddToCartModal product={product} onClose={() => setShowModal(false)} />}
    </div>
  );
}
