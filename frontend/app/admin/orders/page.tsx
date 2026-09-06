'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { AdminOrder, AdminOrdersResponse, OrderStatus } from '@/types';
// The dropdown offers exactly what the API will accept. Keeping a second copy
// of this map here is what let the UI advertise completed -> cancelled after
// the server stopped allowing it.
import { ALLOWED_TRANSITIONS as NEXT_STATUSES } from '@/server/orderStatus';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import Pagination from '@/components/Pagination';
import Card from '@/components/ui/Card';
import FilterPill from '@/components/ui/FilterPill';

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

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

  if (error && !data)
    return (
      <p role="alert" className="font-medium text-red-700">
        {error}
      </p>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Manage Orders</h1>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <FilterPill
            key={f.value}
            active={statusFilter === f.value}
            onClick={() => {
              setStatusFilter(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </FilterPill>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {!data ? (
        <p className="text-gray-500">Loading orders...</p>
      ) : data.orders.length === 0 ? (
        <p className="text-gray-500">No orders found.</p>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Orders: customer, shipping address, total, status and the status update control</caption>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th scope="col" className="p-2 font-medium text-gray-600">Order</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Date</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Customer</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Ship to</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Total</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Status</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Update</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-200 align-top last:border-0">
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
                          // Every row has one of these, so the label has to name
                          // the order it belongs to.
                          aria-label={`Change status of order #${order.id}`}
                          className="cursor-pointer rounded border border-gray-300 bg-white px-2 py-1 text-xs"
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
          </Card>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
