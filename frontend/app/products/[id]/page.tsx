'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Product } from '@/types';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import { useCart } from '@/hooks/useCart';
import { api, ApiError } from '@/lib/api';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const { currency, convert } = useCurrency();
  const { addItem } = useCart();

  useEffect(() => {
    api
      .get<Product>(`/api/products/${params.id}`)
      .then(setProduct)
      .catch((err: ApiError) => setError(err.message));
  }, [params.id]);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!product) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
        {product.image_url && (
          <Image src={product.image_url} alt={product.name} fill className="object-cover" />
        )}
      </div>
      <div>
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{product.category}</p>
        <p className="mt-4 text-2xl font-semibold">
          {formatMoney(convert(Number(product.price)), currency)}
        </p>
        <p className="mt-4 text-gray-700">{product.description}</p>
        <p className="mt-2 text-sm">
          {product.stock === 0 ? (
            <span className="text-red-600">Out of stock</span>
          ) : product.stock <= 5 ? (
            <span className="font-medium text-amber-600">Only {product.stock} left!</span>
          ) : (
            <span className="text-green-700">In stock</span>
          )}
        </p>

        <div className="mt-6 flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={product.stock}
            value={quantity}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              // Clamp to [1, stock] and ignore non-numeric input so we
              // never add NaN or an unfulfillable quantity to the cart.
              setQuantity(
                Number.isNaN(parsed) ? 1 : Math.min(Math.max(1, parsed), Math.max(1, product.stock))
              );
            }}
            className="w-20 rounded border border-gray-300 px-2 py-2"
          />
          <button
            onClick={() => addItem(product, quantity)}
            disabled={product.stock === 0}
            className="rounded bg-brand-500 px-6 py-2 text-white hover:bg-brand-600 disabled:bg-gray-300"
          >
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}
