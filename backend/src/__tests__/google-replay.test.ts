/**
 * Record/Replay harness — sample + unit coverage.
 *
 * The headline test drives a REAL proxy request (middleware/transparent-proxy.ts)
 * end to end with everything external mocked EXCEPT the outbound Google calls,
 * which are served from a recorded fixture by the replay harness — no network,
 * fully deterministic. It proves:
 *   - the proxy reaches the harness for both the token exchange and the API call,
 *   - the recorded admin.directory users.list response is returned verbatim, and
 *   - the proxy PARSES that response (intelligentSync upserts each user).
 *
 * The remaining tests cover the harness helpers other agents will use directly:
 * fixture loading, the {method,host,path} match key (a miss throws loudly), and
 * the record-mode name derivation.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

// ---- mocks (registered before the dynamic import of the proxy) ----

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
  decodeServiceAccountKey: jest.fn(() => ({
    client_email: 'sa@helios-test.iam.gserviceaccount.com',
    private_key: 'FAKE-PRIVATE-KEY',
  })),
}));

jest.unstable_mockModule('../services/telemetry.service.js', () => ({
  telemetryService: { trackApiCall: jest.fn() },
}));

const mockIsEnabled = jest.fn<(key: string) => Promise<boolean>>();
jest.unstable_mockModule('../services/feature-flags.service.js', () => ({
  featureFlagsService: { isEnabled: mockIsEnabled },
}));

// jwt.sign is real (jsonwebtoken) but our private key is fake; stub the signer.
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { sign: jest.fn(() => 'signed-jwt') },
}));

// NOTE: axios is deliberately NOT mocked — the replay harness intercepts the
// two Google calls instead, which is the whole point of this test.

const { default: transparentProxyRouter } = await import('../middleware/transparent-proxy.js');
const {
  loadGoogleFixture,
  useGoogleReplay,
  resetGoogleReplay,
  deriveFixtureName,
  fixturesRoot,
} = await import('../testing/google-replay.js');

// ---- helpers ----

function primeDb(): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('INSERT INTO activity_logs')) return { rows: [{ id: 'audit-1' }] };
    if (text.includes('FROM gw_credentials')) {
      return { rows: [{ service_account_key: 'encrypted', admin_email: 'admin@corp.test' }] };
    }
    // organization_users upserts, activity_logs UPDATE, relay tables, etc.
    return { rows: [] };
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(transparentProxyRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsEnabled.mockResolvedValue(false); // relay flag OFF => legacy passthrough
  primeDb();
});

afterEach(() => {
  resetGoogleReplay();
});

describe('sample: replay admin.directory users.list through the proxy', () => {
  it('serves the recorded response offline and the proxy parses it', async () => {
    const fixture = loadGoogleFixture('admin.directory', 'users.list');
    useGoogleReplay(fixture);

    const res = await request(buildApp())
      .get('/api/google/admin/directory/v1/users')
      .query({ domain: 'example.com', maxResults: '100' })
      .expect(200);

    // 1. The recorded body is returned verbatim.
    expect(res.body).toEqual(fixture.response.data);
    expect(res.body.kind).toBe('admin#directory#users');
    expect(res.body.users).toHaveLength(3);
    expect(res.body.users.map((u: any) => u.primaryEmail)).toEqual([
      'user1@example.com',
      'user2@example.com',
      'user3@example.com',
    ]);

    // 2. The proxy actually PARSED the replayed response: intelligentSync
    //    upserts each user into organization_users.
    const userUpserts = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO organization_users'),
    );
    expect(userUpserts).toHaveLength(3);

    // Spot-check that nested fields (name / orgUnitPath / suspended) parsed.
    const turing = userUpserts.find((c) => (c[1] as unknown[])[1] === 'user2@example.com');
    expect(turing).toBeDefined();
    const params = turing![1] as unknown[];
    expect(params[2]).toBe('Alan'); // first_name  <- name.givenName
    expect(params[3]).toBe('Turing'); // last_name  <- name.familyName
    expect(params[8]).toBe('/Engineering'); // org_unit_path
  });

  it('a request with no matching fixture throws loudly instead of hitting Google', async () => {
    useGoogleReplay(loadGoogleFixture('admin.directory', 'users.list'));

    // GET .../groups has no loaded fixture -> the harness throws -> proxy 500,
    // and critically it never reached the network.
    const res = await request(buildApp()).get('/api/google/admin/directory/v1/groups');
    expect(res.status).toBe(500);
  });
});

describe('harness helpers', () => {
  it('loadGoogleFixture reads from the fixtures root', () => {
    const fx = loadGoogleFixture('admin.directory', 'users.list');
    expect(fx.request).toMatchObject({
      method: 'GET',
      host: 'admin.googleapis.com',
      path: 'admin/directory/v1/users',
    });
    expect(fixturesRoot().replace(/\\/g, '/')).toContain('__tests__/fixtures/google');
  });

  it('loadGoogleFixture throws a clear error for a missing fixture', () => {
    expect(() => loadGoogleFixture('admin.directory', 'nope')).toThrow(/fixture not found/);
  });

  it('deriveFixtureName maps method+path to canonical-ish names', () => {
    expect(deriveFixtureName('GET', 'admin/directory/v1/users')).toEqual({
      family: 'admin.directory',
      name: 'users.list',
    });
    expect(deriveFixtureName('GET', 'admin/directory/v1/users/jane@example.com')).toEqual({
      family: 'admin.directory',
      name: 'users.get',
    });
    expect(deriveFixtureName('POST', 'admin/directory/v1/groups')).toEqual({
      family: 'admin.directory',
      name: 'groups.post',
    });
    expect(deriveFixtureName('GET', 'gmail/v1/users/me/settings/forwarding').family).toBe('gmail');
  });
});
