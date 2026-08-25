/**
 * Integration tests for the transparent proxy WITH relay enforcement wired in
 * (middleware/transparent-proxy.ts + services/relay/enforce.ts), everything
 * external mocked: database, feature flags, Google credentials, axios, JWT.
 *
 * What matters here:
 *   - flag OFF  => byte-identical legacy behavior: request forwards, JWT is
 *     minted with the legacy BROAD scopes (the safety guarantee)
 *   - flag ON   => a deny returns 403 and NOTHING reaches Google (no token
 *     exchange, no forward), and the denial is audited
 *   - flag ON + allow => forwards with ONLY the minimal scopes minted
 *   - batches route through deny-on-unparseable batch authorization
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

// ---- mocks (must be registered before the dynamic import) ----

type QueryResult = { rows: any[] };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'user-1',
      email: 'admin@corp.test',
      role: 'admin',
      organizationId: 'org-1',
      isAdmin: true,
      isEmployee: true,
    };
    next();
  },
}));

jest.unstable_mockModule('../services/gw-credentials.js', () => ({
  decodeServiceAccountKey: jest.fn<(stored: unknown) => { client_email: string; private_key: string }>(
    () => ({
      client_email: 'sa@helios-test.iam.gserviceaccount.com',
      private_key: 'FAKE-PRIVATE-KEY',
    }),
  ),
}));

const mockTrackApiCall = jest.fn();
jest.unstable_mockModule('../services/telemetry.service.js', () => ({
  telemetryService: { trackApiCall: mockTrackApiCall },
}));

const mockIsEnabled = jest.fn<(key: string) => Promise<boolean>>();
jest.unstable_mockModule('../services/feature-flags.service.js', () => ({
  featureFlagsService: { isEnabled: mockIsEnabled },
}));

const mockSign = jest.fn<(payload: any, key: any, options?: any) => string>(() => 'signed-jwt');
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { sign: mockSign },
}));

// axios is used both as axios(config) [the forward] and axios.post [the token
// exchange]; the mock must be callable and carry .post.
const mockAxiosForward = jest.fn<(config: any) => Promise<any>>();
const mockAxiosPost = jest.fn<(url: string, body: any) => Promise<any>>();
jest.unstable_mockModule('axios', () => ({
  default: Object.assign(
    (config: any): Promise<any> => mockAxiosForward(config),
    { post: mockAxiosPost },
  ),
}));

const { default: transparentProxyRouter } = await import('../middleware/transparent-proxy.js');
const { REQUIRED_SCOPES } = await import('../config/google-scopes.js');

// ---- fixtures ----

// Flag OFF mints the FULL set of DWD-authorized scopes (the generic-proxy
// default — every API family reachable). This used to be only the 4 broad
// admin.directory scopes; it was widened when the proxy became host-generic.
const FLAG_OFF_SCOPES = REQUIRED_SCOPES.join(' ');

const READONLY_USER_SCOPE = 'https://www.googleapis.com/auth/admin.directory.user.readonly';

interface RuleRow {
  id: string;
  effect: 'allow' | 'deny';
  match_pattern: string;
}

function toDbRow(r: RuleRow): Record<string, unknown> {
  return {
    subject_allow_privileged: false,
    subject_org_units: null,
    expires_at: null,
    ...r,
  };
}

function primeDb(opts: {
  config?: { relay_enabled: boolean; writes_enabled: boolean } | null;
  rules?: RuleRow[];
}): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('INSERT INTO activity_logs')) return { rows: [{ id: 'audit-1' }] };
    if (text.includes('FROM gw_credentials')) {
      return { rows: [{ service_account_key: 'encrypted', admin_email: 'admin@corp.test' }] };
    }
    if (text.includes('FROM relay_config')) return { rows: opts.config ? [opts.config] : [] };
    if (text.includes('FROM relay_rules')) {
      return { rows: (opts.rules ?? []).map(toDbRow) };
    }
    return { rows: [] };
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  // Deliver multipart/mixed batch bodies as raw strings so the batch
  // authorization path can parse them (mirrors what a raw-body capture
  // middleware would provide in production).
  app.use(express.text({ type: 'multipart/mixed' }));
  app.use(transparentProxyRouter);
  return app;
}

/** The scope string minted into the Google JWT on the last sign call. */
function lastMintedScope(): string {
  expect(mockSign).toHaveBeenCalled();
  const payload = mockSign.mock.calls[mockSign.mock.calls.length - 1][0] as any;
  return payload.scope;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAxiosPost.mockResolvedValue({ data: { access_token: 'fake-token', expires_in: 3600 } });
  mockAxiosForward.mockResolvedValue({ status: 200, data: { ok: true }, headers: {} });
  primeDb({ config: null, rules: [] });
});

describe('feature flag OFF — behavior identical to the legacy proxy', () => {
  beforeEach(() => {
    mockIsEnabled.mockResolvedValue(false);
  });

  it('forwards a GET to Google and mints the full flag-off scopes', async () => {
    const res = await request(buildApp()).get('/api/google/admin/directory/v1/users').expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockAxiosPost).toHaveBeenCalledTimes(1); // token exchange happened
    expect(mockAxiosForward).toHaveBeenCalledTimes(1); // forward happened
    expect(mockAxiosForward.mock.calls[0][0].url).toBe(
      'https://admin.googleapis.com/admin/directory/v1/users',
    );
    expect(lastMintedScope()).toBe(FLAG_OFF_SCOPES);
  });

  it('even a DELETE with zero configured rules passes through (no enforcement)', async () => {
    await request(buildApp())
      .delete('/api/google/admin/directory/v1/users/x%40e.com')
      .expect(200);
    expect(mockAxiosForward).toHaveBeenCalledTimes(1);
    expect(lastMintedScope()).toBe(FLAG_OFF_SCOPES);
  });
});

describe('feature flag ON — deny paths never reach Google', () => {
  beforeEach(() => {
    mockIsEnabled.mockResolvedValue(true);
  });

  it('default-deny: no rules => 403, no token exchange, no forward', async () => {
    primeDb({ config: { relay_enabled: true, writes_enabled: false }, rules: [] });
    const res = await request(buildApp()).get('/api/google/admin/directory/v1/users').expect(403);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe('default-deny');
    expect(mockAxiosPost).not.toHaveBeenCalled();
    expect(mockAxiosForward).not.toHaveBeenCalled();
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('org never opted in (no relay_config row) => 403 relay-disabled', async () => {
    primeDb({ config: null, rules: [] });
    const res = await request(buildApp()).get('/api/google/admin/directory/v1/users').expect(403);
    expect(res.body.reason).toBe('relay-disabled');
    expect(mockAxiosForward).not.toHaveBeenCalled();
  });

  it('delete under a wildcard allow => 403 delete-requires-explicit-rule', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:*' }],
    });
    const res = await request(buildApp())
      .delete('/api/google/admin/directory/v1/users/x%40e.com')
      .expect(403);
    expect(res.body.reason).toBe('delete-requires-explicit-rule');
    expect(mockAxiosForward).not.toHaveBeenCalled();
  });

  it('records the denial to the audit trail', async () => {
    primeDb({ config: { relay_enabled: true, writes_enabled: false }, rules: [] });
    await request(buildApp()).get('/api/google/admin/directory/v1/users').expect(403);
    const auditUpdate = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE activity_logs'),
    );
    expect(auditUpdate).toBeDefined();
    const metadata = JSON.parse((auditUpdate![1] as unknown[])[0] as string);
    expect(metadata.error).toBe('relay-denied: default-deny');
    expect(metadata.relayDecision).toMatchObject({
      enforced: true,
      allowed: false,
      reason: 'default-deny',
    });
  });

  it('a batch smuggling a DELETE among reads is denied and never forwarded', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:*' }],
    });
    const B = 'proxy_batch_boundary';
    const body =
      `--${B}\r\nContent-Type: application/http\r\n\r\nGET /admin/directory/v1/users/a@e.com HTTP/1.1\r\n` +
      `--${B}\r\nContent-Type: application/http\r\n\r\nDELETE /admin/directory/v1/users/b@e.com HTTP/1.1\r\n` +
      `--${B}--`;
    const res = await request(buildApp())
      .post('/api/google/batch/admin/directory_v1')
      .set('Content-Type', `multipart/mixed; boundary=${B}`)
      .send(body)
      .expect(403);
    expect(res.body.reason).toBe('sub-denied');
    expect(mockAxiosForward).not.toHaveBeenCalled();
  });

  it('an unparseable batch is denied, not passed through', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: true },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: '*' }],
    });
    const res = await request(buildApp())
      .post('/api/google/batch/admin/directory_v1')
      .set('Content-Type', 'multipart/mixed; boundary=whatever')
      .send('garbage that is not multipart')
      .expect(403);
    expect(res.body.reason).toBe('batch-unparseable');
    expect(mockAxiosForward).not.toHaveBeenCalled();
  });
});

describe('feature flag ON — a valid allow forwards with minimal scopes', () => {
  beforeEach(() => {
    mockIsEnabled.mockResolvedValue(true);
  });

  it('an allowed read forwards and mints ONLY the readonly scope', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: false },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:GET' }],
    });
    const res = await request(buildApp()).get('/api/google/admin/directory/v1/users').expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockAxiosForward).toHaveBeenCalledTimes(1);
    expect(lastMintedScope()).toBe(READONLY_USER_SCOPE);
    expect(lastMintedScope()).not.toContain(
      'https://www.googleapis.com/auth/admin.directory.group',
    );
  });

  it('records the allow decision to the audit trail', async () => {
    primeDb({
      config: { relay_enabled: true, writes_enabled: false },
      rules: [{ id: 'a1', effect: 'allow', match_pattern: 'admin.directory.users:GET' }],
    });
    await request(buildApp()).get('/api/google/admin/directory/v1/users').expect(200);
    const auditUpdate = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE activity_logs'),
    );
    expect(auditUpdate).toBeDefined();
    const metadata = JSON.parse((auditUpdate![1] as unknown[])[0] as string);
    expect(metadata.relayDecision).toMatchObject({
      enforced: true,
      allowed: true,
      reason: 'allow',
      matchedRuleId: 'a1',
    });
  });
});
