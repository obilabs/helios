/**
 * User Analytics Service
 *
 * Provides personal email engagement analytics for individual users.
 * Users can see their own email open statistics and trends.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

export interface PeriodStats {
  opens: number;
  unique: number;
}

export interface TrendInfo {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
}

export interface PeakHour {
  hour: number;
  day: string;
  avgOpens: number;
}

export interface DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
}

export interface UserAnalytics {
  today: PeriodStats;
  thisWeek: PeriodStats;
  thisMonth: PeriodStats;
  trend: TrendInfo;
  peakHours: PeakHour[];
  byDevice: DeviceBreakdown;
}

export interface DailyStats {
  date: string;
  opens: number;
  unique: number;
  desktop: number;
  mobile: number;
  tablet: number;
}

class UserAnalyticsService {
  /**
   * Get comprehensive analytics for a user
   */
  async getMyStats(userId: string): Promise<UserAnalytics> {
    try {
      const [today, thisWeek, thisMonth, lastWeek, peakHours, byDevice] = await Promise.all([
        this.getPeriodStats(userId, 'today'),
        this.getPeriodStats(userId, 'week'),
        this.getPeriodStats(userId, 'month'),
        this.getPeriodStats(userId, 'last_week'),
        this.getPeakHours(userId),
        this.getDeviceBreakdown(userId),
      ]);

      // Calculate trend by comparing this week vs last week
      const trend = this.calculateTrend(thisWeek.opens, lastWeek.opens);

      return {
        today,
        thisWeek,
        thisMonth,
        trend,
        peakHours,
        byDevice,
      };
    } catch (error: any) {
      logger.error('Failed to get user analytics', { userId, error: error.message });
      // Return empty stats on error
      return {
        today: { opens: 0, unique: 0 },
        thisWeek: { opens: 0, unique: 0 },
        thisMonth: { opens: 0, unique: 0 },
        trend: { direction: 'stable', percentage: 0 },
        peakHours: [],
        byDevice: { desktop: 0, mobile: 0, tablet: 0 },
      };
    }
  }

  /**
   * Get daily stats for a number of days
   */
  async getDailyStats(userId: string, days: number = 30): Promise<DailyStats[]> {
    try {
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
        opens: parseInt(row.total_opens, 10),
        unique: parseInt(row.unique_opens, 10),
        desktop: parseInt(row.desktop_opens, 10),
        mobile: parseInt(row.mobile_opens, 10),
        tablet: parseInt(row.tablet_opens, 10),
      }));
    } catch (error: any) {
      logger.error('Failed to get daily stats', { userId, days, error: error.message });
      return [];
    }
  }

  /**
   * Get stats for a specific time period
   */
  private async getPeriodStats(
    userId: string,
    period: 'today' | 'week' | 'month' | 'last_week'
  ): Promise<PeriodStats> {
    let dateCondition: string;

    switch (period) {
      case 'today':
        dateCondition = "DATE(timestamp) = CURRENT_DATE";
        break;
      case 'week':
        dateCondition = "timestamp >= DATE_TRUNC('week', NOW())";
        break;
      case 'month':
        dateCondition = "timestamp >= DATE_TRUNC('month', NOW())";
        break;
      case 'last_week':
        dateCondition = `
          timestamp >= DATE_TRUNC('week', NOW()) - INTERVAL '1 week'
          AND timestamp < DATE_TRUNC('week', NOW())
        `;
        break;
    }

    const result = await db.query(
      `SELECT
         COUNT(*) as total_opens,
         COUNT(*) FILTER (WHERE is_unique) as unique_opens
       FROM signature_tracking_events
       WHERE user_id = $1
       AND tracking_type = 'user'
       AND ${dateCondition}`,
      [userId]
    );

    return {
      opens: parseInt(result.rows[0].total_opens, 10),
      unique: parseInt(result.rows[0].unique_opens, 10),
    };
  }

  /**
   * Get peak engagement hours for a user
   * Returns top 5 hours across the week
   */
  private async getPeakHours(userId: string): Promise<PeakHour[]> {
    const result = await db.query(
      `SELECT
         EXTRACT(DOW FROM timestamp) as day_of_week,
         EXTRACT(HOUR FROM timestamp) as hour,
         COUNT(*) as open_count
       FROM signature_tracking_events
       WHERE user_id = $1
       AND tracking_type = 'user'
       AND timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY EXTRACT(DOW FROM timestamp), EXTRACT(HOUR FROM timestamp)
       ORDER BY open_count DESC
       LIMIT 5`,
      [userId]
    );

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return result.rows.map((row: any) => ({
      hour: parseInt(row.hour, 10),
      day: dayNames[parseInt(row.day_of_week, 10)],
      avgOpens: parseInt(row.open_count, 10),
    }));
  }

  /**
   * Get device breakdown for the last 30 days
   */
  private async getDeviceBreakdown(userId: string): Promise<DeviceBreakdown> {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop,
         COUNT(*) FILTER (WHERE device_type = 'mobile') as mobile,
         COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet
       FROM signature_tracking_events
       WHERE user_id = $1
       AND tracking_type = 'user'
       AND timestamp >= NOW() - INTERVAL '30 days'`,
      [userId]
    );

    return {
      desktop: parseInt(result.rows[0].desktop, 10),
      mobile: parseInt(result.rows[0].mobile, 10),
      tablet: parseInt(result.rows[0].tablet, 10),
    };
  }

  /**
   * Calculate trend direction and percentage change
   */
  private calculateTrend(current: number, previous: number): TrendInfo {
    if (previous === 0) {
      if (current === 0) {
        return { direction: 'stable', percentage: 0 };
      }
      return { direction: 'up', percentage: 100 };
    }

    const percentageChange = ((current - previous) / previous) * 100;
    const roundedPercentage = Math.round(Math.abs(percentageChange));

    // Consider < 5% change as stable
    if (Math.abs(percentageChange) < 5) {
      return { direction: 'stable', percentage: roundedPercentage };
    }

    return {
      direction: percentageChange > 0 ? 'up' : 'down',
      percentage: roundedPercentage,
    };
  }

  /**
   * Get hourly breakdown for a specific day
   */
  async getHourlyStats(userId: string, date: Date): Promise<Array<{ hour: number; opens: number }>> {
    try {
      const result = await db.query(
        `SELECT
           EXTRACT(HOUR FROM timestamp) as hour,
           COUNT(*) as opens
         FROM signature_tracking_events
         WHERE user_id = $1
         AND tracking_type = 'user'
         AND DATE(timestamp) = $2
         GROUP BY EXTRACT(HOUR FROM timestamp)
         ORDER BY hour`,
        [userId, date.toISOString().split('T')[0]]
      );

      // Fill in missing hours with 0
      const hourlyData = new Array(24).fill(0).map((_, i) => ({ hour: i, opens: 0 }));

      result.rows.forEach((row: any) => {
        const hour = parseInt(row.hour, 10);
        hourlyData[hour].opens = parseInt(row.opens, 10);
      });

      return hourlyData;
    } catch (error: any) {
      logger.error('Failed to get hourly stats', { userId, date, error: error.message });
      return [];
    }
  }

  /**
   * Get summary stats for the user's profile/dashboard
   */
  async getQuickSummary(userId: string): Promise<{
    totalOpens: number;
    avgDailyOpens: number;
    mostActiveDay: string | null;
    mostActiveHour: number | null;
  }> {
    try {
      // Get total opens
      const totalResult = await db.query(
        `SELECT COUNT(*) as total
         FROM signature_tracking_events
         WHERE user_id = $1
         AND tracking_type = 'user'`,
        [userId]
      );

      // Get average daily opens (last 30 days)
      const avgResult = await db.query(
        `SELECT COUNT(*)::float / GREATEST(1, COUNT(DISTINCT DATE(timestamp))) as avg_daily
         FROM signature_tracking_events
         WHERE user_id = $1
         AND tracking_type = 'user'
         AND timestamp >= NOW() - INTERVAL '30 days'`,
        [userId]
      );

      // Get most active day of week
      const dayResult = await db.query(
        `SELECT
           TO_CHAR(timestamp, 'Day') as day_name,
           COUNT(*) as count
         FROM signature_tracking_events
         WHERE user_id = $1
         AND tracking_type = 'user'
         AND timestamp >= NOW() - INTERVAL '30 days'
         GROUP BY TO_CHAR(timestamp, 'Day')
         ORDER BY count DESC
         LIMIT 1`,
        [userId]
      );

      // Get most active hour
      const hourResult = await db.query(
        `SELECT
           EXTRACT(HOUR FROM timestamp) as hour,
           COUNT(*) as count
         FROM signature_tracking_events
         WHERE user_id = $1
         AND tracking_type = 'user'
         AND timestamp >= NOW() - INTERVAL '30 days'
         GROUP BY EXTRACT(HOUR FROM timestamp)
         ORDER BY count DESC
         LIMIT 1`,
        [userId]
      );

      return {
        totalOpens: parseInt(totalResult.rows[0].total, 10),
        avgDailyOpens: parseFloat(avgResult.rows[0].avg_daily) || 0,
        mostActiveDay: dayResult.rows[0]?.day_name?.trim() || null,
        mostActiveHour: hourResult.rows[0] ? parseInt(hourResult.rows[0].hour, 10) : null,
      };
    } catch (error: any) {
      logger.error('Failed to get quick summary', { userId, error: error.message });
      return {
        totalOpens: 0,
        avgDailyOpens: 0,
        mostActiveDay: null,
        mostActiveHour: null,
      };
    }
  }
}

// Export singleton instance
export const userAnalyticsService = new UserAnalyticsService();
