/**
 * Tracking Events Service
 *
 * Records and manages tracking events when pixels are loaded.
 * Handles IP hashing for privacy and unique detection logic.
 */

import crypto from 'crypto';
import { db } from '../database/connection.js';
import { trackingPixelService } from './tracking-pixel.service.js';
import { userTrackingService } from './user-tracking.service.js';

interface TrackingEvent {
  id: string;
  pixelId: string;
  campaignId: string;
  userId: string;
  timestamp: Date;
  ipAddressHash: string | null;
  userAgent: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  isUnique: boolean;
  deviceType: string | null;
  campaignName?: string;
}

interface TrackingEventRow {
  id: string;
  pixel_id: string;
  campaign_id: string;
  user_id: string;
  timestamp: Date;
  ip_address_hash: string | null;
  user_agent: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  is_unique: boolean;
  device_type: string | null;
  campaign_name: string | null;
}

interface RecordEventInput {
  pixelToken: string;
  ipAddress?: string;
  userAgent?: string;
  countryCode?: string;
  region?: string;
  city?: string;
}

interface RecordUserEventInput {
  userTrackingToken: string;
  ipAddress?: string;
  userAgent?: string;
  countryCode?: string;
  region?: string;
  city?: string;
}

interface RecordEventResult {
  success: boolean;
  isUnique: boolean;
  eventId?: string;
  error?: string;
}

class TrackingEventsService {
  private readonly ipSalt: string;

  constructor() {
    // Use environment variable for salt or generate a default
    this.ipSalt = process.env.IP_HASH_SALT || 'helios_tracking_salt_v1';
  }

  /**
   * Hash an IP address for privacy
   * Uses SHA-256 with a salt to prevent reverse lookups
   */
  private hashIpAddress(ipAddress: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(ipAddress + this.ipSalt);
    return hash.digest('hex').substring(0, 64);
  }

  /**
   * Detect device type from user agent string
   */
  private detectDeviceType(userAgent: string | undefined): string {
    if (!userAgent) return 'unknown';

    const ua = userAgent.toLowerCase();

    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
      return 'bot';
    }
    return 'desktop';
  }

  /**
   * Check if this is a unique open for the campaign + user combination
   */
  private async isUniqueOpen(pixelId: string, campaignId: string, userId: string): Promise<boolean> {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM signature_tracking_events
       WHERE campaign_id = $1 AND user_id = $2`,
      [campaignId, userId]
    );

    return parseInt(result.rows[0].count, 10) === 0;
  }

  /**
   * Record a tracking event when a pixel is loaded
   */
  async recordEvent(input: RecordEventInput): Promise<RecordEventResult> {
    try {
      // Look up the pixel
      const pixel = await trackingPixelService.getPixelByToken(input.pixelToken);

      if (!pixel) {
        return {
          success: false,
          isUnique: false,
          error: 'Invalid pixel token',
        };
      }

      // Get campaign name for denormalized storage (helps with analytics queries)
      const campaignResult = await db.query(
        `SELECT name FROM signature_campaigns WHERE id = $1`,
        [pixel.campaignId]
      );
      const campaignName = campaignResult.rows[0]?.name || null;

      // Determine if this is a unique open
      const isUnique = await this.isUniqueOpen(pixel.id, pixel.campaignId, pixel.userId);

      // Hash IP address for privacy
      const ipHash = input.ipAddress ? this.hashIpAddress(input.ipAddress) : null;

      // Detect device type
      const deviceType = this.detectDeviceType(input.userAgent);

      // Skip recording bot events to keep analytics clean
      if (deviceType === 'bot') {
        return {
          success: true,
          isUnique: false,
        };
      }

      // Insert the tracking event
      const result = await db.query(
        `INSERT INTO signature_tracking_events (
           pixel_id, campaign_id, user_id, ip_address_hash, user_agent,
           country_code, region, city, is_unique, device_type, campaign_name
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          pixel.id,
          pixel.campaignId,
          pixel.userId,
          ipHash,
          input.userAgent?.substring(0, 500), // Truncate long user agents
          input.countryCode?.substring(0, 2),
          input.region?.substring(0, 100),
          input.city?.substring(0, 100),
          isUnique,
          deviceType,
          campaignName,
        ]
      );

      return {
        success: true,
        isUnique,
        eventId: result.rows[0].id,
      };
    } catch (error) {
      console.error('Error recording tracking event:', error);
      return {
        success: false,
        isUnique: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get events for a specific campaign
   */
  async getEventsForCampaign(campaignId: string, options?: {
    limit?: number;
    offset?: number;
    uniqueOnly?: boolean;
    startDate?: Date;
    endDate?: Date;
  }): Promise<TrackingEvent[]> {
    const conditions: string[] = ['campaign_id = $1'];
    const params: (string | number | Date)[] = [campaignId];
    let paramIndex = 2;

    if (options?.uniqueOnly) {
      conditions.push('is_unique = true');
    }

    if (options?.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(options.startDate);
    }

    if (options?.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(options.endDate);
    }

    const limit = options?.limit || 1000;
    const offset = options?.offset || 0;

    const query = `
      SELECT id, pixel_id, campaign_id, user_id, timestamp, ip_address_hash,
             user_agent, country_code, region, city, is_unique, device_type, campaign_name
      FROM signature_tracking_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await db.query(query, params);

    return result.rows.map((row: TrackingEventRow) => ({
      id: row.id,
      pixelId: row.pixel_id,
      campaignId: row.campaign_id,
      userId: row.user_id,
      timestamp: row.timestamp,
      ipAddressHash: row.ip_address_hash,
      userAgent: row.user_agent,
      countryCode: row.country_code,
      region: row.region,
      city: row.city,
      isUnique: row.is_unique,
      deviceType: row.device_type,
      campaignName: row.campaign_name || undefined,
    }));
  }

  /**
   * Get events for a specific user in a campaign
   */
  async getEventsForUser(campaignId: string, userId: string): Promise<TrackingEvent[]> {
    const result = await db.query(
      `SELECT id, pixel_id, campaign_id, user_id, timestamp, ip_address_hash,
              user_agent, country_code, region, city, is_unique, device_type, campaign_name
       FROM signature_tracking_events
       WHERE campaign_id = $1 AND user_id = $2
       ORDER BY timestamp DESC`,
      [campaignId, userId]
    );

    return result.rows.map((row: TrackingEventRow) => ({
      id: row.id,
      pixelId: row.pixel_id,
      campaignId: row.campaign_id,
      userId: row.user_id,
      timestamp: row.timestamp,
      ipAddressHash: row.ip_address_hash,
      userAgent: row.user_agent,
      countryCode: row.country_code,
      region: row.region,
      city: row.city,
      isUnique: row.is_unique,
      deviceType: row.device_type,
      campaignName: row.campaign_name || undefined,
    }));
  }

  /**
   * Delete all events for a campaign
   */
  async deleteEventsForCampaign(campaignId: string): Promise<number> {
    const result = await db.query(
      `DELETE FROM signature_tracking_events WHERE campaign_id = $1`,
      [campaignId]
    );

    return result.rowCount || 0;
  }

  /**
   * Get basic stats for a campaign (faster than full analytics)
   */
  async getBasicStats(campaignId: string): Promise<{
    totalOpens: number;
    uniqueOpens: number;
    lastOpenAt: Date | null;
  }> {
    const result = await db.query(
      `SELECT
         COUNT(*) as total_opens,
         COUNT(*) FILTER (WHERE is_unique) as unique_opens,
         MAX(timestamp) as last_open_at
       FROM signature_tracking_events
       WHERE campaign_id = $1`,
      [campaignId]
    );

    const row = result.rows[0];
    return {
      totalOpens: parseInt(row.total_opens, 10),
      uniqueOpens: parseInt(row.unique_opens, 10),
      lastOpenAt: row.last_open_at,
    };
  }

  // ========================================================================
  // User Tracking Methods (always-on tracking)
  // ========================================================================

  /**
   * Check if this is a unique open for user tracking today
   * (unique per day per IP hash for user tracking)
   */
  private async isUniqueUserOpenToday(
    userTrackingId: string,
    ipHash: string | null
  ): Promise<boolean> {
    if (!ipHash) return true; // If no IP, consider it unique

    const result = await db.query(
      `SELECT COUNT(*) as count FROM signature_tracking_events
       WHERE user_tracking_id = $1
       AND ip_address_hash = $2
       AND tracking_type = 'user'
       AND DATE(timestamp) = CURRENT_DATE`,
      [userTrackingId, ipHash]
    );

    return parseInt(result.rows[0].count, 10) === 0;
  }

  /**
   * Record a user tracking event (always-on tracking)
   */
  async recordUserEvent(input: RecordUserEventInput): Promise<RecordEventResult> {
    try {
      // Look up the user tracking token
      const userTracking = await userTrackingService.getTokenByPixel(input.userTrackingToken);

      if (!userTracking) {
        return {
          success: false,
          isUnique: false,
          error: 'Invalid user tracking token',
        };
      }

      // Check if tracking is active for this user
      if (!userTracking.isActive) {
        // Token exists but is deactivated - return success but don't record
        return {
          success: true,
          isUnique: false,
        };
      }

      // Hash IP address for privacy
      const ipHash = input.ipAddress ? this.hashIpAddress(input.ipAddress) : null;

      // Detect device type
      const deviceType = this.detectDeviceType(input.userAgent);

      // Skip recording bot events to keep analytics clean
      if (deviceType === 'bot') {
        return {
          success: true,
          isUnique: false,
        };
      }

      // Determine if this is a unique open today (per IP)
      const isUnique = await this.isUniqueUserOpenToday(userTracking.id, ipHash);

      // Insert the tracking event with tracking_type = 'user'
      const result = await db.query(
        `INSERT INTO signature_tracking_events (
           user_tracking_id, user_id, ip_address_hash, user_agent,
           country_code, region, city, is_unique, device_type, tracking_type
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'user')
         RETURNING id`,
        [
          userTracking.id,
          userTracking.userId,
          ipHash,
          input.userAgent?.substring(0, 500), // Truncate long user agents
          input.countryCode?.substring(0, 2),
          input.region?.substring(0, 100),
          input.city?.substring(0, 100),
          isUnique,
          deviceType,
        ]
      );

      return {
        success: true,
        isUnique,
        eventId: result.rows[0].id,
      };
    } catch (error) {
      console.error('Error recording user tracking event:', error);
      return {
        success: false,
        isUnique: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get user tracking events for a specific user
   */
  async getUserTrackingEvents(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<Array<{
    id: string;
    userId: string;
    timestamp: Date;
    deviceType: string | null;
    isUnique: boolean;
  }>> {
    const conditions: string[] = [
      'user_id = $1',
      "tracking_type = 'user'",
    ];
    const params: (string | Date)[] = [userId];
    let paramIndex = 2;

    if (options?.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(options.startDate);
    }

    if (options?.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(options.endDate);
    }

    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    const query = `
      SELECT id, user_id, timestamp, device_type, is_unique
      FROM signature_tracking_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const result = await db.query(query, params);

    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      timestamp: row.timestamp,
      deviceType: row.device_type,
      isUnique: row.is_unique,
    }));
  }

  /**
   * Get daily stats for user tracking
   */
  async getUserDailyStats(
    userId: string,
    days: number = 30
  ): Promise<Array<{
    date: string;
    totalOpens: number;
    uniqueOpens: number;
    desktopOpens: number;
    mobileOpens: number;
    tabletOpens: number;
  }>> {
    const result = await db.query(
      `SELECT
         DATE(timestamp) as date,
         COUNT(*) as total_opens,
         COUNT(*) FILTER (WHERE is_unique) as unique_opens,
         COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_opens,
         COUNT(*) FILTER (WHERE device_type = 'mobile') as mobile_opens,
         COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_opens
       FROM signature_tracking_events
       WHERE user_id = $1
       AND tracking_type = 'user'
       AND timestamp >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(timestamp)
       ORDER BY DATE(timestamp) DESC`,
      [userId, days]
    );

    return result.rows.map((row: any) => ({
      date: row.date.toISOString().split('T')[0],
      totalOpens: parseInt(row.total_opens, 10),
      uniqueOpens: parseInt(row.unique_opens, 10),
      desktopOpens: parseInt(row.desktop_opens, 10),
      mobileOpens: parseInt(row.mobile_opens, 10),
      tabletOpens: parseInt(row.tablet_opens, 10),
    }));
  }
}

export const trackingEventsService = new TrackingEventsService();
export default trackingEventsService;
