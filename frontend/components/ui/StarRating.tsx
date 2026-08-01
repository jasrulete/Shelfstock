import { cn } from '@/lib/cn';

function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={cn('shrink-0', className)}>
      <path
        fill="currentColor"
        d="M10 1.5l2.47 5.16 5.53.74-4.03 3.9.99 5.7L10 14.3l-4.96 2.7.99-5.7L2 7.4l5.53-.74z"
      />
    </svg>
  );
}

/**
 * Read-only star rating.
 *
 * Draws a grey row of five and overlays a coloured row clipped to the exact
 * percentage, so 4.3 renders as 4.3 rather than snapping to a half. The stars
 * are decorative; the rating is announced once as text so a screen reader
 * hears "Rated 4.3 out of 5" instead of five identical star images.
 */
export default function StarRating({
  average,
  count,
  size = 'sm',
  className,
}: {
  average: number;
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, average));
  const percent = (clamped / 5) * 100;
  const starSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative inline-flex" role="img" aria-label={`Rated ${clamped.toFixed(1)} out of 5`}>
        <span className="flex">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={cn(starSize, 'text-gray-300')} />
          ))}
        </span>
        {/* Clipping layer: same row of stars, cut off at the rating's width. */}
        <span
          className="absolute inset-y-0 left-0 flex overflow-hidden"
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={cn(starSize, 'text-amber-500')} />
          ))}
        </span>
      </span>
      {count !== undefined && (
        <span
          className={cn(
            'font-mono tabular-nums text-gray-500',
            size === 'sm' ? 'text-[0.65rem]' : 'text-xs'
          )}
        >
          {count === 0 ? 'No reviews' : `${clamped.toFixed(1)} (${count})`}
        </span>
      )}
    </span>
  );
}
