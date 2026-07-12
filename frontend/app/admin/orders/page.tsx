'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { AdminOrder, AdminOrdersResponse, OrderStatus } from '@/types';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import Pagination from '@/components/Pagination';

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

// Statuses an admin can move an order INTO. 'cancelled' is terminal on the
// backend (stock is restored when entering it), so it never appears as a
// source of further transitions.
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['shipped', 'completed', 'cancelled'],
  shipped: ['completed', 'cancelled'],
  completed: ['cancelled'],
  cancelled: [],
};

export default function AdminOrdersPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminOrdersResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadOrders = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (statusFilter) params.set('status', statusFilter);
    api
      .get<AdminOrdersResponse>(`/api/orders?${params.toString()}`, { auth: true })
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [page, statusFilter]);

  useEffect(() => {
    const user = auth.getUser();
    if (!user) {
      router.replace('/login?next=/admin/orders');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/');
      return;
    }
    loadOrders();
  }, [router, loadOrders]);

  async function changeStatus(order: AdminOrder, status: OrderStatus) {
    if (
      status === 'cancelled' &&
      !window.confirm(`Cancel order #${order.id}? Its stock will be restored and this cannot be undone.`)
    ) {
      return;
    }
    setUpdatingId(order.id);
    setError(null);
    try {
      await api.patch(`/api/orders/${order.id}/status`, { status }, { auth: true });
      loadOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update order');
    } finally {
      setUpdatingId(null);
    }
  }

  if (error && !data) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Manage Orders</h1>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setStatusFilter(f.value);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-sm ${
              statusFilter === f.value
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!data ? (
        <p className="text-gray-500">Loading orders...</p>
      ) : data.orders.length === 0 ? (
        <p className="text-gray-500">No orders found.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full rounded border border-gray-200 bg-white text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="p-2">Order</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Customer</th>
                  <th className="p-2">Ship to</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Update</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.id} className="border-b align-top last:border-0">
                    <td className="p-2">
                      <Link href={`/orders/${order.id}`} className="text-brand-600 underline">
                        #{order.id}
                      </Link>
                    </td>
                    <td className="p-2 text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-2">{order.user_email}</td>
                    <td className="p-2 text-gray-600">
                      {order.shipping_name ? `${order.shipping_name}, ${order.shipping_city}` : '—'}
                    </td>
                    <td className="p-2">${order.total_amount}</td>
                    <td className="p-2">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="p-2">
                      {NEXT_STATUSES[order.status].length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <select
                          value=""
                          disabled={updatingId === order.id}
                          onChange={(e) => {
                            if (e.target.value) changeStatus(order, e.target.value as OrderStatus);
                          }}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          <option value="">Move to...</option>
                          {NEXT_STATUSES[order.status].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
