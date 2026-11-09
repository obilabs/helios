/**
 * Telemetry policy — what Helios may send to the control plane, and when.
 *
 * Two different things, defaulted differently (same model as Aegis):
 *
 *   - Liveness ping: ON by default, one setting to turn off. Carries ONLY
 *     `{ instance_id, version }`. It exists so installs without a licence key
 *     are counted as running. The control plane derives the product from the
 *     `helios_` prefix of the instance id, so no separate product field is sent.
 *   - Usage telemetry: OFF by default, opt-in. Aggregate ranges and counters.
 *
 * `HELIOS_TELEMETRY_ENABLED` (environment) beats any in-app setting:
 *   - `false`  → master kill-switch: nothing is sent, liveness and licence
 *                re-validation included. Operators who copied the previous
 *                `.env.example` (which shipped `false` and said "disables
 *                telemetry") keep exactly that promise.
 *   - `true`   → usage telemetry on (its previous meaning), liveness on.
 *   - unset    → the in-app settings decide (defaults: liveness on, usage off).
 *
 * Pure functions only (no DB, no network) so the rules are unit-testable.
 */

export type EnvOverride = 'disabled' | 'usage_enabled' | null;

export interface StoredTelemetryConsent {
  liveness?: boolean | null;
  usage?: boolean | null;
}

export interface EffectiveTelemetryState {
  liveness: boolean;
  usage: boolean;
  /** Set when the environment variable fixes the state; the in-app toggles are then read-only. */
  envOverride: EnvOverride;
}

export const DEFAULT_LIVENESS = true;
export const DEFAULT_USAGE = false;

type Env = Record<string, string | undefined>;

export function telemetryEnvOverride(env: Env = process.env): EnvOverride {
  const raw = (env.HELIOS_TELEMETRY_ENABLED ?? '').trim().toLowerCase();
  if (raw === '') return null;
  if (['false', '0', 'no', 'off'].includes(raw)) return 'disabled';
  if (['true', '1', 'yes', 'on'].includes(raw)) return 'usage_enabled';
  return null;
}

/** True when the operator has turned off ALL outbound telemetry, liveness and licence checks included. */
export function isTelemetryKillSwitchOn(env: Env = process.env): boolean {
  return telemetryEnvOverride(env) === 'disabled';
}

export function resolveTelemetryState(
  stored: StoredTelemetryConsent,
  env: Env = process.env,
): EffectiveTelemetryState {
  const envOverride = telemetryEnvOverride(env);
  if (envOverride === 'disabled') return { liveness: false, usage: false, envOverride };
  if (envOverride === 'usage_enabled') return { liveness: true, usage: true, envOverride };
  return {
    liveness: typeof stored.liveness === 'boolean' ? stored.liveness : DEFAULT_LIVENESS,
    usage: typeof stored.usage === 'boolean' ? stored.usage : DEFAULT_USAGE,
    envOverride,
  };
}

export type TelemetrySend = 'usage' | 'liveness' | 'none';

/**
 * Which payload a scheduled tick sends.
 *
 * - Usage heartbeat already carries the instance id and version, so when usage is
 *   on it replaces the liveness ping (the control plane keeps one row per instance
 *   per hour; a separate liveness ping could crowd out the usage row).
 * - With a licence key set, the licence check already reports the install as
 *   running, so no separate liveness ping is sent.
 * - Nothing is sent before first-run setup is complete, so the setup wizard can
 *   disclose the ping before it is ever sent.
 */
export function decideTelemetrySend(
  state: EffectiveTelemetryState,
  opts: { setupComplete: boolean; hasLicenseKey: boolean },
): TelemetrySend {
  if (!opts.setupComplete) return 'none';
  if (state.usage) return 'usage';
  if (state.liveness && !opts.hasLicenseKey) return 'liveness';
  return 'none';
}

export interface LivenessPayload {
  instance_id: string;
  version: string;
}

export function buildLivenessPayload(instanceId: string, version: string): LivenessPayload {
  return { instance_id: instanceId, version };
}

export interface UsageMetrics {
  user_count_range: string;
  modules_enabled: string[];
  uptime_hours: number;
  outcome: 'success' | 'error' | 'none';
  api_usage: Record<string, number>;
  command_usage: Record<string, number>;
  ui_actions: Record<string, number>;
}

export interface UsagePayload extends LivenessPayload, UsageMetrics {
  license_key?: string;
}

/**
 * Opt-in usage heartbeat. Builds the object field by field so nothing outside
 * this list (organization name, domain, emails, IP) can ride along.
 */
export function buildUsagePayload(
  instanceId: string,
  version: string,
  metrics: UsageMetrics,
  licenseKey?: string,
): UsagePayload {
  const payload: UsagePayload = {
    instance_id: instanceId,
    version,
    user_count_range: metrics.user_count_range,
    modules_enabled: [...metrics.modules_enabled],
    uptime_hours: metrics.uptime_hours,
    outcome: metrics.outcome,
    api_usage: { ...metrics.api_usage },
    command_usage: { ...metrics.command_usage },
    ui_actions: { ...metrics.ui_actions },
  };
  if (licenseKey) payload.license_key = licenseKey;
  return payload;
}

export function userCountRange(count: number): string {
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 100) return '51-100';
  if (count <= 500) return '101-500';
  if (count <= 1000) return '501-1000';
  return '1000+';
}
