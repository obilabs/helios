import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import {
  authenticateMtpPairing,
  requirePairedMtpKey,
  requireMtpScope,
  requireActorAssertion,
} from '../middleware/mtp-auth.js';
import { mtpPairingService } from '../services/mtp-pairing.service.js';
import { mtpPollService } from '../services/mtp-poll.service.js';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
import { securityAudit, AuditActions } from '../services/security-audit.service.js';
import {
  MTP_API_VERSION,
  MTP_CAPABILITIES,
  MTP_POLL_ENDPOINT,
  mtpHandshakeResponseSchema,
  mtpPollResponseSchema,
  mtpOffboardRequestSchema,
  mtpOffboardResponseSchema,
  mtpRevokeResponseSchema,
} from '../types/mtp-contract.js';

/**
 * Helios MTP surface — /api/v1/mtp/* (OpenSpec: mtp-integration)
 *
 * Consumed by the MTP's HeliosAdapter (platform change `mtp-helios-adapter`).
 * Auth on every endpoint is a `helios-mtp-pairing` bearer key; the pairing
 * gates live in middleware/mtp-auth.ts and the atomic single-use bind lives
 * in services/mtp-pairing.service.ts (design D2).
 *
 * Endpoints:
 *   POST /handshake  complete the one-time bind; returns org + scopes +
 *                    server capabilities (seam-review g18)
 *   GET  /poll       header-free read; directory/security aggregate (D3)
 *   POST /actions/offboard-user  scoped + actor-asserted Workspace offboard (D5)
 *   POST /revoke     MSP self-revocation of the presenting pairing; actor-
 *                    asserted + audited; ends MSP access ONLY, never a
 *                    Workspace user (D5/g12, `mtp-revoke-cascade`)
 *
 * Response payloads are `.parse()`d through the frozen Zod contract shapes
 * (types/mtp-contract.ts) so drift fails loudly here, not in the MTP.
 */

const router = Router();

// Every MTP endpoint authenticates the pairing bearer.
router.use(authenticateMtpPairing);

/**
 * POST /api/v1/mtp/handshake
 *
 * First call on an unbound key inside its 15-minute window atomically and
 * permanently binds the key (paired_at / paired_from_ip / paired_user_agent).
 * Refusals: 409 already_paired, 410 window_closed, 403 revoked, 401 invalid.
 */
router.post('/handshake', async (req: Request, res: Response): Promise<void> => {
  try {
    const pairing = req.mtpPairing!;

    const result = await mtpPairingService.completeHandshake(pairing.keyHash, {
      ip: req.ip || req.socket.remoteAddress || null,
      userAgent: (req.headers['user-agent'] as string) || null,
    });

    if (!result.ok || !result.pairing) {
      switch (result.kind) {
        case 'already_paired':
          res.status(409).json({
            success: false,
            kind: 'already_paired',
            error: 'Pairing key already bound',
            message:
              'This pairing key has already been bound. Issue a new key to pair another MTP.',
          });
          return;
        case 'window_closed':
          res.status(410).json({
            success: false,
            kind: 'window_closed',
            error: 'Pairing window closed',
            message:
              'The 15-minute pairing window has expired. Ask the organization to issue a new key.',
          });
          return;
        case 'revoked':
          res.status(403).json({
            success: false,
            kind: 'revoked',
            revoked: true,
            revoked_at: result.revokedAt ?? null,
            error: 'MSP access revoked',
            message: 'This MTP pairing has been revoked by the organization',
          });
          return;
        default:
          res.status(401).json({
            success: false,
            kind: 'invalid_key',
            error: 'Invalid pairing key',
            message: 'The provided pairing key is not recognized',
          });
          return;
      }
    }

    const orgResult = await db.query(
      'SELECT id, name, created_at FROM organizations WHERE id = $1',
      [result.pairing.organizationId]
    );

    if (orgResult.rows.length === 0) {
      // Should be impossible (FK), but never bind-and-500 silently.
      logger.error('MTP handshake bound a key for a missing organization', {
        keyId: result.pairing.id,
        organizationId: result.pairing.organizationId,
      });
      res.status(500).json({
        success: false,
        error: 'Organization not found',
        message: 'Pairing bound but the organization record could not be loaded',
      });
      return;
    }

    const org = orgResult.rows[0];

    const payload = mtpHandshakeResponseSchema.parse({
      organization: {
        id: org.id,
        name: org.name,
        created_at: new Date(org.created_at).toISOString(),
      },
      pairing: {
        id: result.pairing.id,
        display_name: result.pairing.name,
        scopes: result.pairing.scopes,
      },
      server: {
        api_version: MTP_API_VERSION,
        capabilities: [...MTP_CAPABILITIES],
        poll_endpoint: MTP_POLL_ENDPOINT,
      },
    });

    res.status(200).json(payload);
  } catch (error: any) {
    logger.error('MTP handshake failed', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: 'Handshake failed',
      message: 'An error occurred while completing the handshake',
    });
  }
});

/**
 * GET /api/v1/mtp/poll
 *
 * Header-free read (no actor assertion — reads never require it, per spec).
 * Requires an already-bound, non-revoked pairing. Returns the Helios-native
 * directory/security aggregate (design D3): user/group counts,
 * suspended/at-risk accounts, security-event counts, GW sync freshness.
 */
router.get(
  '/poll',
  requirePairedMtpKey,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pairing = req.mtpPairing!;

      const aggregate = await mtpPollService.getDirectorySecurityAggregate(
        pairing.organizationId
      );

      const payload = mtpPollResponseSchema.parse({
        organization_id: pairing.organizationId,
        polled_at: new Date().toISOString(),
        ...aggregate,
      });

      // Track usage (async, don't block the poll)
      db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [
        pairing.id,
      ]).catch((error) => {
        logger.error('Failed to update MTP pairing last_used_at', {
          keyId: pairing.id,
          error: error.message,
        });
      });

      res.status(200).json(payload);
    } catch (error: any) {
      logger.error('MTP poll failed', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: 'Poll failed',
        message: 'An error occurred while building the poll aggregate',
      });
    }
  }
);

/**
 * POST /api/v1/mtp/actions/offboard-user
 *
 * The one destructive write Helios exposes to the MTP (OpenSpec mtp-integration
 * task group 3, seam-review g11). Suspends / (optionally transfers Drive then)
 * deletes a real Google Workspace account.
 *
 * Gates (in middleware order):
 *   requirePairedMtpKey      — bound, non-revoked pairing
 *   requireMtpScope          — the pairing was granted `mtp:offboard`
 *                              (issued separately from mtp:poll) → else 403
 *   requireActorAssertion    — X-Actor-Email / X-Actor-Name present → else 400
 *
 * Design D5 — this action is INDEPENDENT of pairing revocation. Revoking the
 * MSP's access (api-keys route) never calls this; offboarding a user never
 * revokes the pairing. The two are deliberately decoupled to prevent a
 * "revoke access → mass-suspend real accounts" coupling.
 *
 * Org-scoping — the target is resolved ONLY within the pairing's organization
 * (`gw_synced_users WHERE organization_id = <pairing org>`); an MSP tech can
 * never reach a user in another organization.
 *
 * Every outcome (success, blocked, failure) is written to the append-only
 * security audit with the asserted MSP technician as the actor (task 3.4).
 */
router.post(
  '/actions/offboard-user',
  requirePairedMtpKey,
  requireMtpScope('mtp:offboard'),
  requireActorAssertion,
  async (req: Request, res: Response): Promise<void> => {
    const pairing = req.mtpPairing!;
    const actor = req.mtpActor!;
    const orgId = pairing.organizationId;
    const actorIp = req.ip || req.socket.remoteAddress || undefined;
    const actorUserAgent = (req.headers['user-agent'] as string) || undefined;

    const parsed = mtpOffboardRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        kind: 'invalid_request',
        error: 'Invalid offboard request',
        message: parsed.error.issues.map((e) => e.message).join('; '),
      });
      return;
    }
    const { user_email, action, transfer_drive_to } = parsed.data;
    const auditAction =
      action === 'delete' ? AuditActions.USER_DELETE : AuditActions.USER_SUSPEND;

    // Common audit envelope for this request.
    const audit = (
      outcome: 'success' | 'failure' | 'blocked',
      extra: { errorCode?: string; errorMessage?: string; changesAfter?: Record<string, any> } = {},
    ) =>
      securityAudit.log({
        actorType: 'mtp',
        actorEmail: actor.email,
        actorIp,
        actorUserAgent,
        action: auditAction,
        actionCategory: 'admin',
        targetType: 'workspace_user',
        targetIdentifier: user_email,
        organizationId: orgId,
        outcome,
        flagged: action === 'delete',
        ...extra,
      });

    try {
      // Resolve the target strictly within the pairing's organization.
      const target = await db.query(
        `SELECT google_id, is_suspended
           FROM gw_synced_users
          WHERE organization_id = $1 AND email = $2`,
        [orgId, user_email]
      );

      if (target.rows.length === 0) {
        await audit('blocked', { errorCode: 'user_not_found' });
        res.status(404).json({
          success: false,
          kind: 'user_not_found',
          error: 'User not found',
          message: 'No Workspace user with that email in this organization',
        });
        return;
      }

      const googleId = target.rows[0].google_id as string;

      // Optional Drive transfer BEFORE the destructive step. If it fails, abort
      // — never suspend/delete after failing to preserve the user's data.
      if (transfer_drive_to) {
        const transfer = await googleWorkspaceService.transferDriveOwnership(
          orgId,
          user_email,
          transfer_drive_to
        );
        if (!transfer.success) {
          await audit('failure', {
            errorCode: 'drive_transfer_failed',
            errorMessage: transfer.error,
            changesAfter: { transfer_drive_to },
          });
          res.status(502).json({
            success: false,
            kind: 'drive_transfer_failed',
            error: 'Drive transfer failed',
            message: transfer.error || 'Could not transfer Drive ownership; action aborted',
          });
          return;
        }
      }

      // The destructive step.
      const result =
        action === 'delete'
          ? await googleWorkspaceService.deleteUser(orgId, googleId)
          : await googleWorkspaceService.suspendUser(orgId, googleId);

      if (!result.success) {
        await audit('failure', {
          errorMessage: result.error,
          changesAfter: { action, transfer_drive_to: transfer_drive_to ?? null },
        });
        res.status(502).json({
          success: false,
          kind: 'workspace_error',
          error: 'Offboard failed',
          message: result.error || 'Google Workspace rejected the offboard action',
        });
        return;
      }

      // Reflect the change in the local cache (best-effort; the next sync
      // reconciles authoritatively from Google).
      if (action === 'delete') {
        await db
          .query('DELETE FROM gw_synced_users WHERE organization_id = $1 AND google_id = $2', [
            orgId,
            googleId,
          ])
          .catch((e) => logger.warn('offboard: local cache delete failed', { error: e.message }));
      } else {
        await db
          .query(
            `UPDATE gw_synced_users SET is_suspended = true, updated_at = NOW()
              WHERE organization_id = $1 AND google_id = $2`,
            [orgId, googleId]
          )
          .catch((e) => logger.warn('offboard: local cache update failed', { error: e.message }));
      }

      await audit('success', {
        changesAfter: { action, transfer_drive_to: transfer_drive_to ?? null },
      });

      const payload = mtpOffboardResponseSchema.parse({
        success: true,
        action,
        user_email,
        outcome: action === 'delete' ? 'deleted' : 'suspended',
      });
      res.status(200).json(payload);
    } catch (error: any) {
      logger.error('MTP offboard-user failed', {
        error: error.message,
        stack: error.stack,
        organizationId: orgId,
        actor: actor.email,
      });
      // Best-effort audit of the unexpected failure.
      await audit('failure', { errorCode: 'internal_error', errorMessage: error.message }).catch(
        () => {}
      );
      res.status(500).json({
        success: false,
        error: 'Offboard failed',
        message: 'An error occurred while performing the offboard action',
      });
    }
  }
);

/**
 * POST /api/v1/mtp/revoke
 *
 * The MSP severs its OWN access to this Helios install (mtp-revoke-cascade,
 * g12). The presenting pairing key selects which pairing is revoked (self-
 * revoke); `revokePairing()` flips `api_keys.is_active=false` + `revoked_at`
 * and records an `msp_access_revoked` security event — it touches ONLY the
 * pairing key + audit trail.
 *
 * D5 INVARIANT (verified): this handler NEVER imports or calls
 * googleWorkspaceService. Revoking MSP access does not suspend, delete, or
 * otherwise alter a single Google Workspace user. Offboard (above) is the only
 * path that touches Workspace, and it is a separate, explicitly-scoped action.
 *
 * NO scope gate: a bound pairing may always revoke itself (kill switch). It is
 * actor-asserted (`X-Actor-*`) + audited so the acting technician is on record.
 * Idempotent: a caller whose key is already revoked is rejected upstream by
 * authenticateMtpPairing (403 `kind:'revoked'`) and never reaches here; the
 * null branch below only covers the narrow revoke-between-auth-and-handler race.
 */
router.post(
  '/revoke',
  requirePairedMtpKey,
  requireActorAssertion,
  async (req: Request, res: Response): Promise<void> => {
    const pairing = req.mtpPairing!;
    const actor = req.mtpActor!;
    const orgId = pairing.organizationId;
    const actorIp = req.ip || req.socket.remoteAddress || undefined;
    const actorUserAgent = (req.headers['user-agent'] as string) || undefined;

    const audit = (
      outcome: 'success' | 'failure',
      extra: { errorCode?: string; errorMessage?: string; changesAfter?: Record<string, any> } = {},
    ) =>
      securityAudit.log({
        actorType: 'mtp',
        actorEmail: actor.email,
        actorIp,
        actorUserAgent,
        action: AuditActions.API_KEY_REVOKE,
        actionCategory: 'admin',
        targetType: 'mtp_pairing',
        targetId: pairing.id,
        targetIdentifier: pairing.name,
        organizationId: orgId,
        outcome,
        // A pairing revoke is a notable access change — surface it for review.
        flagged: true,
        ...extra,
      });

    try {
      // `revokedBy` is a portal-user UUID column; the MTP actor is an email, not
      // a portal user, so we leave it null and attribute the human via the
      // append-only audit log below (and the security_event metadata).
      const revoked = await mtpPairingService.revokePairing(pairing.id, orgId, {
        reason: `MSP self-revoke via MTP by ${actor.email}`,
      });

      if (!revoked) {
        // TOCTOU: the key was revoked between the auth check and here. Idempotent
        // success — the end state (access gone) already holds.
        await audit('success', { changesAfter: { already_revoked: true } });
        res.status(200).json(
          mtpRevokeResponseSchema.parse({
            success: true,
            revoked: true,
            already_revoked: true,
            revoked_at: null,
          })
        );
        return;
      }

      await audit('success', { changesAfter: { revoked_at: revoked.revokedAt.toISOString() } });
      res.status(200).json(
        mtpRevokeResponseSchema.parse({
          success: true,
          revoked: true,
          revoked_at: revoked.revokedAt.toISOString(),
        })
      );
    } catch (error: any) {
      logger.error('MTP revoke failed', {
        error: error.message,
        stack: error.stack,
        organizationId: orgId,
        actor: actor.email,
        pairingId: pairing.id,
      });
      await audit('failure', { errorCode: 'internal_error', errorMessage: error.message }).catch(
        () => {}
      );
      res.status(500).json({
        success: false,
        error: 'Revoke failed',
        message: 'An error occurred while revoking the MSP pairing',
      });
    }
  }
);

export default router;
