/**
 * Helios licence heartbeat — via @obilabs/licensing.
 *
 * Helios is fully open-source and community-licensed: NOTHING is gated when the
 * operator does not pay (only the MSP portal, MTP, gates on payment). So this
 * service is a HEARTBEAT + donor/supporter attribution that NEVER blocks or
 * degrades the product — the same fail-open posture Aegis ships. It:
 *
 *   - routes the actual check through the shared @obilabs/licensing client (the
 *     one sanctioned path to the control plane — no raw /api/instances/* calls),
 *   - applies applyFailOpenPolicy (valid → run; unknown → run silently on the
 *     last-good cache; invalid → run + warn, degrade NOTHING),
 *   - persists ONLY authoritative answers (isPersistableStatus), so a transient
 *     outage is never written as a licence verdict,
 *   - reloads the last-good snapshot on boot so `unknown` carries a grace anchor.
 *
 * Replaces the previous 2-state service, which was dead code (zero importers,
 * init() never called) AND broken (read a non-existent `system_settings` table,
 * getVersion() threw under ESM). Instance identity + version now come from the
 * shared instance-identity / version helpers.
 */

import {
  validateLicense as validateLicenseRemote,
  applyFailOpenPolicy,
  isPersistableStatus,
  type LicenseResult,
  type CachedLicenseSnapshot,
} from '@obilabs/licensing';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { getOrCreateInstanceId } from './instance-identity.js';
import { getHeliosVersion } from '../utils/version.js';
import { deriveBaseUrl } from './license-config.js';

const LICENSE_STATE_KEY = 'license_state';
const DEFAULT_INTERVAL_MS = 20 * 60 * 1000; // 20 min — matches the Aegis heartbeat cadence.
const FLOOR_INTERVAL_MS = 5 * 60 * 1000; // never hammer the control plane.
const BOOT_TIMEOUT_MS = 10_000; // boot path can't wait long.

// Community feature floor. Helios never gates on the licence, so these are the
// features EVERY install has; a `valid` result may carry the control plane's
// `features` map, which we overlay for display only (donor == community today).
const COMMUNITY_FEATURES: Record<string, boolean> = {
  support_chat: false,
  priority_updates: false,
  custom_domain: false,
  api_access: true,
};

class LicenseService {
  private lastResult: LicenseResult | null = null;
  private cachedSnapshot: CachedLicenseSnapshot | null = null;
  private interval: NodeJS.Timeout | null = null;
  private shutdownController: AbortController | null = null;

  /**
   * Boot: load the last-good snapshot, fire one validation, then heartbeat on an
   * interval. NEVER throws — a licence check must never stop Helios from starting.
   */
  async init(): Promise<void> {
    const licenseKey = process.env.HELIOS_LICENSE_KEY;
    if (!licenseKey) {
      logger.info('[License] No HELIOS_LICENSE_KEY — community mode (no phone-home).');
      return;
    }

    // Setting a licence key IS the opt-in to validate it, so — unlike usage
    // telemetry (HELIOS_TELEMETRY_ENABLED, default off) — the licence heartbeat
    // runs whenever a key is present. A community install (no key) never phones
    // home from here.
    this.cachedSnapshot = await this.loadCachedSnapshot();
    await this.validate();

    const intervalMs = this.resolveIntervalMs();
    this.interval = setInterval(() => {
      this.validate().catch((err) =>
        logger.warn(`[License] heartbeat failed: ${err?.message ?? err}`),
      );
    }, intervalMs);
    logger.info(`[License] heartbeat scheduled every ${Math.round(intervalMs / 60000)} min`);
  }

  /**
   * Validate once against the control plane and apply the fail-open policy.
   * NEVER throws. Returns the three-state result; the product keeps running in
   * every case.
   */
  async validate(): Promise<LicenseResult | null> {
    const licenseKey = process.env.HELIOS_LICENSE_KEY;
    if (!licenseKey) return null;

    this.shutdownController = new AbortController();
    const result = await validateLicenseRemote(licenseKey, {
      baseUrl: deriveBaseUrl(),
      instanceId: await getOrCreateInstanceId(),
      version: getHeliosVersion(),
      timeoutMs: BOOT_TIMEOUT_MS,
      cached: this.cachedSnapshot,
      signal: this.shutdownController.signal,
    });
    this.lastResult = result;

    // Fail-open: allow is ALWAYS true for Helios. We only surface a warning on an
    // authoritative `invalid` (revoked/expired/…) — and even then we degrade
    // nothing, because there is nothing gated to degrade.
    const decision = applyFailOpenPolicy(result);
    if (decision.warn) {
      logger.warn(`[License] ${decision.explanation}`);
    } else {
      logger.info(`[License] state=${result.state} plan=${result.plan ?? 'community'} (${result.reason})`);
    }

    // Persist ONLY authoritative answers — an `unknown` (outage/timeout) must
    // never be written as a licence status (isPersistableStatus). This is the
    // canonical fix for "unreachable persisted as revoked".
    if (isPersistableStatus(result)) {
      const snapshot: CachedLicenseSnapshot = {
        state: result.state as 'valid' | 'invalid',
        reason: result.reason,
        product: result.product,
        plan: result.plan,
        expiresAt: result.expiresAt,
        authoritativeAt: result.authoritativeAt ?? result.checkedAt,
      };
      this.cachedSnapshot = snapshot;
      await this.storeCachedSnapshot(snapshot);
    }

    return result;
  }

  /** Current plan (donor/community/…), or 'community' when unknown. Never gates. */
  getPlan(): string {
    return this.lastResult?.plan ?? 'community';
  }

  /**
   * Feature map for display. Null-safe: community floor overlaid with the control
   * plane's `features` when we have a valid result. Helios does not gate on any
   * of these — they exist for parity + future UI (e.g. a supporter badge).
   */
  getFeatures(): Record<string, boolean> {
    const fromCp = this.lastResult?.features ?? null;
    if (!fromCp) return { ...COMMUNITY_FEATURES };
    // Only copy boolean-valued keys; the wire type is Record<string, unknown>.
    const overlay: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(fromCp)) {
      if (typeof v === 'boolean') overlay[k] = v;
    }
    return { ...COMMUNITY_FEATURES, ...overlay };
  }

  hasFeature(feature: string): boolean {
    return this.getFeatures()[feature] ?? false;
  }

  /** True when the control plane last confirmed a valid (donor/supporter) licence. */
  isLicensed(): boolean {
    return this.lastResult?.state === 'valid';
  }

  /** Stop the heartbeat and abort any in-flight validation. */
  shutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.shutdownController?.abort();
    this.shutdownController = null;
    logger.info('[License] shutdown complete');
  }

  private resolveIntervalMs(): number {
    const raw = Number(process.env.HELIOS_LICENSE_HEARTBEAT_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
    if (raw < FLOOR_INTERVAL_MS) {
      logger.warn(
        `[License] requested interval ${raw}ms is below the ${FLOOR_INTERVAL_MS}ms floor; clamping.`,
      );
      return FLOOR_INTERVAL_MS;
    }
    return raw;
  }

  private async loadCachedSnapshot(): Promise<CachedLicenseSnapshot | null> {
    try {
      const client = await db.getClient();
      try {
        const res = await client.query(
          `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
          [LICENSE_STATE_KEY],
        );
        const raw = res.rows[0]?.value;
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedLicenseSnapshot;
        // Only a persistable (authoritative) snapshot is a valid grace anchor.
        if (parsed?.state === 'valid' || parsed?.state === 'invalid') return parsed;
        return null;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.warn(`[License] could not load cached snapshot: ${(err as Error)?.message}`);
      return null;
    }
  }

  private async storeCachedSnapshot(snapshot: CachedLicenseSnapshot): Promise<void> {
    try {
      const client = await db.getClient();
      try {
        await client.query(
          `INSERT INTO system_settings (key, value, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [LICENSE_STATE_KEY, JSON.stringify(snapshot)],
        );
      } finally {
        client.release();
      }
    } catch (err) {
      logger.warn(`[License] could not store cached snapshot: ${(err as Error)?.message}`);
    }
  }
}

// Singleton instance.
export const licenseService = new LicenseService();
