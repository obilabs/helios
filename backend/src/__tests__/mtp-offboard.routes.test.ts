/**
 * POST /api/v1/mtp/actions/offboard-user — gate + outcome tests
 * (OpenSpec mtp-integration task group 3, seam-review g11)
 *
 * What these tests pin down (fail the build on regression):
 *   1. Scope gate: a pairing without `mtp:offboard` is refused 403
 *      insufficient_scope (mtp:poll alone must never allow a destructive
 *      write).
 *   2. Actor assertion: missing or malformed X-Actor-Email / X-Actor-Name
 *      refuses 400 missing_actor_context — no offboard without an
 *      attributable technician.
 *   3. Target resolution is strictly org-scoped (gw_synced_users WHERE
 *      organization_id = <pairing org>) — an MSP tech can never reach a user
 *      in another organization. Unknown target → 404 user_not_found, audited
 *      as 'blocked'.
 *   4. Drive transfer (when requested) runs BEFORE the destructive step and a
 *      failed transfer aborts the whole action (502 drive_transfer_failed,
 *      suspend/delete never called).
 *   5. Google Workspace rejection → 502 workspace_error, audited as
 *      'failure'.
 *   6. Every outcome writes the security audit with the asserted MSP
 *      technician as the actor (actorType 'mtp').
 *
 * The REAL middleware chain is exercised end-to-end: authenticateMtpPairing
 * runs against the mocked db (a real bearer key in valid helios_{env}_{random}
 * format), and requirePairedMtpKey / requireMtpScope / requireActorAssertion
 * are the real implementations (real hasPermission). Only the database,
 * logger, Google Workspace service, audit service, and the sibling MTP
 * services are mocked.
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
  },
}));

// Sibling MTP services the router module imports for its other endpoints
// (handshake / poll) — stubbed so importing the router stays cheap.
jest.unstable_mockModule('../services/mtp-pairing.service.js', () => ({
  mtpPairingService: { completeHandshake: jest.fn() },
}));
jest.unstable_mockModule('../services/mtp-poll.service.js', () => ({
  mtpPollService: { getDirectorySecurityAggregate: jest.fn() },
}));

const { default: mtpRoutes } = await import('../routes/mtp.routes.js');

// ---- fixtures ----

const ORG_ID = 'org-1';
// Valid helios_{env}_{random} format: 43 base64url chars of "random".
const PAIRING_KEY = `helios_dev_${'a'.repeat(43)}`;

const ACTOR_EMAIL = 'tech@msp.example';
const ACTOR_NAME = 'Tech';
const TARGET_EMAIL = 'u@corp.com';

/** Per-test knobs read by the db mock (set in beforeEach, override per test). */
let pairingScopes: string[];
let targetRows: Array<{ google_id: string; is_suspended: boolean }>;

/**
 * Prime the DB mock. Queries are routed by SQL fragment:
 *  - api_keys lookup      → authenticateMtpPairing's bearer-key auth (returns
 *                           a bound, non-revoked pairing carrying
 *                           `pairingScopes` for ORG_ID)
 *  - gw_synced_users SELECT → the org-scoped target lookup (`targetRows`)
 * Everything else (local cache UPDATE/DELETE, last_used_at) returns empty.
 */
function primeDb(): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('FROM api_keys')) {
      return {
        rows: [
          {
            id: 'pk1',
            organization_id: ORG_ID,
            name: 'MSP',
            permissions: pairingScopes,
            is_active: true,
            paired_at: new Date('2026-08-01T00:00:00Z').toISOString(),
            pairing_window_expires_at: null,
            revoked_at: null,
          },
        ],
      };
    }
    if (text.includes('gw_synced_users') && /^\s*SELECT/i.test(text)) {
      return { rows: targetRows };
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

/** POST the offboard action with the pairing bearer + actor headers. */
function offboard(app: Express, body: Record<string, unknown>) {
  return request(app)
    .post('/api/v1/mtp/actions/offboard-user')
    .set('Authorization', `Bearer ${PAIRING_KEY}`)
    .set('X-Actor-Email', ACTOR_EMAIL)
    .set('X-Actor-Name', ACTOR_NAME)
    .send(body);
}

function queriesMatching(fragment: string): Array<[string, unknown[]?]> {
  return mockQuery.mock.calls.filter(([text]) => text.includes(fragment)) as Array<
    [string, unknown[]?]
  >;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockSuspendUser.mockReset();
  mockDeleteUser.mockReset();
  mockTransferDriveOwnership.mockReset();
  mockAuditLog.mockReset();

  // Happy-path defaults; individual tests override what they need.
  pairingScopes = ['mtp:poll', 'mtp:offboard'];
  targetRows = [{ google_id: 'g1', is_suspended: false }];
  mockSuspendUser.mockResolvedValue({ success: true });
  mockDeleteUser.mockResolvedValue({ success: true });
  mockTransferDriveOwnership.mockResolvedValue({ success: true });
  mockAuditLog.mockResolvedValue('audit-id');
  primeDb();
});

// ---------------------------------------------------------------------------
// 1. Scope gate — mtp:poll alone must never allow a destructive write
// ---------------------------------------------------------------------------

describe('scope gate: requireMtpScope(mtp:offboard)', () => {
  it('refuses 403 insufficient_scope when the pairing only has mtp:poll', async () => {
    pairingScopes = ['mtp:poll'];

    const res = await offboard(buildApp(), {
      user_email: TARGET_EMAIL,
      action: 'suspend',
    });

    expect(res.status).toBe(403);
    expect(res.body.kind).toBe('insufficient_scope');
    expect(res.body.success).toBe(false);
    // The gate fires before the handler — nothing destructive, nothing audited.
    expect(mockSuspendUser).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Actor assertion — no offboard without an attributable technician
// ---------------------------------------------------------------------------

describe('actor assertion: requireActorAssertion', () => {
  it('refuses 400 missing_actor_context when X-Actor-* headers are absent', async () => {
    const res = await request(buildApp())
      .post('/api/v1/mtp/actions/offboard-user')
      .set('Authorization', `Bearer ${PAIRING_KEY}`)
      .send({ user_email: TARGET_EMAIL, action: 'suspend' });

    expect(res.status).toBe(400);
    expect(res.body.kind).toBe('missing_actor_context');
    expect(res.body.requiredHeaders).toEqual(['X-Actor-Email', 'X-Actor-Name']);
    expect(mockSuspendUser).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('refuses 400 missing_actor_context when X-Actor-Email is malformed', async () => {
    const res = await request(buildApp())
      .post('/api/v1/mtp/actions/offboard-user')
      .set('Authorization', `Bearer ${PAIRING_KEY}`)
      .set('X-Actor-Email', 'not-an-email')
      .set('X-Actor-Name', ACTOR_NAME)
      .send({ user_email: TARGET_EMAIL, action: 'suspend' });

    expect(res.status).toBe(400);
    expect(res.body.kind).toBe('missing_actor_context');
    expect(mockSuspendUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Target resolution — unknown user in this org → 404, audited as blocked
// ---------------------------------------------------------------------------

describe('target resolution', () => {
  it('refuses 404 user_not_found when the email is not in this organization', async () => {
    targetRows = [];

    const res = await offboard(buildApp(), {
      user_email: TARGET_EMAIL,
      action: 'suspend',
    });

    expect(res.status).toBe(404);
    expect(res.body.kind).toBe('user_not_found');
    expect(mockSuspendUser).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'blocked',
        errorCode: 'user_not_found',
        targetIdentifier: TARGET_EMAIL,
      })
    );
  });

  it('resolves the target ONLY within the pairing organization (org-scoping)', async () => {
    await offboard(buildApp(), { user_email: TARGET_EMAIL, action: 'suspend' }).expect(200);

    const lookups = mockQuery.mock.calls.filter(
      ([text]) => text.includes('gw_synced_users') && /^\s*SELECT/i.test(text)
    );
    expect(lookups).toHaveLength(1);
    const [sql, params] = lookups[0]!;
    expect(sql).toContain('organization_id = $1');
    // params[0] is the PAIRING's org — a tech can never reach another org's user.
    expect(params).toEqual([ORG_ID, TARGET_EMAIL]);
  });
});

// ---------------------------------------------------------------------------
// 4. Successful outcomes
// ---------------------------------------------------------------------------

describe('successful offboard', () => {
  it('suspends: 200 outcome suspended, audited as the asserted technician', async () => {
    const res = await offboard(buildApp(), {
      user_email: TARGET_EMAIL,
      action: 'suspend',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      action: 'suspend',
      user_email: TARGET_EMAIL,
      outcome: 'suspended',
    });
    expect(mockSuspendUser).toHaveBeenCalledWith(ORG_ID, 'g1');
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'mtp',
        actorEmail: ACTOR_EMAIL,
        action: 'user.suspend',
        targetIdentifier: TARGET_EMAIL,
        organizationId: ORG_ID,
        outcome: 'success',
      })
    );
    // Local cache reflects the suspension (best-effort update).
    expect(queriesMatching('UPDATE gw_synced_users')).toHaveLength(1);
  });

  it('deletes: 200 outcome deleted, audited as user.delete (flagged)', async () => {
    const res = await offboard(buildApp(), {
      user_email: TARGET_EMAIL,
      action: 'delete',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      action: 'delete',
      user_email: TARGET_EMAIL,
      outcome: 'deleted',
    });
    expect(mockDeleteUser).toHaveBeenCalledWith(ORG_ID, 'g1');
    expect(mockSuspendUser).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.delete',
        outcome: 'success',
        flagged: true,
      })
    );
  });

  it('transfers Drive BEFORE suspending when transfer_drive_to is given', async () => {
    const res = await offboard(buildApp(), {
      user_email: TARGET_EMAIL,
      action: 'suspend',
      transfer_drive_to: 'boss@corp.com',
    });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('suspended');
    expect(mockTransferDriveOwnership).toHaveBeenCalledWith(
      ORG_ID,
      TARGET_EMAIL,
      'boss@corp.com'
    );
    expect(mockSuspendUser).toHaveBeenCalledWith(ORG_ID, 'g1');
    // Preservation strictly precedes destruction.
    expect(mockTransferDriveOwnership.mock.invocationCallOrder[0]!).toBeLessThan(
      mockSuspendUser.mock.invocationCallOrder[0]!
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Failure paths — abort before destroying data, audit as failure
// ---------------------------------------------------------------------------

describe('failure paths', () => {
  it('aborts on failed Drive transfer: 502 drive_transfer_failed, no suspend/delete', async () => {
    mockTransferDriveOwnership.mockResolvedValue({ success: false, error: 'x' });

    const res = await offboard(buildApp(), {
      user_email: TARGET_EMAIL,
      action: 'suspend',
      transfer_drive_to: 'boss@corp.com',
    });

    expect(res.status).toBe(502);
    expect(res.body.kind).toBe('drive_transfer_failed');
    // Data is never destroyed after a failed preservation step.
    expect(mockSuspendUser).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failure',
        errorCode: 'drive_transfer_failed',
      })
    );
  });

  it('returns 502 workspace_error when Google rejects the suspend', async () => {
    mockSuspendUser.mockResolvedValue({ success: false, error: 'boom' });

    const res = await offboard(buildApp(), {
      user_email: TARGET_EMAIL,
      action: 'suspend',
    });

    expect(res.status).toBe(502);
    expect(res.body.kind).toBe('workspace_error');
    expect(res.body.message).toBe('boom');
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure', errorMessage: 'boom' })
    );
    // The local cache is not touched on failure.
    expect(queriesMatching('UPDATE gw_synced_users')).toHaveLength(0);
  });
});
