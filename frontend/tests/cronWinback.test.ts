import crypto from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/jobs/winback', () => ({
  runWinbackJob: vi.fn(async () => undefined),
}));

import handler from '../pages/api/cron/winback';
import { runWinbackJob } from '@/server/jobs/winback';

function call(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as unknown as NextApiRequest;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as NextApiResponse;
  return { run: () => handler(req, res), status, json };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'a-cron-secret-of-reasonable-length');
  vi.stubEnv('RESEND_API_KEY', 'set');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/cron/winback', () => {
  it('refuses to run at all when no secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const { run, status } = call('Bearer anything');

    await run();

    expect(status).toHaveBeenCalledWith(503);
    expect(runWinbackJob).not.toHaveBeenCalled();
  });

  it('runs the job for the configured secret', async () => {
    const { run, status } = call('Bearer a-cron-secret-of-reasonable-length');

    await run();

    expect(runWinbackJob).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(200);
  });

  it.each([
    ['a wrong secret', 'Bearer a-cron-secret-of-reasonable-lengtX'],
    ['a secret of another length', 'Bearer short'],
    ['no header at all', undefined],
  ])('answers 401 to %s', async (_label, authorization) => {
    const { run, status } = call(authorization);

    await run();

    expect(status).toHaveBeenCalledWith(401);
    expect(runWinbackJob).not.toHaveBeenCalled();
  });

  // A plain `!==` returns at the first differing byte, so how long a wrong
  // guess takes says how many leading bytes were right. Not practical over a
  // network with a 32-byte random secret, but constant-time is free.
  it('compares the secret in constant time', async () => {
    const timingSafeEqual = vi.spyOn(crypto, 'timingSafeEqual');
    try {
      const { run } = call('Bearer a-cron-secret-of-reasonable-lengtX');
      await run();
      expect(timingSafeEqual).toHaveBeenCalledTimes(1);
    } finally {
      timingSafeEqual.mockRestore();
    }
  });
});
