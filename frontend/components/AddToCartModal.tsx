'use client';

import { useEffect, useRef, useState } from 'react';
import ProductImage from './ui/ProductImage';
import { Product } from '@/types';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import { useCart } from '@/hooks/useCart';
import Button from './ui/Button';
import { Input } from './ui/Field';

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
  const dialogRef = useRef<HTMLDivElement>(null);

  /**
   * Modal behaviour a `role="dialog"` attribute alone doesn't provide:
   * Escape closes, focus moves into the dialog and is trapped there while it's
   * open, the page behind can't scroll, and focus returns to whatever opened it
   * on close.
   */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href]'
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  function clamp(n: number) {
    return Math.min(Math.max(1, n), maxQty);
  }

  function handleAdd() {
    addItem(product, quantity);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${product.name} to cart`}
        tabIndex={-1}
        className="w-full max-w-sm rounded-lg bg-white p-4 shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-semibold">Add to cart</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-gray-100">
            <ProductImage src={product.image_url} alt={product.name} sizes="80px" />
          </div>
          <div>
            <p className="font-medium">{product.name}</p>
            <p className="text-sm text-gray-500">
              {formatMoney(convert(priceUsd), currency)} each
            </p>
            {product.stock <= 5 && (
              <p className="text-xs font-medium text-amber-700">Only {product.stock} left</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setQuantity((q) => clamp(q - 1))}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            −
          </Button>
          <Input
            label="Quantity"
            hideLabel
            type="number"
            min={1}
            max={maxQty}
            value={quantity}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              setQuantity(Number.isNaN(parsed) ? 1 : clamp(parsed));
            }}
            wrapperClassName="w-16"
            className="text-center"
          />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setQuantity((q) => clamp(q + 1))}
            disabled={quantity >= maxQty}
            aria-label="Increase quantity"
          >
            +
          </Button>
        </div>

        <Button onClick={handleAdd} className="mt-4 w-full">
          Add {quantity} to cart · {formatMoney(convert(priceUsd * quantity), currency)}
        </Button>
      </div>
    </div>
  );
}
