import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import {
  hashApiKey,
  validateApiKeyFormat,
  hasPermission,
  MTP_PAIRING_KEY_TYPE,
  type ApiScope,
} from '../utils/apiKey.js';
import { db } from '../database/connection.js';

/**
 * MTP pairing-key authentication (OpenSpec: mtp-integration)
 *
 * The MTP (MSP multi-tenant portal) calls Helios's /api/v1/mtp/* surface with
 * a `helios-mtp-pairing` key as a bearer token:
 *
 *   Authorization: Bearer helios_{env}_{random}
 *
 * (X-API-Key is accepted as a fallback for parity with the rest of the API.)
 *
 * This middleware authenticates the key and enforces the gates that apply to
 * EVERY /api/v1/mtp/* call:
 *   - key exists and is a helios-mtp-pairing key         -> else 401 invalid_key
 *   - key is not revoked                                 -> else 403 kind:'revoked'
 *     (authoritative signal, design D6 / seam-review g12: the MTP can tell a
 *      real revocation apart from an outage or a bad key)
 *
 * It deliberately does NOT enforce "already paired" / "window open" — those
 * gates differ per endpoint:
 *   - POST /handshake needs an UNBOUND key inside its window; the bind itself
 *     is a single-statement atomic conditional UPDATE in the pairing service
 *     (design D2 — the `paired_at IS NULL` predicate inside the UPDATE is the
 *     race guard; there is intentionally no SELECT-then-UPDATE anywhere).
 *   - GET /poll (and future actions) need an already-BOUND key -> use
 *     requirePairedMtpKey after this middleware.
 */

export interface MtpPairingContext {
  id: string;
  name: string;
  organizationId: string;
  scopes: string[];
  pairedAt: Date | null;
  pairingWindowExpiresAt: Date | null;
  revokedAt: Date | null;
  /** SHA-256 hash of the presented key — used by the handshake's atomic bind */
  keyHash: string;
}

/**
 * The asserted MSP technician behind a write action (design D4). The bearer
 * pairing key auths the MSP *firm*; these headers identify the specific human
 * for the audit trail. Attached by `requireActorAssertion`, read from the
 * `X-Actor-*` headers the MTP's HeliosAdapter sends. NEVER trusted from a
 * request body.
 */
export interface MtpActorContext {
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      mtpPairing?: MtpPairingContext;
      mtpActor?: MtpActorContext;
    }
  }
}

/** Extract the pairing key from Authorization: Bearer (preferred) or X-API-Key. */
function extractPairingKey(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
    return apiKeyHeader;
  }
  return null;
}

export const authenticateMtpPairing = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawKey = extractPairingKey(req);

    if (!rawKey || !validateApiKeyFormat(rawKey)) {
      res.status(401).json({
        success: false,
        kind: 'invalid_key',
        error: 'Invalid pairing key',
        message: 'Provide a valid pairing key as "Authorization: Bearer <key>"',
      });
      return;
    }

    const keyHash = hashApiKey(rawKey);

    const result = await db.query(
      `SELECT
        id,
        organization_id,
        name,
        permissions,
        is_active,
        paired_at,
        pairing_window_expires_at,
        revoked_at
      FROM api_keys
      WHERE key_hash = $1
        AND type = $2`,
      [keyHash, MTP_PAIRING_KEY_TYPE]
    );

    if (result.rows.length === 0) {
      logger.warn('MTP auth failed: pairing key not found', {
        keyPrefix: `${rawKey.substring(0, 20)}...`,
        path: req.path,
      });
      res.status(401).json({
        success: false,
        kind: 'invalid_key',
        error: 'Invalid pairing key',
        message: 'The provided pairing key is not recognized',
      });
      return;
    }

    const key = result.rows[0];

    // Authoritative revocation (design D6). Distinguishable from a transient
    // outage or a generic auth failure — the MTP treats this as "the customer
    // revoked MSP access", not "retry later".
    if (key.revoked_at || !key.is_active) {
      logger.warn('MTP auth refused: pairing revoked', {
        keyId: key.id,
        keyName: key.name,
        revokedAt: key.revoked_at,
        path: req.path,
      });
      res.status(403).json({
        success: false,
        kind: 'revoked',
        revoked: true,
        revoked_at: key.revoked_at ?? null,
        error: 'MSP access revoked',
        message: 'This MTP pairing has been revoked by the organization',
      });
      return;
    }

    req.mtpPairing = {
      id: key.id,
      name: key.name,
      organizationId: key.organization_id,
      scopes: Array.isArray(key.permissions) ? key.permissions : [],
      pairedAt: key.paired_at ? new Date(key.paired_at) : null,
      pairingWindowExpiresAt: key.pairing_window_expires_at
        ? new Date(key.pairing_window_expires_at)
        : null,
      revokedAt: null,
      keyHash,
    };

    // Compatibility with org-scoped code paths
    req.organizationId = key.organization_id;

    next();
  } catch (error: any) {
    logger.error('MTP pairing authentication error', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during MTP pairing authentication',
    });
  }
};

/**
 * Gate for endpoints that require an already-bound pairing (poll, actions).
 * An unbound key can ONLY be used on the handshake endpoint.
 */
export const requirePairedMtpKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.mtpPairing) {
    res.status(401).json({
      success: false,
      kind: 'invalid_key',
      error: 'Not authenticated',
      message: 'MTP pairing authentication required',
    });
    return;
  }

  if (!req.mtpPairing.pairedAt) {
    res.status(403).json({
      success: false,
      kind: 'not_paired',
      error: 'Pairing not completed',
      message: 'Complete POST /api/v1/mtp/handshake before using this endpoint',
    });
    return;
  }

  next();
};

/**
 * Gate an MTP action on a required scope carried by the pairing key
 * (OpenSpec mtp-integration task 3.2). Scopes are the fine-grained grants the
 * customer attached when issuing the pairing key (`api_keys.permissions`);
 * `mtp:offboard` is issued separately from `mtp:poll` so the customer can
 * grant read-only polling without granting destructive offboards.
 *
 * Refuses with 403 `insufficient_scope` (frozen kind, mtp-contract.ts). Must
 * run AFTER authenticateMtpPairing + requirePairedMtpKey so `req.mtpPairing`
 * exists.
 */
export const requireMtpScope = (scope: ApiScope) => (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const scopes = req.mtpPairing?.scopes ?? [];
  if (!hasPermission(scopes, scope)) {
    logger.warn('MTP action refused: insufficient scope', {
      keyId: req.mtpPairing?.id,
      required: scope,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      kind: 'insufficient_scope',
      error: 'Insufficient scope',
      message: `This action requires the '${scope}' scope, which this pairing was not granted`,
    });
    return;
  }
  next();
};

/** Minimal RFC-5322-ish check — the MTP already validates before sending. */
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Require actor assertion on an MTP write action (design D4, task 3.2). The
 * bearer key auths the MSP firm; `X-Actor-Email` / `X-Actor-Name` identify the
 * specific technician for the append-only audit trail. Refuses with 400
 * `missing_actor_context` when either header is absent or malformed — a
 * destructive write is never performed without an attributable actor.
 *
 * The actor is read ONLY from headers set by the MTP core (which derives them
 * server-side from the tech's session), never from the request body.
 */
export const requireActorAssertion = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const emailRaw = req.headers['x-actor-email'];
  const nameRaw = req.headers['x-actor-name'];
  const email = typeof emailRaw === 'string' ? emailRaw.trim() : '';
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';

  if (!email || !name || !looksLikeEmail(email)) {
    res.status(400).json({
      success: false,
      kind: 'missing_actor_context',
      error: 'Actor assertion required',
      message:
        'Every MTP write action must carry X-Actor-Email and X-Actor-Name identifying the acting technician',
      requiredHeaders: ['X-Actor-Email', 'X-Actor-Name'],
    });
    return;
  }

  req.mtpActor = { email, name };
  next();
};
