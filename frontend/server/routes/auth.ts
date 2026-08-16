import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { sendPasswordReset } from '../mail';
import { siteUrl } from '@/lib/siteUrl';
import { PublicUser, User } from '../types';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET as string;
const SALT_ROUNDS = 10;

/**
 * Deliberately not an RFC 5322 parser. That grammar allows quoted local parts
 * and bracketed IP-literal domains that no storefront will ever be handed, and
 * the regex for it is famously unreadable and still not a delivery guarantee.
 *
 * What this checks is the shape that matters here: exactly one @, something on
 * both sides of it, a domain of two or more non-empty dot-separated labels,
 * and no whitespace anywhere. The reason is practical rather than pedantic -
 * every order this store places emails the address given at registration, so
 * "asdf" is not a smaller mistake than a missing address. It fails later,
 * silently, and forever.
 *
 * Requiring the labels to be non-empty is what rejects `user@.example.com` and
 * `user@example..com`. Both are ordinary typing slips rather than exotic
 * inputs, and both bounce forever.
 *
 * Requiring a dot at all rejects intranet-style addresses like
 * `user@localhost`, which are legal but undeliverable from here. That is the
 * intended trade. Bracketed IP-literal domains (`user@[192.168.0.1]`) still
 * pass - excluding them costs more regex than the case is worth, and one that
 * reaches a real mail server fails there instead.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// RFC 5321 caps a forward path at 254 characters; anything longer will be
// rejected by a receiving server regardless of how well-formed it looks.
const EMAIL_MAX_LENGTH = 254;

function isDeliverableEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
}

function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, role: user.role };
}

function signToken(user: PublicUser): string {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

router.post('/register', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Checked against the normalized form, so a stray leading space is trimmed
  // rather than treated as a malformed address.
  if (!isDeliverableEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    // Never store plaintext passwords - bcrypt hashes + salts in one step.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query<User>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'customer')
       RETURNING id, email, password_hash, role, created_at`,
      [normalizedEmail, passwordHash]
    );

    const user = toPublicUser(result.rows[0]);
    const token = signToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const result = await pool.query<User>('SELECT * FROM users WHERE email = $1', [
      email.trim().toLowerCase(),
    ]);
    const user = result.rows[0];

    // Same error message whether the email doesn't exist or the password is
    // wrong, so we don't leak which emails are registered.
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const publicUser = toPublicUser(user);
    const token = signToken(publicUser);
    res.json({ user: publicUser, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// How long a reset link stays usable. Long enough to survive a slow inbox,
// short enough that a link sitting in a mailbox is not a standing key.
const RESET_TTL_MINUTES = 60;

/** SHA-256, not bcrypt: this is 32 bytes of CSPRNG output rather than a
 *  human-chosen secret, so there is nothing to slow an attacker down for. */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/auth/forgot-password
 *
 * Always answers 200 with the same body, whether or not the address is
 * registered. Anything else turns this into a free "is this person a customer"
 * lookup - the same reasoning that makes login return one message for both a
 * bad password and an unknown user.
 *
 * Rate limiting comes from the limiter mounted on /api/auth in app.ts.
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required' });
  }

  // Deliberately identical for every outcome below.
  const answer = {
    message: 'If that email has an account, a reset link is on its way.',
  };

  try {
    const found = await pool.query<User>('SELECT * FROM users WHERE email = $1', [
      email.trim().toLowerCase(),
    ]);
    const user = found.rows[0];
    if (!user) {
      return res.json(answer);
    }

    // Issuing a new link retires any earlier one, so a forwarded or shoulder
    // surfed old email stops working the moment the real owner asks again.
    await pool.query(
      `UPDATE password_resets SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );

    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [user.id, hashToken(token), String(RESET_TTL_MINUTES)]
    );

    const link = `${siteUrl}/reset-password?token=${encodeURIComponent(token)}`;

    // Local development has no RESEND_API_KEY, so the mail is a silent no-op
    // and the flow would be untestable by hand. Never in production.
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== 'production') {
      console.log(`[dev] password reset link for ${user.email}: ${link}`);
    }

    await sendPasswordReset(user.email, link, RESET_TTL_MINUTES);
    res.json(answer);
  } catch (err) {
    console.error('Forgot password error:', err);
    // Still the same answer: an error here must not be distinguishable either.
    res.json(answer);
  }
});

/**
 * POST /api/auth/reset-password
 *
 * The token is looked up by hash - the raw value never touches the database,
 * so a leaked dump cannot be replayed into an account takeover.
 *
 * Note: this does NOT invalidate sessions that already exist. JWTs here are
 * stateless with a 7-day life and no revocation list, so someone holding a
 * stolen token keeps it until it expires. Fixing that means a database read on
 * every authenticated request, which is a deliberate non-goal for now - it is
 * recorded in HANDOVER rather than left to be discovered.
 */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body ?? {};

  if (typeof token !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'token and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // One message for unknown, expired and already-used alike. Telling them
  // apart would confirm that a token once existed.
  const invalid = { error: 'This reset link is invalid or has expired' };

  try {
    const found = await pool.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_resets WHERE token_hash = $1`,
      [hashToken(token)]
    );
    const reset = found.rows[0];

    if (!reset || reset.used_at || new Date(reset.expires_at).getTime() <= Date.now()) {
      return res.status(400).json(invalid);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      passwordHash,
      reset.user_id,
    ]);
    await pool.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);

    res.json({ message: 'Your password has been changed. You can sign in with it now.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
