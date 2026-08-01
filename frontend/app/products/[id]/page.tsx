'use client';

import { useEffect, useState } from 'react';
import StarRating from '@/components/ui/StarRating';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ProductGallery from '@/components/ProductGallery';
import ProductReviews from '@/components/ProductReviews';
import ProductFaq from '@/components/ProductFaq';
import RelatedProducts from '@/components/RelatedProducts';
import { useParams } from 'next/navigation';
import { Product } from '@/types';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import { useCart } from '@/hooks/useCart';
import { api, ApiError } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  // Next 15 types useParams() as possibly null (it is null while a route is
  // being resolved), so narrow it once here instead of guarding at every use.
  const id = params?.id ?? '';
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const { currency, convert } = useCurrency();
  const { addItem } = useCart();

  useEffect(() => {
    api
      .get<Product>(`/api/products/${id}`)
      .then(setProduct)
      .catch((err: ApiError) => setError(err.message));
  }, [id]);

  if (error)
    return (
      <p role="alert" className="font-medium text-red-700">
        {error}
      </p>
    );
  if (!product) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Shop', href: '/' },
          // Category filtering is client state on the home page rather than a
          // route, so this crumb names the category without pretending there
          // is a /category/<name> page to land on.
          { label: product.category },
          { label: product.name },
        ]}
      />

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <ProductGallery images={product.images ?? []} productName={product.name} />
      <div>
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{product.category}</p>

        {(product.rating_count ?? 0) > 0 && (
          <a href="#reviews" className="mt-2 inline-flex hover:underline">
            <StarRating
              average={product.rating_average ?? 0}
              count={product.rating_count}
              size="md"
            />
          </a>
        )}

        <p className="mt-4 text-2xl font-semibold tabular-nums">
          {formatMoney(convert(Number(product.price)), currency)}
        </p>
        {currency !== 'USD' && (
          <p className="font-mono text-xs text-gray-500 tabular-nums">
            {formatMoney(Number(product.price), 'USD')} USD
          </p>
        )}
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

        {/* Store-wide buying facts, next to the buy button where the doubt is. */}
        <ul className="mt-6 space-y-1.5 border-t border-gray-200 pt-4 text-sm text-gray-600">
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-600">
              ✓
            </span>
            Pay cash when it arrives — no card needed
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="text-brand-600">
              ✓
            </span>
            This price is locked to your order once you place it
          </li>
        </ul>
      </div>
      </div>

      <div id="reviews">
        <ProductReviews productId={String(id)} />
      </div>

      <ProductFaq />

      <RelatedProducts productId={String(id)} category={product.category} />
    </div>
  );
}
