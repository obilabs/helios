/**
 * POST /api/v1/mtp/revoke — MSP self-revocation tests
 * (mtp-revoke-cascade, seam-review g12)
 *
 * What these tests pin down (fail the build on regression):
 *   1. Successful self-revoke: 200 { success, revoked, revoked_at };
 *      revokePairing is called with the PRESENTING pairing's id + org id
 *      (self-revoke, org-scoped) and a human-attributable reason; audited as
 *      api.key.revoke / outcome success by the asserted MSP technician.
 *   2. D5 INVARIANT — the revoke handler NEVER touches Google Workspace.
 *      Revoking MSP access severs the pairing ONLY; it must not suspend,
 *      delete, or transfer Drive for any Workspace user. Offboard is the only
 *      Workspace-touching path and it is a separate, explicitly-scoped action.
 *   3. Actor assertion: missing X-Actor-Email / X-Actor-Name refuses 400
 *      missing_actor_context and revokePairing is never reached.
 *   4. Idempotent TOCTOU branch: revokePairing → null (revoked between auth
 *      and handler) still returns 200 with already_revoked: true.
 *
 * The REAL middleware chain is exercised end-to-end: authenticateMtpPairing
 * runs against the mocked db (a real bearer key in valid helios_{env}_{random}
 * format), and requirePairedMtpKey / requireActorAssertion are the real
 * implementations. Only the database, logger, Google Workspace service, audit
 * service, and the sibling MTP services are mocked.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

// ---- mocks (must be registered before the dynamic imports) ----

type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type GwResult = { success: boolean; error?: string };
const mockSuspendUser = jest.fn<(organizationId: string, googleId: string) => Promise<GwResult>>();
const mockDeleteUser = jest.fn<(organizationId: string, googleId: string) => Promise<GwResult>>();
const mockTransferDriveOwnership = jest.fn<
  (organizationId: string, fromEmail: string, toEmail: string) => Promise<GwResult>
>();
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: {
    suspendUser: mockSuspendUser,
    deleteUser: mockDeleteUser,
    transferDriveOwnership: mockTransferDriveOwnership,
  },
  GoogleWorkspaceService: class {},
}));

const mockAuditLog = jest.fn<(entry: Record<string, unknown>) => Promise<string>>();
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log: mockAuditLog },
  AuditActions: {
    USER_SUSPEND: 'user.suspend',
    USER_DELETE: 'user.delete',
    API_KEY_REVOKE: 'api.key.revoke',
  },
}));

// Sibling MTP services the router module imports for its other endpoints —
// stubbed so importing the router stays cheap. `revokePairing` is the unit
// under test's collaborator; its resolution is set per test.
type RevokeResult = { id: string; name: string; revokedAt: Date } | null;
const mockRevokePairing = jest.fn<
  (pairingId: string, organizationId: string, opts: { reason?: string }) => Promise<RevokeResult>
>();
jest.unstable_mockModule('../services/mtp-pairing.service.js', () => ({
  mtpPairingService: {
    completeHandshake: jest.fn(),
    revokePairing: mockRevokePairing,
  },
}));
jest.unstable_mockModule('../services/mtp-poll.service.js', () => ({
  mtpPollService: { getDirectorySecurityAggregate: jest.fn() },
}));

const { default: mtpRoutes } = await import('../routes/mtp.routes.js');

// ---- fixtures ----

const ORG_ID = 'org-1';
// Valid helios_{env}_{random} format: 43 base64url chars of "random".
const PAIRING_KEY = `helios_dev_${'a'.repeat(43)}`;
const PAIRING_ID = 'pk1';

const ACTOR_EMAIL = 'tech@msp.example';
const ACTOR_NAME = 'Tech Person';

/**
 * Prime the DB mock. The api_keys lookup feeds authenticateMtpPairing a bound,
 * non-revoked, org-scoped pairing (NO mtp:offboard needed — revoke has no
 * scope gate; a bound pairing may always kill-switch itself).
 */
function primeDb(): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('FROM api_keys')) {
      return {
        rows: [
          {
            id: PAIRING_ID,
            organization_id: ORG_ID,
            name: 'MSP Pairing',
            permissions: ['mtp:poll'],
            is_active: true,
            paired_at: new Date('2026-08-01T00:00:00Z').toISOString(),
            pairing_window_expires_at: null,
            revoked_at: null,
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
  app.use('/api/v1/mtp', mtpRoutes);
  return app;
}

/** POST /revoke with the pairing bearer + actor headers. */
function revoke(app: Express) {
  return request(app)
    .post('/api/v1/mtp/revoke')
    .set('Authorization', `Bearer ${PAIRING_KEY}`)
    .set('X-Actor-Email', ACTOR_EMAIL)
    .set('X-Actor-Name', ACTOR_NAME)
    .send({});
}

beforeEach(() => {
  mockQuery.mockReset();
  mockSuspendUser.mockReset();
  mockDeleteUser.mockReset();
  mockTransferDriveOwnership.mockReset();
  mockAuditLog.mockReset();
  mockRevokePairing.mockReset();

  // Happy-path defaults; individual tests override what they need.
  mockRevokePairing.mockResolvedValue({
    id: PAIRING_ID,
    name: 'MSP Pairing',
    revokedAt: new Date('2026-08-10T00:00:00Z'),
  });
  mockAuditLog.mockResolvedValue('audit-id');
  primeDb();
});

// ---------------------------------------------------------------------------
// 1. Successful self-revoke — 200, org-scoped service call, audited
// ---------------------------------------------------------------------------

describe('successful self-revoke', () => {
  it('revokes the presenting pairing: 200, service called org-scoped, audited', async () => {
    const res = await revoke(buildApp());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.revoked).toBe(true);
    expect(res.body.revoked_at).toBe('2026-08-10T00:00:00.000Z');

    // Self-revoke: the PRESENTING pairing's id + its own org — never a caller-
    // supplied target — plus an attributable reason.
    expect(mockRevokePairing).toHaveBeenCalledTimes(1);
    expect(mockRevokePairing).toHaveBeenCalledWith(
      PAIRING_ID,
      ORG_ID,
      expect.objectContaining({ reason: expect.stringContaining(ACTOR_EMAIL) })
    );

    // Audited as an API-key revoke by the asserted MSP technician.
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'mtp',
        actorEmail: ACTOR_EMAIL,
        action: 'api.key.revoke',
        targetType: 'mtp_pairing',
        targetId: PAIRING_ID,
        organizationId: ORG_ID,
        outcome: 'success',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 2. D5 invariant — revoke severs MSP access ONLY, never touches Workspace
// ---------------------------------------------------------------------------

describe('D5 invariant: no Google Workspace touch', () => {
  it('never calls suspendUser / deleteUser / transferDriveOwnership', async () => {
    const res = await revoke(buildApp());

    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(true);
    // Revoking MSP access must NEVER offboard a real Workspace user — the
    // "revoke access → mass-suspend real accounts" coupling is forbidden.
    expect(mockSuspendUser).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockTransferDriveOwnership).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Actor assertion — no revoke without an attributable technician
// ---------------------------------------------------------------------------

describe('actor assertion: requireActorAssertion', () => {
  it('refuses 400 missing_actor_context when X-Actor-* headers are absent', async () => {
    const res = await request(buildApp())
      .post('/api/v1/mtp/revoke')
      .set('Authorization', `Bearer ${PAIRING_KEY}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.kind).toBe('missing_actor_context');
    // The gate fires before the handler — nothing revoked.
    expect(mockRevokePairing).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. Idempotent TOCTOU — already revoked between auth and handler
// ---------------------------------------------------------------------------

describe('idempotent already-revoked (TOCTOU)', () => {
  it('returns 200 already_revoked when revokePairing resolves null', async () => {
    mockRevokePairing.mockResolvedValue(null);

    const res = await revoke(buildApp());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.revoked).toBe(true);
    expect(res.body.already_revoked).toBe(true);
    expect(res.body.revoked_at).toBeNull();
  });
});
