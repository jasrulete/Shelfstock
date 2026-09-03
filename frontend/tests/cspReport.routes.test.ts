import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { createApp } from '../server/app';

const app = createApp();
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

/**
 * The page CSP ships report-only, which enforces nothing. Its entire value is
 * the report, and before this endpoint existed there was nowhere for one to
 * go. Browsers send reports in two shapes - the legacy report-uri object and
 * the Reporting API batch - and both must land as one compact, bounded log
 * line each, with nothing echoed back to whoever sent it.
 */
describe('POST /api/csp-report', () => {
  it('accepts a legacy report-uri body and logs one compact line', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://shelfstock-jer2x.vercel.app/products/6',
            'effective-directive': 'script-src',
            'blocked-uri': 'https://evil.example/x.js',
            'source-file': 'https://shelfstock-jer2x.vercel.app/_next/static/chunks/app.js',
            'line-number': 42,
          },
        })
      );

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].join(' ');
    expect(line).toContain('CSP violation');
    expect(line).toContain('script-src');
    expect(line).toContain('https://evil.example/x.js');
    expect(line).toContain('/products/6');
    expect(line).toContain('app.js:42');
  });

  it('accepts a Reporting API batch and logs only the csp-violation entries', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(
        JSON.stringify([
          {
            type: 'csp-violation',
            url: 'https://shelfstock-jer2x.vercel.app/',
            body: {
              documentURL: 'https://shelfstock-jer2x.vercel.app/',
              effectiveDirective: 'img-src',
              blockedURL: 'https://cdn.example/a.png',
              sourceFile: null,
              lineNumber: null,
            },
          },
          { type: 'deprecation', url: 'https://shelfstock-jer2x.vercel.app/', body: { id: 'x' } },
        ])
      );

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].join(' ');
    expect(line).toContain('img-src');
    expect(line).toContain('https://cdn.example/a.png');
    expect(line).not.toContain('deprecation');
  });

  it('never echoes the report back, and clips oversized fields in the log line', async () => {
    const huge = 'https://x.example/' + 'a'.repeat(5000);
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'blocked-uri': huge, 'effective-directive': 'img-src' } }));

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].join(' ');
    expect(line.length).toBeLessThan(1000);
    expect(line).not.toContain('a'.repeat(300));
  });

  it('answers 204 to a body that is not a report, and logs nothing for it', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ hello: 'world' }));

    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the JSON error contract on an oversized report', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'blocked-uri': 'x'.repeat(200 * 1024) } }));

    expect(res.status).toBe(413);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('Request body too large');
    expect(warn).not.toHaveBeenCalled();
  });
});
