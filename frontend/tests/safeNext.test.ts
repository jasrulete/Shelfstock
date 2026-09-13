import { describe, expect, it } from 'vitest';
import { safeNext } from '../lib/safeNext';

const ORIGIN = 'https://shelfstock.example';

describe('safeNext', () => {
  it('keeps an internal path, with its query and hash', () => {
    expect(safeNext('/admin/orders?status=pending#top', ORIGIN)).toBe(
      '/admin/orders?status=pending#top'
    );
  });

  it('falls back to the home page when there is no next', () => {
    expect(safeNext(null, ORIGIN)).toBe('/');
    expect(safeNext(undefined, ORIGIN)).toBe('/');
    expect(safeNext('', ORIGIN)).toBe('/');
  });

  // The WHATWG parser treats a backslash as a slash for http(s) URLs, so
  // "/\evil.com" resolves to https://evil.com/ - a string-prefix check that
  // only refuses "//" lets it through, and the App Router then performs a
  // full-page navigation to the foreign origin.
  it.each([
    '//evil.com',
    '/\\evil.com',
    '/\\/evil.com',
    '\\\\evil.com',
    'https://evil.com/login',
    'javascript:alert(1)',
  ])('refuses %s', (raw) => {
    expect(safeNext(raw, ORIGIN)).toBe('/');
  });

  // searchParams.get() decodes %5C to a backslash before the check, which the
  // case above covers. A literal %5C that reaches here stays percent-encoded,
  // and a percent-encoded backslash cannot leave the origin.
  it('keeps a percent-encoded backslash as a path on this site', () => {
    expect(safeNext('/%5Cevil.com', ORIGIN)).toBe('/%5Cevil.com');
  });

  it('accepts an absolute URL on this origin but returns only its path', () => {
    expect(safeNext(`${ORIGIN}/orders/3`, ORIGIN)).toBe('/orders/3');
  });
});
