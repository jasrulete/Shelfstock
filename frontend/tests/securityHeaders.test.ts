import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// next.config.js is CommonJS with no types; createRequire keeps this test free
// of a ts-expect-error that would rot the moment allowJs changed.
const require = createRequire(import.meta.url);
const nextConfig = require('../next.config.js');

const PAGES_SOURCE = '/((?!api/).*)';

async function pageHeaders(): Promise<Record<string, string>> {
  const rules = await nextConfig.headers();
  const pages = rules.find((r: { source: string }) => r.source === PAGES_SOURCE);
  expect(pages, `no headers() rule with source ${PAGES_SOURCE}`).toBeDefined();
  return Object.fromEntries(pages.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
}

/**
 * These pin the parts of next.config.js that are easy to lose in a refactor
 * and expensive to lose in production: the negative-lookahead source that
 * keeps page headers off API responses, and the reporting wiring without which
 * the report-only CSP collects nothing.
 */
describe('next.config.js headers()', () => {
  it('points the report-only CSP at /api/csp-report by both mechanisms browsers use', async () => {
    const h = await pageHeaders();
    const csp = h['Content-Security-Policy-Report-Only'];
    expect(csp).toBeDefined();
    // report-uri for Firefox/Safari, report-to for Chromium. Both, or half the
    // browsers report into a void.
    expect(csp).toContain('report-uri /api/csp-report');
    expect(csp).toContain('report-to csp-endpoint');
    expect(h['Reporting-Endpoints']).toBe('csp-endpoint="/api/csp-report"');
  });

  it('does not ship an enforcing CSP until the report has been read', async () => {
    const h = await pageHeaders();
    // Promoting is a deliberate step documented in SECURITY.md, not a
    // side effect of someone tidying a header name.
    expect(h['Content-Security-Policy']).toBeUndefined();
  });

  it('keeps the enforcing clickjacking and sniffing headers beside the report-only CSP', async () => {
    const h = await pageHeaders();
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });
});
