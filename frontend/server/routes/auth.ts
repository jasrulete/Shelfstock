import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
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

export default router;
