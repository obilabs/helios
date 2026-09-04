/**
 * Tests for the relay authoring routes (routes/relay.routes.ts) — the admin
 * surface that makes the least-privilege gate usable in-product.
 *
 * What these pin down (fail the build on regression):
 *   1. Admin gate: a non-admin is refused 403 on every route (config + rules).
 *      Authoring the org's authorization policy is admin-only.
 *   2. Config GET/PUT: the two org toggles (relay_enabled, writes_enabled) and
 *      the global api_relay feature flag are reported and updated; a partial PUT
 *      merges over the current row and never clobbers the untouched toggle;
 *      enforcement_active is the AND of the flag and relay_enabled.
 *   3. Rules CRUD: list / create / delete are org-scoped; create validates
 *      effect + match_pattern grammar (bad input → 400, never written);
 *      delete of a missing/foreign rule → 404.
 *
 * The REAL route handlers + validation run; only the database, feature-flag
 * service, logger, and auth middleware are mocked. requireAdmin is faithfully
 * reimplemented so the admin gate is genuinely exercised.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

// ---- mocks (registered before the dynamic import of the router) ----

type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockIsEnabled = jest.fn<(key: string) => Promise<boolean>>();
const mockSetFlag = jest.fn<(key: string, enabled: boolean) => Promise<unknown>>();
jest.unstable_mockModule('../services/feature-flags.service.js', () => ({
  featureFlagsService: { isEnabled: mockIsEnabled, setFlag: mockSetFlag },
}));

// Test-controlled current user. requireAuth injects it; requireAdmin gates on it
// exactly as the real middleware does (401 no user / 403 not admin).
let currentUser: Record<string, unknown> | null;
jest.unstable_mockModule('../middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!currentUser) return res.status(401).json({ success: false, error: 'Authentication required' });
    req.user = currentUser;
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
    if (!req.user.isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });
    next();
  },
}));

const { default: relayRoutes } = await import('../routes/relay.routes.js');

const ORG = 'org-1';
const ADMIN = { userId: 'admin-1', email: 'admin@e.com', organizationId: ORG, role: 'admin', isAdmin: true };
const NON_ADMIN = { userId: 'user-1', email: 'user@e.com', organizationId: ORG, role: 'user', isAdmin: false };

/** Per-test knobs read by the db mock. */
let configRow: { relay_enabled: boolean; writes_enabled: boolean } | null;
let ruleRows: any[];
let deleteRowCount: number;

function primeDb(): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('FROM relay_config')) {
      return { rows: configRow ? [configRow] : [] };
    }
    if (text.includes('INSERT INTO relay_config')) {
      return { rows: [] };
    }
    if (text.includes('INSERT INTO relay_rules')) {
      // Echo a stored row shaped like the DB columns createRelayRule RETURNs.
      return {
        rows: [
          {
            id: 'rule-new',
            effect: 'allow',
            match_pattern: 'admin.directory.users:GET',
            subject_allow_privileged: false,
            subject_org_units: null,
            expires_at: null,
            access_group_id: null,
            created_by: ADMIN.userId,
            created_at: '2026-08-25T00:00:00.000Z',
          },
        ],
      };
    }
    if (text.includes('DELETE FROM relay_rules')) {
      return { rows: [], rowCount: deleteRowCount };
    }
    if (text.includes('FROM relay_rules')) {
      return { rows: ruleRows };
    }
    return { rows: [] };
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/organization/relay', relayRoutes);
  return app;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockSetFlag.mockReset();
  currentUser = { ...ADMIN };
  configRow = { relay_enabled: true, writes_enabled: false };
  ruleRows = [];
  deleteRowCount = 1;
  mockIsEnabled.mockResolvedValue(true);
  mockSetFlag.mockResolvedValue({});
  primeDb();
});

// ---------------------------------------------------------------------------
// 1. Admin gate
// ---------------------------------------------------------------------------

describe('admin gate', () => {
  it('refuses 403 for a non-admin on GET /config', async () => {
    currentUser = { ...NON_ADMIN };
    const res = await request(buildApp()).get('/api/v1/organization/relay/config');
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses 403 for a non-admin on POST /rules (nothing written)', async () => {
    currentUser = { ...NON_ADMIN };
    const res = await request(buildApp())
      .post('/api/v1/organization/relay/rules')
      .send({ effect: 'allow', match_pattern: 'admin.directory.users:GET' });
    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses 401 when unauthenticated', async () => {
    currentUser = null;
    const res = await request(buildApp()).get('/api/v1/organization/relay/rules');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2. Config GET/PUT
// ---------------------------------------------------------------------------

describe('GET /config', () => {
  it('returns the org toggles plus the global flag and enforcement_active', async () => {
    configRow = { relay_enabled: true, writes_enabled: true };
    mockIsEnabled.mockResolvedValue(true);
    const res = await request(buildApp()).get('/api/v1/organization/relay/config');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      relay_enabled: true,
      writes_enabled: true,
      feature_flag_enabled: true,
      enforcement_active: true,
    });
  });

  it('enforcement_active is false when the global flag is off even if relay_enabled', async () => {
    configRow = { relay_enabled: true, writes_enabled: false };
    mockIsEnabled.mockResolvedValue(false);
    const res = await request(buildApp()).get('/api/v1/organization/relay/config');
    expect(res.body.data.enforcement_active).toBe(false);
  });

  it('reports a fresh org (no config row) as closed', async () => {
    configRow = null;
    const res = await request(buildApp()).get('/api/v1/organization/relay/config');
    expect(res.body.data.relay_enabled).toBe(false);
    expect(res.body.data.writes_enabled).toBe(false);
  });
});

describe('PUT /config', () => {
  it('a partial update merges over the current row (writes_enabled untouched)', async () => {
    configRow = { relay_enabled: false, writes_enabled: true };
    const res = await request(buildApp())
      .put('/api/v1/organization/relay/config')
      .send({ relay_enabled: true }); // only relay_enabled

    expect(res.status).toBe(200);
    const upsert = mockQuery.mock.calls.find(([t]) => t.includes('INSERT INTO relay_config'));
    expect(upsert).toBeDefined();
    // setRelayConfig(org, { relayEnabled, writesEnabled }) → params [org, relay, writes]
    expect(upsert![1]).toEqual([ORG, true, true]);
    expect(res.body.data.writes_enabled).toBe(true);
  });

  it('flips the global api_relay feature flag when feature_flag_enabled is given', async () => {
    const res = await request(buildApp())
      .put('/api/v1/organization/relay/config')
      .send({ relay_enabled: true, feature_flag_enabled: true });
    expect(res.status).toBe(200);
    expect(mockSetFlag).toHaveBeenCalledWith('api_relay', true);
    expect(res.body.data.feature_flag_enabled).toBe(true);
  });

  it('does not touch the feature flag when feature_flag_enabled is omitted', async () => {
    await request(buildApp())
      .put('/api/v1/organization/relay/config')
      .send({ writes_enabled: true })
      .expect(200);
    expect(mockSetFlag).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean toggle with 400', async () => {
    const res = await request(buildApp())
      .put('/api/v1/organization/relay/config')
      .send({ relay_enabled: 'yes' });
    expect(res.status).toBe(400);
    expect(mockQuery.mock.calls.some(([t]) => t.includes('INSERT INTO relay_config'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Rules CRUD
// ---------------------------------------------------------------------------

describe('GET /rules', () => {
  it('lists the org rules (org-scoped query)', async () => {
    ruleRows = [
      {
        id: 'r1',
        effect: 'allow',
        match_pattern: 'admin.directory.users:GET',
        subject_allow_privileged: false,
        subject_org_units: null,
        expires_at: null,
        access_group_id: null,
        created_by: null,
        created_at: '2026-08-25T00:00:00.000Z',
      },
    ];
    const res = await request(buildApp()).get('/api/v1/organization/relay/rules');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: 'r1', matchPattern: 'admin.directory.users:GET' });
    const select = mockQuery.mock.calls.find(([t]) => t.includes('FROM relay_rules'));
    expect(select![0]).toContain('organization_id = $1');
    expect(select![1]).toEqual([ORG]);
  });
});

describe('POST /rules', () => {
  it('creates a valid allow rule → 201 with the mapped row', async () => {
    const res = await request(buildApp())
      .post('/api/v1/organization/relay/rules')
      .send({ effect: 'allow', match_pattern: 'admin.directory.users:GET' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: 'rule-new',
      effect: 'allow',
      matchPattern: 'admin.directory.users:GET',
      subjectAllowPrivileged: false,
    });
    const insert = mockQuery.mock.calls.find(([t]) => t.includes('INSERT INTO relay_rules'));
    // org first, created_by (admin) last.
    expect(insert![1]![0]).toBe(ORG);
    expect(insert![1]![7]).toBe(ADMIN.userId);
  });

  it('accepts subject/OU/expiry and passes them through', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request(buildApp())
      .post('/api/v1/organization/relay/rules')
      .send({
        effect: 'allow',
        match_pattern: 'admin.directory.users:GET',
        subject_allow_privileged: true,
        subject_org_units: ['/Sales', '/Eng'],
        expires_at: future,
      });
    expect(res.status).toBe(201);
    const insert = mockQuery.mock.calls.find(([t]) => t.includes('INSERT INTO relay_rules'))!;
    expect(insert[1]![3]).toBe(true); // subject_allow_privileged
    expect(insert[1]![4]).toBe(JSON.stringify(['/Sales', '/Eng'])); // subject_org_units JSONB
    expect(insert[1]![5]).toBeInstanceOf(Date); // expires_at
  });

  it('rejects an invalid effect with 400 (nothing written)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/organization/relay/rules')
      .send({ effect: 'maybe', match_pattern: 'admin.directory.users:GET' });
    expect(res.status).toBe(400);
    expect(mockQuery.mock.calls.some(([t]) => t.includes('INSERT INTO relay_rules'))).toBe(false);
  });

  it('rejects a malformed match_pattern with 400', async () => {
    const bad = ['UPPER.Case:GET', 'admin.directory.users:FROBNICATE', ''];
    for (const match_pattern of bad) {
      const res = await request(buildApp())
        .post('/api/v1/organization/relay/rules')
        .send({ effect: 'allow', match_pattern });
      expect(res.status).toBe(400);
    }
    expect(mockQuery.mock.calls.some(([t]) => t.includes('INSERT INTO relay_rules'))).toBe(false);
  });

  it('rejects an invalid expires_at with 400', async () => {
    const res = await request(buildApp())
      .post('/api/v1/organization/relay/rules')
      .send({ effect: 'allow', match_pattern: '*', expires_at: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('accepts the bare wildcard and method wildcards', async () => {
    for (const match_pattern of ['*', 'admin.directory.users:*', 'admin.directory.*:GET']) {
      const res = await request(buildApp())
        .post('/api/v1/organization/relay/rules')
        .send({ effect: 'allow', match_pattern });
      expect(res.status).toBe(201);
    }
  });
});

describe('DELETE /rules/:id', () => {
  it('deletes an existing rule (org-scoped) → 200', async () => {
    deleteRowCount = 1;
    const res = await request(buildApp()).delete('/api/v1/organization/relay/rules/r1');
    expect(res.status).toBe(200);
    const del = mockQuery.mock.calls.find(([t]) => t.includes('DELETE FROM relay_rules'))!;
    expect(del[0]).toContain('organization_id = $2');
    expect(del[1]).toEqual(['r1', ORG]);
  });

  it('returns 404 when the rule is missing or belongs to another org', async () => {
    deleteRowCount = 0;
    const res = await request(buildApp()).delete('/api/v1/organization/relay/rules/nope');
    expect(res.status).toBe(404);
  });
});
