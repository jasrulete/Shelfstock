'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Order } from '@/types';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import OrderStatusBadge from '@/components/OrderStatusBadge';

// useSearchParams() (for the ?placed=1 confirmation banner) requires a
// Suspense boundary - see app/login/page.tsx for the same pattern.
export default function OrderDetailPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Loading order...</p>}>
      <OrderDetail />
    </Suspense>
  );
}

function OrderDetail() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const justPlaced = searchParams.get('placed') === '1';
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.isLoggedIn()) {
      router.replace(`/login?next=/orders/${params.id}`);
      return;
    }
    api
      .get<Order>(`/api/orders/${params.id}`, { auth: true })
      .then(setOrder)
      .catch((err: ApiError) => setError(err.message));
  }, [params.id, router]);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!order) return <p className="text-gray-500">Loading order...</p>;

  return (
    <div className="max-w-2xl space-y-4">
      {justPlaced && (
        <div className="rounded border border-green-200 bg-green-50 p-4 text-green-800">
          <p className="font-semibold">Thank you! Your order has been placed.</p>
          <p className="text-sm">
            You&apos;ll pay in cash when it&apos;s delivered. Keep this order number for reference.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Order #{order.id}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-sm text-gray-500">
        Placed on {new Date(order.created_at).toLocaleString()}
      </p>

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Items</h2>
        <ul className="space-y-1 text-sm text-gray-700">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between">
              <span>
                {item.product_name} × {item.quantity}
              </span>
              <span>${(Number(item.price_at_purchase) * item.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span>
            ${order.total_amount} {order.currency}
          </span>
        </div>
      </div>

      {order.shipping_address && (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">Shipping to</h2>
          <p>{order.shipping_name}</p>
          <p>{order.shipping_address}</p>
          <p>{order.shipping_city}</p>
          <p className="text-gray-500">{order.shipping_phone}</p>
        </div>
      )}

      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Payment method: {order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method}
      </div>

      <Link href="/orders" className="inline-block text-sm text-brand-600 underline">
        ← Back to order history
      </Link>
    </div>
  );
}
