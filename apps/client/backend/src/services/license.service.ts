/**
 * License Validation Service
 *
 * Validates license with helios.gridworx.io and caches the result.
 * Provides feature flags based on license plan.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface LicenseFeatures {
  support_chat: boolean;
  priority_updates: boolean;
  custom_domain: boolean;
  api_access: boolean;
}

interface LicenseValidation {
  valid: boolean;
  plan: 'community' | 'starter' | 'pro' | 'msp';
  features: LicenseFeatures;
  expires_at: string | null;
  message?: string;
}

interface CachedLicense extends LicenseValidation {
  cached_at: number;
}

class LicenseService {
  private cache: CachedLicense | null = null;
  private validationInterval: NodeJS.Timeout | null = null;

  // Cache for 24 hours
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  // Validation endpoint
  private readonly VALIDATE_ENDPOINT =
    process.env.HELIOS_LICENSE_URL || 'https://helios.gridworx.io/api/instances/validate';

  // Default community features
  private readonly COMMUNITY_FEATURES: LicenseFeatures = {
    support_chat: false,
    priority_updates: false,
    custom_domain: false,
    api_access: true,
  };

  /**
   * Initialize the license service
   * Called once at application startup
   */
  async init(): Promise<void> {
    const licenseKey = process.env.HELIOS_LICENSE_KEY;

    if (!licenseKey) {
      logger.info('[License] No license key configured - running in community mode');
      this.cache = {
        valid: false,
        plan: 'community',
        features: this.COMMUNITY_FEATURES,
        expires_at: null,
        message: 'No license key - community mode',
        cached_at: Date.now(),
      };
      return;
    }

    logger.info('[License] Validating license...');

    // Initial validation
    await this.validate();

    // Schedule periodic validation (every 24 hours)
    this.validationInterval = setInterval(
      () => this.validate().catch((err) => logger.warn('[License] Validation failed:', err.message)),
      this.CACHE_TTL_MS
    );
  }

  /**
   * Validate license with helios-web
   */
  async validate(): Promise<LicenseValidation> {
    const licenseKey = process.env.HELIOS_LICENSE_KEY;

    if (!licenseKey) {
      return this.getCommunityLicense();
    }

    try {
      const instanceId = await this.getInstanceId();
      const version = this.getVersion();

      const response = await fetch(this.VALIDATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `helios-client/${version}`,
          'X-Helios-API-Version': '1',
        },
        body: JSON.stringify({
          instance_id: instanceId,
          license_key: licenseKey,
          version: version,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.warn(`[License] Validation failed: HTTP ${response.status}`);
        return this.useCachedOrCommunity();
      }

      const data = (await response.json()) as LicenseValidation;

      // Cache the result
      this.cache = {
        ...data,
        cached_at: Date.now(),
      };

      logger.info(`[License] Valid: ${data.valid}, Plan: ${data.plan}`);

      // Store in database for offline access
      await this.storeLicenseState(data);

      return data;
    } catch (error: any) {
      logger.warn(`[License] Validation error: ${error.message}`);
      return this.useCachedOrCommunity();
    }
  }

  /**
   * Get current license state (from cache or validate)
   */
  async getLicense(): Promise<LicenseValidation> {
    // Return cache if fresh
    if (this.cache && Date.now() - this.cache.cached_at < this.CACHE_TTL_MS) {
      return this.cache;
    }

    // Validate if cache expired
    return this.validate();
  }

  /**
   * Get license features
   */
  async getFeatures(): Promise<LicenseFeatures> {
    const license = await this.getLicense();
    return license.features;
  }

  /**
   * Check if a specific feature is enabled
   */
  async hasFeature(feature: keyof LicenseFeatures): Promise<boolean> {
    const features = await this.getFeatures();
    return features[feature];
  }

  /**
   * Get current plan
   */
  async getPlan(): Promise<string> {
    const license = await this.getLicense();
    return license.plan;
  }

  /**
   * Check if instance is licensed (not community)
   */
  async isLicensed(): Promise<boolean> {
    const license = await this.getLicense();
    return license.valid && license.plan !== 'community';
  }

  /**
   * Get instance ID from database (global setting)
   */
  private async getInstanceId(): Promise<string> {
    const client = await db.getClient();
    try {
      const result = await client.query(`
        SELECT value FROM system_settings
        WHERE key = 'instance_id'
        LIMIT 1
      `);
      return result.rows[0]?.value || 'unknown';
    } finally {
      client.release();
    }
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
   * Get community license (no features)
   */
  private getCommunityLicense(): LicenseValidation {
    return {
      valid: false,
      plan: 'community',
      features: this.COMMUNITY_FEATURES,
      expires_at: null,
      message: 'Running in community mode',
    };
  }

  /**
   * Use cached license or fall back to community
   */
  private useCachedOrCommunity(): LicenseValidation {
    if (this.cache) {
      logger.info('[License] Using cached license state');
      return this.cache;
    }
    return this.getCommunityLicense();
  }

  /**
   * Store license state in database for offline access (global setting)
   */
  private async storeLicenseState(license: LicenseValidation): Promise<void> {
    const client = await db.getClient();
    try {
      await client.query(
        `
        INSERT INTO system_settings (key, value, created_at, updated_at)
        VALUES ('license_state', $1, NOW(), NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `,
        [JSON.stringify(license)]
      );
    } catch (error) {
      logger.warn('[License] Failed to store license state:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Shutdown license service
   */
  shutdown(): void {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }
    logger.info('[License] Shutdown complete');
  }
}

// Singleton instance
export const licenseService = new LicenseService();
