'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import SalesChart from '@/components/SalesChart';
import Card from '@/components/ui/Card';

interface Summary {
  total_revenue: number;
  total_orders: number;
}

interface RevenuePoint {
  period: string;
  revenue: number;
  orders: number;
}

interface TopProduct {
  id: number;
  name: string;
  units_sold: number;
  revenue: number;
}

interface CustomerStats {
  total_customers: number;
  new_customers: number;
  repeat_rate: number;
}

interface LowStockProduct {
  id: number;
  name: string;
  stock: number;
}

interface StaleOrder {
  id: number;
  total_amount: string;
  created_at: string;
  user_email: string;
}

/** One dashboard statistic. Five of these were previously copy-pasted inline. */
function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [customers, setCustomers] = useState<CustomerStats | null>(null);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [staleOrders, setStaleOrders] = useState<StaleOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.getUser();
    // Client-side gate for a snappy redirect. This is a UX convenience
    // only - the real enforcement is the adminOnly middleware on the
    // backend, which is what actually protects the data.
    if (!user) {
      router.replace('/login?next=/admin/dashboard');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/');
      return;
    }

    Promise.all([
      api.get<Summary>('/api/analytics/summary', { auth: true }),
      api.get<RevenuePoint[]>('/api/analytics/revenue-over-time', { auth: true }),
      api.get<TopProduct[]>('/api/analytics/top-products?limit=5', { auth: true }),
      api.get<CustomerStats>('/api/analytics/customers', { auth: true }),
      api.get<LowStockProduct[]>('/api/analytics/low-stock', { auth: true }),
      api.get<StaleOrder[]>('/api/analytics/stale-orders', { auth: true }),
    ])
      .then(([s, r, t, c, ls, so]) => {
        setSummary(s);
        setRevenue(r);
        setTopProducts(t);
        setCustomers(c);
        setLowStock(ls);
        setStaleOrders(so);
      })
      .catch((err: ApiError) => setError(err.message));
  }, [router]);

  if (error)
    return (
      <p role="alert" className="font-medium text-red-700">
        {error}
      </p>
    );
  if (!summary) return <p className="text-gray-500">Loading dashboard...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sales Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Total Revenue" value={`$${summary.total_revenue.toFixed(2)}`} />
        <Kpi label="Total Orders" value={summary.total_orders} />
        {customers && (
          <>
            <Kpi label="Customers" value={customers.total_customers} />
            <Kpi label="New (30d)" value={customers.new_customers} />
            <Kpi label="Repeat Rate" value={`${(customers.repeat_rate * 100).toFixed(0)}%`} />
          </>
        )}
      </div>

      {staleOrders.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-2 font-semibold text-amber-800">
            ⚠ {staleOrders.length} {staleOrders.length === 1 ? 'order' : 'orders'} pending for 7+
            days
          </h2>
          <ul className="space-y-1 text-sm text-amber-900">
            {staleOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="underline">
                  Order #{o.id}
                </Link>{' '}
                — {o.user_email} — ${o.total_amount} — placed{' '}
                {new Date(o.created_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
          <Link href="/admin/orders" className="mt-2 inline-block text-sm font-medium text-amber-800 underline">
            Manage orders →
          </Link>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4">
          <h2 className="mb-2 font-semibold text-red-800">
            Low stock ({lowStock.length} {lowStock.length === 1 ? 'product' : 'products'} at 5 or
            fewer units)
          </h2>
          <ul className="space-y-1 text-sm text-red-900">
            {lowStock.map((p) => (
              <li key={p.id}>
                {p.name} — {p.stock === 0 ? 'out of stock' : `${p.stock} left`}
              </li>
            ))}
          </ul>
          <Link href="/admin/products" className="mt-2 inline-block text-sm font-medium text-red-800 underline">
            Manage products →
          </Link>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-semibold">Revenue Over Time</h2>
        <SalesChart data={revenue} />
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Top Products</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Top products by units sold and revenue</caption>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th scope="col" className="p-2 font-medium text-gray-600">Product</th>
                <th scope="col" className="p-2 font-medium text-gray-600">Units Sold</th>
                <th scope="col" className="p-2 font-medium text-gray-600">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.id} className="border-b border-gray-200 last:border-0">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2 tabular-nums">{p.units_sold}</td>
                  <td className="p-2 tabular-nums">${p.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
