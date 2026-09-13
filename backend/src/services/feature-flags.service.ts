import { db } from '../database/connection.js';
import { cacheService } from './cache.service.js';
import { logger } from '../utils/logger.js';
import {
  FEATURE_REGISTRY,
  getFeatureDefinition,
  resolveFeature,
  resolveFeatureProfile,
  type FeatureDefinition,
  type FeatureMaturity,
  type FeatureProfile,
} from '../config/feature-registry.js';

/**
 * Feature flags = code registry (config/feature-registry.ts) + release profile
 * (HELIOS_FEATURE_PROFILE) + per-organization overrides stored in the
 * `feature_flags` table. Only rows with `is_override = true` are read; rows
 * seeded before migration 100 were defaults and are ignored.
 */

export interface FeatureFlag {
  feature_key: string;
  name: string;
  description: string;
  category: string;
  maturity: FeatureMaturity;
  is_enabled: boolean;
  /** Whether an admin can change it under the current profile. */
  is_available: boolean;
  is_required: boolean;
  is_overridden: boolean;
  default_enabled: boolean;
}

export class FeatureFlagError extends Error {
  constructor(public readonly code: 'unknown_flag' | 'not_available', message: string) {
    super(message);
    this.name = 'FeatureFlagError';
  }
}

const CACHE_KEY = 'feature_flags:overrides';
const CACHE_TTL = 60; // 1 minute TTL

class FeatureFlagsService {
  get profile(): FeatureProfile {
    return resolveFeatureProfile();
  }

  /** Stored overrides for registered flags only. */
  private async loadOverrides(): Promise<Record<string, boolean>> {
    const cached = await cacheService.get<Record<string, boolean>>(CACHE_KEY);
    if (cached) return cached;

    const result = await db.query(
      'SELECT feature_key, is_enabled FROM feature_flags WHERE is_override = true'
    );
    const overrides: Record<string, boolean> = {};
    for (const row of result.rows) {
      if (getFeatureDefinition(row.feature_key)) overrides[row.feature_key] = row.is_enabled;
    }
    await cacheService.set(CACHE_KEY, overrides, CACHE_TTL);
    return overrides;
  }

  private async safeOverrides(): Promise<Record<string, boolean>> {
    try {
      return await this.loadOverrides();
    } catch (error) {
      // Defaults still apply without the database; overrides are an addition.
      logger.error('Error loading feature flag overrides', { error });
      return {};
    }
  }

  private describe(def: FeatureDefinition, overrides: Record<string, boolean>): FeatureFlag {
    const override = def.key in overrides ? overrides[def.key] : undefined;
    const resolved = resolveFeature(def, this.profile, override);
    return {
      feature_key: def.key,
      name: def.name,
      description: def.description,
      category: def.category,
      maturity: def.maturity,
      is_enabled: resolved.enabled,
      is_available: resolved.available,
      is_required: def.required === true,
      is_overridden: override !== undefined && resolved.available,
      default_enabled: resolved.defaultEnabled,
    };
  }

  /** Check if a feature is enabled. Unknown flags are disabled. */
  async isEnabled(featureKey: string): Promise<boolean> {
    const def = getFeatureDefinition(featureKey);
    if (!def) {
      logger.warn(`Feature flag not registered: ${featureKey}`);
      return false;
    }
    return this.describe(def, await this.safeOverrides()).is_enabled;
  }

  /** key -> enabled for every registered flag. Main frontend endpoint. */
  async getAllFlagsMap(): Promise<Record<string, boolean>> {
    const overrides = await this.safeOverrides();
    const map: Record<string, boolean> = {};
    for (const def of FEATURE_REGISTRY) map[def.key] = this.describe(def, overrides).is_enabled;
    return map;
  }

  /** Full details for the admin UI. */
  async getAllFlags(): Promise<FeatureFlag[]> {
    const overrides = await this.safeOverrides();
    return FEATURE_REGISTRY.map((def) => this.describe(def, overrides));
  }

  async getFlagsByCategory(category: string): Promise<FeatureFlag[]> {
    return (await this.getAllFlags()).filter((f) => f.category === category);
  }

  async getFlag(featureKey: string): Promise<FeatureFlag | null> {
    const def = getFeatureDefinition(featureKey);
    if (!def) return null;
    return this.describe(def, await this.safeOverrides());
  }

  /**
   * Store an organization override. Throws FeatureFlagError when the flag is
   * not registered or cannot be changed under the current profile (required,
   * or experimental in a release).
   */
  async setFlag(featureKey: string, enabled: boolean): Promise<FeatureFlag> {
    const def = getFeatureDefinition(featureKey);
    if (!def) {
      throw new FeatureFlagError('unknown_flag', `Feature flag not registered: ${featureKey}`);
    }
    if (!resolveFeature(def, this.profile).available) {
      throw new FeatureFlagError(
        'not_available',
        def.required
          ? `${def.name} is a core feature and cannot be changed`
          : `${def.name} is experimental and unavailable in the ${this.profile} profile`
      );
    }

    await db.query(
      `INSERT INTO feature_flags (feature_key, name, description, is_enabled, category, is_override)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (feature_key)
       DO UPDATE SET is_enabled = EXCLUDED.is_enabled, is_override = true, updated_at = NOW()`,
      [def.key, def.name, def.description, enabled, def.category]
    );
    await cacheService.del(CACHE_KEY);
    logger.info('Feature flag override set', { featureKey: def.key, enabled: enabled === true });
    return this.describe(def, await this.safeOverrides());
  }

  /** Remove an override so the registry default applies again. */
  async clearOverride(featureKey: string): Promise<FeatureFlag | null> {
    const def = getFeatureDefinition(featureKey);
    if (!def) return null;
    await db.query('UPDATE feature_flags SET is_override = false, updated_at = NOW() WHERE feature_key = $1', [featureKey]);
    await cacheService.del(CACHE_KEY);
    logger.info('Feature flag override cleared', { featureKey: def.key });
    return this.describe(def, await this.safeOverrides());
  }

  /** Bulk update. Validates every flag before writing any. */
  async setMultipleFlags(flags: { feature_key: string; is_enabled: boolean }[]): Promise<void> {
    for (const flag of flags) {
      const def = getFeatureDefinition(flag.feature_key);
      if (!def) throw new FeatureFlagError('unknown_flag', `Feature flag not registered: ${flag.feature_key}`);
      if (!resolveFeature(def, this.profile).available) {
        throw new FeatureFlagError('not_available', `${def.name} cannot be changed in the ${this.profile} profile`);
      }
    }
    for (const flag of flags) {
      await this.setFlag(flag.feature_key, flag.is_enabled);
    }
  }

  async checkMultiple(featureKeys: string[]): Promise<Record<string, boolean>> {
    const allFlags = await this.getAllFlagsMap();
    const result: Record<string, boolean> = {};
    for (const key of featureKeys) result[key] = allFlags[key] ?? false;
    return result;
  }

  async getCategories(): Promise<string[]> {
    return [...new Set(FEATURE_REGISTRY.map((f) => f.category))].sort();
  }
}

// Export singleton instance
export const featureFlagsService = new FeatureFlagsService();
