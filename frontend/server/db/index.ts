import { Pool } from 'pg';

/**
 * Postgres pool, shaped for serverless.
 *
 * Three things differ from the long-lived server this used to be:
 *
 * 1. The pool is cached on globalThis. Vercel reuses a warm function instance
 *    across invocations, but module state can be re-evaluated in dev; without
 *    this, hot reloads leak a new pool each time.
 * 2. `max` is deliberately small. Every concurrent function instance keeps its
 *    own pool, so real connection usage is max x instances. Neon's POOLED
 *    connection string (the one containing `-pooler`) is what makes this safe -
 *    it fronts the database with PgBouncer. The direct string will exhaust
 *    connections under any real concurrency.
 * 3. It is built on FIRST USE, not on import. See the proxy at the bottom.
 */
declare global {
  // eslint-disable-next-line no-var
  var __shelfstockPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  // Local Postgres (docker compose, or `db` on the compose network) speaks
  // plaintext; hosted providers require TLS.
  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('@db:');

  return new Pool({
    connectionString,
    // Certificate verification stays ON for hosted databases. The old Railway
    // setup needed rejectUnauthorized:false because it served a self-signed
    // cert; Neon uses a publicly-trusted CA, so there's no reason to weaken
    // this. If a provider ever needs the escape hatch, prefer pinning its CA
    // via PGSSLROOTCERT over disabling verification.
    ssl: isLocal ? false : { rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

let cached: Pool | undefined;

function getPool(): Pool {
  if (cached) return cached;

  const existing = globalThis.__shelfstockPool;
  if (existing) {
    cached = existing;
    return cached;
  }

  const created = createPool();
  created.on('error', (err) => {
    // Unexpected errors on idle clients shouldn't crash the function instance.
    console.error('Unexpected PostgreSQL error on idle client', err);
  });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__shelfstockPool = created;
  }

  cached = created;
  return cached;
}

/**
 * The pool, built the first time anything touches it rather than when this
 * module is imported.
 *
 * Importing used to construct it, which meant importing threw when
 * DATABASE_URL was unset - even from code that never runs a query. Once the
 * storefront pages became Server Components, `next build` imported this module
 * just to collect page data and fell over, and both the Dockerfile and the CI
 * workflow had to carry a fake connection string that is never connected to.
 *
 * A proxy rather than a `getPool()` function so that every existing
 * `pool.query(...)` call site, and the `Pool` type they rely on for generics
 * like `pool.query<User>(...)`, keep working untouched. The trap binds methods
 * to the real pool so `this` is correct inside pg.
 *
 * Deferring construction does not hide a missing DATABASE_URL: the first
 * request still throws by name, which is covered by a test.
 */
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, property) {
    const real = getPool();
    const value = Reflect.get(real, property, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
