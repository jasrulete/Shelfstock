import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * The surface that was previously written out as
 * `rounded border border-gray-200 bg-white ...` in 31 places.
 *
 * Padding is intentionally NOT baked in - call sites use p-3, p-4 and p-8
 * depending on density, and forcing one value would change existing layouts.
 */
export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-gray-200 bg-white shadow-card', className)}
      {...props}
    />
  );
}
