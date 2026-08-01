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
import Card from './ui/Card';

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
    <Card className="h-72 w-full p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted}>
          {/* Grid/axis strokes follow the warm neutral ramp, not recharts' cool default. */}
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="label" fontSize={12} stroke="#78716c" />
          <YAxis fontSize={12} stroke="#78716c" />
          <Tooltip
            formatter={(value: number) => `$${value.toFixed(2)}`}
            contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e7e5e4', fontSize: 12 }}
          />
          <Bar dataKey="revenue" fill="#1f8a53" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
