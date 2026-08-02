'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/hooks/useCart';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Order } from '@/types';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const { currency, convert } = useCurrency();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState({ name: '', phone: '', address: '', city: '' });

  useEffect(() => {
    // Protected route: bounce anonymous visitors to login and send them
    // back here afterward.
    if (!auth.isLoggedIn()) {
      router.replace('/login?next=/checkout');
    }
  }, [router]);

  function patchShipping(patch: Partial<typeof shipping>) {
    setShipping((prev) => ({ ...prev, ...patch }));
  }

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const order = await api.post<Order>(
        '/api/orders',
        {
          items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          shipping,
        },
        { auth: true }
      );
      clearCart();
      router.push(`/orders/${order.id}?placed=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to place order');
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Your cart is empty.</p>;
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-bold">Checkout</h1>

      <form onSubmit={handlePlaceOrder} className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Shipping details</h2>
          <div className="space-y-3">
            <Input
              label="Full name"
              required
              maxLength={120}
              autoComplete="name"
              value={shipping.name}
              onChange={(e) => patchShipping({ name: e.target.value })}
            />
            <Input
              label="Phone number"
              type="tel"
              required
              maxLength={40}
              autoComplete="tel"
              hint="We'll call this number to arrange delivery."
              value={shipping.phone}
              onChange={(e) => patchShipping({ phone: e.target.value })}
            />
            <AddressAutocomplete
              label="Street address"
              required
              maxLength={300}
              placeholder="Start typing to see suggestions"
              value={shipping.address}
              onChange={(address) => patchShipping({ address })}
              onSelect={({ address, city }) =>
                // Keep an already-typed city if the suggestion has none.
                patchShipping({ address, ...(city ? { city } : {}) })
              }
            />
            <Input
              label="City"
              required
              maxLength={120}
              autoComplete="address-level2"
              value={shipping.city}
              onChange={(e) => patchShipping({ city: e.target.value })}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Payment</h2>
          <p className="text-sm text-gray-600">
            Cash on Delivery — pay when your order arrives.
          </p>
        </Card>

        <Card className="space-y-2 p-4">
          <h2 className="font-semibold">Order summary</h2>
          {items.map((item) => (
            <div key={item.product.id} className="flex justify-between text-sm">
              <span>
                {item.product.name} × {item.quantity}
              </span>
              <span>
                {formatMoney(convert(Number(item.product.price) * item.quantity), currency)}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>{formatMoney(convert(subtotal), currency)}</span>
          </div>
          {currency !== 'USD' && (
            <p className="text-xs text-gray-500">
              Prices shown in {currency} are approximate. Your order total is ${subtotal.toFixed(2)}{' '}
              USD.
            </p>
          )}
        </Card>

        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={submitting} className="w-full">
          {submitting ? 'Placing order...' : 'Place order'}
        </Button>
      </form>
    </div>
  );
}
