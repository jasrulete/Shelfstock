'use client';

import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Toggle pill used by the admin status and segment filters. `aria-pressed`
 * is what tells assistive tech which filter is active - colour alone doesn't.
 */
export default function FilterPill({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-sm transition-colors',
        active
          ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50',
        className
      )}
      {...props}
    />
  );
}
