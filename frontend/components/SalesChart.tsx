'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface RevenuePoint {
  period: string;
  revenue: number;
  orders: number;
}

export default function SalesChart({ data }: { data: RevenuePoint[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.period).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="h-72 w-full rounded border border-gray-200 bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
          <Bar dataKey="revenue" fill="#1f8a53" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
