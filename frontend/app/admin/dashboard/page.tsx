'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import SalesChart from '@/components/SalesChart';

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

export default function AdminDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
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
    ])
      .then(([s, r, t]) => {
        setSummary(s);
        setRevenue(r);
        setTopProducts(t);
      })
      .catch((err: ApiError) => setError(err.message));
  }, [router]);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!summary) return <p className="text-gray-500">Loading dashboard...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sales Dashboard</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="text-2xl font-bold">${summary.total_revenue.toFixed(2)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold">{summary.total_orders}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Revenue Over Time</h2>
        <SalesChart data={revenue} />
      </div>

      <div>
        <h2 className="mb-2 font-semibold">Top Products</h2>
        <table className="w-full rounded border border-gray-200 bg-white text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Product</th>
              <th className="p-2">Units Sold</th>
              <th className="p-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {topProducts.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-2">{p.name}</td>
                <td className="p-2">{p.units_sold}</td>
                <td className="p-2">${p.revenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
