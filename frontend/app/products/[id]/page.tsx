'use client';

import { useEffect, useState } from 'react';
import ProductImage from '@/components/ui/ProductImage';
import { useParams } from 'next/navigation';
import { Product } from '@/types';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import { useCart } from '@/hooks/useCart';
import { api, ApiError } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

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
        {/* The hero image of the page - never lazy-load it. */}
        <ProductImage
          src={product.image_url}
          alt={product.name}
          priority
          sizes="(max-width: 767px) 100vw, 50vw"
        />
      </div>
      <div>
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{product.category}</p>
        <p className="mt-4 text-2xl font-semibold">
          {formatMoney(convert(Number(product.price)), currency)}
        </p>
        <p className="mt-4 text-gray-700">{product.description}</p>
        {/* Colours here are one step darker than the obvious amber-600/red-600
            so each clears 4.5:1 against white. */}
        <p className="mt-2 text-sm">
          {product.stock === 0 ? (
            <span className="font-medium text-red-700">Out of stock</span>
          ) : product.stock <= 5 ? (
            <span className="font-medium text-amber-700">Only {product.stock} left</span>
          ) : (
            <span className="text-brand-700">In stock</span>
          )}
        </p>

        <div className="mt-6 flex items-end gap-3">
          <Input
            label="Quantity"
            hideLabel
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
            wrapperClassName="w-20"
          />
          <Button size="lg" onClick={() => addItem(product, quantity)} disabled={product.stock === 0}>
            Add to cart
          </Button>
        </div>
      </div>
    </div>
  );
}
