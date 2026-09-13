/**
 * Authentication middleware: bearer token first, then the session cookie.
 *
 * Pins the behaviour of authenticateToken, optionalAuth and requirePermission
 * for every combination of Authorization header and session state.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

const getSession = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../lib/auth.js', () => ({
  auth: { api: { getSession } },
}));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { authenticateToken, optionalAuth, requirePermission } = await import('../middleware/auth.js');
const { getJwtSecret } = await import('../config/secrets.js');

const ORG = 'org-1';

function token(claims: Record<string, unknown>, secret = getJwtSecret()): string {
  return jwt.sign({ organizationId: ORG, ...claims }, secret, { expiresIn: '5m' });
}

const ADMIN_TOKEN = () => token({ userId: 'u-admin', email: 'a@corp.test', role: 'admin', type: 'access' });
const USER_TOKEN = () => token({ userId: 'u-user', email: 'u@corp.test', role: 'user', type: 'access' });

const SESSION = {
  session: { id: 's-1' },
  user: { id: 'u-session', email: 's@corp.test', role: 'user', organizationId: ORG },
};

function run(mw: any, authorization?: string) {
  const req: any = { headers: authorization === undefined ? {} : { authorization } };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const next = jest.fn();
  return Promise.resolve(mw(req, res, next)).then(() => ({ req, res, next }));
}

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue(null);
});

describe('authenticateToken', () => {
  it('accepts a valid access token without consulting the session', async () => {
    const { req, next } = await run(authenticateToken, `Bearer ${ADMIN_TOKEN()}`);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ userId: 'u-admin', role: 'admin', organizationId: ORG, isAdmin: true, isEmployee: true });
    expect(getSession).not.toHaveBeenCalled();
  });

  it.each([
    ['no header', undefined],
    ['a non-Bearer scheme', `Basic ${ADMIN_TOKEN()}`],
    ['an empty bearer', 'Bearer '],
    ['a garbage token', 'Bearer not-a-jwt'],
    ['a token signed with another secret', `Bearer ${token({ userId: 'x', role: 'admin', type: 'access' }, 'another-secret-that-is-long-enough-000')}`],
    ['a non-access token', `Bearer ${token({ userId: 'x', role: 'admin', type: 'refresh' })}`],
  ])('with %s and no session: 401, next not called', async (_label, header) => {
    const { res, next, req } = await run(authenticateToken, header);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('with a rejected token falls back to a valid session', async () => {
    getSession.mockResolvedValue(SESSION);
    const { req, next } = await run(authenticateToken, 'Bearer not-a-jwt');
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ userId: 'u-session', role: 'user', isAdmin: false });
  });

  it('with no header uses a valid session', async () => {
    getSession.mockResolvedValue(SESSION);
    const { req, next } = await run(authenticateToken);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.userId).toBe('u-session');
  });

  it('marks external admins as non-employees', async () => {
    const t = token({ userId: 'ext', role: 'admin', type: 'access', isExternalAdmin: true });
    const { req } = await run(authenticateToken, `Bearer ${t}`);
    expect(req.user.isEmployee).toBe(false);
  });
});

describe('optionalAuth', () => {
  it('attaches the token user', async () => {
    const { req, next } = await run(optionalAuth, `Bearer ${USER_TOKEN()}`);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.userId).toBe('u-user');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('continues anonymously with a rejected token and no session', async () => {
    const { req, next, res } = await run(optionalAuth, 'Bearer not-a-jwt');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(req.user).toBeUndefined();
  });

  it('attaches the session user when there is no token', async () => {
    getSession.mockResolvedValue(SESSION);
    const { req, next } = await run(optionalAuth);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.userId).toBe('u-session');
  });
});

describe("requirePermission('admin')", () => {
  const guard = requirePermission('admin');

  it('lets an admin token through', async () => {
    const { next } = await run(guard, `Bearer ${ADMIN_TOKEN()}`);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-admin token with 403', async () => {
    const { res, next } = await run(guard, `Bearer ${USER_TOKEN()}`);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a non-admin session with 403', async () => {
    getSession.mockResolvedValue(SESSION);
    const { res, next } = await run(guard, 'Bearer not-a-jwt');
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('401 without any valid credential', async () => {
    const { res, next } = await run(guard);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
