/**
 * Telemetry consent — the in-app settings behind the telemetry policy.
 *
 * Stored install-wide in `system_settings` (next to `instance_id`, which is also
 * install-level). Every change is written to `security_audit_logs`, which is
 * append-only and hash-chained, so the consent history cannot be edited.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { securityAudit } from './security-audit.service.js';
import {
  resolveTelemetryState,
  type EffectiveTelemetryState,
  type StoredTelemetryConsent,
} from '../lib/telemetry-policy.js';

const LIVENESS_KEY = 'telemetry_liveness_enabled';
const USAGE_KEY = 'telemetry_usage_enabled';

export const TELEMETRY_CONSENT_ACTION = 'settings.telemetry.consent';

function parseBool(value: unknown): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export async function loadStoredTelemetryConsent(): Promise<StoredTelemetryConsent> {
  try {
    const res = await db.query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1::text[])`,
      [[LIVENESS_KEY, USAGE_KEY]],
    );
    const byKey = new Map<string, unknown>(res.rows.map((r: any) => [r.key, r.value]));
    return {
      liveness: parseBool(byKey.get(LIVENESS_KEY)),
      usage: parseBool(byKey.get(USAGE_KEY)),
    };
  } catch (err) {
    logger.warn(`[Telemetry] could not read consent settings: ${(err as Error)?.message}`);
    return {};
  }
}

export async function getEffectiveTelemetryState(): Promise<EffectiveTelemetryState> {
  return resolveTelemetryState(await loadStoredTelemetryConsent());
}

export interface ConsentActor {
  organizationId: string;
  actorId?: string;
  actorEmail?: string;
  actorType?: 'user' | 'anonymous' | 'system';
  source: 'setup_wizard' | 'settings';
  requestId?: string;
}

/**
 * Save a consent change and record it. Only the fields present in `patch` are
 * written. Returns the effective state after the change.
 */
export async function saveTelemetryConsent(
  patch: { liveness?: boolean; usage?: boolean },
  actor: ConsentActor,
): Promise<EffectiveTelemetryState> {
  const before = await loadStoredTelemetryConsent();
  const entries: Array<[string, boolean]> = [];
  if (typeof patch.liveness === 'boolean') entries.push([LIVENESS_KEY, patch.liveness]);
  if (typeof patch.usage === 'boolean') entries.push([USAGE_KEY, patch.usage]);

  for (const [key, value] of entries) {
    await db.query(
      `INSERT INTO system_settings (key, value, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, String(value)],
    );
  }

  const after = await loadStoredTelemetryConsent();
  // The recorded consent is the admin's choice, independent of any env override.
  const beforeState = resolveTelemetryState(before, {});
  const afterState = resolveTelemetryState(after, {});

  await securityAudit.log({
    action: TELEMETRY_CONSENT_ACTION,
    actionCategory: 'admin',
    actorType: actor.actorType ?? 'user',
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    organizationId: actor.organizationId,
    requestId: actor.requestId,
    targetType: 'telemetry',
    targetIdentifier: actor.source,
    outcome: 'success',
    changesBefore: { liveness: beforeState.liveness, usage: beforeState.usage },
    changesAfter: { liveness: afterState.liveness, usage: afterState.usage },
  });

  return resolveTelemetryState(after);
}
