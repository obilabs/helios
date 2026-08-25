/**
 * Audit-trail coverage for direct Google Workspace REST mutations.
 *
 * Regression guard for the coverage hole where UI-driven Google directory
 * mutations (create user, group create/update, group membership add/remove,
 * and service-account credential setup) wrote NOTHING of their own to the
 * compliance audit trail (`audit_logs_unified`, which UNIONs `activity_logs`
 * and `security_audit_logs`). These tests pin that every such mutation now
 * emits a semantic `securityAudit.log()` row via the shared writer.
 *
 * The real router is exercised through supertest with the database, Google
 * service, and auth middleware mocked (no live Postgres / Google needed).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

const ORG_ID = 'org-1';

// ---- mocks (registered before the dynamic import of the router) ----

type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Inject an authenticated admin actor; the real auth/JWT path is out of scope
// for an audit-write test.
jest.unstable_mockModule('../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { userId: 'admin-1', email: 'admin@corp.test', role: 'admin', organizationId: ORG_ID };
    next();
  },
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

const gw = {
  storeServiceAccountCredentials: jest.fn(async () => ({ success: true, message: 'stored' })),
  getDomainWideDelegationInfo: jest.fn(() => ({})),
  addGroupMember: jest.fn(async () => ({ success: true })),
  removeGroupMember: jest.fn(async () => ({ success: true })),
  createGroup: jest.fn(async () => ({ success: true, data: { id: 'grp-1' } })),
  updateGroup: jest.fn(async () => ({ success: true })),
  createUser: jest.fn(async () => ({ success: true, userId: 'gw-user-1' })),
  getSetupStatus: jest.fn(async () => ({ isConfigured: true })),
};
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: gw,
  GoogleWorkspaceService: class {},
}));

jest.unstable_mockModule('../services/sync-scheduler.service.js', () => ({
  syncScheduler: { manualSync: jest.fn(async () => ({ success: true, stats: {} })) },
}));

jest.unstable_mockModule('../services/gw-credentials.js', () => ({
  decodeServiceAccountKey: jest.fn(() => ({})),
}));

const mockAuditLog = jest.fn<(entry: any) => Promise<string>>(async () => 'audit-id');
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log: mockAuditLog },
  AuditActions: {
    USER_CREATE: 'user.create',
    USER_UPDATE: 'user.update',
    USER_SUSPEND: 'user.suspend',
    USER_ACTIVATE: 'user.activate',
    USER_ROLE_CHANGE: 'user.role.change',
    GROUP_CREATE: 'group.create',
    GROUP_UPDATE: 'group.update',
    GROUP_MEMBER_ADD: 'group.member.add',
    GROUP_MEMBER_REMOVE: 'group.member.remove',
    SERVICE_ACCOUNT_CONFIGURE: 'service.account.configure',
  },
}));

const { default: gwRouter } = await import('../routes/google-workspace.routes.js');

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/gw', gwRouter);
  return app;
}

/** Return the single securityAudit.log entry with the given action. */
function auditFor(action: string): any {
  const call = mockAuditLog.mock.calls.find((c: any[]) => (c[0] as any)?.action === action);
  return call ? (call[0] as any) : undefined;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('SELECT id FROM organizations WHERE id')) return { rows: [{ id: ORG_ID }] };
    return { rows: [] };
  });
  mockAuditLog.mockClear();
  Object.values(gw).forEach((fn) => (fn as jest.Mock).mockClear?.());
});

describe('google-workspace REST mutations write the audit trail', () => {
  it('POST /gw/setup audits the service-account credential change', async () => {
    const res = await request(buildApp())
      .post('/gw/setup')
      .send({
        organizationId: ORG_ID,
        domain: 'corp.test',
        adminEmail: 'admin@corp.test',
        credentials: {
          client_email: 'svc@project.iam.gserviceaccount.com',
          private_key: 'PK',
          client_id: '123',
        },
      });

    expect(res.status).toBe(200);
    const entry = auditFor('service.account.configure');
    expect(entry).toBeTruthy();
    expect(entry.organizationId).toBe(ORG_ID);
    expect(entry.targetType).toBe('service_account');
    expect(entry.outcome).toBe('success');
  });

  it('POST /gw/groups audits group creation', async () => {
    const res = await request(buildApp())
      .post('/gw/groups')
      .send({ organizationId: ORG_ID, email: 'team@corp.test', name: 'Team' });

    expect(res.status).toBe(200);
    const entry = auditFor('group.create');
    expect(entry).toBeTruthy();
    expect(entry.targetType).toBe('group');
    expect(entry.organizationId).toBe(ORG_ID);
  });

  it('PATCH /gw/groups/:groupId audits group update', async () => {
    const res = await request(buildApp())
      .patch('/gw/groups/grp-1')
      .send({ organizationId: ORG_ID, name: 'Renamed' });

    expect(res.status).toBe(200);
    const entry = auditFor('group.update');
    expect(entry).toBeTruthy();
    expect(entry.targetId).toBe('grp-1');
  });

  it('POST /gw/groups/:groupId/members audits a membership add', async () => {
    const res = await request(buildApp())
      .post('/gw/groups/grp-1/members')
      .send({ organizationId: ORG_ID, email: 'member@corp.test', role: 'MEMBER' });

    expect(res.status).toBe(200);
    const entry = auditFor('group.member.add');
    expect(entry).toBeTruthy();
    expect(entry.targetId).toBe('grp-1');
    expect(entry.changesAfter?.memberEmail).toBe('member@corp.test');
  });

  it('DELETE /gw/groups/:groupId/members/:memberEmail audits a membership removal', async () => {
    const res = await request(buildApp())
      .delete('/gw/groups/grp-1/members/member@corp.test')
      .query({ organizationId: ORG_ID });

    expect(res.status).toBe(200);
    const entry = auditFor('group.member.remove');
    expect(entry).toBeTruthy();
    expect(entry.targetId).toBe('grp-1');
  });

  it('POST /gw/users audits creation of a Google directory user', async () => {
    const res = await request(buildApp())
      .post('/gw/users')
      .send({ email: 'New@corp.test', firstName: 'New', lastName: 'User' });

    expect(res.status).toBe(201);
    const entry = auditFor('user.create');
    expect(entry).toBeTruthy();
    expect(entry.targetType).toBe('user');
    expect(entry.targetIdentifier).toBe('new@corp.test');
    expect(entry.changesAfter?.provider).toBe('google_workspace');
  });

  it('does NOT write an audit row when the underlying Google op fails', async () => {
    gw.createGroup.mockResolvedValueOnce({ success: false, error: 'boom' } as any);
    const res = await request(buildApp())
      .post('/gw/groups')
      .send({ organizationId: ORG_ID, email: 'team@corp.test', name: 'Team' });

    expect(res.status).toBe(200); // route echoes the service result
    expect(auditFor('group.create')).toBeUndefined();
  });
});
