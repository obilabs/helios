import { db } from '../database/connection.js';
import { cacheService } from './cache.service.js';
import { logger } from '../utils/logger.js';

export interface FeatureFlag {
  id: string;
  feature_key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  category: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagSummary {
  feature_key: string;
  is_enabled: boolean;
}

const CACHE_KEY = 'feature_flags:all';
const CACHE_TTL = 60; // 1 minute TTL

class FeatureFlagsService {
  /**
   * Check if a feature is enabled
   */
  async isEnabled(featureKey: string): Promise<boolean> {
    try {
      // Try cache first
      const cached = await cacheService.get<Record<string, boolean>>(CACHE_KEY);
      if (cached && featureKey in cached) {
        return cached[featureKey];
      }

      // Fetch from database
      const result = await db.query(
        'SELECT is_enabled FROM feature_flags WHERE feature_key = $1',
        [featureKey]
      );

      if (result.rows.length === 0) {
        logger.warn(`Feature flag not found: ${featureKey}`);
        return false; // Default to disabled for unknown flags
      }

      return result.rows[0].is_enabled;
    } catch (error) {
      logger.error('Error checking feature flag', { featureKey, error });
      return false; // Default to disabled on error
    }
  }

  /**
   * Get all feature flags as a simple key -> enabled map
   * This is the main method for frontend consumption
   */
  async getAllFlagsMap(): Promise<Record<string, boolean>> {
    try {
      // Try cache first
      const cached = await cacheService.get<Record<string, boolean>>(CACHE_KEY);
      if (cached) {
        return cached;
      }

      // Fetch from database
      const result = await db.query(
        'SELECT feature_key, is_enabled FROM feature_flags ORDER BY feature_key'
      );

      const flagsMap: Record<string, boolean> = {};
      for (const row of result.rows) {
        flagsMap[row.feature_key] = row.is_enabled;
      }

      // Cache the results
      await cacheService.set(CACHE_KEY, flagsMap, CACHE_TTL);

      return flagsMap;
    } catch (error) {
      logger.error('Error fetching all feature flags', { error });
      return {};
    }
  }

  /**
   * Get all feature flags with full details (for admin UI)
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    try {
      const result = await db.query(
        'SELECT * FROM feature_flags ORDER BY category, feature_key'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching feature flags with details', { error });
      return [];
    }
  }

  /**
   * Get feature flags by category
   */
  async getFlagsByCategory(category: string): Promise<FeatureFlag[]> {
    try {
      const result = await db.query(
        'SELECT * FROM feature_flags WHERE category = $1 ORDER BY feature_key',
        [category]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching feature flags by category', { category, error });
      return [];
    }
  }

  /**
   * Get a single feature flag by key
   */
  async getFlag(featureKey: string): Promise<FeatureFlag | null> {
    try {
      const result = await db.query(
        'SELECT * FROM feature_flags WHERE feature_key = $1',
        [featureKey]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching feature flag', { featureKey, error });
      return null;
    }
  }

  /**
   * Enable or disable a feature flag
   */
  async setFlag(featureKey: string, enabled: boolean): Promise<FeatureFlag | null> {
    try {
      const result = await db.query(
        `UPDATE feature_flags
         SET is_enabled = $1, updated_at = NOW()
         WHERE feature_key = $2
         RETURNING *`,
        [enabled, featureKey]
      );

      if (result.rows.length === 0) {
        logger.warn(`Feature flag not found for update: ${featureKey}`);
        return null;
      }

      // Invalidate cache
      await cacheService.del(CACHE_KEY);

      logger.info(`Feature flag updated: ${featureKey} = ${enabled}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating feature flag', { featureKey, enabled, error });
      throw error;
    }
  }

  /**
   * Create a new feature flag (admin only)
   */
  async createFlag(data: {
    feature_key: string;
    name: string;
    description?: string;
    is_enabled?: boolean;
    category?: string;
    metadata?: Record<string, any>;
  }): Promise<FeatureFlag> {
    try {
      const result = await db.query(
        `INSERT INTO feature_flags (feature_key, name, description, is_enabled, category, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          data.feature_key,
          data.name,
          data.description || null,
          data.is_enabled ?? false,
          data.category || 'general',
          data.metadata ? JSON.stringify(data.metadata) : '{}'
        ]
      );

      // Invalidate cache
      await cacheService.del(CACHE_KEY);

      logger.info(`Feature flag created: ${data.feature_key}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating feature flag', { data, error });
      throw error;
    }
  }

  /**
   * Delete a feature flag (admin only)
   */
  async deleteFlag(featureKey: string): Promise<boolean> {
    try {
      const result = await db.query(
        'DELETE FROM feature_flags WHERE feature_key = $1',
        [featureKey]
      );

      if (result.rowCount === 0) {
        return false;
      }

      // Invalidate cache
      await cacheService.del(CACHE_KEY);

      logger.info(`Feature flag deleted: ${featureKey}`);
      return true;
    } catch (error) {
      logger.error('Error deleting feature flag', { featureKey, error });
      throw error;
    }
  }

  /**
   * Bulk update multiple flags at once
   */
  async setMultipleFlags(flags: { feature_key: string; is_enabled: boolean }[]): Promise<void> {
    try {
      for (const flag of flags) {
        await db.query(
          `UPDATE feature_flags
           SET is_enabled = $1, updated_at = NOW()
           WHERE feature_key = $2`,
          [flag.is_enabled, flag.feature_key]
        );
      }

      // Invalidate cache
      await cacheService.del(CACHE_KEY);

      logger.info(`Bulk updated ${flags.length} feature flags`);
    } catch (error) {
      logger.error('Error bulk updating feature flags', { error });
      throw error;
    }
  }

  /**
   * Check multiple features at once (for efficiency)
   */
  async checkMultiple(featureKeys: string[]): Promise<Record<string, boolean>> {
    const allFlags = await this.getAllFlagsMap();
    const result: Record<string, boolean> = {};

    for (const key of featureKeys) {
      result[key] = allFlags[key] ?? false;
    }

    return result;
  }

  /**
   * Get all available categories
   */
  async getCategories(): Promise<string[]> {
    try {
      const result = await db.query(
        'SELECT DISTINCT category FROM feature_flags ORDER BY category'
      );
      return result.rows.map((row: { category: string }) => row.category);
    } catch (error) {
      logger.error('Error fetching feature flag categories', { error });
      return [];
    }
  }
}

// Export singleton instance
export const featureFlagsService = new FeatureFlagsService();
