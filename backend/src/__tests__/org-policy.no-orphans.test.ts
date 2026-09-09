/**
 * No-orphans policy: a user with active direct reports cannot be suspended,
 * offboarded or deleted unless the reports are reassigned in the same action.
 *
 * Offline. The service is exercised directly and through the status route
 * (the route test is the one that fails if a future change drops the guard).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

const ORG_ID = 'org-1';
type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: mockQuery } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { userId: 'admin-1', email: 'admin@example.com', role: 'admin', organizationId: ORG_ID };
    next();
  },
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../services/auth.service.js', () => ({ authService: { generateAccessToken: jest.fn(() => 't') } }));
jest.unstable_mockModule('../services/password-setup.service.js', () => ({ PasswordSetupService: { sendPasswordSetupEmail: jest.fn(async () => true) } }));
jest.unstable_mockModule('../services/sync-scheduler.service.js', () => ({ syncScheduler: { manualSync: jest.fn(async () => ({ success: true })) } }));
const gws = {
  updateUser: jest.fn<any>(async () => ({ success: true })),
  suspendUser: jest.fn<any>(async () => ({ success: true })),
  restoreUser: jest.fn<any>(async () => ({ success: true })),
  deleteUser: jest.fn<any>(async () => ({ success: true })),
  createUser: jest.fn<any>(async () => ({ success: false, error: 'not in test' })),
  undeleteUser: jest.fn<any>(async () => ({ success: true })),
};
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({ googleWorkspaceService: gws, GoogleWorkspaceService: class {} }));
jest.unstable_mockModule('../services/microsoft-graph.service.js', () => ({ microsoftGraphService: { setAccountEnabled: jest.fn(async () => ({ success: true })) }, chooseUpnDomain: jest.fn(() => 'example.net') }));
jest.unstable_mockModule('../services/activity-tracker.service.js', () => ({ activityTracker: { trackUserChange: jest.fn(async () => undefined) } }));
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log: jest.fn(async () => 'audit') },
  AuditActions: new Proxy({}, { get: (_t, k) => String(k).toLowerCase() }),
}));
jest.unstable_mockModule('../services/user-snapshot.service.js', () => ({
  userSnapshotService: { capture: jest.fn(async () => ({ success: true, snapshot: { id: 's' } })), latest: jest.fn(async () => null), recreate: jest.fn(), list: jest.fn(async () => []) },
}));

const { orgPolicyService } = await import('../services/org-policy.service.js');
const { default: organizationRouter } = await import('../routes/organization.routes.js');

const MANAGER = { id: 'mgr-1', email: 'manager@example.com', status: 'active', role: 'user', google_workspace_id: 'g-mgr', microsoft_365_id: null as string | null };
const REPORTS = [
  { id: 'rep-1', email: 'rep1@example.com', first_name: 'Rep', last_name: 'One' },
  { id: 'rep-2', email: 'rep2@example.com', first_name: 'Rep', last_name: 'Two' },
];

function primeDb(reports: any[]): void {
  let moved = false; // after the reassign UPDATE, nobody reports to the manager any more
  mockQuery.mockImplementation(async (text: string, params?: unknown[]) => {
    if (/reporting_manager_id = \$2\s+AND is_active = true/.test(text)) return { rows: moved ? [] : reports };
    if (text.startsWith('SELECT id, email, first_name, last_name FROM organization_users WHERE reporting_manager_id')) return { rows: reports };
    if (text.startsWith('UPDATE organization_users SET reporting_manager_id = $1, updated_at = NOW() WHERE reporting_manager_id')) {
      moved = true;
      const rows = reports.filter((r) => r.id !== params?.[0]).map((r) => ({ id: r.id, email: r.email }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes('SELECT google_workspace_id FROM organization_users WHERE id = $1')) return { rows: [{ google_workspace_id: `g-${params?.[0]}` }] };
    if (text.includes('SELECT email FROM organization_users WHERE id = $1')) return { rows: [{ email: 'newboss@example.com' }] };
    if (text.includes('FROM organization_users WHERE id = $1 AND organization_id = $2 AND status != \'deleted\'')) return { rows: [MANAGER] };
    if (text.includes("SELECT id, email, role, status FROM organization_users WHERE id = $1")) return { rows: [MANAGER] };
    if (text.includes('SELECT google_workspace_id FROM organization_users WHERE id = $1') ) return { rows: [{ google_workspace_id: 'g-mgr' }] };
    if (text.includes('COUNT(*)')) return { rows: [{ count: '1', cnt: '1' }] };
    return { rows: [], rowCount: 0 };
  });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use('/api/v1/organization', organizationRouter);
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('service', () => {
  it('flags a user with active reports and names them', async () => {
    primeDb(REPORTS);
    const c = await orgPolicyService.checkNoOrphans(ORG_ID, 'mgr-1');
    expect(c.ok).toBe(false);
    expect(orgPolicyService.describeOrphans('suspend', c.reports)).toMatch(/Cannot suspend this user: 2 people report to them \(Rep One, Rep Two\)/);
  });

  it('passes a user with no active reports', async () => {
    primeDb([]);
    expect((await orgPolicyService.checkNoOrphans(ORG_ID, 'mgr-1')).ok).toBe(true);
  });

  it('reassigning all to one pushes the manager relation to Google for every report', async () => {
    primeDb(REPORTS);
    const r = await orgPolicyService.reassignDirectReports(ORG_ID, 'mgr-1', { mode: 'all_to_one', targetManagerId: 'mgr-2' });
    expect(r.reassignedCount).toBe(2);
    expect(gws.updateUser).toHaveBeenCalledTimes(2);
    expect(gws.updateUser).toHaveBeenCalledWith(ORG_ID, 'g-rep-1', { managerEmail: 'newboss@example.com' });
  });

  it('all-to-one leaves out the new manager when they are one of the reports and says so', async () => {
    primeDb(REPORTS);
    const r = await orgPolicyService.reassignDirectReports(ORG_ID, 'mgr-1', { mode: 'all_to_one', targetManagerId: 'rep-1' });
    const sql = mockQuery.mock.calls.find((c) => String(c[0]).includes('WHERE reporting_manager_id = $2 AND organization_id = $3 AND id <> $1'));
    expect(sql).toBeDefined();
    const self = r.results.find((x) => x.reportId === 'rep-1');
    expect(self?.success).toBe(false);
    expect(self?.error).toMatch(/cannot report to themselves/);
  });

  it('refuses to reassign reports to the departing manager', async () => {
    primeDb(REPORTS);
    await expect(orgPolicyService.reassignDirectReports(ORG_ID, 'mgr-1', { mode: 'all_to_one', targetManagerId: 'mgr-1' })).rejects.toThrow(/own manager/);
  });

  it('a Google rejection marks that report failed instead of hiding it', async () => {
    primeDb(REPORTS);
    gws.updateUser.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'Invalid manager' });
    const r = await orgPolicyService.reassignDirectReports(ORG_ID, 'mgr-1', { mode: 'all_to_one', targetManagerId: 'mgr-2' });
    expect(r.reassignedCount).toBe(1);
    expect(r.results.find((x) => x.reportId === 'rep-2')?.error).toMatch(/Google Workspace rejected/);
  });
});

describe('PATCH /users/:id/status suspend', () => {
  it('is refused with 409 and the orphan list while people report to the user; Google is not touched', async () => {
    primeDb(REPORTS);
    const res = await request(app()).patch('/api/v1/organization/users/mgr-1/status').send({ status: 'suspended' });
    expect(res.status).toBe(409);
    expect(res.body.data.orphans.map((o: any) => o.email)).toEqual(['rep1@example.com', 'rep2@example.com']);
    expect(gws.suspendUser).not.toHaveBeenCalled();
  });

  it('proceeds when reassignReports is supplied in the same request', async () => {
    primeDb(REPORTS);
    const res = await request(app())
      .patch('/api/v1/organization/users/mgr-1/status')
      .send({ status: 'suspended', reassignReports: { mode: 'all_to_one', targetManagerId: 'mgr-2' } });
    expect(res.status).toBe(200);
    expect(gws.updateUser).toHaveBeenCalledTimes(2);
    expect(gws.suspendUser).toHaveBeenCalledTimes(1);
    expect(res.body.data.reassigned.reassignedCount).toBe(2);
  });

  it('activating is never blocked by reports', async () => {
    primeDb(REPORTS);
    const res = await request(app()).patch('/api/v1/organization/users/mgr-1/status').send({ status: 'active' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /users/:id', () => {
  it('is refused with 409 while people report to the user', async () => {
    primeDb(REPORTS);
    const res = await request(app()).delete('/api/v1/organization/users/mgr-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.data.orphans).toHaveLength(2);
    expect(gws.deleteUser).not.toHaveBeenCalled();
  });
});
