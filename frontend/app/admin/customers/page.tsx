'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { CustomersResponse, CustomerSegment } from '@/types';
import SegmentBadge from '@/components/SegmentBadge';
import Pagination from '@/components/Pagination';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FilterPill from '@/components/ui/FilterPill';
import { Input } from '@/components/ui/Field';

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

  if (error && !data)
    return (
      <p role="alert" className="font-medium text-red-700">
        {error}
      </p>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Customers</h1>

      <div className="flex flex-wrap items-center gap-2">
        {SEGMENT_FILTERS.map((f) => (
          <FilterPill
            key={f.value}
            active={segmentFilter === f.value}
            onClick={() => {
              setSegmentFilter(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </FilterPill>
        ))}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
          className="ml-auto flex items-end gap-2"
        >
          <Input
            label="Search customers"
            hideLabel
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search email or name..."
            wrapperClassName="w-56"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {!data ? (
        <p className="text-gray-500">Loading customers...</p>
      ) : data.customers.length === 0 ? (
        <p className="text-gray-500">No customers found.</p>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Customer accounts: segment, orders placed, total spent, last order and join date</caption>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th scope="col" className="p-2 font-medium text-gray-600">Customer</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Segment</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Orders</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Total Spent</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Last Order</th>
                  <th scope="col" className="p-2 font-medium text-gray-600">Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.id} className="border-b border-gray-200 last:border-0">
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
                    <td className="p-2 tabular-nums">{c.orders_count}</td>
                    <td className="p-2 tabular-nums">${c.total_spent.toFixed(2)}</td>
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
          </Card>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
