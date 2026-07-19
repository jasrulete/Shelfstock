import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../src/middleware/auth';
import { adminOnly } from '../src/middleware/adminOnly';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const SECRET = process.env.JWT_SECRET as string;

describe('requireAuth middleware', () => {
  it('rejects a request with no Authorization header', () => {
    const req: any = { headers: {} };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or malformed Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer Authorization header', () => {
    const req: any = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ userId: 1, role: 'customer' }, 'not-the-real-secret');
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ userId: 1, role: 'customer' }, SECRET, { expiresIn: '-10s' });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid token and attaches the payload to req.user', () => {
    const token = jwt.sign({ userId: 7, role: 'admin' }, SECRET, { expiresIn: '1h' });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: 7, role: 'admin' });
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('adminOnly middleware', () => {
  it('returns 401 when req.user is missing (requireAuth not run)', () => {
    const req: any = {};
    const res = mockRes();
    const next = vi.fn();

    adminOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for an authenticated non-admin user', () => {
    const req: any = { user: { userId: 3, role: 'customer' } };
    const res = mockRes();
    const next = vi.fn();

    adminOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes an admin through', () => {
    const req: any = { user: { userId: 1, role: 'admin' } };
    const res = mockRes();
    const next = vi.fn();

    adminOnly(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
