import type { NextApiRequest, NextApiResponse } from 'next';
import { createApp } from '@/server/app';

/**
 * Mounts the whole Express API as one serverless function.
 *
 * This lives under `pages/` rather than `app/` on purpose: Pages Router API
 * routes hand the handler Node's `IncomingMessage`/`ServerResponse`, which is
 * exactly what Express middleware expects. App Router route handlers use the
 * Web `Request`/`Response` objects and would need an adapter layer. Next
 * supports both directories in one project, and a static path like
 * `pages/api/cron/winback` still wins over this catch-all.
 *
 * The app is built once at module scope so a warm function instance reuses it
 * (and the pg pool underneath) instead of rebuilding the router per request.
 */
const app = createApp();

export const config = {
  api: {
    // Express does its own JSON parsing via express.json(). If Next parsed the
    // body first, the stream would already be consumed and every POST/PUT
    // would hang.
    bodyParser: false,
  },
};

function missingEnv(): string | null {
  if (!process.env.DATABASE_URL) return 'DATABASE_URL is not set';
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    return 'JWT_SECRET is missing or shorter than 32 characters';
  }
  return null;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // The old standalone server called process.exit() on bad config at boot.
  // A function can't do that usefully, so fail the request loudly instead -
  // an unset JWT_SECRET would otherwise sign tokens with "undefined".
  const configError = missingEnv();
  if (configError) {
    console.error(`API misconfigured: ${configError}`);
    return res.status(500).json({ error: 'Server is misconfigured' });
  }

  // Express signals completion by ending the response, not by resolving a
  // promise. Returning one that settles on 'finish'/'close' keeps the function
  // alive until the response is actually written.
  return new Promise<void>((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    (app as unknown as (req: NextApiRequest, res: NextApiResponse) => void)(req, res);
  });
}
