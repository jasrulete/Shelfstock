import { OrderStatus } from '@/types';

const STYLES: Record<OrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  shipped: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-600',
};

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[status]}`}>
      {status}
    </span>
  );
}
