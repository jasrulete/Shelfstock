/**
 * Joins class names, dropping falsy ones. Deliberately not clsx/tailwind-merge:
 * the primitives put caller classes last, and Tailwind's own cascade handles
 * the rest - not worth two dependencies.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
