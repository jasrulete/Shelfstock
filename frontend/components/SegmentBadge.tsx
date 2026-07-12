import { CustomerSegment } from '@/types';

const STYLES: Record<CustomerSegment, string> = {
  vip: 'bg-purple-100 text-purple-800',
  active: 'bg-green-100 text-green-800',
  new: 'bg-blue-100 text-blue-800',
  at_risk: 'bg-amber-100 text-amber-800',
  prospect: 'bg-gray-200 text-gray-600',
};

const LABELS: Record<CustomerSegment, string> = {
  vip: 'VIP',
  active: 'Active',
  new: 'New',
  at_risk: 'At risk',
  prospect: 'Prospect',
};

export default function SegmentBadge({ segment }: { segment: CustomerSegment }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[segment]}`}>
      {LABELS[segment]}
    </span>
  );
}
