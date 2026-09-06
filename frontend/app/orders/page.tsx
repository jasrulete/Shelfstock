'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Order } from '@/types';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import Card from '@/components/ui/Card';
import Button, { buttonClasses } from '@/components/ui/Button';

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function cancelOrder(order: Order) {
    if (
      !window.confirm(
        `Cancel order #${order.id}? Its stock goes back on the shelf and this cannot be undone.`
      )
    )
      return;
    setCancelling(order.id);
    setActionError(null);
    try {
      // Owner-only and pending-only server-side; the button is only offered
      // while pending, and the server's answer is what the card shows.
      const updated = await api.post<Order>(`/api/orders/${order.id}/cancel`, undefined, {
        auth: true,
      });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: updated.status } : o)));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not cancel the order');
    } finally {
      setCancelling(null);
    }
  }

  if (loading) return <p className="text-gray-500">Loading orders...</p>;
  if (error)
    return (
      <p role="alert" className="font-medium text-red-700">
        {error}
      </p>
    );
  if (orders.length === 0)
    return (
      <Card className="p-8 text-center text-gray-500">
        <p className="mb-4">You haven&apos;t placed any orders yet.</p>
        <Link href="/" className={buttonClasses()}>
          Start shopping
        </Link>
      </Card>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Order History</h1>
      {actionError && (
        <p role="alert" className="font-medium text-red-700">
          {actionError}
        </p>
      )}
      {orders.map((order) => (
        <Card key={order.id} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link href={`/orders/${order.id}`} className="font-medium text-brand-600 underline">
                Order #{order.id}
              </Link>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {new Date(order.created_at).toLocaleDateString()}
              </span>
              {order.status === 'pending' && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={cancelling === order.id}
                  onClick={() => cancelOrder(order)}
                >
                  {cancelling === order.id ? 'Cancelling…' : 'Cancel order'}
                  <span className="sr-only"> #{order.id}</span>
                </Button>
              )}
            </div>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {order.items.map((item) => (
              <li key={item.id}>
                {item.product_name} × {item.quantity} @ ${item.price_at_purchase}{' '}
                <span className="text-gray-500">(price at time of purchase)</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between font-semibold">
            <span>Total</span>
            <span>
              ${order.total_amount} {order.currency}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
