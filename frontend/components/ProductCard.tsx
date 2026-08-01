'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Product } from '@/types';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import AddToCartModal from './AddToCartModal';
import Button from './ui/Button';
import Card from './ui/Card';
import Badge from './ui/Badge';

// Stock is the most characteristic thing ShelfStock knows about a product, so
// it belongs on the card rather than only on the detail page. Anything above
// the low-stock threshold shows no badge - a "plenty in stock" pill would be
// noise on every card in the grid.
function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) {
    // The disabled button already says "Out of stock", so this is decoration
    // for the eye, not a second announcement for a screen reader.
    return (
      <Badge variant="danger" aria-hidden="true" className="absolute left-1.5 top-1.5 z-10">
        Out of stock
      </Badge>
    );
  }
  if (stock <= 5) {
    return (
      <Badge variant="warn" className="absolute left-1.5 top-1.5 z-10">
        Only {stock} left
      </Badge>
    );
  }
  return null;
}

export default function ProductCard({ product }: { product: Product }) {
  const { currency, convert } = useCurrency();
  const [showModal, setShowModal] = useState(false);
  const priceUsd = Number(product.price);
  const outOfStock = product.stock === 0;

  return (
    <>
      {/*
        Below sm the card is a horizontal row (thumbnail left, details right):
        a full-bleed square image in a single-column grid makes each card about
        450px tall, so barely one product fits on screen. From sm up it's the
        usual vertical card.

        `group` drives the image zoom on hover; `relative` anchors both the
        stock badge and the stretched title link below.
      */}
      <Card className="group relative flex gap-3 p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover sm:flex-col sm:gap-0">
        <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded bg-gray-100 sm:mb-3 sm:w-full">
          {product.image_url && (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              className={`object-cover transition-transform duration-300 group-hover:scale-105 ${
                outOfStock ? 'opacity-50 grayscale' : ''
              }`}
              sizes="(max-width: 639px) 96px, (max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw"
            />
          )}
          <StockBadge stock={product.stock} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="line-clamp-1 font-medium">
            {/*
              Stretched link: the ::after covers the whole Card, so clicking
              anywhere on it opens the product - without nesting the Add to
              cart button inside an anchor (invalid HTML) or adding a second
              duplicate link for the image.
            */}
            <Link
              href={`/products/${product.id}`}
              className="after:absolute after:inset-0 hover:underline"
            >
              {product.name}
            </Link>
          </h3>
          <p className="mb-2 line-clamp-2 text-sm text-gray-500">{product.description}</p>

          <div className="mt-auto flex items-end justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="font-semibold tabular-nums">
                {formatMoney(convert(priceUsd), currency)}
              </span>
              {/*
                The USD original sits under the converted price whenever the
                shopper isn't already in USD. Orders are stored in USD, so this
                is the number they will actually be charged - showing only the
                approximate conversion asks them to trust a figure the receipt
                won't match.
              */}
              {currency !== 'USD' && (
                <span className="font-mono text-[0.65rem] leading-tight text-gray-500 tabular-nums">
                  {formatMoney(priceUsd, 'USD')} USD
                </span>
              )}
            </div>
            {/* z-10 keeps the button clickable above the stretched link. */}
            <Button
              size="sm"
              onClick={() => setShowModal(true)}
              disabled={outOfStock}
              className="relative z-10 shrink-0"
            >
              {outOfStock ? 'Out of stock' : 'Add to cart'}
              <span className="sr-only"> — {product.name}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/*
        Rendered as a sibling of the Card, not inside it. The Card's hover
        transform would otherwise become the containing block for this
        position:fixed overlay and knock its centering off while hovered.
      */}
      {showModal && <AddToCartModal product={product} onClose={() => setShowModal(false)} />}
    </>
  );
}
