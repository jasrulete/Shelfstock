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

  useEffect(() => {
    // Protected route: bounce anonymous visitors to login and send them
    // back here afterward.
    if (!auth.isLoggedIn()) {
      router.replace('/login?next=/checkout');
    }
  }, [router]);

  async function handlePlaceOrder() {
    setSubmitting(true);
    setError(null);
    try {
      const order = await api.post<Order>(
        '/api/orders',
        {
          items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          currency,
        },
        { auth: true }
      );
      clearCart();
      router.push(`/orders?justPlaced=${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-gray-500">Your cart is empty.</p>;
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-bold">Checkout</h1>

      <div className="space-y-2 rounded border border-gray-200 bg-white p-4">
        {items.map((item) => (
          <div key={item.product.id} className="flex justify-between text-sm">
            <span>
              {item.product.name} × {item.quantity}
            </span>
            <span>{formatMoney(convert(Number(item.product.price) * item.quantity), currency)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span>{formatMoney(convert(subtotal), currency)}</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <button
        onClick={handlePlaceOrder}
        disabled={submitting}
        className="mt-4 w-full rounded bg-brand-500 px-4 py-2 text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {submitting ? 'Placing order...' : 'Place order'}
      </button>
    </div>
  );
}
