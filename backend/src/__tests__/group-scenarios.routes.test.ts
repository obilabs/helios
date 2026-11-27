/**
 * Group scenarios HTTP surface (routes/group-scenarios.routes.ts).
 *
 * Pins down the contract a client relies on, especially the status codes that
 * keep a partial result from reading as success:
 *   - admin only (403 for a non-admin), and 404 while the preview flag is off;
 *   - 201 only for a verified create; 207 with success:false for mismatch/partial;
 *   - 409 when the Groups Settings scope is not authorised (nothing created);
 *   - built-ins: disable via PATCH, DELETE refused with 409.
 *
 * The real router and service run; the database, flag service, Google gateway,
 * audit log and auth middleware are mocked.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const builtinState = new Map<string, boolean>();
const mockQuery = jest.fn(async (text: string, params: unknown[] = []): Promise<{ rows: any[]; rowCount?: number }> => {
  if (text.includes('FROM group_scenario_builtin_state') && text.includes('builtin_key = $2')) {
    const v = builtinState.get(params[1] as string);
    return { rows: v === undefined ? [] : [{ is_disabled: v }] };
  }
  if (text.includes('INSERT INTO group_scenario_builtin_state')) {
    builtinState.set(params[1] as string, params[2] as boolean);
    return { rows: [] };
  }
  return { rows: [], rowCount: 0 };
});
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: mockQuery } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let flagOn = true;
jest.unstable_mockModule('../services/feature-flags.service.js', () => ({
  featureFlagsService: { isEnabled: async () => flagOn },
}));

const auditLog = jest.fn(async (_entry: Record<string, unknown>) => 'audit-1');
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log: auditLog },
  AuditActions: { GROUP_CREATE: 'group.create' },
}));

jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: { syncGroups: async () => ({ success: true }) },
}));

let settingsStored: Record<string, unknown> = {};
let ignoreDefaultSender = false;
let probeState: 'authorised' | 'not_authorised' = 'authorised';
const created: string[] = [];
const fakeGateway = {
  probeSettingsScope: async () => ({ state: probeState, scope: 'https://www.googleapis.com/auth/apps.groups.settings', message: 'not authorised here' }),
  createGroup: async ({ email }: { email: string }) => { created.push(email); return { id: 'gid-1', email }; },
  patchSettings: async (_e: string, values: Record<string, string>) => {
    settingsStored = { ...values };
    if (ignoreDefaultSender) delete settingsStored.defaultSender;
  },
  getSettings: async () => settingsStored,
  insertAlias: async (): Promise<void> => undefined,
  listAliases: async (): Promise<string[]> => [],
  insertMember: async (): Promise<void> => undefined,
  getMember: async () => ({ email: '', role: null as string | null, delivery: null as string | null }),
  deleteGroup: async (): Promise<void> => undefined,
};
jest.unstable_mockModule('../services/group-scenarios/google-groups.gateway.js', () => ({
  gatewayForOrganization: async () => fakeGateway,
  googleErrorInfo: (e: any): { status: number | null; message: string; reason: string | null } => ({ status: e?.response?.status ?? null, message: String(e?.message || e), reason: null }),
  isUnauthorisedClient: () => false,
  isApiNotEnabled: () => false,
}));

let currentUser: Record<string, unknown> | null;
jest.unstable_mockModule('../middleware/auth.js', () => ({
  requireAdmin: (req: any, res: any, next: any) => {
    if (!currentUser) return res.status(401).json({ success: false });
    req.user = currentUser;
    if (currentUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Forbidden' });
    next();
  },
}));

const { default: routes } = await import('../routes/group-scenarios.routes.js');

const app = express();
app.use(express.json());
app.use('/api/v1/group-scenarios', routes);

const ADMIN = { userId: 'admin-1', email: 'admin@example.com', organizationId: 'org-1', role: 'admin' };

beforeEach(() => {
  currentUser = ADMIN;
  flagOn = true;
  probeState = 'authorised';
  ignoreDefaultSender = false;
  settingsStored = {};
  created.length = 0;
  builtinState.clear();
  auditLog.mockClear();
});

describe('group scenarios routes', () => {
  it('non-admins are refused', async () => {
    currentUser = { ...ADMIN, role: 'user' };
    await request(app).get('/api/v1/group-scenarios').expect(403);
    await request(app).post('/api/v1/group-scenarios/public-contact-inbox/groups').send({}).expect(403);
  });

  it('404 while the preview flag is off', async () => {
    flagOn = false;
    const res = await request(app).get('/api/v1/group-scenarios').expect(404);
    expect(res.body.success).toBe(false);
  });

  it('lists built-ins with explainer and drill-in', async () => {
    const res = await request(app).get('/api/v1/group-scenarios').expect(200);
    const contact = res.body.data.find((s: any) => s.key === 'public-contact-inbox');
    expect(contact.userStory).toMatch(/^As a/);
    expect(contact.settingsDetail).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'spamModerationLevel', value: 'ALLOW' })]));
    expect(contact.source).toBe('builtin');
  });

  it('reports the settings scope state', async () => {
    probeState = 'not_authorised';
    const res = await request(app).get('/api/v1/group-scenarios/status').expect(200);
    expect(res.body.data).toEqual(expect.objectContaining({ googleConfigured: true, settingsScope: expect.objectContaining({ state: 'not_authorised' }) }));
  });

  it('201 for a verified create, with the audit row marked success', async () => {
    const res = await request(app)
      .post('/api/v1/group-scenarios/public-contact-inbox/groups')
      .send({ email: 'hello@example.com', name: 'Hello' })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.outcome).toBe('verified');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'group.create', outcome: 'success' }));
  });

  it('207 with success:false when the read-back differs', async () => {
    ignoreDefaultSender = true;
    const res = await request(app)
      .post('/api/v1/group-scenarios/public-contact-inbox/groups')
      .send({ email: 'hello@example.com', name: 'Hello' })
      .expect(207);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('GROUP_SETTINGS_MISMATCH');
    expect(res.body.data.mismatches).toEqual([{ area: 'settings', field: 'defaultSender', expected: 'DEFAULT_SELF', actual: null }]);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'partial' }));
  });

  it('409 and nothing created when the Groups Settings scope is not authorised', async () => {
    probeState = 'not_authorised';
    const res = await request(app)
      .post('/api/v1/group-scenarios/public-contact-inbox/groups')
      .send({ email: 'hello@example.com', name: 'Hello' })
      .expect(409);
    expect(res.body.error.code).toBe('SETTINGS_SCOPE_NOT_AUTHORISED');
    expect(created).toEqual([]);
  });

  it('400 on invalid input, 404 on an unknown scenario', async () => {
    await request(app).post('/api/v1/group-scenarios/public-contact-inbox/groups').send({ email: 'nope', name: '' }).expect(400);
    await request(app).post('/api/v1/group-scenarios/no-such/groups').send({ email: 'a@example.com', name: 'A' }).expect(404);
  });

  it('built-ins: PATCH disables, DELETE is refused', async () => {
    const patched = await request(app).patch('/api/v1/group-scenarios/announcement-list').send({ disabled: true }).expect(200);
    expect(patched.body.data.disabled).toBe(true);
    const del = await request(app).delete('/api/v1/group-scenarios/announcement-list').expect(409);
    expect(del.body.error.code).toBe('BUILTIN_NOT_DELETABLE');
    await request(app).patch('/api/v1/group-scenarios/announcement-list').send({ settings: {} }).expect(400);
  });
});
