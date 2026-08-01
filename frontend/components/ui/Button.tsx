import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 disabled:bg-gray-300 disabled:text-gray-500',
  secondary:
    'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:text-gray-400',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:text-gray-400',
  danger: 'text-red-700 hover:bg-red-50 disabled:text-gray-400',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
  // Square, padding-free - for single-glyph controls (close, +, −). Declaring
  // it as a size rather than passing `p-0` at the call site avoids relying on
  // which padding utility Tailwind happens to emit last.
  icon: 'h-9 w-9 text-lg leading-none',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors duration-150 disabled:cursor-not-allowed';

/**
 * Class string for a button-shaped element. Exported separately so `<Link>`
 * elements that look like buttons share one source of truth instead of
 * re-declaring the colour and padding classes.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, type = 'button', ...props },
  ref
) {
  return (
    <button ref={ref} type={type} className={buttonClasses({ variant, size, className })} {...props} />
  );
});

export default Button;
