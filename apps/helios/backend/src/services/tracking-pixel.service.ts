/**
 * Tracking Pixel Service
 *
 * Generates and manages tracking pixels for signature campaigns.
 * Each pixel is unique per user + campaign combination.
 */

import crypto from 'crypto';
import { db } from '../database/connection.js';

interface TrackingPixel {
  id: string;
  campaignId: string;
  userId: string;
  pixelToken: string;
  createdAt: Date;
}

interface GeneratePixelResult {
  pixelToken: string;
  pixelUrl: string;
}

class TrackingPixelService {
  private readonly baseUrl: string;
  private readonly pixelPath: string = '/api/t/p';

  constructor() {
    // Use environment variable or default to the backend URL
    this.baseUrl = process.env.PUBLIC_URL || process.env.BACKEND_URL || 'http://localhost:3001';
  }

  /**
   * Generate a unique, URL-safe token
   */
  private generateToken(): string {
    // 24 bytes = 32 base64 characters, URL-safe
    const buffer = crypto.randomBytes(24);
    return buffer.toString('base64url');
  }

  /**
   * Get or create a tracking pixel for a user + campaign combination
   */
  async getOrCreatePixel(campaignId: string, userId: string): Promise<GeneratePixelResult> {
    // First check if pixel already exists for this user + campaign
    const existingResult = await db.query(
      `SELECT pixel_token FROM signature_tracking_pixels
       WHERE campaign_id = $1 AND user_id = $2`,
      [campaignId, userId]
    );

    if (existingResult.rows.length > 0) {
      const token = existingResult.rows[0].pixel_token;
      return {
        pixelToken: token,
        pixelUrl: this.getPixelUrl(token),
      };
    }

    // Generate new token and create pixel
    const token = this.generateToken();

    await db.query(
      `INSERT INTO signature_tracking_pixels (campaign_id, user_id, pixel_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (campaign_id, user_id) DO UPDATE SET pixel_token = $3`,
      [campaignId, userId, token]
    );

    return {
      pixelToken: token,
      pixelUrl: this.getPixelUrl(token),
    };
  }

  /**
   * Get the full URL for a tracking pixel
   */
  getPixelUrl(token: string): string {
    return `${this.baseUrl}${this.pixelPath}/${token}.gif`;
  }

  /**
   * Look up a pixel by its token
   */
  async getPixelByToken(token: string): Promise<TrackingPixel | null> {
    const result = await db.query(
      `SELECT id, campaign_id, user_id, pixel_token, created_at
       FROM signature_tracking_pixels
       WHERE pixel_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      campaignId: row.campaign_id,
      userId: row.user_id,
      pixelToken: row.pixel_token,
      createdAt: row.created_at,
    };
  }

  /**
   * Get all pixels for a campaign
   */
  async getPixelsForCampaign(campaignId: string): Promise<TrackingPixel[]> {
    const result = await db.query(
      `SELECT id, campaign_id, user_id, pixel_token, created_at
       FROM signature_tracking_pixels
       WHERE campaign_id = $1
       ORDER BY created_at DESC`,
      [campaignId]
    );

    return result.rows.map((row: { id: string; campaign_id: string; user_id: string; pixel_token: string; created_at: Date }) => ({
      id: row.id,
      campaignId: row.campaign_id,
      userId: row.user_id,
      pixelToken: row.pixel_token,
      createdAt: row.created_at,
    }));
  }

  /**
   * Delete all pixels for a campaign (when campaign is deleted)
   */
  async deletePixelsForCampaign(campaignId: string): Promise<number> {
    const result = await db.query(
      `DELETE FROM signature_tracking_pixels
       WHERE campaign_id = $1`,
      [campaignId]
    );

    return result.rowCount || 0;
  }

  /**
   * Generate HTML for the tracking pixel image tag
   */
  getPixelHtml(token: string, altText: string = ''): string {
    const url = this.getPixelUrl(token);
    return `<img src="${url}" width="1" height="1" alt="${altText}" style="display:none;visibility:hidden;" />`;
  }

  /**
   * Batch generate pixels for multiple users in a campaign
   */
  async generatePixelsForUsers(campaignId: string, userIds: string[]): Promise<Map<string, GeneratePixelResult>> {
    const results = new Map<string, GeneratePixelResult>();

    // Process in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);

      // Generate tokens and insert in batch
      const values: string[] = [];
      const params: string[] = [];
      let paramIndex = 1;

      for (const userId of batch) {
        const token = this.generateToken();
        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        params.push(campaignId, userId, token);
        results.set(userId, {
          pixelToken: token,
          pixelUrl: this.getPixelUrl(token),
        });
      }

      // Upsert batch
      await db.query(
        `INSERT INTO signature_tracking_pixels (campaign_id, user_id, pixel_token)
         VALUES ${values.join(', ')}
         ON CONFLICT (campaign_id, user_id) DO UPDATE SET pixel_token = EXCLUDED.pixel_token`,
        params
      );
    }

    return results;
  }

  /**
   * Decode a pixel URL to extract the token
   */
  extractTokenFromUrl(url: string): string | null {
    // Expected format: /api/t/p/{token}.gif
    const match = url.match(/\/api\/t\/p\/([a-zA-Z0-9_-]+)\.gif/);
    return match ? match[1] : null;
  }
}

export const trackingPixelService = new TrackingPixelService();
export default trackingPixelService;
