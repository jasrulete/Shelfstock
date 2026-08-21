import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pool } from './db';
import analyticsRoutes from './routes/analytics';
import authRoutes from './routes/auth';
import categoriesRoutes from './routes/categories';
import customersRoutes from './routes/customers';
import devicesRoutes from './routes/devices';
import ordersRoutes from './routes/orders';
import productsRoutes from './routes/products';

export function createApp() {
  const app = express();

  // Vercel terminates TLS and forwards the client IP in X-Forwarded-For.
  // Without this, rate limiting would key every request to the proxy's IP
  // and throttle all users together.
  app.set('trust proxy', 1);

  // No CORS middleware: the API is served from the same origin as the app
  // (/api/* on the Next.js deployment), so there is no cross-origin request
  // to allow. This is the point of co-locating them - the storefront can no
  // longer end up pointing at a host that has gone away.

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  // NOTE: express-rate-limit keeps counters in the memory of a single
  // process. On Vercel each concurrent function instance has its own memory,
  // so these limits are per-instance rather than global - they still blunt a
  // naive brute-force burst, but they are not a hard guarantee. A shared
  // store (Upstash/Redis) would be the upgrade if this ever needs to be real.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
      // An object, matching authLimiter below. A bare string here would be
      // served as text/plain and break the same JSON contract the terminal
      // error handler exists to keep.
      message: { error: 'Too many requests, please try again later' },
    })
  );
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later' },
  });

  // Liveness only - the function is running.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Readiness - actually touches Postgres. The previous /health answered "ok"
  // while the database was unreachable, which is precisely why the dead
  // deployment went unnoticed. Anything monitoring this should watch /api/health.
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok' });
    } catch (err) {
      console.error('Health check failed:', err);
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/categories', categoriesRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/devices', devicesRoutes);
  app.use('/api/analytics', analyticsRoutes);

  // Centralized 404 for unmatched API routes
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  /**
   * Terminal error handler. Registered last so it catches everything, and it
   * has to exist: express.json() rejects a malformed or oversized body before
   * any route runs, and without a 4-arg handler Express answers those with its
   * default HTML page - while lib/api.ts and the companion's api/client.ts
   * both read `error` off a JSON body on every non-2xx.
   *
   * Only the two body-parser failures get a specific message. Everything else
   * gets a fixed string, because err.message from pg carries the table and
   * column that failed and sometimes the bound parameter values; the real
   * error goes to the server log instead.
   */
  // The unused `_next` is load-bearing: Express decides a middleware is an
  // error handler by its arity, so dropping the fourth argument silently turns
  // this back into ordinary middleware that never runs.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }

    console.error('Unhandled API error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
