import jwt from 'jsonwebtoken';
import type { UserRole } from '../src/types';

/** Signs a JWT the same way routes/auth.ts does, using the test secret. */
export function tokenFor(userId: number, role: UserRole = 'customer'): string {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
}
