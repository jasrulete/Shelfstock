import { OrderStatus } from '@/types';
import Badge, { BadgeVariant } from './ui/Badge';

const VARIANTS: Record<OrderStatus, BadgeVariant> = {
  pending: 'warn',
  shipped: 'info',
  completed: 'success',
  cancelled: 'neutral',
};

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={VARIANTS[status]} className="capitalize">
      {status}
    </Badge>
  );
}
