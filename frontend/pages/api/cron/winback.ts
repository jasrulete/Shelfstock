import type { NextApiRequest, NextApiResponse } from 'next';
import { runWinbackJob } from '@/server/jobs/winback';

/**
 * Daily win-back run, triggered by Vercel Cron (see vercel.json).
 *
 * This static path takes precedence over the `[...path]` catch-all, so the
 * Express app never sees it.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set in
 * the project. Without that check the endpoint would be a public "email my
 * customers" button, so an unset secret disables the route outright rather
 * than leaving it open.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set - refusing to run the win-back job');
    return res.status(503).json({ error: 'Cron is not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ skipped: 'RESEND_API_KEY not set' });
  }

  try {
    await runWinbackJob();
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Win-back job error:', err);
    return res.status(500).json({ error: 'Win-back job failed' });
  }
}
