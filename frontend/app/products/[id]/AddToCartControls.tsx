'use client';

import { useState } from 'react';
import { Product } from '@/types';
import { useCart } from '@/hooks/useCart';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

/** Quantity stepper plus the add-to-cart button. Client-only: the cart lives
 *  in localStorage and is synced across tabs. */
export default function AddToCartControls({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  return (
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
  );
}
