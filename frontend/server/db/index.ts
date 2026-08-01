import { Pool } from 'pg';

/**
 * Postgres pool, shaped for serverless.
 *
 * Two things differ from the long-lived server this used to be:
 *
 * 1. The pool is cached on globalThis. Vercel reuses a warm function instance
 *    across invocations, but module state can be re-evaluated in dev; without
 *    this, hot reloads leak a new pool each time.
 * 2. `max` is deliberately small. Every concurrent function instance keeps its
 *    own pool, so real connection usage is max x instances. Neon's POOLED
 *    connection string (the one containing `-pooler`) is what makes this safe -
 *    it fronts the database with PgBouncer. The direct string will exhaust
 *    connections under any real concurrency.
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

export const pool: Pool = globalThis.__shelfstockPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__shelfstockPool = pool;
}

pool.on('error', (err) => {
  // Unexpected errors on idle clients shouldn't crash the function instance.
  console.error('Unexpected PostgreSQL error on idle client', err);
});
