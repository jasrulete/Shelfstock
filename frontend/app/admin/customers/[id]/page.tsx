'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { CustomerDetail } from '@/types';
import SegmentBadge from '@/components/SegmentBadge';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import Card from '@/components/ui/Card';

/** Mirrors the dashboard's KPI tile so both admin screens read the same. */
function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

export default function AdminCustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.getUser();
    if (!user) {
      router.replace(`/login?next=/admin/customers/${params.id}`);
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/');
      return;
    }
    api
      .get<CustomerDetail>(`/api/customers/${params.id}`, { auth: true })
      .then(setCustomer)
      .catch((err: ApiError) => setError(err.message));
  }, [router, params.id]);

  if (error)
    return (
      <p role="alert" className="font-medium text-red-700">
        {error}
      </p>
    );
  if (!customer) return <p className="text-gray-500">Loading customer...</p>;

  const avgOrderValue =
    customer.orders_count > 0 ? customer.total_spent / customer.orders_count : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/customers" className="text-sm text-brand-600 underline">
          &larr; All customers
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{customer.shipping_name ?? customer.email}</h1>
          <SegmentBadge segment={customer.segment} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 md:col-span-1">
          <h2 className="mb-3 font-semibold">Contact</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd>{customer.email}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Phone</dt>
              <dd>{customer.shipping_phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">City</dt>
              <dd>{customer.shipping_city ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Customer since</dt>
              <dd>{new Date(customer.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
        </Card>

        <div className="md:col-span-2">
          <div className="grid grid-cols-2 gap-4">
            <Kpi label="Lifetime Value" value={`$${customer.total_spent.toFixed(2)}`} />
            <Kpi label="Orders" value={customer.orders_count} />
            <Kpi label="Avg. Order Value" value={`$${avgOrderValue.toFixed(2)}`} />
            <Kpi
              label="Last Order"
              value={
                customer.last_order_at
                  ? new Date(customer.last_order_at).toLocaleDateString()
                  : '—'
              }
            />
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Activity Timeline</h2>
        {customer.orders.length === 0 ? (
          <p className="text-gray-500">No orders yet.</p>
        ) : (
          <ol className="relative ml-2 space-y-4 border-l border-gray-200 pl-6">
            {customer.orders.map((order) => (
              <li key={order.id} className="relative">
                <span className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
                <Card className="p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/orders/${order.id}`} className="text-brand-600 underline">
                      Order #{order.id}
                    </Link>
                    <OrderStatusBadge status={order.status} />
                    <span className="ml-auto font-medium">${order.total_amount}</span>
                  </div>
                  <p className="mt-1 text-gray-500">
                    {new Date(order.created_at).toLocaleString()} &middot; {order.item_count}{' '}
                    {order.item_count === 1 ? 'item' : 'items'}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
