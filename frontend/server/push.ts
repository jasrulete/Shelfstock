import { Expo } from 'expo-server-sdk';
import { pool } from './db';

// One client for the process; Expo's push API needs no credentials for
// basic sends, which keeps this feature on the free tier.
const expo = new Expo();

/**
 * Fire-and-forget push to every registered companion-app device when a
 * new order lands. Mirrors the mail.ts contract: log-and-continue, never
 * throw into the order request path.
 */
export async function notifyAdminsNewOrder(order: { id: number; total_amount: string }): Promise<void> {
  try {
    // Joined to users rather than reading device_tokens alone: a row survives
    // its owner being demoted out of the admin role, so without this an
    // ex-admin's phone keeps showing order totals on its lock screen. The role
    // is checked at send time because that is the only moment it is current.
    const { rows } = await pool.query(
      `SELECT d.token FROM device_tokens d
         JOIN users u ON u.id = d.user_id
        WHERE u.role = 'admin'`
    );
    const messages = rows
      .filter((r: { token: string }) => Expo.isExpoPushToken(r.token))
      .map((r: { token: string }) => ({
        to: r.token,
        sound: 'default' as const,
        title: 'New order',
        body: `Order #${order.id} — $${order.total_amount}`,
        data: { orderId: order.id },
      }));
    if (messages.length === 0) return;

    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        await pruneDeadTokens(chunk, tickets);
      } catch (err) {
        console.error('Expo push send error:', err);
      }
    }
  } catch (err) {
    console.error('Expo push error:', err);
  }
}

/**
 * Expo returns one ticket per message, in order. A DeviceNotRegistered ticket
 * means that installation is gone for good - the app was uninstalled or the
 * token rotated - so the row is dead weight that will fail on every future
 * order. Expo asks senders to stop using such tokens; leaving them costs a
 * wasted request per order forever.
 *
 * Best-effort by design: this runs after the notification has already been
 * delivered to everyone else, so a failure here must not surface.
 */
async function pruneDeadTokens(
  chunk: { to: string | string[] }[],
  tickets: unknown
): Promise<void> {
  if (!Array.isArray(tickets)) return;

  const dead = tickets.flatMap((ticket: any, i) => {
    if (ticket?.status !== 'error' || ticket?.details?.error !== 'DeviceNotRegistered') return [];
    // Expo's type allows `to` to be an array; this sender always builds one
    // message per token, so anything else is not ours to interpret.
    const to = chunk[i]?.to;
    return typeof to === 'string' ? [to] : [];
  });
  if (dead.length === 0) return;

  try {
    await pool.query('DELETE FROM device_tokens WHERE token = ANY($1)', [dead]);
    console.log(`Pruned ${dead.length} unregistered device token(s)`);
  } catch (err) {
    console.error('Prune device tokens error:', err);
  }
}
