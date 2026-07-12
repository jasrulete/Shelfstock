'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/hooks/useCart';
import { useCurrency, formatMoney } from '@/lib/currencyContext';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Order } from '@/types';

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

  const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-bold">Checkout</h1>

      <form onSubmit={handlePlaceOrder} className="space-y-4">
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Shipping details</h2>
          <div className="space-y-3">
            <input
              required
              maxLength={120}
              placeholder="Full name"
              value={shipping.name}
              onChange={(e) => patchShipping({ name: e.target.value })}
              className={inputClass}
            />
            <input
              required
              type="tel"
              maxLength={40}
              placeholder="Phone number"
              value={shipping.phone}
              onChange={(e) => patchShipping({ phone: e.target.value })}
              className={inputClass}
            />
            <input
              required
              maxLength={300}
              placeholder="Street address"
              value={shipping.address}
              onChange={(e) => patchShipping({ address: e.target.value })}
              className={inputClass}
            />
            <input
              required
              maxLength={120}
              placeholder="City"
              value={shipping.city}
              onChange={(e) => patchShipping({ city: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Payment</h2>
          <p className="text-sm text-gray-600">
            Cash on Delivery — pay when your order arrives.
          </p>
        </div>

        <div className="space-y-2 rounded border border-gray-200 bg-white p-4">
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
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brand-500 px-4 py-2 text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? 'Placing order...' : 'Place order'}
        </button>
      </form>
    </div>
  );
}
