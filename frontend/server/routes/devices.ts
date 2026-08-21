import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { adminOnly } from '../middleware/adminOnly';

const router = Router();

// POST /api/devices { token } - register this device for admin push.
// Upsert: reinstalls and token rotations just repoint the row.
router.post('/', requireAuth, adminOnly, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token || token.length > 200) {
    return res.status(400).json({ error: 'token is required (max 200 chars)' });
  }
  try {
    await pool.query(
      `INSERT INTO device_tokens (user_id, token) VALUES ($1, $2)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [req.user!.userId, token]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Register device error:', err);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// DELETE /api/devices/:token - called on logout / notifications-off.
router.delete('/:token', requireAuth, adminOnly, async (req, res) => {
  try {
    // Scoped to the caller: without the user_id predicate any admin could
    // unregister another admin's device by presenting its token, silently
    // turning off someone else's order alerts.
    await pool.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [
      req.params.token,
      req.user!.userId,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Unregister device error:', err);
    res.status(500).json({ error: 'Failed to unregister device' });
  }
});

export default router;
