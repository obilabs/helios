/**
 * User Tracking Service
 *
 * Manages permanent tracking tokens for user-level email engagement tracking.
 * Each user gets a unique, permanent pixel token that's embedded in their signature
 * for always-on tracking (as opposed to campaign-specific tracking).
 */

import crypto from 'crypto';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

export interface UserTrackingToken {
  id: string;
  userId: string;
  organizationId: string;
  pixelToken: string;
  isActive: boolean;
  createdAt: Date;
}

export interface UserTrackingSummary {
  trackingId: string;
  userId: string;
  organizationId: string;
  isActive: boolean;
  createdAt: Date;
  totalOpens: number;
  activeDays: number;
  uniqueRecipients: number;
  lastOpenAt: Date | null;
  opensLast7Days: number;
  opensLast30Days: number;
}

class UserTrackingService {
  /**
   * Generate a URL-safe token for tracking pixel URL
   * Uses crypto.randomBytes for cryptographic security
   */
  generateToken(length: number = 24): string {
    const bytes = crypto.randomBytes(length);
    // Convert to base64url encoding (URL-safe)
    return bytes
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Get or create a tracking token for a user
   * This is idempotent - calling multiple times returns the same token
   */
  async getOrCreateToken(
    userId: string,
    organizationId: string
  ): Promise<UserTrackingToken> {
    try {
      // Try to get existing token
      const existing = await this.getTokenForUser(userId);
      if (existing) {
        return existing;
      }

      // Create new token
      const pixelToken = this.generateToken();

      const result = await db.query(
        `INSERT INTO signature_user_tracking (user_id, organization_id, pixel_token)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET user_id = signature_user_tracking.user_id
         RETURNING id, user_id as "userId", organization_id as "organizationId",
                   pixel_token as "pixelToken", is_active as "isActive", created_at as "createdAt"`,
        [userId, organizationId, pixelToken]
      );

      logger.info('Created user tracking token', { userId, organizationId });
      return result.rows[0];
    } catch (error: any) {
      logger.error('Failed to get or create tracking token', {
        userId,
        organizationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get tracking token by pixel token (used by tracking endpoint)
   */
  async getTokenByPixel(pixelToken: string): Promise<UserTrackingToken | null> {
    try {
      const result = await db.query(
        `SELECT id, user_id as "userId", organization_id as "organizationId",
                pixel_token as "pixelToken", is_active as "isActive", created_at as "createdAt"
         FROM signature_user_tracking
         WHERE pixel_token = $1`,
        [pixelToken]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error: any) {
      logger.error('Failed to get token by pixel', { pixelToken, error: error.message });
      return null;
    }
  }

  /**
   * Get tracking token for a specific user
   */
  async getTokenForUser(userId: string): Promise<UserTrackingToken | null> {
    try {
      const result = await db.query(
        `SELECT id, user_id as "userId", organization_id as "organizationId",
                pixel_token as "pixelToken", is_active as "isActive", created_at as "createdAt"
         FROM signature_user_tracking
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error: any) {
      logger.error('Failed to get token for user', { userId, error: error.message });
      return null;
    }
  }

  /**
   * Deactivate tracking for a user (admin action)
   * The pixel will still work but events won't be recorded
   */
  async deactivateToken(userId: string): Promise<void> {
    try {
      await db.query(
        `UPDATE signature_user_tracking
         SET is_active = false
         WHERE user_id = $1`,
        [userId]
      );

      logger.info('Deactivated user tracking token', { userId });
    } catch (error: any) {
      logger.error('Failed to deactivate tracking token', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Reactivate tracking for a user
   */
  async activateToken(userId: string): Promise<void> {
    try {
      await db.query(
        `UPDATE signature_user_tracking
         SET is_active = true
         WHERE user_id = $1`,
        [userId]
      );

      logger.info('Activated user tracking token', { userId });
    } catch (error: any) {
      logger.error('Failed to activate tracking token', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all tracking tokens for an organization
   */
  async getOrganizationTokens(
    organizationId: string,
    options?: {
      activeOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ tokens: UserTrackingToken[]; total: number }> {
    try {
      const { activeOnly = false, limit = 100, offset = 0 } = options || {};

      const whereClause = activeOnly
        ? 'WHERE organization_id = $1 AND is_active = true'
        : 'WHERE organization_id = $1';

      const countResult = await db.query(
        `SELECT COUNT(*) as count FROM signature_user_tracking ${whereClause}`,
        [organizationId]
      );

      const result = await db.query(
        `SELECT id, user_id as "userId", organization_id as "organizationId",
                pixel_token as "pixelToken", is_active as "isActive", created_at as "createdAt"
         FROM signature_user_tracking
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [organizationId, limit, offset]
      );

      return {
        tokens: result.rows,
        total: parseInt(countResult.rows[0].count),
      };
    } catch (error: any) {
      logger.error('Failed to get organization tokens', {
        organizationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get tracking summary for a user (uses the view)
   */
  async getUserTrackingSummary(userId: string): Promise<UserTrackingSummary | null> {
    try {
      const result = await db.query(
        `SELECT
           tracking_id as "trackingId",
           user_id as "userId",
           organization_id as "organizationId",
           is_active as "isActive",
           created_at as "createdAt",
           total_opens as "totalOpens",
           active_days as "activeDays",
           unique_recipients as "uniqueRecipients",
           last_open_at as "lastOpenAt",
           opens_last_7_days as "opensLast7Days",
           opens_last_30_days as "opensLast30Days"
         FROM user_tracking_summary
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error: any) {
      logger.error('Failed to get user tracking summary', { userId, error: error.message });
      return null;
    }
  }

  /**
   * Get organization-wide tracking summary
   */
  async getOrganizationTrackingSummary(organizationId: string): Promise<{
    trackedUsers: number;
    activeTrackedUsers: number;
    totalOpens: number;
    uniqueRecipients: number;
    opensLast7Days: number;
    opensLast30Days: number;
  } | null> {
    try {
      const result = await db.query(
        `SELECT
           tracked_users as "trackedUsers",
           active_tracked_users as "activeTrackedUsers",
           total_opens as "totalOpens",
           unique_recipients as "uniqueRecipients",
           opens_last_7_days as "opensLast7Days",
           opens_last_30_days as "opensLast30Days"
         FROM organization_tracking_summary
         WHERE organization_id = $1`,
        [organizationId]
      );

      if (result.rows.length === 0) {
        return {
          trackedUsers: 0,
          activeTrackedUsers: 0,
          totalOpens: 0,
          uniqueRecipients: 0,
          opensLast7Days: 0,
          opensLast30Days: 0,
        };
      }

      return result.rows[0];
    } catch (error: any) {
      logger.error('Failed to get organization tracking summary', {
        organizationId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get pixel URL for a user
   */
  async getPixelUrl(userId: string, baseUrl: string): Promise<string | null> {
    const token = await this.getTokenForUser(userId);
    if (!token) {
      return null;
    }
    return `${baseUrl}/api/t/u/${token.pixelToken}.gif`;
  }

  /**
   * Bulk create tokens for multiple users
   */
  async bulkCreateTokens(
    users: Array<{ userId: string; organizationId: string }>
  ): Promise<number> {
    if (users.length === 0) {
      return 0;
    }

    try {
      const values = users.map((u) => {
        const token = this.generateToken();
        return `('${u.userId}', '${u.organizationId}', '${token}')`;
      });

      const result = await db.query(
        `INSERT INTO signature_user_tracking (user_id, organization_id, pixel_token)
         VALUES ${values.join(', ')}
         ON CONFLICT (user_id) DO NOTHING`
      );

      logger.info('Bulk created user tracking tokens', {
        requested: users.length,
        created: result.rowCount,
      });

      return result.rowCount || 0;
    } catch (error: any) {
      logger.error('Failed to bulk create tracking tokens', { error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
export const userTrackingService = new UserTrackingService();
