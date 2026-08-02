'use client';

import {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  useId,
} from 'react';
import { cn } from '@/lib/cn';

/**
 * Labelled form controls.
 *
 * Every control here renders a real <label htmlFor>, wires aria-describedby to
 * its hint and error text, and sets aria-invalid when it's in an error state.
 * Placeholders are no longer load-bearing: they may add an example, but the
 * label is what names the field.
 *
 * `hideLabel` keeps the label in the accessibility tree via sr-only for the few
 * places (search box, filter bar) where a visible label would duplicate
 * adjacent text - it never means "no label".
 *
 * Text is 16px on mobile (`text-base`) so iOS Safari doesn't zoom the viewport
 * when a field takes focus, then drops to 14px from the sm breakpoint up.
 */

const CONTROL_BASE =
  'w-full rounded border bg-white px-3 py-2 text-base text-gray-900 transition-colors placeholder:text-gray-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm';

/** Exported so custom controls (e.g. the address combobox) match plain inputs. */
export function controlClasses(hasError: boolean, className?: string): string {
  return cn(
    CONTROL_BASE,
    hasError ? 'border-red-600' : 'border-gray-300 hover:border-gray-400',
    className
  );
}

interface FieldShellProps {
  id: string;
  label: string;
  hideLabel?: boolean;
  required?: boolean;
  hint?: ReactNode;
  hintId: string;
  error?: string;
  errorId: string;
  wrapperClassName?: string;
  children: ReactNode;
}

function FieldShell({
  id,
  label,
  hideLabel,
  required,
  hint,
  hintId,
  error,
  errorId,
  wrapperClassName,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', wrapperClassName)}>
      <label
        htmlFor={id}
        className={cn(
          'block text-sm font-medium text-gray-700',
          hideLabel && 'sr-only'
        )}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-700" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Builds the shared id/aria wiring for a control. */
function useFieldIds(error?: string, hint?: ReactNode) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = cn(hint && !error ? hintId : '', error ? errorId : '').trim() || undefined;
  return { id, hintId, errorId, describedBy };
}

interface CommonFieldProps {
  label: string;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string;
  /**
   * Sizing/layout for the field's wrapper. Width belongs here rather than on
   * `className` (which targets the control) - the control is always `w-full`,
   * so a `w-*` passed to it would collide with that in the CSS cascade.
   */
  wrapperClassName?: string;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>,
    CommonFieldProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hideLabel, hint, error, className, wrapperClassName, required, ...props },
  ref
) {
  const { id, hintId, errorId, describedBy } = useFieldIds(error, hint);

  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      required={required}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      wrapperClassName={wrapperClassName}
    >
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={controlClasses(Boolean(error), className)}
        {...props}
      />
    </FieldShell>
  );
});

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>,
    CommonFieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hideLabel, hint, error, className, wrapperClassName, required, ...props },
  ref
) {
  const { id, hintId, errorId, describedBy } = useFieldIds(error, hint);

  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      required={required}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      wrapperClassName={wrapperClassName}
    >
      <textarea
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={controlClasses(Boolean(error), className)}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>,
    CommonFieldProps {
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel, hint, error, className, wrapperClassName, required, children, ...props },
  ref
) {
  const { id, hintId, errorId, describedBy } = useFieldIds(error, hint);

  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      required={required}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      wrapperClassName={wrapperClassName}
    >
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={controlClasses(Boolean(error), cn('cursor-pointer', className))}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});
