/**
 * Tests for the relay ENFORCEMENT seam (services/relay/enforce.ts) — the glue
 * between the transparent proxy and the pure policy engine, with the database
 * and feature-flag service mocked.
 *
 * The deny paths are the point: flag ON must mean deny-by-default, and every
 * engine reason (org-deny, ceiling, delete-explicit, writes toggle, batch
 * smuggling, unparseable batch, missing scope mapping) must surface as a
 * non-forwarding denial.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

type QueryResult = { rows: any[] };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

const mockIsEnabled = jest.fn<(key: string) => Promise<boolean>>();
jest.unstable_mockModule('../services/feature-flags.service.js', () => ({
  featureFlagsService: { isEnabled: mockIsEnabled },
}));

const { enforceRelayAuthorization, isBatchRequest, RELAY_FEATURE_FLAG } = await import(
  '../services/relay/enforce.js'
);

const ORG = 'org-1';

interface RuleRow {
  id: string;
  effect: 'allow' | 'deny';
  match_pattern: string;
  subject_allow_privileged?: boolean;
  subject_org_units?: string[] | null;
  expires_at?: string | null;
}

function toDbRow(r: RuleRow): Required<RuleRow> {
  return {
    subject_allow_privileged: false,
    subject_org_units: null,
    expires_at: null,
    ...r,
  } as Required<RuleRow>;
}

/** Prime the mocked DB with a relay_config row and relay_rules rows. */
function primeDb(opts: {
  config?: { relay_enabled: boolean; writes_enabled: boolean } | null;
  rules?: RuleRow[];
}): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('FROM relay_config')) {
      return { rows: opts.config ? [opts.config] : [] };
    }
    if (text.includes('FROM relay_rules')) {
      return { rows: (opts.rules ?? []).map(toDbRow) };
    }
    return { rows: [] };
  });
}

const ADMIN = { isAdmin: true, patterns: [] as string[] };

function usersGet(overrides: Partial<Parameters<typeof enforceRelayAuthorization>[0]> = {}) {
  return enforceRelayAuthorization({
    organizationId: ORG,
    path: 'admin/directory/v1/users',
    method: 'GET',
    caller: ADMIN,
    ...overrides,
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockIsEnabled.mockReset();
  mockIsEnabled.mockResolvedValue(true); // flag ON unless a test says otherwise
  primeDb({ config: { relay_enabled: true, writes_enabled: false } });
});

describe('feature flag OFF — the safety guarantee', () => {
  it('returns passthrough and never touches the relay tables', async () => {
    mockIsEnabled.mockResolvedValue(false);
    const v = await usersGet();
    expect(v.mode).toBe('passthrough');
    expect(mockIsEnabled).toHaveBeenCalledWith(RELAY_FEATURE_FLAG);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('passthrough even for a DELETE with no rules at all (no enforcement when off)', async () => {
    mockIsEnabled.mockResolvedValue(false);
    primeDb({ config: null, rules: [] });
    const v = await usersGet({ method: 'DELETE', path: 'admin/directory/v1/users/x@e.com' });
    expect(v.mode).toBe('passthrough');
  });
});

describe('flag ON — deny-by-default', () => {
  it('denies when the org has never configured the relay (no config row)', async () => {
    primeDb({ config: null });
    const v = await usersGet();
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('relay-disabled');
  });

  it('denies with default-deny when the relay is enabled but no rule matches', async () => {
    primeDb({ config: { relay_enabled: true, writes_enabled: false }, rules: [] });
    const v = await usersGet();
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('default-deny');
  });

  it('denies when there is no organization id', async () => {
    const v = await usersGet({ organizationId: undefined });
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('default-deny');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('flag ON — engine semantics surface through the seam', () => {
  it('org-deny beats a matching allow', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [
        { id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:GET' },
        { id: 'd1', effect: 'deny', match_pattern: 'admin.directory.users:*' },
      ],
    });
    const v = await usersGet();
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') {
      expect(v.reason).toBe('org-deny');
      expect(v.audit.allowed).toBe(false);
    }
  });

  it('ceiling-exceeded: a non-admin caller with no relay patterns reaches nothing', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:GET' }],
    });
    const v = await usersGet({ caller: { isAdmin: false, patterns: [] } });
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('ceiling-exceeded');
  });

  it('a non-admin caller within their pattern ceiling is allowed', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: false },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:GET' }],
    });
    const v = await usersGet({
      caller: { isAdmin: false, patterns: ['admin.directory.users:GET'] },
    });
    expect(v.mode).toBe('forward');
  });

  it('delete without an EXPLICIT :DELETE rule is denied even under a wildcard allow', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:*' }],
    });
    const v = await usersGet({ method: 'DELETE', path: 'admin/directory/v1/users/x@e.com' });
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('delete-requires-explicit-rule');
  });

  it('writes-disabled: enabling the relay does NOT enable writes', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: false },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:POST' }],
    });
    const v = await usersGet({ method: 'POST' });
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('writes-disabled');
  });

  it('an expired allow rule no longer matches (default-deny)', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: false },
      rules: [
        {
          id: 'a1',
          effect: 'allow',
          match_pattern: 'admin.directory.users:GET',
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    });
    const v = await usersGet();
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('default-deny');
  });
});

describe('flag ON — a valid allow forwards with MINIMAL scopes', () => {
  it('a permitted directory read forwards with only the readonly scope', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: false },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:GET' }],
    });
    const v = await usersGet();
    expect(v.mode).toBe('forward');
    if (v.mode === 'forward') {
      expect(v.scopes).toEqual([
        'https://www.googleapis.com/auth/admin.directory.user.readonly',
      ]);
      expect(v.scopes.join(' ')).not.toMatch(/admin\.directory\.user(?!\.readonly)/);
      expect(v.audit).toMatchObject({ enforced: true, allowed: true, reason: 'allow', matchedRuleId: 'a1' });
    }
  });

  it('an allowed request to a resource with NO scope mapping is denied, never broad-minted', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: false },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: '*' }],
    });
    const v = await usersGet({ path: 'admin/reports/v1/activities' });
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('no-scope-mapping');
  });
});

describe('flag ON — batch requests', () => {
  const B = 'relay_test_boundary';
  const batchBody = (lines: string[]): string =>
    lines
      .map(
        (line) =>
          `--${B}\r\nContent-Type: application/http\r\n\r\n${line} HTTP/1.1\r\nHost: admin.googleapis.com\r\n`,
      )
      .join('') + `--${B}--`;

  const batchInput = (body: unknown): Parameters<typeof enforceRelayAuthorization>[0] => ({
    organizationId: ORG,
    path: 'batch/admin/directory_v1',
    method: 'POST',
    contentType: `multipart/mixed; boundary=${B}`,
    body,
    caller: ADMIN,
  });

  it('detects batches by path and by content type', () => {
    expect(isBatchRequest('batch/admin/directory_v1')).toBe(true);
    expect(isBatchRequest('admin/directory/v1/users', 'multipart/mixed; boundary=x')).toBe(true);
    expect(isBatchRequest('admin/directory/v1/users', 'application/json')).toBe(false);
  });

  it('a batch smuggling a DELETE among reads is denied wholesale', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:*' }],
    });
    const body = batchBody([
      'GET /admin/directory/v1/users/a@e.com',
      'DELETE /admin/directory/v1/users/b@e.com',
      'GET /admin/directory/v1/users/c@e.com',
    ]);
    const v = await enforceRelayAuthorization(batchInput(body));
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') {
      expect(v.reason).toBe('sub-denied');
      expect(v.audit.batch?.deniedIndex).toBe(1);
      expect(v.audit.batch?.subReasons?.[1]).toBe('delete-requires-explicit-rule');
    }
  });

  it('an all-allowed batch forwards with the union of minimal read scopes', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: false },
      rules: [
        { id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:GET' },
        { id: 'a2', effect: 'allow', match_pattern: 'admin.directory.groups:GET' },
      ],
    });
    const body = batchBody([
      'GET /admin/directory/v1/users/a@e.com',
      'GET /admin/directory/v1/groups/g@e.com',
    ]);
    const v = await enforceRelayAuthorization(batchInput(body));
    expect(v.mode).toBe('forward');
    if (v.mode === 'forward') {
      expect(v.scopes).toEqual(
        expect.arrayContaining([
          'https://www.googleapis.com/auth/admin.directory.user.readonly',
          'https://www.googleapis.com/auth/admin.directory.group.readonly',
        ]),
      );
      expect(v.scopes.join(' ')).not.toMatch(/user(?!\.readonly)/);
    }
  });

  it('an unparseable batch body is denied, never passed through', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: '*' }],
    });
    const v = await enforceRelayAuthorization(batchInput('this is not multipart at all'));
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('batch-unparseable');
  });

  it('a non-string batch body (express parsed it away) is denied, never passed through', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: '*' }],
    });
    const v = await enforceRelayAuthorization(batchInput({}));
    expect(v.mode).toBe('deny');
    if (v.mode === 'deny') expect(v.reason).toBe('batch-unparseable');
  });
});

describe('fail-closed on storage errors', () => {
  it('propagates a DB failure instead of silently allowing', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(usersGet()).rejects.toThrow('db down');
  });
});
