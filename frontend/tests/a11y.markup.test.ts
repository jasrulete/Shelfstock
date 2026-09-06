import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Roadmap Phase 3, accessibility. These are the markup facts a glance at the
 * rendered page cannot catch, checked at the source so a new column or a new
 * table cannot quietly lose them.
 */
const ADMIN_TABLES = [
  'app/admin/customers/page.tsx',
  'app/admin/dashboard/page.tsx',
  'app/admin/orders/page.tsx',
  'app/admin/products/page.tsx',
];

function source(file: string) {
  return readFileSync(resolve(__dirname, '..', file), 'utf8');
}

describe('admin tables', () => {
  it.each(ADMIN_TABLES)('%s: every <th> is scope="col" and every <table> has a caption', (file) => {
    const src = source(file);
    const headers = src.match(/<th\b/g)?.length ?? 0;
    expect(headers).toBeGreaterThan(0);
    expect(src.match(/<th scope="col"/g)?.length ?? 0).toBe(headers);
    expect(src.match(/<caption className="sr-only">/g)?.length ?? 0).toBe(
      src.match(/<table\b/g)?.length ?? 0
    );
  });
});

describe('root layout', () => {
  it('starts with a skip link that lands on <main id="main">', () => {
    const src = source('app/layout.tsx');
    expect(src).toMatch(/<a\s+href="#main"/);
    expect(src).toMatch(/<main id="main"/);
    expect(src.indexOf('href="#main"')).toBeLessThan(src.indexOf('<NavBar'));
  });
});
