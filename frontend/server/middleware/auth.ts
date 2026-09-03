import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET as string;

/**
 * Verifies the Bearer JWT on the request and attaches the decoded payload
 * to req.user. This ONLY proves "who is this request from" - it does not
 * by itself authorize access to any particular resource. Route handlers
 * that touch user-owned data (e.g. orders) must additionally compare
 * req.user.id against the resource's owner id. See routes/orders.ts.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Attaches req.user when a valid Bearer token is present and does nothing
 * otherwise - no 401 either way. For endpoints that are genuinely public but
 * return MORE to a signed-in admin, where requireAuth would lock the public
 * out and no auth at all would hand everyone the admin projection.
 *
 * A malformed or expired token is treated as absent rather than rejected: the
 * response is public data, so failing the whole request over a stale token
 * would break a signed-out shopper whose JWT merely aged out.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice('Bearer '.length), JWT_SECRET) as JwtPayload;
    } catch {
      // Anonymous. Deliberately not an error.
    }
  }
  next();
}
