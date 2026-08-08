/**
 * Admin Analytics Service
 *
 * Provides organization-wide email engagement analytics for administrators.
 * Aggregates data across all users for team performance insights.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { UserAnalytics, userAnalyticsService } from './user-analytics.service.js';

export interface TopPerformer {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  opens: number;
  uniqueOpens: number;
}

export interface DepartmentStats {
  department: string;
  opens: number;
  uniqueOpens: number;
  users: number;
  avgOpensPerUser: number;
}

export interface OrgDailyStats {
  date: string;
  totalOpens: number;
  uniqueOpens: number;
  activeUsers: number;
}

export interface OrgAnalytics {
  totalOpens: number;
  uniqueOpens: number;
  activeUsers: number;
  trackedUsers: number;
  topPerformers: TopPerformer[];
  byDepartment: DepartmentStats[];
  dailyStats: OrgDailyStats[];
}

class AdminAnalyticsService {
  /**
   * Get comprehensive organization-wide stats
   */
  async getOrganizationStats(organizationId: string, days: number = 30): Promise<OrgAnalytics> {
    try {
      const [
        summary,
        topPerformers,
        byDepartment,
        dailyStats,
        trackedUsers,
      ] = await Promise.all([
        this.getOrgSummary(organizationId, days),
        this.getTopPerformers(organizationId, days),
        this.getDepartmentBreakdown(organizationId, days),
        this.getOrgDailyStats(organizationId, days),
        this.getTrackedUserCount(organizationId),
      ]);

      return {
        totalOpens: summary.totalOpens,
        uniqueOpens: summary.uniqueOpens,
        activeUsers: summary.activeUsers,
        trackedUsers,
        topPerformers,
        byDepartment,
        dailyStats,
      };
    } catch (error: any) {
      logger.error('Failed to get organization stats', { organizationId, error: error.message });
      return {
        totalOpens: 0,
        uniqueOpens: 0,
        activeUsers: 0,
        trackedUsers: 0,
        topPerformers: [],
        byDepartment: [],
        dailyStats: [],
      };
    }
  }

  /**
   * Get stats for a specific user (admin view - same as user view but accessible by admin)
   */
  async getUserStats(userId: string): Promise<UserAnalytics> {
    return userAnalyticsService.getMyStats(userId);
  }

  /**
   * Get organization summary stats
   */
  private async getOrgSummary(
    organizationId: string,
    days: number
  ): Promise<{ totalOpens: number; uniqueOpens: number; activeUsers: number }> {
    const result = await db.query(
      `SELECT
         COUNT(*) as total_opens,
         COUNT(*) FILTER (WHERE ste.is_unique) as unique_opens,
         COUNT(DISTINCT ste.user_id) as active_users
       FROM signature_tracking_events ste
       JOIN organization_users ou ON ste.user_id = ou.id
       WHERE ou.organization_id = $1
       AND ste.tracking_type = 'user'
       AND ste.timestamp >= NOW() - INTERVAL '1 day' * $2`,
      [organizationId, days]
    );

    return {
      totalOpens: parseInt(result.rows[0].total_opens, 10),
      uniqueOpens: parseInt(result.rows[0].unique_opens, 10),
      activeUsers: parseInt(result.rows[0].active_users, 10),
    };
  }

  /**
   * Get top performers by email opens
   */
  private async getTopPerformers(
    organizationId: string,
    days: number,
    limit: number = 10
  ): Promise<TopPerformer[]> {
    const result = await db.query(
      `SELECT
         ou.id as user_id,
         COALESCE(ou.first_name || ' ' || ou.last_name, ou.email) as name,
         ou.email,
         d.name as department,
         COUNT(*) as opens,
         COUNT(*) FILTER (WHERE ste.is_unique) as unique_opens
       FROM signature_tracking_events ste
       JOIN organization_users ou ON ste.user_id = ou.id
       LEFT JOIN departments d ON ou.department_id = d.id
       WHERE ou.organization_id = $1
       AND ste.tracking_type = 'user'
       AND ste.timestamp >= NOW() - INTERVAL '1 day' * $2
       GROUP BY ou.id, ou.first_name, ou.last_name, ou.email, d.name
       ORDER BY opens DESC
       LIMIT $3`,
      [organizationId, days, limit]
    );

    return result.rows.map((row: any) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      department: row.department,
      opens: parseInt(row.opens, 10),
      uniqueOpens: parseInt(row.unique_opens, 10),
    }));
  }

  /**
   * Get stats broken down by department
   */
  private async getDepartmentBreakdown(
    organizationId: string,
    days: number
  ): Promise<DepartmentStats[]> {
    const result = await db.query(
      `SELECT
         COALESCE(d.name, 'Unassigned') as department,
         COUNT(*) as opens,
         COUNT(*) FILTER (WHERE ste.is_unique) as unique_opens,
         COUNT(DISTINCT ou.id) as users
       FROM signature_tracking_events ste
       JOIN organization_users ou ON ste.user_id = ou.id
       LEFT JOIN departments d ON ou.department_id = d.id
       WHERE ou.organization_id = $1
       AND ste.tracking_type = 'user'
       AND ste.timestamp >= NOW() - INTERVAL '1 day' * $2
       GROUP BY d.name
       ORDER BY opens DESC`,
      [organizationId, days]
    );

    return result.rows.map((row: any) => {
      const opens = parseInt(row.opens, 10);
      const users = parseInt(row.users, 10);
      return {
        department: row.department,
        opens,
        uniqueOpens: parseInt(row.unique_opens, 10),
        users,
        avgOpensPerUser: users > 0 ? Math.round((opens / users) * 10) / 10 : 0,
      };
    });
  }

  /**
   * Get daily stats for the organization
   */
  private async getOrgDailyStats(
    organizationId: string,
    days: number
  ): Promise<OrgDailyStats[]> {
    const result = await db.query(
      `SELECT
         DATE(ste.timestamp) as date,
         COUNT(*) as total_opens,
         COUNT(*) FILTER (WHERE ste.is_unique) as unique_opens,
         COUNT(DISTINCT ste.user_id) as active_users
       FROM signature_tracking_events ste
       JOIN organization_users ou ON ste.user_id = ou.id
       WHERE ou.organization_id = $1
       AND ste.tracking_type = 'user'
       AND ste.timestamp >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(ste.timestamp)
       ORDER BY DATE(ste.timestamp) DESC`,
      [organizationId, days]
    );

    return result.rows.map((row: any) => ({
      date: row.date.toISOString().split('T')[0],
      totalOpens: parseInt(row.total_opens, 10),
      uniqueOpens: parseInt(row.unique_opens, 10),
      activeUsers: parseInt(row.active_users, 10),
    }));
  }

  /**
   * Get count of users with tracking tokens
   */
  private async getTrackedUserCount(organizationId: string): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM signature_user_tracking
       WHERE organization_id = $1
       AND is_active = true`,
      [organizationId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get engagement trend comparison (this period vs previous period)
   */
  async getEngagementTrend(
    organizationId: string,
    days: number = 7
  ): Promise<{
    currentPeriod: { opens: number; uniqueOpens: number; activeUsers: number };
    previousPeriod: { opens: number; uniqueOpens: number; activeUsers: number };
    trend: { opens: number; uniqueOpens: number; activeUsers: number };
  }> {
    try {
      const currentResult = await db.query(
        `SELECT
           COUNT(*) as opens,
           COUNT(*) FILTER (WHERE ste.is_unique) as unique_opens,
           COUNT(DISTINCT ste.user_id) as active_users
         FROM signature_tracking_events ste
         JOIN organization_users ou ON ste.user_id = ou.id
         WHERE ou.organization_id = $1
         AND ste.tracking_type = 'user'
         AND ste.timestamp >= NOW() - INTERVAL '1 day' * $2`,
        [organizationId, days]
      );

      const previousResult = await db.query(
        `SELECT
           COUNT(*) as opens,
           COUNT(*) FILTER (WHERE ste.is_unique) as unique_opens,
           COUNT(DISTINCT ste.user_id) as active_users
         FROM signature_tracking_events ste
         JOIN organization_users ou ON ste.user_id = ou.id
         WHERE ou.organization_id = $1
         AND ste.tracking_type = 'user'
         AND ste.timestamp >= NOW() - INTERVAL '1 day' * ($2 * 2)
         AND ste.timestamp < NOW() - INTERVAL '1 day' * $2`,
        [organizationId, days]
      );

      const current = {
        opens: parseInt(currentResult.rows[0].opens, 10),
        uniqueOpens: parseInt(currentResult.rows[0].unique_opens, 10),
        activeUsers: parseInt(currentResult.rows[0].active_users, 10),
      };

      const previous = {
        opens: parseInt(previousResult.rows[0].opens, 10),
        uniqueOpens: parseInt(previousResult.rows[0].unique_opens, 10),
        activeUsers: parseInt(previousResult.rows[0].active_users, 10),
      };

      const calculateTrend = (curr: number, prev: number): number => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
      };

      return {
        currentPeriod: current,
        previousPeriod: previous,
        trend: {
          opens: calculateTrend(current.opens, previous.opens),
          uniqueOpens: calculateTrend(current.uniqueOpens, previous.uniqueOpens),
          activeUsers: calculateTrend(current.activeUsers, previous.activeUsers),
        },
      };
    } catch (error: any) {
      logger.error('Failed to get engagement trend', { organizationId, error: error.message });
      return {
        currentPeriod: { opens: 0, uniqueOpens: 0, activeUsers: 0 },
        previousPeriod: { opens: 0, uniqueOpens: 0, activeUsers: 0 },
        trend: { opens: 0, uniqueOpens: 0, activeUsers: 0 },
      };
    }
  }

  /**
   * Get peak engagement hours across the organization
   */
  async getOrgPeakHours(
    organizationId: string,
    days: number = 30
  ): Promise<Array<{ hour: number; day: string; avgOpens: number }>> {
    try {
      const result = await db.query(
        `SELECT
           EXTRACT(DOW FROM ste.timestamp) as day_of_week,
           EXTRACT(HOUR FROM ste.timestamp) as hour,
           COUNT(*) as open_count
         FROM signature_tracking_events ste
         JOIN organization_users ou ON ste.user_id = ou.id
         WHERE ou.organization_id = $1
         AND ste.tracking_type = 'user'
         AND ste.timestamp >= NOW() - INTERVAL '1 day' * $2
         GROUP BY EXTRACT(DOW FROM ste.timestamp), EXTRACT(HOUR FROM ste.timestamp)
         ORDER BY open_count DESC
         LIMIT 10`,
        [organizationId, days]
      );

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      return result.rows.map((row: any) => ({
        hour: parseInt(row.hour, 10),
        day: dayNames[parseInt(row.day_of_week, 10)],
        avgOpens: parseInt(row.open_count, 10),
      }));
    } catch (error: any) {
      logger.error('Failed to get org peak hours', { organizationId, error: error.message });
      return [];
    }
  }

  /**
   * Get device distribution across the organization
   */
  async getOrgDeviceStats(
    organizationId: string,
    days: number = 30
  ): Promise<{ desktop: number; mobile: number; tablet: number; total: number }> {
    try {
      const result = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE ste.device_type = 'desktop') as desktop,
           COUNT(*) FILTER (WHERE ste.device_type = 'mobile') as mobile,
           COUNT(*) FILTER (WHERE ste.device_type = 'tablet') as tablet,
           COUNT(*) as total
         FROM signature_tracking_events ste
         JOIN organization_users ou ON ste.user_id = ou.id
         WHERE ou.organization_id = $1
         AND ste.tracking_type = 'user'
         AND ste.timestamp >= NOW() - INTERVAL '1 day' * $2`,
        [organizationId, days]
      );

      return {
        desktop: parseInt(result.rows[0].desktop, 10),
        mobile: parseInt(result.rows[0].mobile, 10),
        tablet: parseInt(result.rows[0].tablet, 10),
        total: parseInt(result.rows[0].total, 10),
      };
    } catch (error: any) {
      logger.error('Failed to get org device stats', { organizationId, error: error.message });
      return { desktop: 0, mobile: 0, tablet: 0, total: 0 };
    }
  }

  /**
   * Get users with no engagement (potential issues or inactive)
   */
  async getInactiveTrackedUsers(
    organizationId: string,
    days: number = 30
  ): Promise<Array<{ userId: string; name: string; email: string; lastActivity: Date | null }>> {
    try {
      const result = await db.query(
        `SELECT
           ou.id as user_id,
           COALESCE(ou.first_name || ' ' || ou.last_name, ou.email) as name,
           ou.email,
           (
             SELECT MAX(timestamp)
             FROM signature_tracking_events ste
             WHERE ste.user_id = ou.id AND ste.tracking_type = 'user'
           ) as last_activity
         FROM organization_users ou
         JOIN signature_user_tracking sut ON ou.id = sut.user_id
         WHERE ou.organization_id = $1
         AND sut.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM signature_tracking_events ste
           WHERE ste.user_id = ou.id
           AND ste.tracking_type = 'user'
           AND ste.timestamp >= NOW() - INTERVAL '1 day' * $2
         )
         ORDER BY last_activity NULLS LAST
         LIMIT 50`,
        [organizationId, days]
      );

      return result.rows.map((row: any) => ({
        userId: row.user_id,
        name: row.name,
        email: row.email,
        lastActivity: row.last_activity,
      }));
    } catch (error: any) {
      logger.error('Failed to get inactive tracked users', { organizationId, error: error.message });
      return [];
    }
  }
}

// Export singleton instance
export const adminAnalyticsService = new AdminAnalyticsService();
