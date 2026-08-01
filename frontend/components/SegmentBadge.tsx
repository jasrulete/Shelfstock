import { CustomerSegment } from '@/types';
import Badge, { BadgeVariant } from './ui/Badge';

const VARIANTS: Record<CustomerSegment, BadgeVariant> = {
  vip: 'accent',
  active: 'success',
  new: 'info',
  at_risk: 'warn',
  prospect: 'neutral',
};

const LABELS: Record<CustomerSegment, string> = {
  vip: 'VIP',
  active: 'Active',
  new: 'New',
  at_risk: 'At risk',
  prospect: 'Prospect',
};

export default function SegmentBadge({ segment }: { segment: CustomerSegment }) {
  return <Badge variant={VARIANTS[segment]}>{LABELS[segment]}</Badge>;
}
