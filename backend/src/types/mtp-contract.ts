import { z } from 'zod';

/**
 * Frozen MTP wire-contract shapes (OpenSpec: mtp-integration, task 2.4)
 *
 * These Zod schemas are the authoritative contract between Helios's
 * /api/v1/mtp/* surface and the MTP's HeliosAdapter (companion platform
 * change `mtp-helios-adapter`). The route handlers `.parse()` their payloads
 * through these schemas before responding, so contract drift fails loudly on
 * the Helios side rather than surfacing as a shape mismatch in the MTP.
 *
 * Versioning: additive changes only. Anything breaking bumps
 * MTP_API_VERSION, which the MTP reads from `server.api_version` at handshake.
 *
 * Error envelope (not Zod-frozen — documented here for the adapter):
 *   400 { kind: 'missing_actor_context' }              write action without X-Actor-* headers (D4)
 *   401 { kind: 'invalid_key' }                        unknown/garbled key
 *   403 { kind: 'insufficient_scope' }                 pairing lacks the action's scope (e.g. mtp:offboard)
 *   403 { kind: 'revoked', revoked: true, revoked_at } authoritative revocation (D6/g12)
 *   403 { kind: 'not_paired' }                         unbound key on a non-handshake endpoint
 *   404 { kind: 'user_not_found' }                     offboard target not in this organization
 *   409 { kind: 'already_paired' }                     handshake on an already-bound key
 *   410 { kind: 'window_closed' }                      handshake after the 15-min window
 */

export const MTP_API_VERSION = '1';

/**
 * Coarse product-level action set Helios supports (seam-review g18). The MTP
 * gates its UI on these — Helios is a directory/security product, so the set
 * differs from an ITSM product's (no tickets).
 *
 * `user.offboard` is advertised because the surface will support it; the
 * action endpoint itself lands in task group 3 (scope + actor asserted).
 */
export const MTP_CAPABILITIES = [
  'directory.read',
  'security.read',
  'user.offboard',
] as const;

export const MTP_POLL_ENDPOINT = '/api/v1/mtp/poll';

// ---------------------------------------------------------------------------
// POST /api/v1/mtp/handshake — single-use bind response
// ---------------------------------------------------------------------------

export const mtpHandshakeResponseSchema = z.object({
  organization: z.object({
    id: z.string(),
    name: z.string(),
    created_at: z.string(),
  }),
  pairing: z.object({
    id: z.string(),
    display_name: z.string(),
    scopes: z.array(z.string()),
  }),
  server: z.object({
    api_version: z.string(),
    capabilities: z.array(z.string()),
    poll_endpoint: z.string(),
  }),
});

export type MtpHandshakeResponse = z.infer<typeof mtpHandshakeResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/v1/mtp/poll — Helios-native directory/security aggregate (D3)
// ---------------------------------------------------------------------------

export const mtpPollResponseSchema = z.object({
  organization_id: z.string(),
  polled_at: z.string(),
  aggregates: z.object({
    /** Total portal directory users (organization_users). */
    user_count: z.number().int(),
    /** Active portal directory users. */
    active_user_count: z.number().int(),
    /** Google Workspace accounts currently suspended (gw_synced_users). */
    suspended_user_count: z.number().int(),
    /** Distinct users with unresolved high/critical security events. */
    at_risk_account_count: z.number().int(),
    /** Active synced groups (access_groups). */
    group_count: z.number().int(),
    /** Unresolved security events, all severities. */
    security_event_count_open: z.number().int(),
    /** Unresolved critical-severity security events. */
    security_event_count_critical: z.number().int(),
    /** Security events raised in the last 24 hours (any state). */
    security_event_count_last_24h: z.number().int(),
  }),
  google_workspace: z.object({
    module_enabled: z.boolean(),
    sync_status: z.string().nullable(),
    last_sync_at: z.string().nullable(),
    /** Seconds since last successful sync; null if never synced / disabled. */
    sync_age_seconds: z.number().int().nullable(),
  }),
});

export type MtpPollResponse = z.infer<typeof mtpPollResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/v1/mtp/actions/offboard-user — the one write action Helios exposes
// (OpenSpec mtp-integration task group 3, seam-review g11). Gated by the
// `mtp:offboard` scope + `X-Actor-*` assertion + audit. Per design D5 this is
// a distinct, explicit action — NEVER implied by revoking the MSP pairing.
// ---------------------------------------------------------------------------

export const mtpOffboardRequestSchema = z.object({
  /** Primary email of the Workspace user to offboard (must be in this org). */
  user_email: z.string().email(),
  /**
   * The account action. `suspend` is reversible; `delete` is PERMANENT (the
   * Workspace account and its data are removed and the licence freed).
   */
  action: z.enum(['suspend', 'delete']),
  /**
   * Optional: transfer the user's Drive to this account BEFORE suspend/delete.
   * If the transfer fails the whole action aborts (data is never destroyed
   * after a failed preservation step).
   */
  transfer_drive_to: z.string().email().optional(),
});

export type MtpOffboardRequest = z.infer<typeof mtpOffboardRequestSchema>;

export const mtpOffboardResponseSchema = z.object({
  success: z.boolean(),
  action: z.enum(['suspend', 'delete']),
  user_email: z.string(),
  /** Human-readable outcome, e.g. 'suspended', 'deleted'. */
  outcome: z.string(),
});

export type MtpOffboardResponse = z.infer<typeof mtpOffboardResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/v1/mtp/revoke — MSP self-revocation of the presenting pairing
// (OpenSpec mtp-integration task group 5 / platform `mtp-revoke-cascade`, g12).
// Actor-asserted + audited; NO scope required — a pairing may always sever its
// OWN access (kill switch), so gating it on a scope that legacy `mtp:poll`-only
// keys lack would defeat the purpose. Per design D5 this ends MSP ACCESS ONLY:
// it touches the pairing key + audit trail and NEVER a Google Workspace user.
//
// Idempotent: an already-revoked pairing is blocked upstream by
// authenticateMtpPairing (403 `kind:'revoked'`); the `already_revoked` flag
// below only covers the narrow TOCTOU race where the key is revoked between the
// auth check and the handler.
// ---------------------------------------------------------------------------

export const mtpRevokeResponseSchema = z.object({
  success: z.boolean(),
  revoked: z.boolean(),
  /** ISO timestamp of the revocation; null on the idempotent no-op path. */
  revoked_at: z.string().nullable().optional(),
  /** True when the pairing was already revoked (idempotent no-op). */
  already_revoked: z.boolean().optional(),
});

export type MtpRevokeResponse = z.infer<typeof mtpRevokeResponseSchema>;
