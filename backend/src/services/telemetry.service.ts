/**
 * Telemetry Service
 *
 * Sends at most one small payload per interval to the control plane
 * (POST /api/instances/heartbeat). The rules for what is sent live in
 * lib/telemetry-policy.ts:
 *   - liveness ping `{ instance_id, version }` — on by default, can be turned off;
 *   - usage heartbeat — off by default, opt-in;
 *   - HELIOS_TELEMETRY_ENABLED=false turns everything off.
 * Never sends organization name, domain, emails, credentials or directory data.
 */

import { db } from '../database/connection.js';
import { getOrCreateInstanceId } from './instance-identity.js';
import { getHeliosVersion } from '../utils/version.js';
import { getEffectiveTelemetryState } from './telemetry-consent.js';
import {
  buildLivenessPayload,
  buildUsagePayload,
  decideTelemetrySend,
  isTelemetryKillSwitchOn,
  userCountRange,
  type TelemetrySend,
} from '../lib/telemetry-policy.js';

interface HeartbeatResponse {
  success: boolean;
  message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

class TelemetryService {
  private started = false;
  private usageEnabled = false;
  private startTime: Date = new Date();

  // Usage counters (only collected while usage telemetry is on; reset after each send)
  private apiUsage: Map<string, number> = new Map();
  private commandUsage: Map<string, number> = new Map();
  private uiActions: Map<string, number> = new Map();

  private heartbeatInterval: NodeJS.Timeout | null = null;

  private readonly TELEMETRY_ENDPOINT = process.env.HELIOS_TELEMETRY_URL || 'https://api.obilabs.dev/api/instances/heartbeat';

  /**
   * Called once at startup. Schedules the periodic tick unless the operator has
   * turned telemetry off entirely. The first tick runs now; it sends nothing until
   * first-run setup is complete.
   */
  async init(): Promise<void> {
    if (isTelemetryKillSwitchOn()) {
      console.log('[Telemetry] Disabled by HELIOS_TELEMETRY_ENABLED=false (no liveness ping, no usage data, no licence checks)');
      return;
    }

    this.started = true;
    await this.tick();

    const intervalMs = this.getHeartbeatInterval();
    this.heartbeatInterval = setInterval(() => {
      this.tick().catch(err => console.warn('[Telemetry] tick failed:', err?.message ?? err));
    }, intervalMs);
    console.log(`[Telemetry] Scheduled every ${intervalMs / 60000} minutes`);
  }

  /** Daily; hourly for usage telemetry on a licensed install (unchanged cadence). */
  private getHeartbeatInterval(): number {
    return process.env.HELIOS_LICENSE_KEY ? HOUR_MS : DAY_MS;
  }

  /** Re-read consent and send whatever the policy allows. Never throws. */
  async tick(): Promise<TelemetrySend> {
    if (!this.started || isTelemetryKillSwitchOn()) return 'none';
    try {
      const state = await getEffectiveTelemetryState();
      this.usageEnabled = state.usage;
      const decision = decideTelemetrySend(state, {
        setupComplete: await this.isSetupComplete(),
        hasLicenseKey: !!process.env.HELIOS_LICENSE_KEY,
      });
      if (decision === 'none') return decision;

      const instanceId = await getOrCreateInstanceId();
      const version = getHeliosVersion();
      const payload = decision === 'usage'
        ? buildUsagePayload(instanceId, version, {
            user_count_range: await this.getUserCountRange(),
            modules_enabled: await this.getEnabledModules(),
            uptime_hours: this.getUptimeHours(),
            outcome: await this.getLastSyncStatus(),
            api_usage: Object.fromEntries(this.apiUsage),
            command_usage: Object.fromEntries(this.commandUsage),
            ui_actions: Object.fromEntries(this.uiActions),
          }, process.env.HELIOS_LICENSE_KEY || undefined)
        : buildLivenessPayload(instanceId, version);

      const ok = await this.post(payload, version);
      if (ok && decision === 'usage') {
        this.apiUsage.clear();
        this.commandUsage.clear();
        this.uiActions.clear();
      }
      return decision;
    } catch (error: any) {
      console.warn(`[Telemetry] ${error?.message ?? error}`);
      return 'none';
    }
  }

  /** Call after a consent change so counters stop or start straight away. */
  async refreshConsent(): Promise<void> {
    try {
      this.usageEnabled = (await getEffectiveTelemetryState()).usage;
      if (!this.usageEnabled) {
        this.apiUsage.clear();
        this.commandUsage.clear();
        this.uiActions.clear();
      }
    } catch {
      // keep the previous value
    }
  }

  private async post(payload: object, version: string): Promise<boolean> {
    try {
      const response = await fetch(this.TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `helios/${version}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        console.warn(`[Telemetry] Heartbeat failed: HTTP ${response.status}`);
        return false;
      }
      const data = await response.json().catch(() => ({})) as HeartbeatResponse;
      console.log(`[Telemetry] Heartbeat sent: ${data.message || 'OK'}`);
      return true;
    } catch (error: any) {
      // Fail silently - telemetry must never break the app
      console.warn(`[Telemetry] Heartbeat error: ${error?.message ?? error}`);
      return false;
    }
  }

  trackApiCall(apiName: string): void {
    if (!this.usageEnabled) return;
    this.apiUsage.set(apiName, (this.apiUsage.get(apiName) || 0) + 1);
  }

  trackCommand(commandName: string): void {
    if (!this.usageEnabled) return;
    this.commandUsage.set(commandName, (this.commandUsage.get(commandName) || 0) + 1);
  }

  trackUiAction(actionName: string): void {
    if (!this.usageEnabled) return;
    this.uiActions.set(actionName, (this.uiActions.get(actionName) || 0) + 1);
  }

  private async isSetupComplete(): Promise<boolean> {
    try {
      const result = await db.query('SELECT 1 FROM organizations LIMIT 1');
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  private async getUserCountRange(): Promise<string> {
    const result = await db.query(
      'SELECT COUNT(*) AS count FROM organization_users WHERE is_active = true',
    );
    return userCountRange(parseInt(result.rows[0]?.count || '0', 10));
  }

  private async getEnabledModules(): Promise<string[]> {
    try {
      const result = await db.query('SELECT slug FROM modules WHERE is_enabled = true');
      return result.rows.map((row: any) => row.slug);
    } catch {
      return [];
    }
  }

  private async getLastSyncStatus(): Promise<'success' | 'error' | 'none'> {
    try {
      const result = await db.query('SELECT status FROM sync_logs ORDER BY created_at DESC LIMIT 1');
      if (!result.rows[0]) return 'none';
      return result.rows[0].status === 'success' ? 'success' : 'error';
    } catch {
      return 'none';
    }
  }

  private getUptimeHours(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / HOUR_MS);
  }

  /** True while the scheduler runs (i.e. the kill-switch is not set). */
  isEnabled(): boolean {
    return this.started;
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.started = false;
    console.log('[Telemetry] Shutdown complete');
  }
}

export const telemetryService = new TelemetryService();
