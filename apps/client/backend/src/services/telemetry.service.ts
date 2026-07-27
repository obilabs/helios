/**
 * Telemetry Service
 *
 * Sends anonymous usage data to helios.gridworx.io for usage-driven development.
 * - Disabled by default for self-hosted instances
 * - Collects anonymous aggregate data only
 * - Never collects PII, credentials, or organization-specific data
 */

import { db } from '../database/connection.js';
import crypto from 'crypto';

interface TelemetryPayload {
  instance_id: string;
  version: string;
  license_key?: string;
  user_count_range: string;
  modules_enabled: string[];
  uptime_hours: number;
  last_sync_status: 'success' | 'error' | 'none';
  api_usage: Record<string, number>;
  command_usage: Record<string, number>;
  ui_actions: Record<string, number>;
}

interface HeartbeatResponse {
  success: boolean;
  message?: string;
  next_heartbeat_seconds?: number;
}

class TelemetryService {
  private enabled: boolean = false;
  private instanceId: string | null = null;
  private startTime: Date = new Date();

  // Usage counters (reset after each heartbeat)
  private apiUsage: Map<string, number> = new Map();
  private commandUsage: Map<string, number> = new Map();
  private uiActions: Map<string, number> = new Map();

  // Heartbeat interval handle
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Helios web endpoint
  private readonly TELEMETRY_ENDPOINT = process.env.HELIOS_TELEMETRY_URL || 'https://helios.gridworx.io/api/instances/heartbeat';

  constructor() {
    // Will be initialized async in init()
  }

  /**
   * Initialize the telemetry service
   * Called once at application startup
   */
  async init(): Promise<void> {
    // Check if telemetry is enabled
    this.enabled = process.env.HELIOS_TELEMETRY_ENABLED === 'true';

    if (!this.enabled) {
      console.log('[Telemetry] Disabled - set HELIOS_TELEMETRY_ENABLED=true to enable');
      return;
    }

    try {
      // Get or create instance ID
      this.instanceId = await this.getOrCreateInstanceId();
      console.log(`[Telemetry] Enabled - Instance ID: ${this.instanceId}`);

      // Send initial heartbeat
      await this.sendHeartbeat();

      // Schedule periodic heartbeats
      const intervalMs = this.getHeartbeatInterval();
      this.heartbeatInterval = setInterval(() => {
        this.sendHeartbeat().catch(err => {
          console.error('[Telemetry] Heartbeat failed:', err.message);
        });
      }, intervalMs);

      console.log(`[Telemetry] Heartbeat scheduled every ${intervalMs / 1000 / 60} minutes`);
    } catch (error) {
      console.error('[Telemetry] Initialization failed:', error);
      this.enabled = false;
    }
  }

  /**
   * Get heartbeat interval based on license status
   * Hosted (licensed): hourly
   * Self-hosted: daily
   */
  private getHeartbeatInterval(): number {
    const hasLicense = !!process.env.HELIOS_LICENSE_KEY;
    return hasLicense
      ? 60 * 60 * 1000      // Hosted: hourly
      : 24 * 60 * 60 * 1000; // Self-hosted: daily
  }

  /**
   * Get or create a unique instance ID
   * Stored in organization_settings table
   */
  private async getOrCreateInstanceId(): Promise<string> {
    const client = await db.getClient();
    try {
      // Check for existing instance ID
      const result = await client.query(`
        SELECT value FROM organization_settings
        WHERE key = 'instance_id'
        LIMIT 1
      `);

      if (result.rows[0]?.value) {
        return result.rows[0].value;
      }

      // Generate new instance ID
      const instanceId = `helios_${crypto.randomUUID().replace(/-/g, '').slice(0, 21)}`;

      // Store it
      await client.query(`
        INSERT INTO organization_settings (key, value, created_at, updated_at)
        VALUES ('instance_id', $1, NOW(), NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `, [instanceId]);

      return instanceId;
    } finally {
      client.release();
    }
  }

  /**
   * Track an API relay call
   * Called when Developer Console proxies an API request
   */
  trackApiCall(apiName: string): void {
    if (!this.enabled) return;
    this.apiUsage.set(apiName, (this.apiUsage.get(apiName) || 0) + 1);
  }

  /**
   * Track a command execution
   * Called when user triggers sync, bulk operations, etc.
   */
  trackCommand(commandName: string): void {
    if (!this.enabled) return;
    this.commandUsage.set(commandName, (this.commandUsage.get(commandName) || 0) + 1);
  }

  /**
   * Track a UI action
   * Called for significant UI interactions
   */
  trackUiAction(actionName: string): void {
    if (!this.enabled) return;
    this.uiActions.set(actionName, (this.uiActions.get(actionName) || 0) + 1);
  }

  /**
   * Get user count range (anonymized)
   */
  private async getUserCountRange(): Promise<string> {
    const client = await db.getClient();
    try {
      const result = await client.query(`
        SELECT COUNT(*) as count FROM organization_users WHERE is_active = true
      `);
      const count = parseInt(result.rows[0]?.count || '0');

      if (count <= 10) return '1-10';
      if (count <= 50) return '11-50';
      if (count <= 100) return '51-100';
      if (count <= 500) return '101-500';
      if (count <= 1000) return '501-1000';
      return '1000+';
    } finally {
      client.release();
    }
  }

  /**
   * Get list of enabled modules
   */
  private async getEnabledModules(): Promise<string[]> {
    const client = await db.getClient();
    try {
      const result = await client.query(`
        SELECT slug FROM modules WHERE is_enabled = true
      `);
      return result.rows.map(row => row.slug);
    } catch {
      // Table might not exist yet
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * Get last sync status
   */
  private async getLastSyncStatus(): Promise<'success' | 'error' | 'none'> {
    const client = await db.getClient();
    try {
      const result = await client.query(`
        SELECT status FROM sync_logs
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (!result.rows[0]) return 'none';
      return result.rows[0].status === 'success' ? 'success' : 'error';
    } catch {
      return 'none';
    } finally {
      client.release();
    }
  }

  /**
   * Get uptime in hours
   */
  private getUptimeHours(): number {
    const uptimeMs = Date.now() - this.startTime.getTime();
    return Math.floor(uptimeMs / (1000 * 60 * 60));
  }

  /**
   * Get package version
   */
  private getVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require('../../package.json');
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Send heartbeat to helios.gridworx.io
   */
  async sendHeartbeat(): Promise<void> {
    if (!this.enabled || !this.instanceId) return;

    try {
      const payload: TelemetryPayload = {
        instance_id: this.instanceId,
        version: this.getVersion(),
        license_key: process.env.HELIOS_LICENSE_KEY || undefined,
        user_count_range: await this.getUserCountRange(),
        modules_enabled: await this.getEnabledModules(),
        uptime_hours: this.getUptimeHours(),
        last_sync_status: await this.getLastSyncStatus(),
        api_usage: Object.fromEntries(this.apiUsage),
        command_usage: Object.fromEntries(this.commandUsage),
        ui_actions: Object.fromEntries(this.uiActions),
      };

      const response = await fetch(this.TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `helios-client/${payload.version}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        const data = await response.json() as HeartbeatResponse;
        console.log(`[Telemetry] Heartbeat sent successfully: ${data.message || 'OK'}`);

        // Reset counters after successful send
        this.apiUsage.clear();
        this.commandUsage.clear();
        this.uiActions.clear();
      } else {
        console.warn(`[Telemetry] Heartbeat failed: HTTP ${response.status}`);
      }
    } catch (error: any) {
      // Fail silently - telemetry should never break the app
      console.warn(`[Telemetry] Heartbeat error: ${error.message}`);
    }
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current instance ID
   */
  getInstanceId(): string | null {
    return this.instanceId;
  }

  /**
   * Shutdown telemetry service
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    console.log('[Telemetry] Shutdown complete');
  }
}

// Singleton instance
export const telemetryService = new TelemetryService();
