import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { hashApiKey, validateApiKeyFormat, MTP_PAIRING_KEY_TYPE } from '../utils/apiKey.js';
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

declare global {
  namespace Express {
    interface Request {
      mtpPairing?: MtpPairingContext;
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
