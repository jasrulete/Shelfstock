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
    rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false })
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

  return app;
}
