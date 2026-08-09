import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import {
  authenticateMtpPairing,
  requirePairedMtpKey,
} from '../middleware/mtp-auth.js';
import { mtpPairingService } from '../services/mtp-pairing.service.js';
import { mtpPollService } from '../services/mtp-poll.service.js';
import {
  MTP_API_VERSION,
  MTP_CAPABILITIES,
  MTP_POLL_ENDPOINT,
  mtpHandshakeResponseSchema,
  mtpPollResponseSchema,
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

// ---------------------------------------------------------------------------
// TODO(mtp-integration, task group 3 — under separate human review):
// POST /api/v1/mtp/actions/offboard-user
//   - gate on the dedicated `mtp:offboard` scope (pairing.scopes) AND
//     actor-assertion headers (X-Actor-Email / X-Actor-Name) — refuse with
//     400 missing-actor-context / 403 insufficient-scope when absent
//   - wire to the existing services/user-offboarding.service.ts
//     (suspend/transfer/delete); NEVER triggered by pairing revocation (D5)
//   - audit-log every action with the asserted MSP technician (task 3.4)
// Wire it here, after requirePairedMtpKey, e.g.:
//   router.post('/actions/offboard-user', requirePairedMtpKey, requireMtpScope('mtp:offboard'), requireActorAssertion, handler)
// ---------------------------------------------------------------------------

export default router;
