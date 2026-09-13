/**
 * Behavioural authorization checks: the REAL routers with the REAL auth
 * middleware (middleware/auth.ts) and a signed JWT, services and DB mocked.
 *
 * Complements the source-analysis test (route-authorization.test.ts): that one
 * proves every mutating route names an admin guard; this one proves the guard
 * actually answers 403 for a signed-in non-admin, lets admins and super_admins
 * through, and that google-workspace routes stay scoped to the session org.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Express, Router } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>(async () => ({ rows: [] }));
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: mockQuery } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// No session cookies in these tests; JWT bearer auth is exercised for real.
jest.unstable_mockModule('../lib/auth.js', () => ({
  auth: { api: { getSession: async (): Promise<null> => null } },
}));

const noop = () => jest.fn(async () => ({ success: true }));
jest.unstable_mockModule('../services/bulk-operations.service.js', () => ({
  bulkOperationsService: { createOperation: noop(), processOperation: noop() },
}));
jest.unstable_mockModule('../services/csv-parser.service.js', () => ({ csvParserService: {} }));
jest.unstable_mockModule('../services/user-onboarding.service.js', () => ({ userOnboardingService: {} }));
jest.unstable_mockModule('../services/user-offboarding.service.js', () => ({ userOffboardingService: {} }));
jest.unstable_mockModule('../services/scheduled-action.service.js', () => ({
  scheduledActionService: { approveAction: jest.fn(async () => null), getAction: jest.fn(async () => null) },
}));
jest.unstable_mockModule('../services/lifecycle-log.service.js', () => ({ lifecycleLogService: {} }));
jest.unstable_mockModule('../services/lifecycle-request.service.js', () => ({ lifecycleRequestService: {} }));
jest.unstable_mockModule('../services/lifecycle-task.service.js', () => ({ lifecycleTaskService: {} }));
jest.unstable_mockModule('../services/timeline-generator.service.js', () => ({ timelineGeneratorService: {} }));
jest.unstable_mockModule('../services/oauth-token-sync.service.js', () => ({
  oauthTokenSyncService: {
    getUserUnified2FAStatus: jest.fn(async () => null),
    getUserSecurity: jest.fn(async () => null),
    getUserPasskeys: jest.fn(async () => []),
    revokeAppForAllUsers: jest.fn(async () => ({ success: true })),
  },
}));
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log: jest.fn(async () => 'audit-id') },
  AuditActions: new Proxy({}, { get: (_t, p) => String(p) }),
}));
const gw = {
  getGroups: jest.fn<(orgId: string) => Promise<any>>(),
  testConnection: jest.fn<(...a: any[]) => Promise<any>>(),
  createGroup: jest.fn(async () => ({ success: true })),
};
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({ googleWorkspaceService: gw }));
jest.unstable_mockModule('../services/sync-scheduler.service.js', () => ({ syncScheduler: {} }));
jest.unstable_mockModule('../services/gw-credentials.js', () => ({ decodeServiceAccountKey: jest.fn() }));

const { getJwtSecret } = await import('../config/secrets.js');
const { default: bulkRouter } = await import('../routes/bulk-operations.routes.js');
const { default: lifecycleRouter } = await import('../routes/lifecycle.routes.js');
const { default: securityRouter } = await import('../routes/security.routes.js');
const { default: auditLogsRouter } = await import('../routes/audit-logs.routes.js');
const { default: gwRouter } = await import('../routes/google-workspace.routes.js');

const ORG = 'org-1';

function tokenFor(role: string, email = `${role}@corp.test`): string {
  return jwt.sign(
    { userId: `${role}-id`, email, role, organizationId: ORG, type: 'access' },
    getJwtSecret(),
    { expiresIn: '5m' },
  );
}

function appWith(path: string, router: Router): Express {
  const app = express();
  app.use(express.json());
  app.use(path, router);
  return app;
}

const apps = {
  bulk: appWith('/bulk', bulkRouter),
  lifecycle: appWith('/lifecycle', lifecycleRouter),
  security: appWith('/organization/security', securityRouter),
  audit: appWith('/organization/audit-logs', auditLogsRouter),
  gw: appWith('/google-workspace', gwRouter),
};

type Case = { name: string; app: Express; method: 'get' | 'post' | 'put' | 'patch' | 'delete'; url: string; body?: object };

const ADMIN_ONLY: Case[] = [
  { name: 'bulk execute', app: apps.bulk, method: 'post', url: '/bulk/execute', body: { operationType: 'user_update', items: [] } },
  { name: 'bulk sync/suspend', app: apps.bulk, method: 'post', url: '/bulk/sync/suspend', body: {} },
  { name: 'lifecycle offboard', app: apps.lifecycle, method: 'post', url: '/lifecycle/offboard', body: { userId: 'u-2' } },
  { name: 'lifecycle approve scheduled action', app: apps.lifecycle, method: 'post', url: '/lifecycle/scheduled-actions/a-1/approve', body: {} },
  { name: 'security revoke oauth app', app: apps.security, method: 'delete', url: '/organization/security/oauth-apps/client-1' },
  { name: 'audit log read', app: apps.audit, method: 'get', url: '/organization/audit-logs' },
  { name: 'google group create', app: apps.gw, method: 'post', url: '/google-workspace/groups', body: { email: 'g@corp.test', name: 'G' } },
];

describe('non-admins are refused on admin routes', () => {
  beforeEach(() => {
    mockQuery.mockClear();
  });

  for (const c of ADMIN_ONLY) {
    it(`${c.name}: user -> 403, manager -> 403, unauthenticated -> 401`, async () => {
      for (const role of ['user', 'manager']) {
        const res = await (request(c.app) as any)[c.method](c.url).set('Authorization', `Bearer ${tokenFor(role)}`).send(c.body ?? {});
        expect(res.status).toBe(403);
      }
      const anon = await (request(c.app) as any)[c.method](c.url).send(c.body ?? {});
      expect(anon.status).toBe(401);
    });

    it(`${c.name}: admin and super_admin pass the guard`, async () => {
      for (const role of ['admin', 'super_admin']) {
        const res = await (request(c.app) as any)[c.method](c.url).set('Authorization', `Bearer ${tokenFor(role)}`).send(c.body ?? {});
        expect([401, 403]).not.toContain(res.status);
      }
    });
  }
});

describe('security: a user may read only their own security details', () => {
  it('user reading someone else -> 403; reading self -> not 403; admin -> not 403', async () => {
    const other = await request(apps.security)
      .get('/organization/security/users/boss@corp.test/security')
      .set('Authorization', `Bearer ${tokenFor('user', 'me@corp.test')}`);
    expect(other.status).toBe(403);

    const self = await request(apps.security)
      .get('/organization/security/users/ME@corp.test/security')
      .set('Authorization', `Bearer ${tokenFor('user', 'me@corp.test')}`);
    expect(self.status).not.toBe(403);

    const admin = await request(apps.security)
      .get('/organization/security/users/boss@corp.test/security')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(admin.status).not.toBe(403);
  });
});

describe('google-workspace: organization scoping and honest status codes', () => {
  beforeEach(() => {
    gw.getGroups.mockReset();
    gw.testConnection.mockReset();
  });

  it('a path :organizationId that is not the session org -> 403 (service never called)', async () => {
    const res = await request(apps.gw)
      .get('/google-workspace/groups/other-org')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(403);
    expect(gw.getGroups).not.toHaveBeenCalled();
  });

  it('a query organizationId that is not the session org -> 403', async () => {
    const res = await request(apps.gw)
      .get(`/google-workspace/groups/${ORG}?organizationId=other-org`)
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(403);
  });

  it('a service success is 200; an upstream failure is 502 with the same body shape', async () => {
    gw.getGroups.mockResolvedValueOnce({ success: true, data: { groups: [] } });
    const ok = await request(apps.gw).get(`/google-workspace/groups/${ORG}`).set('Authorization', `Bearer ${tokenFor('user')}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ success: true, data: { groups: [] } });

    gw.getGroups.mockResolvedValueOnce({ success: false, error: 'Request had insufficient authentication scopes.' });
    const failed = await request(apps.gw).get(`/google-workspace/groups/${ORG}`).set('Authorization', `Bearer ${tokenFor('user')}`);
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ success: false, error: 'Request had insufficient authentication scopes.' });
  });

  it('an unconfigured integration answers 409, not 200', async () => {
    gw.testConnection.mockResolvedValueOnce({ success: false, error: 'Google Workspace not configured' });
    const res = await request(apps.gw)
      .post('/google-workspace/test-connection')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ domain: 'corp.test', adminEmail: 'admin@corp.test' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});
