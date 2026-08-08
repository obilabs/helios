/**
 * Campaign Analytics Service
 *
 * Provides aggregated analytics data for signature campaigns,
 * including open rates, geographic distribution, and time series data.
 */

import { db } from '../database/connection.js';

interface CampaignStats {
  campaignId: string;
  campaignName: string;
  totalOpens: number;
  uniqueOpens: number;
  targetUserCount: number;
  openRate: number; // percentage
  lastOpenAt: Date | null;
  deviceBreakdown: {
    desktop: number;
    mobile: number;
    tablet: number;
    unknown: number;
  };
}

interface DailyOpens {
  date: string; // YYYY-MM-DD
  totalOpens: number;
  uniqueOpens: number;
}

interface GeoDistribution {
  countryCode: string | null;
  country: string;
  opens: number;
  uniqueOpens: number;
  percentage: number;
}

interface TopPerformer {
  userId: string;
  userEmail: string;
  userName: string;
  opens: number;
  lastOpenAt: Date;
}

// Map country codes to names (basic mapping)
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  AU: 'Australia',
  JP: 'Japan',
  IN: 'India',
  BR: 'Brazil',
  MX: 'Mexico',
  // Add more as needed
};

class CampaignAnalyticsService {
  /**
   * Get comprehensive stats for a campaign
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    // Get campaign info
    const campaignResult = await db.query(
      `SELECT id, name FROM signature_campaigns WHERE id = $1`,
      [campaignId]
    );

    if (campaignResult.rows.length === 0) {
      return null;
    }

    const campaign = campaignResult.rows[0];

    // Get opens stats
    const opensResult = await db.query(
      `SELECT
         COUNT(*) as total_opens,
         COUNT(*) FILTER (WHERE is_unique) as unique_opens,
         MAX(timestamp) as last_open_at,
         COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_opens,
         COUNT(*) FILTER (WHERE device_type = 'mobile') as mobile_opens,
         COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_opens,
         COUNT(*) FILTER (WHERE device_type = 'unknown' OR device_type IS NULL) as unknown_opens
       FROM signature_tracking_events
       WHERE campaign_id = $1`,
      [campaignId]
    );

    // Get target user count (users who have received the campaign signature)
    const targetResult = await db.query(
      `SELECT COUNT(DISTINCT user_id) as target_count
       FROM signature_tracking_pixels
       WHERE campaign_id = $1`,
      [campaignId]
    );

    const opens = opensResult.rows[0];
    const targetCount = parseInt(targetResult.rows[0]?.target_count || '0', 10);
    const uniqueOpens = parseInt(opens.unique_opens, 10);

    return {
      campaignId,
      campaignName: campaign.name,
      totalOpens: parseInt(opens.total_opens, 10),
      uniqueOpens,
      targetUserCount: targetCount,
      openRate: targetCount > 0 ? (uniqueOpens / targetCount) * 100 : 0,
      lastOpenAt: opens.last_open_at,
      deviceBreakdown: {
        desktop: parseInt(opens.desktop_opens, 10),
        mobile: parseInt(opens.mobile_opens, 10),
        tablet: parseInt(opens.tablet_opens, 10),
        unknown: parseInt(opens.unknown_opens, 10),
      },
    };
  }

  /**
   * Get daily opens for a campaign within a date range
   */
  async getOpensByDay(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DailyOpens[]> {
    // Default to last 30 days if no range specified
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const result = await db.query(
      `SELECT
         DATE(timestamp AT TIME ZONE 'UTC') as date,
         COUNT(*) as total_opens,
         COUNT(*) FILTER (WHERE is_unique) as unique_opens
       FROM signature_tracking_events
       WHERE campaign_id = $1
         AND timestamp >= $2
         AND timestamp <= $3
       GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
       ORDER BY date ASC`,
      [campaignId, start, end]
    );

    // Fill in missing dates with zeros
    const dateMap = new Map<string, DailyOpens>();

    // Initialize all dates in range
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      dateMap.set(dateStr, {
        date: dateStr,
        totalOpens: 0,
        uniqueOpens: 0,
      });
      current.setDate(current.getDate() + 1);
    }

    // Fill in actual data
    for (const row of result.rows) {
      const dateStr = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : row.date;
      dateMap.set(dateStr, {
        date: dateStr,
        totalOpens: parseInt(row.total_opens, 10),
        uniqueOpens: parseInt(row.unique_opens, 10),
      });
    }

    return Array.from(dateMap.values());
  }

  /**
   * Get geographic distribution of opens
   */
  async getGeoDistribution(campaignId: string): Promise<GeoDistribution[]> {
    const result = await db.query(
      `SELECT
         country_code,
         COUNT(*) as opens,
         COUNT(*) FILTER (WHERE is_unique) as unique_opens
       FROM signature_tracking_events
       WHERE campaign_id = $1
       GROUP BY country_code
       ORDER BY opens DESC`,
      [campaignId]
    );

    // Calculate total for percentages
    const totalOpens = result.rows.reduce(
      (sum: number, row: { opens: string }) => sum + parseInt(row.opens, 10),
      0
    );

    return result.rows.map((row: { country_code: string | null; opens: string; unique_opens: string }) => ({
      countryCode: row.country_code,
      country: row.country_code
        ? COUNTRY_NAMES[row.country_code] || row.country_code
        : 'Unknown',
      opens: parseInt(row.opens, 10),
      uniqueOpens: parseInt(row.unique_opens, 10),
      percentage: totalOpens > 0 ? (parseInt(row.opens, 10) / totalOpens) * 100 : 0,
    }));
  }

  /**
   * Get top performers (users whose emails got the most opens)
   */
  async getTopPerformers(campaignId: string, limit: number = 10): Promise<TopPerformer[]> {
    const result = await db.query(
      `SELECT
         e.user_id,
         u.email as user_email,
         COALESCE(u.first_name || ' ' || u.last_name, u.email) as user_name,
         COUNT(*) as opens,
         MAX(e.timestamp) as last_open_at
       FROM signature_tracking_events e
       JOIN organization_users u ON e.user_id = u.id
       WHERE e.campaign_id = $1
       GROUP BY e.user_id, u.email, u.first_name, u.last_name
       ORDER BY opens DESC
       LIMIT $2`,
      [campaignId, limit]
    );

    return result.rows.map((row: {
      user_id: string;
      user_email: string;
      user_name: string;
      opens: string;
      last_open_at: Date;
    }) => ({
      userId: row.user_id,
      userEmail: row.user_email,
      userName: row.user_name,
      opens: parseInt(row.opens, 10),
      lastOpenAt: row.last_open_at,
    }));
  }

  /**
   * Get hourly distribution of opens (to understand when emails are read)
   */
  async getHourlyDistribution(campaignId: string): Promise<{ hour: number; opens: number }[]> {
    const result = await db.query(
      `SELECT
         EXTRACT(HOUR FROM timestamp) as hour,
         COUNT(*) as opens
       FROM signature_tracking_events
       WHERE campaign_id = $1
       GROUP BY EXTRACT(HOUR FROM timestamp)
       ORDER BY hour`,
      [campaignId]
    );

    // Fill in all 24 hours
    const hourMap = new Map<number, number>();
    for (let i = 0; i < 24; i++) {
      hourMap.set(i, 0);
    }

    for (const row of result.rows) {
      hourMap.set(parseInt(row.hour, 10), parseInt(row.opens, 10));
    }

    return Array.from(hourMap.entries()).map(([hour, opens]) => ({ hour, opens }));
  }

  /**
   * Get summary stats for multiple campaigns (for dashboard)
   */
  async getCampaignsSummary(organizationId: string): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    totalOpens: number;
    totalUniqueOpens: number;
    averageOpenRate: number;
  }> {
    const result = await db.query(
      `SELECT
         COUNT(DISTINCT c.id) as total_campaigns,
         COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') as active_campaigns,
         COALESCE(SUM(stats.total_opens), 0) as total_opens,
         COALESCE(SUM(stats.unique_opens), 0) as total_unique_opens,
         COALESCE(AVG(stats.open_rate), 0) as avg_open_rate
       FROM signature_campaigns c
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) as total_opens,
           COUNT(*) FILTER (WHERE is_unique) as unique_opens,
           CASE
             WHEN (SELECT COUNT(DISTINCT user_id) FROM signature_tracking_pixels WHERE campaign_id = c.id) > 0
             THEN (COUNT(*) FILTER (WHERE is_unique)::float / (SELECT COUNT(DISTINCT user_id) FROM signature_tracking_pixels WHERE campaign_id = c.id)) * 100
             ELSE 0
           END as open_rate
         FROM signature_tracking_events
         WHERE campaign_id = c.id
       ) stats ON true
       WHERE c.organization_id = $1`,
      [organizationId]
    );

    const row = result.rows[0];
    return {
      totalCampaigns: parseInt(row.total_campaigns, 10),
      activeCampaigns: parseInt(row.active_campaigns, 10),
      totalOpens: parseInt(row.total_opens, 10),
      totalUniqueOpens: parseInt(row.total_unique_opens, 10),
      averageOpenRate: parseFloat(row.avg_open_rate) || 0,
    };
  }

  /**
   * Export campaign analytics as CSV-ready data
   */
  async exportCampaignData(campaignId: string): Promise<{
    summary: CampaignStats | null;
    dailyOpens: DailyOpens[];
    geoDistribution: GeoDistribution[];
    topPerformers: TopPerformer[];
  }> {
    const [summary, dailyOpens, geoDistribution, topPerformers] = await Promise.all([
      this.getCampaignStats(campaignId),
      this.getOpensByDay(campaignId),
      this.getGeoDistribution(campaignId),
      this.getTopPerformers(campaignId, 50),
    ]);

    return {
      summary,
      dailyOpens,
      geoDistribution,
      topPerformers,
    };
  }
}

export const campaignAnalyticsService = new CampaignAnalyticsService();
export default campaignAnalyticsService;
