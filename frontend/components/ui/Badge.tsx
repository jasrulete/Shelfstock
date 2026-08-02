import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant = 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'accent';

// Every pairing here clears 4.5:1 against its own background, so badge text
// stays legible at the 12px size these are always rendered at.
const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-gray-200 text-gray-700',
  success: 'bg-brand-100 text-brand-800',
  warn: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  accent: 'bg-purple-100 text-purple-800',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export default function Badge({ variant = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
