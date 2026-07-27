import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';

class CacheService {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private readonly defaultTTL = 300; // 5 minutes
  private readonly host = process.env.REDIS_HOST || 'localhost';
  private readonly port = parseInt(process.env.REDIS_PORT || '6379');

  constructor() {
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: this.host,
          port: this.port
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error: any) {
      logger.error('Failed to connect to Redis', { error: error.message });
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) return null;

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error: any) {
      logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
    } catch (error: any) {
      logger.error('Cache set error', { key, error: error.message });
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string | string[]): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      if (Array.isArray(key)) {
        for (const k of key) {
          await this.client.del(k);
        }
      } else {
        await this.client.del(key);
      }
    } catch (error: any) {
      logger.error('Cache delete error', { key, error: error.message });
    }
  }

  /**
   * Clear cache by pattern
   */
  async clearPattern(pattern: string): Promise<void> {
    if (!this.isConnected || !this.client) return;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.del(keys);
      }
    } catch (error: any) {
      logger.error('Cache clear pattern error', { pattern, error: error.message });
    }
  }

  /**
   * Cache wrapper for expensive operations
   */
  async remember<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // If not in cache, execute factory function
    const result = await factory();

    // Store in cache for next time
    await this.set(key, result, ttl);

    return result;
  }

  /**
   * Invalidate cache for an organization
   */
  async invalidateOrg(organizationId: string): Promise<void> {
    await this.clearPattern(`org:${organizationId}:*`);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUser(userId: string): Promise<void> {
    await this.clearPattern(`user:${userId}:*`);
  }

  /**
   * Cache keys for different entities
   */
  keys = {
    // Dashboard
    dashboardStats: (orgId: string) => `org:${orgId}:dashboard:stats`,
    dashboardWidgets: (userId: string) => `user:${userId}:dashboard:widgets`,

    // Users
    usersList: (orgId: string, page: number = 1) => `org:${orgId}:users:list:${page}`,
    userDetails: (userId: string) => `user:${userId}:details`,
    userGroups: (userId: string) => `user:${userId}:groups`,

    // Groups
    groupsList: (orgId: string) => `org:${orgId}:groups:list`,
    groupMembers: (groupId: string) => `group:${groupId}:members`,

    // Organization
    orgSettings: (orgId: string) => `org:${orgId}:settings`,
    orgModules: (orgId: string) => `org:${orgId}:modules`,
    orgChart: (orgId: string) => `org:${orgId}:chart`,

    // Activity
    recentActivity: (orgId: string) => `org:${orgId}:activity:recent`,
    securityEvents: (orgId: string) => `org:${orgId}:security:events`,
  };

  /**
   * Get cache stats
   */
  async getStats(): Promise<any> {
    if (!this.isConnected || !this.client) {
      return { connected: false };
    }

    try {
      const info = await this.client.info('stats');
      return {
        connected: true,
        stats: info
      };
    } catch (error: any) {
      return { connected: false, error: error.message };
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

// Export singleton instance
export const cacheService = new CacheService();