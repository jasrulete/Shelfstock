'use client';

import { useEffect, useState } from 'react';
import ProductImage from './ui/ProductImage';
import Link from 'next/link';
import { useCart } from '@/hooks/useCart';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import Button, { buttonClasses } from './ui/Button';
import Card from './ui/Card';
import { Input } from './ui/Field';

// The input holds a local draft so the field can be momentarily empty while
// the user retypes a number. Committing Number('') = 0 straight to the cart
// would delete the item on the first backspace; only valid quantities >= 1
// are committed, and blur snaps the draft back to the real value.
function QuantityInput({
  value,
  max,
  productName,
  onCommit,
}: {
  value: number;
  max: number;
  productName: string;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Input
      // Naming the product makes each row's control distinguishable when a
      // screen reader lists them out of visual context.
      label={`Quantity for ${productName}`}
      hideLabel
      type="number"
      min={1}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parseInt(e.target.value, 10);
        if (!Number.isNaN(parsed) && parsed >= 1) onCommit(parsed);
      }}
      onBlur={() => setDraft(String(value))}
      wrapperClassName="w-16"
    />
  );
}

export default function CartDrawer() {
  const { items, updateQuantity, removeItem, subtotal } = useCart();
  const { currency, convert } = useCurrency();

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center text-gray-500">
        <p className="mb-4">Your cart is empty.</p>
        <Link href="/" className={buttonClasses()}>
          Browse products
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map(({ product, quantity }) => (
        <Card key={product.id} className="flex items-center justify-between gap-4 p-3">
          <Link href={`/products/${product.id}`} className="flex items-center gap-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-gray-100">
              <ProductImage src={product.image_url} alt={product.name} sizes="64px" />
            </div>
            <div>
              <p className="font-medium hover:underline">{product.name}</p>
              <p className="text-sm text-gray-500">
                {formatMoney(convert(Number(product.price)), currency)} each
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <QuantityInput
              value={quantity}
              max={product.stock}
              productName={product.name}
              onCommit={(q) => updateQuantity(product.id, q)}
            />
            <Button variant="danger" size="sm" onClick={() => removeItem(product.id)}>
              Remove
              <span className="sr-only"> {product.name} from cart</span>
            </Button>
          </div>
        </Card>
      ))}

      <div className="flex items-center justify-between border-t border-gray-200 pt-4 text-lg font-semibold">
        <span>Subtotal</span>
        <span>{formatMoney(convert(subtotal), currency)}</span>
      </div>

      <Link href="/checkout" className={buttonClasses({ size: 'lg', className: 'w-full' })}>
        Proceed to checkout
      </Link>
    </div>
  );
}
