/**
 * Audit-trail coverage for direct organization user REST mutations.
 *
 * Regression guard for the coverage hole where the UI Add/Edit/Suspend/Promote
 * paths recorded their action only in `security_events` (activityTracker) and
 * the legacy `audit_logs` table — NEITHER of which is surfaced by the
 * compliance audit view `audit_logs_unified` (it UNIONs `activity_logs` and
 * `security_audit_logs`). These tests pin that each of those mutations now also
 * emits a semantic `securityAudit.log()` row (→ security_audit_logs → in the
 * unified view).
 *
 * The real router runs through supertest with the database and all services
 * mocked; auth middleware injects an admin actor.
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

jest.unstable_mockModule('../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { userId: 'admin-1', email: 'admin@corp.test', role: 'admin', organizationId: ORG_ID };
    next();
  },
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule('../services/auth.service.js', () => ({
  authService: { generateAccessToken: jest.fn(() => 'minted-token') },
}));

jest.unstable_mockModule('../services/password-setup.service.js', () => ({
  PasswordSetupService: { sendPasswordSetupEmail: jest.fn(async () => true) },
}));

jest.unstable_mockModule('../services/sync-scheduler.service.js', () => ({
  syncScheduler: { manualSync: jest.fn(async () => ({ success: true })) },
}));

jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: {
    createUser: jest.fn(async () => ({ success: false, error: 'not in test' })),
    updateUser: jest.fn(async () => ({ success: true })),
    deleteUser: jest.fn(async () => ({ success: true })),
    suspendUser: jest.fn(async () => ({ success: true })),
  },
  GoogleWorkspaceService: class {},
}));

const mockTrackUserChange = jest.fn(async () => undefined);
jest.unstable_mockModule('../services/activity-tracker.service.js', () => ({
  activityTracker: { trackUserChange: mockTrackUserChange },
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

const { default: organizationRouter } = await import('../routes/organization.routes.js');

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/organization', organizationRouter);
  return app;
}

function auditFor(action: string): any {
  const call = mockAuditLog.mock.calls.find((c: any[]) => (c[0] as any)?.action === action);
  return call ? (call[0] as any) : undefined;
}

const UPDATED_ROW = {
  id: 'user-2',
  email: 'user-2@corp.test',
  first_name: 'U',
  last_name: 'Two',
  role: 'user',
  is_active: true,
  is_external_admin: false,
  updated_at: new Date().toISOString(),
};

beforeEach(() => {
  mockQuery.mockReset();
  mockTrackUserChange.mockClear();
  mockAuditLog.mockClear();

  mockQuery.mockImplementation(async (text: string) => {
    // last-admin guard count
    if (text.includes("role = 'admin'") && text.includes('id != $2')) {
      return { rows: [{ count: '1' }] };
    }
    if (text.includes('SELECT id FROM organizations LIMIT 1')) {
      return { rows: [{ id: ORG_ID }] };
    }
    // create: "already exists" pre-check → not taken
    if (text.includes('SELECT id FROM organization_users WHERE email')) {
      return { rows: [] };
    }
    if (text.includes('INSERT INTO organization_users')) {
      return {
        rows: [{
          id: 'new-user-1',
          email: 'new@corp.test',
          first_name: 'New',
          last_name: 'User',
          role: 'user',
          is_active: true,
          is_external_admin: false,
          created_at: new Date().toISOString(),
        }],
      };
    }
    // promote
    if (text.includes('UPDATE organization_users') && text.includes("role = 'admin'")) {
      return { rows: [{ ...UPDATED_ROW, id: 'user-2', email: 'user-2@corp.test', role: 'admin' }] };
    }
    // demote
    if (text.includes('UPDATE organization_users') && text.includes("role = 'user'")) {
      return { rows: [{ ...UPDATED_ROW, id: 'admin-2', email: 'admin-2@corp.test', role: 'user' }] };
    }
    // generic update (PUT profile edit + PATCH status)
    if (text.includes('UPDATE organization_users')) {
      return { rows: [UPDATED_ROW] };
    }
    if (text.includes('SELECT google_workspace_id, email FROM organization_users')) {
      return { rows: [{ google_workspace_id: null, email: 'user-2@corp.test' }] };
    }
    // PATCH status target lookup
    if (text.includes('SELECT id, email, status, role FROM organization_users')) {
      return { rows: [{ id: 'user-2', email: 'user-2@corp.test', status: 'active', role: 'user' }] };
    }
    // PUT target lookup
    if (text.includes('SELECT id, role FROM organization_users')) {
      return { rows: [{ id: 'user-2', role: 'user' }] };
    }
    // audit_logs inserts, log_activity, security_events, etc.
    return { rows: [] };
  });
});

describe('organization user REST mutations write the audit trail', () => {
  it('POST /organization/users audits user creation', async () => {
    const res = await request(buildApp())
      .post('/organization/users')
      .send({ email: 'new@corp.test', firstName: 'New', lastName: 'User', password: 'password123', role: 'user' });

    expect(res.status).toBe(201);
    const entry = auditFor('user.create');
    expect(entry).toBeTruthy();
    expect(entry.targetType).toBe('user');
    expect(entry.targetId).toBe('new-user-1');
    expect(entry.organizationId).toBe(ORG_ID);
    expect(entry.actorId).toBe('admin-1');
  });

  it('PUT /organization/users/:id audits a profile update', async () => {
    const res = await request(buildApp())
      .put('/organization/users/user-2')
      .send({ firstName: 'Changed' });

    expect(res.status).toBe(200);
    const entry = auditFor('user.update');
    expect(entry).toBeTruthy();
    expect(entry.targetId).toBe('user-2');
    expect(entry.organizationId).toBe(ORG_ID);
  });

  it('PATCH /organization/users/:id/status audits a suspend', async () => {
    const res = await request(buildApp())
      .patch('/organization/users/user-2/status')
      .send({ status: 'suspended' });

    expect(res.status).toBe(200);
    const entry = auditFor('user.suspend');
    expect(entry).toBeTruthy();
    expect(entry.targetId).toBe('user-2');
    expect(entry.changesAfter?.status).toBe('suspended');
  });

  it('PATCH /organization/users/:id/status audits an activate', async () => {
    const res = await request(buildApp())
      .patch('/organization/users/user-2/status')
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    expect(auditFor('user.activate')).toBeTruthy();
  });

  it('POST /organization/admins/promote/:id audits the role elevation', async () => {
    const res = await request(buildApp())
      .post('/organization/admins/promote/user-2')
      .send({});

    expect(res.status).toBe(200);
    const entry = auditFor('user.role.change');
    expect(entry).toBeTruthy();
    expect(entry.changesAfter?.role).toBe('admin');
    expect(entry.targetId).toBe('user-2');
  });

  it('POST /organization/admins/demote/:id audits the role demotion', async () => {
    const res = await request(buildApp())
      .post('/organization/admins/demote/admin-2')
      .send({});

    expect(res.status).toBe(200);
    const entry = auditFor('user.role.change');
    expect(entry).toBeTruthy();
    expect(entry.changesAfter?.role).toBe('user');
    expect(entry.targetId).toBe('admin-2');
  });
});
