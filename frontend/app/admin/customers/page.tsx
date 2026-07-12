'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { CustomersResponse, CustomerSegment } from '@/types';
import SegmentBadge from '@/components/SegmentBadge';
import Pagination from '@/components/Pagination';

const SEGMENT_FILTERS: Array<{ label: string; value: '' | CustomerSegment }> = [
  { label: 'All', value: '' },
  { label: 'VIP', value: 'vip' },
  { label: 'Active', value: 'active' },
  { label: 'New', value: 'new' },
  { label: 'At risk', value: 'at_risk' },
  { label: 'Prospect', value: 'prospect' },
];

export default function AdminCustomersPage() {
  const router = useRouter();
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [segmentFilter, setSegmentFilter] = useState<'' | CustomerSegment>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (segmentFilter) params.set('segment', segmentFilter);
    if (search) params.set('search', search);
    api
      .get<CustomersResponse>(`/api/customers?${params.toString()}`, { auth: true })
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [page, segmentFilter, search]);

  useEffect(() => {
    const user = auth.getUser();
    if (!user) {
      router.replace('/login?next=/admin/customers');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/');
      return;
    }
    loadCustomers();
  }, [router, loadCustomers]);

  if (error && !data) return <p className="text-red-500">{error}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Customers</h1>

      <div className="flex flex-wrap items-center gap-2">
        {SEGMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setSegmentFilter(f.value);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-sm ${
              segmentFilter === f.value
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
          className="ml-auto flex gap-2"
        >
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search email or name..."
            className="rounded border border-gray-300 px-3 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            Search
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!data ? (
        <p className="text-gray-500">Loading customers...</p>
      ) : data.customers.length === 0 ? (
        <p className="text-gray-500">No customers found.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full rounded border border-gray-200 bg-white text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="p-2">Customer</th>
                  <th className="p-2">Segment</th>
                  <th className="p-2">Orders</th>
                  <th className="p-2">Total Spent</th>
                  <th className="p-2">Last Order</th>
                  <th className="p-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="p-2">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="text-brand-600 underline"
                      >
                        {c.shipping_name ?? c.email}
                      </Link>
                      {c.shipping_name && <p className="text-xs text-gray-500">{c.email}</p>}
                    </td>
                    <td className="p-2">
                      <SegmentBadge segment={c.segment} />
                    </td>
                    <td className="p-2">{c.orders_count}</td>
                    <td className="p-2">${c.total_spent.toFixed(2)}</td>
                    <td className="p-2 text-gray-500">
                      {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="p-2 text-gray-500">
                      {new Date(c.created_at).toLocaleDateString()}
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
