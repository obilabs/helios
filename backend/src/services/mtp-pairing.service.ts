import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import {
  generateApiKey,
  MTP_PAIRING_KEY_TYPE,
  MTP_PAIRING_WINDOW_MINUTES,
} from '../utils/apiKey.js';

/**
 * MTP pairing service (OpenSpec: mtp-integration, tasks 1.3 / 1.4)
 *
 * Lifecycle of a `helios-mtp-pairing` key:
 *
 *   issuePairing()      admin mints a key; opens a 15-minute pairing window
 *   completeHandshake() the MTP's FIRST handshake atomically and permanently
 *                       binds the key (single-statement conditional UPDATE —
 *                       design D2; see the SQL below)
 *   revokePairing()     authoritative revocation: records an explicit
 *                       "MSP access revoked" security event so the MTP learns
 *                       of a real revocation rather than inferring it from a
 *                       poll 401 (design D6, seam-review g12)
 *
 * Revoking a pairing ONLY ends the MSP's access to Helios. It never touches
 * Google Workspace accounts (design D5 — offboarding is a distinct, scoped,
 * actor-asserted MTP action).
 */

/** Scopes granted to a new pairing unless the issuer narrows/extends them. */
const DEFAULT_PAIRING_SCOPES = ['mtp:poll'];

export interface IssuedPairing {
  /** Plaintext pairing key — shown ONCE, never stored. */
  key: string;
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  pairingWindowExpiresAt: Date;
}

export interface BoundPairing {
  id: string;
  organizationId: string;
  name: string;
  scopes: string[];
  pairedAt: Date;
}

export type HandshakeFailureKind =
  | 'already_paired'
  | 'window_closed'
  | 'revoked'
  | 'invalid_key';

// NOTE: a flat shape (not a discriminated union) because this codebase
// compiles with strict:false, where boolean-discriminant narrowing does not
// work. `ok:true` guarantees `pairing` is set; `ok:false` guarantees `kind`.
export interface HandshakeResult {
  ok: boolean;
  pairing?: BoundPairing;
  kind?: HandshakeFailureKind;
  revokedAt?: Date | null;
}

class MtpPairingService {
  /**
   * Mint a new pairing key for this organization. Opens the 15-minute
   * pairing window; the key is useless after the window closes unbound.
   */
  async issuePairing(
    organizationId: string,
    opts: {
      name: string;
      description?: string;
      scopes?: string[];
      createdBy?: string;
    }
  ): Promise<IssuedPairing> {
    const { key, hash, prefix } = generateApiKey();
    const scopes =
      opts.scopes && opts.scopes.length > 0 ? opts.scopes : DEFAULT_PAIRING_SCOPES;

    const result = await db.query(
      `INSERT INTO api_keys (
        organization_id,
        name,
        description,
        type,
        key_hash,
        key_prefix,
        permissions,
        created_by,
        pairing_window_expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + ($9::int * INTERVAL '1 minute'))
      RETURNING id, name, key_prefix, permissions, pairing_window_expires_at`,
      [
        organizationId,
        opts.name,
        opts.description ??
          'MTP pairing key (single-use; binds on first handshake)',
        MTP_PAIRING_KEY_TYPE,
        hash,
        prefix,
        JSON.stringify(scopes),
        opts.createdBy ?? null,
        MTP_PAIRING_WINDOW_MINUTES,
      ]
    );

    const row = result.rows[0];

    logger.info('MTP pairing key issued', {
      keyId: row.id,
      organizationId,
      windowExpiresAt: row.pairing_window_expires_at,
    });

    return {
      key,
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      scopes,
      pairingWindowExpiresAt: new Date(row.pairing_window_expires_at),
    };
  }

  /**
   * Complete the single-use binding for the first handshake.
   *
   * SECURITY (design D2 — mirror of Aegis's hardened pattern): the bind is a
   * SINGLE-STATEMENT conditional UPDATE. The `paired_at IS NULL` predicate
   * inside the UPDATE's WHERE clause is the race guard — when two handshakes
   * race on the same unbound key, Postgres row-level locking guarantees
   * exactly one UPDATE matches and binds; the loser matches zero rows and is
   * refused. Do NOT rewrite this as SELECT-then-UPDATE.
   *
   * When the atomic claim matches nothing, a follow-up read-only SELECT
   * classifies the refusal (already_paired / window_closed / revoked /
   * invalid_key) purely for the error response — it plays no part in binding.
   */
  async completeHandshake(
    keyHash: string,
    ctx: { ip: string | null; userAgent: string | null }
  ): Promise<HandshakeResult> {
    const bind = await db.query(
      `UPDATE api_keys
          SET paired_at = NOW(),
              paired_from_ip = $2,
              paired_user_agent = $3,
              last_used_at = NOW()
        WHERE key_hash = $1
          AND type = 'helios-mtp-pairing'
          AND is_active = true
          AND revoked_at IS NULL
          AND paired_at IS NULL
          AND pairing_window_expires_at > NOW()
      RETURNING id, organization_id, name, permissions, paired_at`,
      [keyHash, ctx.ip, ctx.userAgent]
    );

    if (bind.rows.length === 1) {
      const row = bind.rows[0];

      // Record the successful bind as a security event (visibility for the
      // customer: who/where paired, so a hijacked key is detectable).
      await this.recordSecurityEvent(row.organization_id, {
        eventType: 'msp_access_paired',
        severity: 'info',
        description: `MTP pairing "${row.name}" bound from ${ctx.ip ?? 'unknown IP'}`,
        metadata: {
          api_key_id: row.id,
          paired_from_ip: ctx.ip,
          paired_user_agent: ctx.userAgent,
        },
      });

      logger.info('MTP pairing bound', {
        keyId: row.id,
        organizationId: row.organization_id,
        pairedFromIp: ctx.ip,
      });

      return {
        ok: true,
        pairing: {
          id: row.id,
          organizationId: row.organization_id,
          name: row.name,
          scopes: Array.isArray(row.permissions) ? row.permissions : [],
          pairedAt: new Date(row.paired_at),
        },
      };
    }

    // Atomic claim matched nothing — classify why (read-only diagnosis).
    const probe = await db.query(
      `SELECT paired_at, pairing_window_expires_at, revoked_at, is_active
         FROM api_keys
        WHERE key_hash = $1
          AND type = 'helios-mtp-pairing'`,
      [keyHash]
    );

    if (probe.rows.length === 0) {
      return { ok: false, kind: 'invalid_key' };
    }

    const key = probe.rows[0];
    if (key.revoked_at || !key.is_active) {
      return {
        ok: false,
        kind: 'revoked',
        revokedAt: key.revoked_at ? new Date(key.revoked_at) : null,
      };
    }
    if (key.paired_at) {
      return { ok: false, kind: 'already_paired' };
    }
    // Not paired, not revoked, active — the window must have closed.
    return { ok: false, kind: 'window_closed' };
  }

  /**
   * Authoritatively revoke a pairing (design D6). Records an explicit
   * "MSP access revoked" security event; a subsequent /api/v1/mtp/* call
   * returns the authoritative revoked signal (403 kind:'revoked'), never a
   * bare 401 the MTP would have to guess about.
   *
   * NOTE (design D5): this ends MSP access ONLY. It never offboards or
   * suspends Google Workspace users.
   */
  async revokePairing(
    keyId: string,
    organizationId: string,
    opts: { revokedBy?: string; reason?: string } = {}
  ): Promise<{ id: string; name: string; revokedAt: Date } | null> {
    const result = await db.query(
      `UPDATE api_keys
          SET is_active = false,
              revoked_at = NOW(),
              revoked_by = $3
        WHERE id = $1
          AND organization_id = $2
          AND type = 'helios-mtp-pairing'
          AND revoked_at IS NULL
      RETURNING id, name, revoked_at`,
      [keyId, organizationId, opts.revokedBy ?? null]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    await this.recordSecurityEvent(organizationId, {
      eventType: 'msp_access_revoked',
      severity: 'medium',
      description: `MSP access revoked: MTP pairing "${row.name}" was revoked${
        opts.reason ? ` (${opts.reason})` : ''
      }`,
      metadata: {
        api_key_id: row.id,
        revoked_by: opts.revokedBy ?? null,
        reason: opts.reason ?? null,
      },
    });

    logger.info('MTP pairing revoked', {
      keyId: row.id,
      organizationId,
      revokedBy: opts.revokedBy,
    });

    return { id: row.id, name: row.name, revokedAt: new Date(row.revoked_at) };
  }

  private async recordSecurityEvent(
    organizationId: string,
    event: {
      eventType: string;
      severity: string;
      description: string;
      metadata: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO security_events (
          organization_id, event_type, severity, source, description, metadata
        ) VALUES ($1, $2, $3, 'mtp', $4, $5)`,
        [
          organizationId,
          event.eventType,
          event.severity,
          event.description,
          JSON.stringify(event.metadata),
        ]
      );
    } catch (error: any) {
      // Event recording must never block the pairing lifecycle itself.
      logger.error('Failed to record MTP security event', {
        organizationId,
        eventType: event.eventType,
        error: error.message,
      });
    }
  }
}

export const mtpPairingService = new MtpPairingService();
