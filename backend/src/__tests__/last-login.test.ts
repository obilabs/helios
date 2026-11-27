/**
 * A successful sign-in records organization_users.last_login, by either path:
 * the session endpoints served by better-auth (lib/auth.ts, session-create
 * hook) and the JWT route POST /api/v1/auth/login (routes/auth.routes.ts).
 * Both go through lib/last-login.ts.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';

const TEST_SECRET = 'test-secret-for-last-login-unit-tests-0123456789';

const query = jest.fn<(...args: any[]) => Promise<any>>();
const logAuth = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../database/connection.js', () => ({ db: { query } }));
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { logAuth },
  AuditActions: { AUTH_LOGIN_SUCCESS: 'auth.login.success', AUTH_LOGIN_FAILURE: 'auth.login.failure' },
}));
jest.unstable_mockModule('../config/secrets.js', () => ({
  getJwtSecret: () => TEST_SECRET,
  getAuthSecret: () => TEST_SECRET,
}));

const { recordLastLogin } = await import('../lib/last-login.js');

const isLastLoginWrite = (call: any[]) =>
  /UPDATE organization_users SET last_login = NOW\(\) WHERE id = \$1/.test(String(call[0]));
const lastLoginWrites = () => query.mock.calls.filter(isLastLoginWrite);

describe('recordLastLogin', () => {
  beforeEach(() => query.mockReset());

  it('stamps the time on the signed-in account', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    await recordLastLogin('u1');
    expect(lastLoginWrites()).toEqual([[expect.any(String), ['u1']]]);
  });

  it('does nothing without an account id', async () => {
    await recordLastLogin(undefined);
    await recordLastLogin('');
    expect(query).not.toHaveBeenCalled();
  });

  it('never fails the sign-in when the write fails', async () => {
    query.mockRejectedValue(new Error('database unavailable'));
    await expect(recordLastLogin('u1')).resolves.toBeUndefined();
  });
});

describe('session sign-in (better-auth)', () => {
  beforeEach(() => query.mockReset());

  it('records the time when a session is created', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    const { auth } = await import('../lib/auth.js');
    const after = (auth.options as any).databaseHooks?.session?.create?.after;
    expect(typeof after).toBe('function');

    await after({ id: 's1', userId: 'u-form', token: 't', expiresAt: new Date() }, null);
    expect(lastLoginWrites()).toEqual([[expect.any(String), ['u-form']]]);
  });
});

describe('POST /api/v1/auth/login (JWT)', () => {
  beforeEach(() => {
    query.mockReset();
    logAuth.mockReset();
    logAuth.mockResolvedValue('row-1');
  });

  async function app() {
    const { default: authRoutes } = await import('../routes/auth.routes.js');
    const a = express();
    a.use(express.json());
    a.use('/api/v1/auth', authRoutes);
    return a;
  }

  it('records the time on a successful sign-in', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    query.mockImplementation(async (sql: string) =>
      String(sql).includes('FROM organization_users')
        ? {
            rows: [{
              id: 'u-jwt', email: 'admin@example.com', password_hash: hash, first_name: 'A', last_name: 'B',
              role: 'admin', is_active: true, organization_id: 'org-1', is_external_admin: false, default_view: null,
            }],
          }
        : String(sql).includes('FROM organizations')
          ? { rows: [{ id: 'org-1', name: 'Example', domain: 'example.com' }] }
          : { rows: [], rowCount: 1 }
    );

    const res = await request(await app())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(lastLoginWrites()).toEqual([[expect.any(String), ['u-jwt']]]);
  });

  it('does not record a time when the password is wrong', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    query.mockImplementation(async (sql: string) =>
      String(sql).includes('FROM organization_users')
        ? { rows: [{ id: 'u-jwt', email: 'admin@example.com', password_hash: hash, role: 'admin', is_active: true, organization_id: 'org-1' }] }
        : { rows: [], rowCount: 1 }
    );

    const res = await request(await app())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(lastLoginWrites()).toEqual([]);
  });
});
