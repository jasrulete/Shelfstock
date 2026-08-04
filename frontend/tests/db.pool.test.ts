import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * These tests import the real `server/db`, deliberately unmocked - the whole
 * point is what happens at import time.
 */
const ORIGINAL_URL = process.env.DATABASE_URL;

async function freshImport() {
  vi.resetModules();
  delete (globalThis as { __shelfstockPool?: unknown }).__shelfstockPool;
  return import('../server/db');
}

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  delete (globalThis as { __shelfstockPool?: unknown }).__shelfstockPool;
});

describe('the database pool', () => {
  /**
   * The Server Components import this module transitively, so `next build`
   * loads it just to collect page data - with no database in sight. Throwing
   * on import is what forced a fake DATABASE_URL into both the Dockerfile and
   * the CI workflow.
   */
  it('can be imported with no DATABASE_URL at all', async () => {
    delete process.env.DATABASE_URL;

    await expect(freshImport()).resolves.toHaveProperty('pool');
  });

  // Deferring the failure must not mean swallowing it: a real request against
  // a misconfigured deployment still has to say exactly what is missing.
  it('still fails loudly, and by name, when something actually uses it', async () => {
    delete process.env.DATABASE_URL;
    const { pool } = await freshImport();

    expect(() => pool.query('SELECT 1')).toThrow(/DATABASE_URL/);
  });

  it('builds the pool once and reuses it', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    const { pool } = await freshImport();

    // Touching the proxy is what constructs the underlying pool.
    expect(typeof pool.query).toBe('function');
    const created = (globalThis as { __shelfstockPool?: unknown }).__shelfstockPool;
    expect(created).toBeDefined();

    expect(typeof pool.connect).toBe('function');
    expect((globalThis as { __shelfstockPool?: unknown }).__shelfstockPool).toBe(created);
  });

  it('exposes the real pg Pool behind the export', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    const { pool } = await freshImport();

    // Options the app relies on: a small max, because every serverless
    // instance keeps its own pool.
    expect(pool.options.max).toBe(3);
  });
});
