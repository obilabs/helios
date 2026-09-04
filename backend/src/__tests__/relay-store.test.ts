/**
 * Tests for the relay authoring STORE helpers (services/relay/store.ts) and,
 * crucially, the round-trip: a rule authored through createRelayRule, once
 * loaded back by loadRelayRuleSet, drives the pure policy engine (evaluate())
 * to the intended allow/deny verdict.
 *
 * This is the "policy" half the finished gate needs — proving the admin
 * authoring surface is actually wired to enforcement, not just persisted. The
 * database is mocked; the policy engine runs for real.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

const {
  createRelayRule,
  listRelayRules,
  deleteRelayRule,
  loadRelayRuleSet,
  setRelayConfig,
} = await import('../services/relay/store.js');
const { evaluate } = await import('../services/relay/policy.js');

const ORG = 'org-1';
const ENABLED = { relayEnabled: true, writesEnabled: true };

function desc(resource: string, method: string, extra: Record<string, unknown> = {}) {
  return { cloud: 'google' as const, resource, method, ...extra };
}

beforeEach(() => {
  mockQuery.mockReset();
});

// ---------------------------------------------------------------------------
// createRelayRule — the INSERT shape
// ---------------------------------------------------------------------------

describe('createRelayRule', () => {
  it('inserts the org-scoped rule and maps the stored row to camelCase', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'r-1',
          effect: 'allow',
          match_pattern: 'admin.directory.users:GET',
          subject_allow_privileged: false,
          subject_org_units: null,
          expires_at: null,
          access_group_id: null,
          created_by: 'admin-1',
          created_at: '2026-08-25T00:00:00.000Z',
        },
      ],
    });

    const rule = await createRelayRule(
      ORG,
      { effect: 'allow', matchPattern: 'admin.directory.users:GET' },
      'admin-1',
    );

    expect(rule).toEqual({
      id: 'r-1',
      effect: 'allow',
      matchPattern: 'admin.directory.users:GET',
      subjectAllowPrivileged: false,
      subjectOrgUnits: null,
      expiresAt: null,
      accessGroupId: null,
      createdBy: 'admin-1',
      createdAt: '2026-08-25T00:00:00.000Z',
    });

    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO relay_rules');
    expect(params![0]).toBe(ORG);
    expect(params![7]).toBe('admin-1'); // created_by
  });

  it('serializes OU scoping to JSON and passes a Date for expiry', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'r', effect: 'allow', match_pattern: 'x:GET' }] });
    const future = new Date(Date.now() + 60_000).toISOString();
    await createRelayRule(ORG, {
      effect: 'allow',
      matchPattern: 'admin.directory.users:GET',
      subjectAllowPrivileged: true,
      subjectOrgUnits: ['/Sales'],
      expiresAt: future,
    });
    const params = mockQuery.mock.calls[0]![1]!;
    expect(params[3]).toBe(true); // subject_allow_privileged
    expect(params[4]).toBe(JSON.stringify(['/Sales'])); // subject_org_units
    expect(params[5]).toBeInstanceOf(Date); // expires_at
  });

  it('stores an empty OU array as NULL (no scoping), not "[]"', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'r', effect: 'allow', match_pattern: 'x:GET' }] });
    await createRelayRule(ORG, {
      effect: 'allow',
      matchPattern: 'admin.directory.users:GET',
      subjectOrgUnits: [],
    });
    expect(mockQuery.mock.calls[0]![1]![4]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listRelayRules / deleteRelayRule
// ---------------------------------------------------------------------------

describe('listRelayRules', () => {
  it('maps rows and queries only this organization', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'r1',
          effect: 'deny',
          match_pattern: '*',
          subject_allow_privileged: false,
          subject_org_units: ['/Sales'],
          expires_at: '2026-09-01T00:00:00.000Z',
          access_group_id: 'g1',
          created_by: null,
          created_at: '2026-08-25T00:00:00.000Z',
        },
      ],
    });
    const rules = await listRelayRules(ORG);
    expect(rules[0]).toMatchObject({
      id: 'r1',
      effect: 'deny',
      matchPattern: '*',
      subjectOrgUnits: ['/Sales'],
      expiresAt: '2026-09-01T00:00:00.000Z',
      accessGroupId: 'g1',
    });
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('WHERE organization_id = $1');
    expect(params).toEqual([ORG]);
  });
});

describe('deleteRelayRule', () => {
  it('returns true when a row is removed', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    expect(await deleteRelayRule(ORG, 'r1')).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('AND organization_id = $2'); // never cross-org
    expect(params).toEqual(['r1', ORG]);
  });

  it('returns false when nothing matched (missing or foreign rule)', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await deleteRelayRule(ORG, 'nope')).toBe(false);
  });
});

describe('setRelayConfig', () => {
  it('upserts both toggles for the org', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await setRelayConfig(ORG, { relayEnabled: true, writesEnabled: false });
    const [sql, params] = mockQuery.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO relay_config');
    expect(params).toEqual([ORG, true, false]);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: authored rows → loadRelayRuleSet → evaluate() (the wiring proof)
// ---------------------------------------------------------------------------

describe('authored rules drive the policy engine end-to-end', () => {
  /** Prime the db mock so loadRelayRuleSet returns these DB-shaped rows. */
  function withRules(rows: any[]): void {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM relay_rules')) return { rows };
      return { rows: [] };
    });
  }

  it('an authored allow row makes evaluate() permit exactly that read', async () => {
    withRules([
      {
        id: 'a1',
        effect: 'allow',
        match_pattern: 'admin.directory.users:GET',
        subject_allow_privileged: false,
        subject_org_units: null,
        expires_at: null,
      },
    ]);
    const ruleSet = await loadRelayRuleSet(ORG);
    expect(evaluate(desc('admin.directory.users', 'GET'), ruleSet, ENABLED).allow).toBe(true);
    // A different resource is still default-denied.
    expect(evaluate(desc('admin.directory.groups', 'GET'), ruleSet, ENABLED).reason).toBe(
      'default-deny',
    );
  });

  it('an authored deny row overrides an authored allow (org-deny kill switch)', async () => {
    withRules([
      { id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:*' },
      { id: 'd1', effect: 'deny', match_pattern: 'admin.directory.users:DELETE' },
    ]);
    const ruleSet = await loadRelayRuleSet(ORG);
    const d = evaluate(desc('admin.directory.users', 'DELETE'), ruleSet, ENABLED);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('org-deny');
    expect(d.matchedRuleId).toBe('d1');
  });

  it('an authored expiry is honored: an expired allow no longer permits', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    withRules([
      { id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:GET', expires_at: past },
    ]);
    const ruleSet = await loadRelayRuleSet(ORG);
    expect(evaluate(desc('admin.directory.users', 'GET'), ruleSet, ENABLED).reason).toBe(
      'default-deny',
    );
  });

  it('an authored subject_allow_privileged row lets evaluate() act on a privileged subject', async () => {
    withRules([
      {
        id: 'a1',
        effect: 'allow',
        match_pattern: 'admin.directory.users:GET',
        subject_allow_privileged: true,
      },
    ]);
    const ruleSet = await loadRelayRuleSet(ORG);
    const d = evaluate(
      desc('admin.directory.users', 'GET', { subjectPrivileged: true }),
      ruleSet,
      ENABLED,
    );
    expect(d.allow).toBe(true);
  });

  it('an authored OU-scoped row denies a subject outside the OU', async () => {
    withRules([
      {
        id: 'a1',
        effect: 'allow',
        match_pattern: 'admin.directory.users:GET',
        subject_org_units: ['/Sales'],
      },
    ]);
    const ruleSet = await loadRelayRuleSet(ORG);
    expect(
      evaluate(
        desc('admin.directory.users', 'GET', { subject: 'x', subjectOrgUnit: '/Eng' }),
        ruleSet,
        ENABLED,
      ).reason,
    ).toBe('subject-out-of-scope');
    expect(
      evaluate(
        desc('admin.directory.users', 'GET', { subject: 'x', subjectOrgUnit: '/Sales' }),
        ruleSet,
        ENABLED,
      ).allow,
    ).toBe(true);
  });
});
