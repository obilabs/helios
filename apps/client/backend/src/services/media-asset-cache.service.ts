import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';
import type { IAssetCacheService, CachedAsset } from '../types/media-assets.js';

/**
 * Media Asset Cache Service
 *
 * Specialized Redis cache for binary media assets.
 * Unlike the general cache service which stores JSON,
 * this handles raw binary data with base64 encoding.
 *
 * Key features:
 * - Stores binary file content as base64
 * - Configurable TTL per asset
 * - Max cacheable size limit (5MB default)
 * - Organization-level cache invalidation
 */
export class MediaAssetCacheService implements IAssetCacheService {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private readonly host = process.env.REDIS_HOST || 'localhost';
  private readonly port = parseInt(process.env.REDIS_PORT || '6379', 10);
  private readonly defaultTTL = 3600; // 1 hour
  private readonly maxCacheableSizeBytes = 5 * 1024 * 1024; // 5MB
  private readonly keyPrefix = 'asset:';

  constructor() {
    this.connect();
  }

  /**
   * Connect to Redis
   */
  private async connect(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: this.host,
          port: this.port,
        },
      });

      this.client.on('error', (err) => {
        logger.error('Asset cache Redis error', { error: err.message });
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Asset cache Redis connected');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error: any) {
      logger.error('Failed to connect asset cache to Redis', { error: error.message });
      this.isConnected = false;
    }
  }

  /**
   * Ensure client is connected
   */
  private async ensureConnected(): Promise<boolean> {
    if (this.isConnected && this.client) {
      return true;
    }

    // Try to reconnect
    await this.connect();
    return this.isConnected;
  }

  /**
   * Build cache key for an asset
   */
  private buildKey(accessToken: string): string {
    return `${this.keyPrefix}${accessToken}`;
  }

  /**
   * Get cached asset by access token
   */
  async get(accessToken: string): Promise<CachedAsset | null> {
    if (!await this.ensureConnected() || !this.client) {
      return null;
    }

    try {
      const key = this.buildKey(accessToken);

      // Get the cached data (stored as JSON with base64-encoded content)
      const cached = await this.client.get(key);
      if (!cached) {
        logger.debug('Asset cache miss', { accessToken });
        return null;
      }

      // Parse the cached entry
      const entry = JSON.parse(cached);
      const data = Buffer.from(entry.data, 'base64');

      logger.debug('Asset cache hit', {
        accessToken,
        size: data.length,
        mimeType: entry.mimeType,
      });

      return {
        data,
        mimeType: entry.mimeType,
        cachedAt: new Date(entry.cachedAt),
      };
    } catch (error: any) {
      logger.error('Asset cache get error', { accessToken, error: error.message });
      return null;
    }
  }

  /**
   * Set cached asset
   */
  async set(
    accessToken: string,
    data: Buffer,
    mimeType: string,
    ttlSeconds: number = this.defaultTTL
  ): Promise<void> {
    if (!await this.ensureConnected() || !this.client) {
      return;
    }

    // Don't cache files larger than the limit
    if (data.length > this.maxCacheableSizeBytes) {
      logger.debug('Asset too large to cache', {
        accessToken,
        size: data.length,
        maxSize: this.maxCacheableSizeBytes,
      });
      return;
    }

    try {
      const key = this.buildKey(accessToken);

      // Store as JSON with base64-encoded content
      const entry = JSON.stringify({
        data: data.toString('base64'),
        mimeType,
        cachedAt: new Date().toISOString(),
      });

      await this.client.setEx(key, ttlSeconds, entry);

      logger.debug('Asset cached', {
        accessToken,
        size: data.length,
        mimeType,
        ttlSeconds,
      });
    } catch (error: any) {
      logger.error('Asset cache set error', { accessToken, error: error.message });
    }
  }

  /**
   * Invalidate cached asset
   */
  async invalidate(accessToken: string): Promise<void> {
    if (!await this.ensureConnected() || !this.client) {
      return;
    }

    try {
      const key = this.buildKey(accessToken);
      await this.client.del(key);

      logger.debug('Asset cache invalidated', { accessToken });
    } catch (error: any) {
      logger.error('Asset cache invalidate error', { accessToken, error: error.message });
    }
  }

  /**
   * Invalidate all assets for an organization
   * This uses a pattern scan which may be slow for large datasets
   */
  async invalidateAll(organizationId: string): Promise<void> {
    if (!await this.ensureConnected() || !this.client) {
      return;
    }

    try {
      // Note: This requires knowing which assets belong to which org
      // For now, we'll just log that this was called
      // In production, you might want to store org-specific keys differently
      logger.info('Asset cache invalidateAll called', { organizationId });

      // A real implementation might:
      // 1. Query the database for all asset tokens for this org
      // 2. Delete each from cache
      // For now, this is a placeholder
    } catch (error: any) {
      logger.error('Asset cache invalidateAll error', { organizationId, error: error.message });
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    maxCacheableSizeMB: number;
    defaultTTLSeconds: number;
    keyCount?: number;
    memorySizeBytes?: number;
    error?: string;
  }> {
    const baseStats = {
      connected: this.isConnected,
      maxCacheableSizeMB: this.maxCacheableSizeBytes / (1024 * 1024),
      defaultTTLSeconds: this.defaultTTL,
    };

    if (!await this.ensureConnected() || !this.client) {
      return baseStats;
    }

    try {
      // Count asset keys
      const keys = await this.client.keys(`${this.keyPrefix}*`);

      // Get memory info
      const info = await this.client.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memorySizeBytes = memoryMatch ? parseInt(memoryMatch[1], 10) : undefined;

      return {
        ...baseStats,
        keyCount: keys.length,
        memorySizeBytes,
      };
    } catch (error: any) {
      return {
        ...baseStats,
        error: error.message,
      };
    }
  }

  /**
   * Check if an asset is cached
   */
  async has(accessToken: string): Promise<boolean> {
    if (!await this.ensureConnected() || !this.client) {
      return false;
    }

    try {
      const key = this.buildKey(accessToken);
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Get TTL for a cached asset
   */
  async getTTL(accessToken: string): Promise<number> {
    if (!await this.ensureConnected() || !this.client) {
      return -1;
    }

    try {
      const key = this.buildKey(accessToken);
      return await this.client.ttl(key);
    } catch (error: any) {
      return -1;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

// Singleton instance
export const mediaAssetCacheService = new MediaAssetCacheService();
