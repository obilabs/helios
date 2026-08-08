/**
 * Enforcement tests for the security principle:
 *
 *   "Admin is bootstrapped once, then only granted — never self-served."
 *   (_north_star/PRINCIPLES.md → Engineering & Security #1)
 *
 * What these tests pin down (fail the build on regression):
 *   1. The first-run bootstrap (POST /organization/setup) closes permanently
 *      once an organization exists (409).
 *   2. No account-creation endpoint grants admin from request input — a
 *      request attempting to set a privileged role does NOT produce an admin
 *      (single-user create, and bulk import).
 *   3. Elevation to admin is a SEPARATE, admin-gated, audited route
 *      (POST /organization/admins/promote/:userId) — non-admins are rejected.
 *   4. LAST-ADMIN GUARD: delete / demote / suspend / deactivate / block of
 *      the final remaining active admin is refused on every path.
 *   5. Self-signup posture: better-auth public sign-up is disabled and
 *      privileged fields are not client-inputtable.
 *
 * Real handlers are exercised through the router via supertest, with the
 * database and external services mocked (no live Postgres / Google needed).
 * Auth uses the REAL middleware/auth.ts JWT path (real requireAdmin), with
 * better-auth session lookup mocked to "no session".
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Must be set BEFORE middleware/auth.js is (dynamically) imported below.
process.env['JWT_SECRET'] = 'admin-invariant-test-secret';

// ---- mocks (must be registered before the dynamic imports) ----

type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// better-auth: no cookie session in these tests — forces the JWT path in the
// REAL authenticateToken/requireAdmin middleware.
jest.unstable_mockModule('../lib/auth.js', () => ({
  auth: { api: { getSession: jest.fn(async () => null) } },
}));

jest.unstable_mockModule('../services/auth.service.js', () => ({
  authService: { generateAccessToken: jest.fn(() => 'minted-token') },
}));

jest.unstable_mockModule('../services/password-setup.service.js', () => ({
  PasswordSetupService: { sendPasswordSetupEmail: jest.fn(async () => true) },
}));

jest.unstable_mockModule('../services/sync-scheduler.service.js', () => ({
  syncScheduler: { getOrganizationStats: jest.fn(async () => ({})) },
}));

jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: {
    createUser: jest.fn(async () => ({ success: false, error: 'not in test' })),
    updateUser: jest.fn(async () => ({ success: true })),
    deleteUser: jest.fn(async () => ({ success: true })),
    suspendUser: jest.fn(async () => ({ success: true })),
    getUserGroups: jest.fn(async () => ({ success: true, data: [] })),
    removeUserFromGroup: jest.fn(async () => ({ success: true })),
  },
  GoogleWorkspaceService: class {},
}));

const mockTrackUserChange = jest.fn(async () => undefined);
jest.unstable_mockModule('../services/activity-tracker.service.js', () => ({
  activityTracker: { trackUserChange: mockTrackUserChange },
}));

jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log: jest.fn(async () => undefined) },
  AuditActions: {},
}));

// bulk-operations.service dependencies (unit-tested in the same file)
jest.unstable_mockModule('../services/queue.service.js', () => ({
  queueService: { addJob: jest.fn(), getQueue: jest.fn() },
}));
jest.unstable_mockModule('../services/csv-parser.service.js', () => ({
  csvParserService: { parse: jest.fn(), validate: jest.fn() },
}));
jest.unstable_mockModule('../websocket/bulk-operations.gateway.js', () => ({
  bulkOperationEvents: { emitProgress: jest.fn(), emitCompleted: jest.fn(), emitFailed: jest.fn() },
}));
jest.unstable_mockModule('../services/google-workspace-batch.service.js', () => ({
  googleWorkspaceBatchService: {},
}));

const { default: organizationRouter } = await import('../routes/organization.routes.js');
const { BulkOperationsService } = await import('../services/bulk-operations.service.js');

// ---- fixtures ----

const JWT_SECRET = 'admin-invariant-test-secret';
const ORG_ID = 'org-1';

function tokenFor(role: string, userId: string): string {
  return jwt.sign(
    { userId, email: `${userId}@corp.test`, role, organizationId: ORG_ID, type: 'access' },
    JWT_SECRET
  );
}

const ADMIN_TOKEN = tokenFor('admin', 'admin-1');
const USER_TOKEN = tokenFor('user', 'user-1');

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/organization', organizationRouter);
  return app;
}

/**
 * Prime the DB mock. Queries are routed by SQL fragment:
 *  - orgExists          → 'SELECT id FROM organizations LIMIT 1'
 *  - targetUser         → the per-route target-user lookup
 *  - otherActiveAdmins  → the last-admin-guard count (matched via "id != $2")
 * Everything else returns empty rows / a generic RETURNING row.
 */
function primeDb(opts: {
  orgExists?: boolean;
  targetUser?: Record<string, unknown> | null;
  otherActiveAdmins?: number;
  emailTaken?: boolean;
}): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes("role = 'admin'") && text.includes('id != $2')) {
      return { rows: [{ count: String(opts.otherActiveAdmins ?? 1) }] };
    }
    if (text.includes('SELECT id FROM organizations LIMIT 1')) {
      return { rows: opts.orgExists === false ? [] : [{ id: ORG_ID }] };
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
    if (text.includes('UPDATE organization_users')) {
      return {
        rows: opts.targetUser ? [{ ...opts.targetUser }] : [],
        rowCount: opts.targetUser ? 1 : 0,
      };
    }
    if (text.includes('SELECT id FROM organization_users WHERE email')) {
      return { rows: opts.emailTaken ? [{ id: 'existing-1' }] : [] };
    }
    if (text.includes('FROM organization_users')) {
      return { rows: opts.targetUser ? [{ ...opts.targetUser }] : [] };
    }
    // audit_logs inserts, log_activity, security_events, BEGIN/COMMIT, etc.
    return { rows: [] };
  });
}

function queriesMatching(fragment: string): string[] {
  return mockQuery.mock.calls.map((c) => c[0]).filter((q) => q.includes(fragment));
}

beforeEach(() => {
  mockQuery.mockReset();
  mockTrackUserChange.mockClear();
});

// ---------------------------------------------------------------------------
// 1. Bootstrap closes permanently
// ---------------------------------------------------------------------------

describe('bootstrap: POST /organization/setup', () => {
  it('refuses with 409 once an organization exists (idempotent-closed)', async () => {
    primeDb({ orgExists: true });
    const res = await request(buildApp())
      .post('/organization/setup')
      .send({
        organizationName: 'Evil Corp',
        organizationDomain: 'evil.test',
        adminEmail: 'attacker@evil.test',
        adminPassword: 'password123',
        adminFirstName: 'A',
        adminLastName: 'B',
      });

    expect(res.status).toBe(409);
    // and no admin was created
    expect(queriesMatching('INSERT INTO organization_users')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Account creation never grants admin from request input
// ---------------------------------------------------------------------------

describe('creation: POST /organization/users', () => {
  const validBody = {
    email: 'new@corp.test',
    firstName: 'New',
    lastName: 'User',
    password: 'password123',
  };

  it('rejects role=admin from the request body (400) and creates nothing', async () => {
    primeDb({});
    const res = await request(buildApp())
      .post('/organization/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ ...validBody, role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/privileged roles cannot be assigned/i);
    expect(queriesMatching('INSERT INTO organization_users')).toHaveLength(0);
  });

  it('rejects role=super_admin and role=platform_owner too', async () => {
    for (const role of ['super_admin', 'platform_owner']) {
      primeDb({});
      const res = await request(buildApp())
        .post('/organization/users')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ ...validBody, role });
      expect(res.status).toBe(400);
      expect(queriesMatching('INSERT INTO organization_users')).toHaveLength(0);
    }
  });

  it('rejects role=admin even when combined with isExternalAdmin', async () => {
    primeDb({});
    const res = await request(buildApp())
      .post('/organization/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ ...validBody, role: 'admin', isExternalAdmin: true });

    expect(res.status).toBe(400);
    expect(queriesMatching('INSERT INTO organization_users')).toHaveLength(0);
  });

  it('is admin-gated: a non-admin cannot create accounts at all (403)', async () => {
    primeDb({});
    const res = await request(buildApp())
      .post('/organization/users')
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ ...validBody, role: 'user' });

    expect(res.status).toBe(403);
    expect(queriesMatching('INSERT INTO organization_users')).toHaveLength(0);
  });

  it('creates a non-privileged account when role=user (the allowed path)', async () => {
    primeDb({});
    const res = await request(buildApp())
      .post('/organization/users')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ ...validBody, role: 'user' });

    expect(res.status).toBe(201);
    const inserts = queriesMatching('INSERT INTO organization_users');
    expect(inserts).toHaveLength(1);
    // the INSERT received the non-privileged role
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes('INSERT INTO organization_users'));
    expect(insertCall?.[1]).toContain('user');
    expect(insertCall?.[1]).not.toContain('admin');
  });
});

describe('creation: bulk import (BulkOperationsService.createUser)', () => {
  it('refuses to create a user with a privileged role from import data', async () => {
    primeDb({});
    const service = new BulkOperationsService() as any;
    await expect(
      service.createUser({ email: 'evil@corp.test', firstName: 'E', lastName: 'V', role: 'admin' }, ORG_ID)
    ).rejects.toThrow(/privileged role/i);
    expect(queriesMatching('INSERT INTO organization_users')).toHaveLength(0);
  });

  it('creates non-privileged users normally', async () => {
    primeDb({});
    const service = new BulkOperationsService() as any;
    const row = await service.createUser(
      { email: 'ok@corp.test', firstName: 'O', lastName: 'K', role: 'user' },
      ORG_ID
    );
    expect(row).toBeTruthy();
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes('INSERT INTO organization_users'));
    expect(insertCall?.[1]).toContain('user');
  });
});

// ---------------------------------------------------------------------------
// 3. Elevation is a separate, admin-gated, audited route
// ---------------------------------------------------------------------------

describe('elevation: POST /organization/admins/promote/:userId', () => {
  it('rejects a non-admin caller (403) and never touches the role column', async () => {
    primeDb({ targetUser: { id: 'user-2', email: 'user-2@corp.test', role: 'user' } });
    const res = await request(buildApp())
      .post('/organization/admins/promote/user-2')
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({});

    expect(res.status).toBe(403);
    expect(queriesMatching("SET role = 'admin'")).toHaveLength(0);
  });

  it('rejects an unauthenticated caller (401)', async () => {
    primeDb({});
    const res = await request(buildApp()).post('/organization/admins/promote/user-2').send({});
    expect(res.status).toBe(401);
    expect(queriesMatching("SET role = 'admin'")).toHaveLength(0);
  });

  it('allows an admin caller and writes an audit record', async () => {
    primeDb({
      targetUser: { id: 'user-2', email: 'user-2@corp.test', first_name: 'U', last_name: 'Two', role: 'admin' },
    });
    const res = await request(buildApp())
      .post('/organization/admins/promote/user-2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});

    expect(res.status).toBe(200);
    expect(queriesMatching("SET role = 'admin'")).toHaveLength(1);
    // AUDITED elevation: audit_logs row written
    const auditInserts = mockQuery.mock.calls.filter(
      (c) => c[0].includes('INSERT INTO audit_logs') && c[0].includes('promote_admin')
    );
    expect(auditInserts).toHaveLength(1);
  });
});

describe('elevation cannot happen through the generic update route', () => {
  it('PUT /organization/users/:id rejects role=admin for a non-admin target (400)', async () => {
    primeDb({ targetUser: { id: 'user-2', role: 'user' } });
    const res = await request(buildApp())
      .put('/organization/users/user-2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/promote/i);
    expect(queriesMatching('UPDATE organization_users SET')).toHaveLength(0);
  });

  it('PUT /organization/users/:id is admin-gated (403 for non-admin)', async () => {
    primeDb({ targetUser: { id: 'user-2', role: 'user' } });
    const res = await request(buildApp())
      .put('/organization/users/user-2')
      .set('Authorization', `Bearer ${USER_TOKEN}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(queriesMatching('UPDATE organization_users SET')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Last-admin guard on every removal/demotion path
// ---------------------------------------------------------------------------

describe('last-admin guard', () => {
  it('DELETE /organization/users/:id refuses to delete the last admin', async () => {
    primeDb({
      targetUser: { id: 'admin-2', email: 'admin-2@corp.test', role: 'admin', status: 'active' },
      otherActiveAdmins: 0,
    });
    const res = await request(buildApp())
      .delete('/organization/users/admin-2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last administrator/i);
    expect(queriesMatching("SET status = 'deleted'")).toHaveLength(0);
  });

  it('DELETE succeeds when another active admin remains', async () => {
    primeDb({
      targetUser: { id: 'admin-2', email: 'admin-2@corp.test', role: 'admin', status: 'active' },
      otherActiveAdmins: 1,
    });
    const res = await request(buildApp())
      .delete('/organization/users/admin-2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(queriesMatching("SET status = 'deleted'")).toHaveLength(1);
  });

  it('POST /organization/admins/demote/:id refuses to demote the last admin', async () => {
    primeDb({
      targetUser: { id: 'admin-2', email: 'admin-2@corp.test', role: 'user' },
      otherActiveAdmins: 0,
    });
    const res = await request(buildApp())
      .post('/organization/admins/demote/admin-2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last administrator/i);
    expect(queriesMatching("SET role = 'user'")).toHaveLength(0);
  });

  it('demote succeeds (and is audited) when another active admin remains', async () => {
    primeDb({
      targetUser: { id: 'admin-2', email: 'admin-2@corp.test', first_name: 'A', last_name: 'Two', role: 'user' },
      otherActiveAdmins: 1,
    });
    const res = await request(buildApp())
      .post('/organization/admins/demote/admin-2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});

    expect(res.status).toBe(200);
    expect(queriesMatching("SET role = 'user'")).toHaveLength(1);
    const auditInserts = mockQuery.mock.calls.filter(
      (c) => c[0].includes('INSERT INTO audit_logs') && c[0].includes('demote_admin')
    );
    expect(auditInserts).toHaveLength(1);
  });

  it('PATCH /organization/users/:id/status refuses to suspend the last admin', async () => {
    primeDb({
      targetUser: { id: 'admin-2', email: 'admin-2@corp.test', status: 'active', role: 'admin' },
      otherActiveAdmins: 0,
    });
    const res = await request(buildApp())
      .patch('/organization/users/admin-2/status')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'suspended' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last administrator/i);
    expect(queriesMatching('SET status = $1')).toHaveLength(0);
  });

  it('PUT /organization/users/:id refuses to demote the last admin via role change', async () => {
    primeDb({
      targetUser: { id: 'admin-2', role: 'admin' },
      otherActiveAdmins: 0,
    });
    const res = await request(buildApp())
      .put('/organization/users/admin-2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last administrator/i);
  });

  it('PUT /organization/users/:id refuses to deactivate the last admin', async () => {
    primeDb({
      targetUser: { id: 'admin-2', role: 'admin' },
      otherActiveAdmins: 0,
    });
    const res = await request(buildApp())
      .put('/organization/users/admin-2')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last administrator/i);
  });

  it('POST /organization/users/:id/block refuses to block the last admin', async () => {
    primeDb({
      targetUser: {
        id: 'admin-2',
        email: 'admin-2@corp.test',
        first_name: 'A',
        last_name: 'Two',
        role: 'admin',
        google_workspace_id: 'gw-1',
      },
      otherActiveAdmins: 0,
    });
    const res = await request(buildApp())
      .post('/organization/users/admin-2/block')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ reason: 'test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last administrator/i);
    expect(queriesMatching("'blocked'")).toHaveLength(0);
  });

  it('bulk suspend refuses to suspend the last admin', async () => {
    primeDb({
      targetUser: { id: 'admin-2', role: 'admin' },
      otherActiveAdmins: 0,
    });
    const service = new BulkOperationsService() as any;
    await expect(
      service.suspendUser({ email: 'admin-2@corp.test' }, ORG_ID)
    ).rejects.toThrow(/last administrator/i);
    expect(queriesMatching("user_status = 'suspended'")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Self-signup posture (source-level tripwire)
// ---------------------------------------------------------------------------

describe('self-signup posture: better-auth configuration', () => {
  const __filename = fileURLToPath(import.meta.url);
  const authSource = fs.readFileSync(
    path.join(path.dirname(__filename), '..', 'lib', 'auth.ts'),
    'utf8'
  );

  it('public sign-up is disabled (emailAndPassword.disableSignUp: true)', () => {
    expect(authSource).toMatch(/disableSignUp:\s*true/);
  });

  it('privileged fields are not client-inputtable (input: false)', () => {
    for (const field of ['role', 'organizationId', 'isExternalAdmin', 'isActive']) {
      const block = authSource.match(new RegExp(`${field}:\\s*\\{[^}]*\\}`, 's'));
      expect(block?.[0] ?? '').toMatch(/input:\s*false/);
    }
  });
});
