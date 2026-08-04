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
    const { rows } = await pool.query('SELECT token FROM device_tokens');
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
        await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error('Expo push send error:', err);
      }
    }
  } catch (err) {
    console.error('Expo push error:', err);
  }
}
