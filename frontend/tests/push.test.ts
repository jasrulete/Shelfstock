import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock('expo-server-sdk', () => {
  class Expo {
    static isExpoPushToken = (t: string) => t.startsWith('ExponentPushToken');
    chunkPushNotifications = (msgs: unknown[]) => [msgs];
    sendPushNotificationsAsync = sendMock;
  }
  return { Expo };
});
vi.mock('../server/db', () => ({ pool: { query: vi.fn() } }));

import { pool } from '../server/db';
import { notifyAdminsNewOrder } from '../server/push';

const poolQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('notifyAdminsNewOrder', () => {
  it('sends one message per valid token with the order id as data', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [{ token: 'ExponentPushToken[a]' }, { token: 'garbage' }],
    });

    await notifyAdminsNewOrder({ id: 42, total_amount: '19.50' });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const chunk = sendMock.mock.calls[0][0];
    expect(chunk).toHaveLength(1); // invalid token filtered out
    expect(chunk[0]).toMatchObject({
      to: 'ExponentPushToken[a]',
      data: { orderId: 42 },
    });
    expect(chunk[0].body).toContain('42');
  });

  it('swallows send errors', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ token: 'ExponentPushToken[a]' }] });
    sendMock.mockRejectedValueOnce(new Error('expo down'));

    await expect(notifyAdminsNewOrder({ id: 1, total_amount: '1.00' })).resolves.toBeUndefined();
  });

  it('does nothing with zero registered devices', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });
    await notifyAdminsNewOrder({ id: 1, total_amount: '1.00' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  // A device_tokens row outlives its owner's admin role, so the role has to be
  // re-checked at send time or a demoted account keeps receiving order totals.
  it('only selects tokens belonging to current admins', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ token: 'ExponentPushToken[a]' }] });

    await notifyAdminsNewOrder({ id: 1, total_amount: '1.00' });

    const sql = poolQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/JOIN\s+users/i);
    expect(sql).toMatch(/role\s*=\s*'admin'/i);
  });

  it('deletes tokens Expo reports as DeviceNotRegistered', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [{ token: 'ExponentPushToken[gone]' }, { token: 'ExponentPushToken[live]' }],
    });
    sendMock.mockResolvedValueOnce([
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok' },
    ]);

    await notifyAdminsNewOrder({ id: 7, total_amount: '5.00' });

    const del = poolQuery.mock.calls.find(([sql]) => /DELETE FROM device_tokens/i.test(sql));
    expect(del).toBeDefined();
    // Only the dead one, and the live token is untouched.
    expect(del![1]).toEqual([['ExponentPushToken[gone]']]);
  });

  it('keeps a token whose ticket failed for some other reason', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ token: 'ExponentPushToken[a]' }] });
    sendMock.mockResolvedValueOnce([
      { status: 'error', details: { error: 'MessageRateExceeded' } },
    ]);

    await notifyAdminsNewOrder({ id: 8, total_amount: '5.00' });

    const del = poolQuery.mock.calls.find(([sql]) => /DELETE FROM device_tokens/i.test(sql));
    expect(del).toBeUndefined();
  });

  it('survives a prune failure without throwing', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ token: 'ExponentPushToken[a]' }] });
    sendMock.mockResolvedValueOnce([
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);
    poolQuery.mockRejectedValueOnce(new Error('db gone'));

    await expect(notifyAdminsNewOrder({ id: 9, total_amount: '1.00' })).resolves.toBeUndefined();
  });
});
