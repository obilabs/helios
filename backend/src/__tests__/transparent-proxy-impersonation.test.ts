/**
 * Per-user impersonation through the transparent proxy.
 *
 * The proxy uses domain-wide delegation: it mints a service-account JWT whose
 * `sub` decides WHICH user Google acts as. Historically `sub` was always the org
 * admin, so per-user Gmail/Calendar settings for a DIFFERENT user (forwarding,
 * vacation, signature, delegates, calendar sharing for user X) 403'd. A caller
 * now selects the target with an `X-Impersonate-User` header.
 *
 * These tests drive a REAL proxy request end to end with everything external
 * mocked EXCEPT the outbound Google calls, which the replay harness serves from
 * an in-memory fixture (no network). `jwt.sign` is stubbed so we can inspect the
 * exact payload — specifically its `sub`. They prove:
 *   1. the header sets the JWT `sub` to the impersonated user,
 *   2. with no header the `sub` falls back to the org admin (legacy behavior),
 *   3. a cross-domain target is rejected 403 and NOTHING is forwarded (no token
 *      minted, no Google call), and
 *   4. the impersonated subject is recorded on the audit row.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';
import type { GoogleFixture } from '../testing/google-replay.js';

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

// jwt.sign is real (jsonwebtoken) but our private key is fake; stub the signer
// and capture the payload so we can assert on `sub`.
const mockSign = jest.fn((_payload: any, _key: any, _opts: any) => 'signed-jwt');
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { sign: mockSign },
}));

// NOTE: axios is deliberately NOT mocked — the replay harness intercepts the
// two Google calls instead.

const { default: transparentProxyRouter } = await import('../middleware/transparent-proxy.js');
const { useGoogleReplay, resetGoogleReplay } = await import('../testing/google-replay.js');

// ---- fixtures / helpers ----

const ADMIN_EMAIL = 'admin@corp.test';
const ORG_DOMAIN = 'corp.test';
const TARGET_USER = 'alice@corp.test';

/** An in-memory Gmail vacation fixture for TARGET_USER's mailbox. */
function vacationFixture(userId: string): GoogleFixture {
  return {
    family: 'gmail',
    name: 'settings.vacation.get',
    request: {
      method: 'GET',
      host: 'gmail.googleapis.com',
      path: `gmail/v1/users/${userId}/settings/vacation`,
      query: null,
      body: null,
    },
    response: { status: 200, data: { enableAutoReply: false }, headers: {} },
  };
}

function vacationPath(userId: string): string {
  return `/api/google/gmail/v1/users/${userId}/settings/vacation`;
}

function primeDb(): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('INSERT INTO activity_logs')) return { rows: [{ id: 'audit-1' }] };
    if (text.includes('FROM gw_credentials')) {
      return {
        rows: [
          {
            service_account_key: 'encrypted',
            admin_email: ADMIN_EMAIL,
            domain: ORG_DOMAIN,
          },
        ],
      };
    }
    return { rows: [] };
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(transparentProxyRouter);
  return app;
}

/** The payload passed to the (single) jwt.sign call, if any. */
function signedPayload(): any {
  return mockSign.mock.calls.length ? (mockSign.mock.calls[0][0] as any) : null;
}

/** The metadata JSON recorded on the audit-log INSERT. */
function auditMetadata(): any {
  const insert = mockQuery.mock.calls.find(
    (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO activity_logs'),
  );
  if (!insert) return null;
  const params = insert[1] as unknown[];
  return JSON.parse(params[7] as string); // $8 metadata
}

/** The description recorded on the audit-log INSERT. */
function auditDescription(): string {
  const insert = mockQuery.mock.calls.find(
    (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO activity_logs'),
  );
  const params = insert![1] as unknown[];
  return params[6] as string; // $7 description
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsEnabled.mockResolvedValue(false); // relay flag OFF => legacy passthrough
  primeDb();
});

afterEach(() => {
  resetGoogleReplay();
});

describe('per-user impersonation', () => {
  it('sets the JWT `sub` from X-Impersonate-User', async () => {
    useGoogleReplay(vacationFixture(TARGET_USER) as any);

    const res = await request(buildApp())
      .get(vacationPath(TARGET_USER))
      .set('X-Impersonate-User', TARGET_USER)
      .expect(200);

    expect(res.body).toEqual({ enableAutoReply: false });
    // The whole point: the delegation subject is the impersonated user.
    expect(signedPayload()?.sub).toBe(TARGET_USER);
  });

  it('falls back to the org admin as `sub` when no header is present', async () => {
    useGoogleReplay(vacationFixture(TARGET_USER) as any);

    await request(buildApp()).get(vacationPath(TARGET_USER)).expect(200);

    expect(signedPayload()?.sub).toBe(ADMIN_EMAIL);
  });

  it('treats a blank/whitespace header as absent (sub = admin)', async () => {
    useGoogleReplay(vacationFixture(TARGET_USER) as any);

    await request(buildApp())
      .get(vacationPath(TARGET_USER))
      .set('X-Impersonate-User', '   ')
      .expect(200);

    expect(signedPayload()?.sub).toBe(ADMIN_EMAIL);
  });
});

describe('cross-domain impersonation guard', () => {
  it('rejects a target outside the org domain with 403 and forwards nothing', async () => {
    // Load a fixture; the request must be rejected BEFORE it could be used.
    useGoogleReplay(vacationFixture('bob@evil.com') as any);

    const res = await request(buildApp())
      .get(vacationPath('bob@evil.com'))
      .set('X-Impersonate-User', 'bob@evil.com')
      .expect(403);

    expect(res.body.success).toBe(false);
    // No token was ever minted => nothing was forwarded to Google.
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('rejects a malformed (no-domain) target with 403', async () => {
    const res = await request(buildApp())
      .get(vacationPath('not-an-email'))
      .set('X-Impersonate-User', 'not-an-email')
      .expect(403);

    expect(res.body.success).toBe(false);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('domain comparison is case-insensitive (same domain, different case is allowed)', async () => {
    useGoogleReplay(vacationFixture(TARGET_USER) as any);

    await request(buildApp())
      .get(vacationPath(TARGET_USER))
      .set('X-Impersonate-User', 'Alice@CORP.TEST')
      .expect(200);

    expect(signedPayload()?.sub).toBe('Alice@CORP.TEST');
  });
});

describe('audit records the impersonated subject', () => {
  it('writes impersonatedSubject into the audit metadata and description on success', async () => {
    useGoogleReplay(vacationFixture(TARGET_USER) as any);

    await request(buildApp())
      .get(vacationPath(TARGET_USER))
      .set('X-Impersonate-User', TARGET_USER)
      .expect(200);

    expect(auditMetadata()?.impersonatedSubject).toBe(TARGET_USER);
    expect(auditDescription()).toContain(`impersonating ${TARGET_USER}`);
  });

  it('records the subject even when the request is rejected cross-domain', async () => {
    await request(buildApp())
      .get(vacationPath('bob@evil.com'))
      .set('X-Impersonate-User', 'bob@evil.com')
      .expect(403);

    // The attempted impersonation is captured on the audit row from the outset.
    expect(auditMetadata()?.impersonatedSubject).toBe('bob@evil.com');
  });

  it('omits impersonatedSubject entirely when no impersonation was requested', async () => {
    useGoogleReplay(vacationFixture(TARGET_USER) as any);

    await request(buildApp()).get(vacationPath(TARGET_USER)).expect(200);

    expect(auditMetadata()?.impersonatedSubject).toBeUndefined();
  });
});
