'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Order } from '@/types';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import OrderStatusBadge from '@/components/OrderStatusBadge';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.isLoggedIn()) {
      router.replace('/login?next=/orders');
      return;
    }
    // /api/orders/my is scoped server-side to the logged-in user, so this
    // will only ever return this account's own orders.
    api
      .get<Order[]>('/api/orders/my', { auth: true })
      .then(setOrders)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p className="text-gray-500">Loading orders...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (orders.length === 0)
    return (
      <div className="rounded border border-gray-200 bg-white p-8 text-center text-gray-500">
        <p className="mb-4">You haven&apos;t placed any orders yet.</p>
        <Link
          href="/"
          className="inline-block rounded bg-brand-500 px-4 py-2 text-white hover:bg-brand-600"
        >
          Start shopping
        </Link>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Order History</h1>
      {orders.map((order) => (
        <div key={order.id} className="rounded border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link href={`/orders/${order.id}`} className="font-medium text-brand-600 underline">
                Order #{order.id}
              </Link>
              <OrderStatusBadge status={order.status} />
            </div>
            <span className="text-sm text-gray-500">
              {new Date(order.created_at).toLocaleDateString()}
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {order.items.map((item) => (
              <li key={item.id}>
                {item.product_name} × {item.quantity} @ ${item.price_at_purchase}{' '}
                <span className="text-gray-400">(price at time of purchase)</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between font-semibold">
            <span>Total</span>
            <span>
              ${order.total_amount} {order.currency}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
