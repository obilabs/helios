/**
 * @openapi
 * tags:
 *   - name: Tracking Analytics
 *     description: Email engagement tracking analytics endpoints
 */

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { userAnalyticsService } from '../services/user-analytics.service.js';
import { adminAnalyticsService } from '../services/admin-analytics.service.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// User Endpoints (for viewing own stats)
// ============================================================================

/**
 * @openapi
 * /api/v1/tracking/my-stats:
 *   get:
 *     summary: Get current user's email engagement statistics
 *     description: |
 *       Returns comprehensive email engagement analytics for the authenticated user.
 *       Includes today's stats, weekly and monthly summaries, trend analysis,
 *       peak engagement hours, and device breakdown.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     today:
 *                       type: object
 *                       properties:
 *                         opens:
 *                           type: integer
 *                         unique:
 *                           type: integer
 *                     thisWeek:
 *                       type: object
 *                       properties:
 *                         opens:
 *                           type: integer
 *                         unique:
 *                           type: integer
 *                     thisMonth:
 *                       type: object
 *                       properties:
 *                         opens:
 *                           type: integer
 *                         unique:
 *                           type: integer
 *                     trend:
 *                       type: object
 *                       properties:
 *                         direction:
 *                           type: string
 *                           enum: [up, down, stable]
 *                         percentage:
 *                           type: integer
 *                     peakHours:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           hour:
 *                             type: integer
 *                           day:
 *                             type: string
 *                           avgOpens:
 *                             type: integer
 *                     byDevice:
 *                       type: object
 *                       properties:
 *                         desktop:
 *                           type: integer
 *                         mobile:
 *                           type: integer
 *                         tablet:
 *                           type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/my-stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const stats = await userAnalyticsService.getMyStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Failed to get user stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve statistics' },
    });
  }
});

/**
 * @openapi
 * /api/v1/tracking/my-stats/daily:
 *   get:
 *     summary: Get current user's daily engagement stats
 *     description: |
 *       Returns daily email engagement breakdown for the specified number of days.
 *       Useful for trend charts and detailed analysis.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days to retrieve
 *     responses:
 *       200:
 *         description: Daily stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       opens:
 *                         type: integer
 *                       unique:
 *                         type: integer
 *                       desktop:
 *                         type: integer
 *                       mobile:
 *                         type: integer
 *                       tablet:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/my-stats/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string, 10) || 30));

    const dailyStats = await userAnalyticsService.getDailyStats(userId, days);

    res.json({
      success: true,
      data: dailyStats,
    });
  } catch (error: any) {
    logger.error('Failed to get daily stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve daily statistics' },
    });
  }
});

/**
 * @openapi
 * /api/v1/tracking/my-stats/summary:
 *   get:
 *     summary: Get quick summary of user's engagement
 *     description: |
 *       Returns a quick summary suitable for dashboard widgets.
 *       Includes total opens, average daily opens, most active day and hour.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalOpens:
 *                       type: integer
 *                     avgDailyOpens:
 *                       type: number
 *                     mostActiveDay:
 *                       type: string
 *                       nullable: true
 *                     mostActiveHour:
 *                       type: integer
 *                       nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/my-stats/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const summary = await userAnalyticsService.getQuickSummary(userId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    logger.error('Failed to get summary stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve summary' },
    });
  }
});

// ============================================================================
// Admin Endpoints (for viewing organization-wide stats)
// ============================================================================

/**
 * @openapi
 * /api/v1/admin/tracking/organization-stats:
 *   get:
 *     summary: Get organization-wide engagement statistics
 *     description: |
 *       Returns comprehensive email engagement analytics for the entire organization.
 *       Includes total opens, top performers, department breakdown, and daily trends.
 *       Requires admin role.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Organization stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalOpens:
 *                       type: integer
 *                     uniqueOpens:
 *                       type: integer
 *                     activeUsers:
 *                       type: integer
 *                     trackedUsers:
 *                       type: integer
 *                     topPerformers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           department:
 *                             type: string
 *                             nullable: true
 *                           opens:
 *                             type: integer
 *                           uniqueOpens:
 *                             type: integer
 *                     byDepartment:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           department:
 *                             type: string
 *                           opens:
 *                             type: integer
 *                           uniqueOpens:
 *                             type: integer
 *                           users:
 *                             type: integer
 *                           avgOpensPerUser:
 *                             type: number
 *                     dailyStats:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           totalOpens:
 *                             type: integer
 *                           uniqueOpens:
 *                             type: integer
 *                           activeUsers:
 *                             type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/admin/tracking/organization-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string, 10) || 30));

    const stats = await adminAnalyticsService.getOrganizationStats(organizationId, days);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Failed to get organization stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve organization statistics' },
    });
  }
});

/**
 * @openapi
 * /api/v1/admin/tracking/user/{userId}/stats:
 *   get:
 *     summary: Get engagement statistics for a specific user
 *     description: |
 *       Returns detailed engagement analytics for a specific user.
 *       Requires admin role.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to retrieve stats for
 *     responses:
 *       200:
 *         description: User stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/UserAnalytics'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/admin/tracking/user/:userId/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const stats = await adminAnalyticsService.getUserStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Failed to get user stats', { userId: req.params.userId, error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve user statistics' },
    });
  }
});

/**
 * @openapi
 * /api/v1/admin/tracking/trend:
 *   get:
 *     summary: Get engagement trend comparison
 *     description: |
 *       Compares current period vs previous period engagement metrics.
 *       Useful for trend arrows and growth indicators.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 90
 *           default: 7
 *         description: Period length in days
 *     responses:
 *       200:
 *         description: Trend data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     currentPeriod:
 *                       type: object
 *                       properties:
 *                         opens:
 *                           type: integer
 *                         uniqueOpens:
 *                           type: integer
 *                         activeUsers:
 *                           type: integer
 *                     previousPeriod:
 *                       type: object
 *                       properties:
 *                         opens:
 *                           type: integer
 *                         uniqueOpens:
 *                           type: integer
 *                         activeUsers:
 *                           type: integer
 *                     trend:
 *                       type: object
 *                       properties:
 *                         opens:
 *                           type: integer
 *                           description: Percentage change
 *                         uniqueOpens:
 *                           type: integer
 *                         activeUsers:
 *                           type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/admin/tracking/trend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string, 10) || 7));

    const trend = await adminAnalyticsService.getEngagementTrend(organizationId, days);

    res.json({
      success: true,
      data: trend,
    });
  } catch (error: any) {
    logger.error('Failed to get engagement trend', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve trend data' },
    });
  }
});

/**
 * @openapi
 * /api/v1/admin/tracking/peak-hours:
 *   get:
 *     summary: Get organization peak engagement hours
 *     description: |
 *       Returns the top hours and days when email engagement is highest.
 *       Useful for optimizing email send times.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 7
 *           maximum: 90
 *           default: 30
 *         description: Analysis period in days
 *     responses:
 *       200:
 *         description: Peak hours retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       hour:
 *                         type: integer
 *                       day:
 *                         type: string
 *                       avgOpens:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/admin/tracking/peak-hours', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const days = Math.min(90, Math.max(7, parseInt(req.query.days as string, 10) || 30));

    const peakHours = await adminAnalyticsService.getOrgPeakHours(organizationId, days);

    res.json({
      success: true,
      data: peakHours,
    });
  } catch (error: any) {
    logger.error('Failed to get peak hours', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve peak hours' },
    });
  }
});

/**
 * @openapi
 * /api/v1/admin/tracking/devices:
 *   get:
 *     summary: Get device distribution for the organization
 *     description: Returns breakdown of email opens by device type.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 90
 *           default: 30
 *     responses:
 *       200:
 *         description: Device stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     desktop:
 *                       type: integer
 *                     mobile:
 *                       type: integer
 *                     tablet:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/admin/tracking/devices', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string, 10) || 30));

    const deviceStats = await adminAnalyticsService.getOrgDeviceStats(organizationId, days);

    res.json({
      success: true,
      data: deviceStats,
    });
  } catch (error: any) {
    logger.error('Failed to get device stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve device statistics' },
    });
  }
});

/**
 * @openapi
 * /api/v1/admin/tracking/inactive-users:
 *   get:
 *     summary: Get users with no recent engagement
 *     description: |
 *       Returns list of tracked users who have had no email opens
 *       in the specified period. Useful for identifying potential issues.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 7
 *           maximum: 90
 *           default: 30
 *     responses:
 *       200:
 *         description: Inactive users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       lastActivity:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/admin/tracking/inactive-users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const days = Math.min(90, Math.max(7, parseInt(req.query.days as string, 10) || 30));

    const inactiveUsers = await adminAnalyticsService.getInactiveTrackedUsers(organizationId, days);

    res.json({
      success: true,
      data: inactiveUsers,
    });
  } catch (error: any) {
    logger.error('Failed to get inactive users', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve inactive users' },
    });
  }
});

// ============================================================================
// Tracking Settings Endpoints
// ============================================================================

interface TrackingSettings {
  userTrackingEnabled: boolean;
  campaignTrackingEnabled: boolean;
  retentionDays: number;
  showUserDashboard: boolean;
  excludeBots: boolean;
}

const TRACKING_SETTINGS_KEYS = [
  'tracking_user_enabled',
  'tracking_campaign_enabled',
  'tracking_retention_days',
  'tracking_show_user_dashboard',
  'tracking_exclude_bots',
] as const;

const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  userTrackingEnabled: true,
  campaignTrackingEnabled: true,
  retentionDays: 90,
  showUserDashboard: true,
  excludeBots: true,
};

/**
 * @openapi
 * /api/v1/settings/tracking:
 *   get:
 *     summary: Get organization tracking settings
 *     description: |
 *       Returns the current tracking settings for the organization.
 *       Requires admin role.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tracking settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     userTrackingEnabled:
 *                       type: boolean
 *                       description: Enable user-level engagement tracking
 *                     campaignTrackingEnabled:
 *                       type: boolean
 *                       description: Enable campaign-level tracking
 *                     retentionDays:
 *                       type: integer
 *                       description: Days to retain tracking data
 *                     showUserDashboard:
 *                       type: boolean
 *                       description: Show engagement widget to users
 *                     excludeBots:
 *                       type: boolean
 *                       description: Filter out bot/crawler traffic
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/settings/tracking', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user!.organizationId;

    // Get all tracking settings from the database
    const result = await db.query(
      `SELECT key, value FROM organization_settings
       WHERE organization_id = $1
       AND key = ANY($2)`,
      [organizationId, TRACKING_SETTINGS_KEYS]
    );

    // Build settings object with defaults
    const settings: TrackingSettings = { ...DEFAULT_TRACKING_SETTINGS };

    result.rows.forEach((row: { key: string; value: string }) => {
      switch (row.key) {
        case 'tracking_user_enabled':
          settings.userTrackingEnabled = row.value === 'true';
          break;
        case 'tracking_campaign_enabled':
          settings.campaignTrackingEnabled = row.value === 'true';
          break;
        case 'tracking_retention_days':
          settings.retentionDays = parseInt(row.value, 10) || DEFAULT_TRACKING_SETTINGS.retentionDays;
          break;
        case 'tracking_show_user_dashboard':
          settings.showUserDashboard = row.value === 'true';
          break;
        case 'tracking_exclude_bots':
          settings.excludeBots = row.value === 'true';
          break;
      }
    });

    res.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    logger.error('Failed to get tracking settings', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve tracking settings' },
    });
  }
});

/**
 * @openapi
 * /api/v1/settings/tracking:
 *   put:
 *     summary: Update organization tracking settings
 *     description: |
 *       Updates tracking settings for the organization.
 *       Requires admin role. Changes take effect immediately.
 *     tags: [Tracking Analytics]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userTrackingEnabled:
 *                 type: boolean
 *                 description: Enable user-level engagement tracking
 *               campaignTrackingEnabled:
 *                 type: boolean
 *                 description: Enable campaign-level tracking
 *               retentionDays:
 *                 type: integer
 *                 minimum: 7
 *                 maximum: 365
 *                 description: Days to retain tracking data (7-365)
 *               showUserDashboard:
 *                 type: boolean
 *                 description: Show engagement widget to users
 *               excludeBots:
 *                 type: boolean
 *                 description: Filter out bot/crawler traffic
 *     responses:
 *       200:
 *         description: Tracking settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     userTrackingEnabled:
 *                       type: boolean
 *                     campaignTrackingEnabled:
 *                       type: boolean
 *                     retentionDays:
 *                       type: integer
 *                     showUserDashboard:
 *                       type: boolean
 *                     excludeBots:
 *                       type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid settings provided
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.put('/settings/tracking', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.user!.organizationId;
    const {
      userTrackingEnabled,
      campaignTrackingEnabled,
      retentionDays,
      showUserDashboard,
      excludeBots,
    } = req.body;

    // Validate retention days if provided
    if (retentionDays !== undefined) {
      const days = parseInt(retentionDays, 10);
      if (isNaN(days) || days < 7 || days > 365) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Retention days must be between 7 and 365',
          },
        });
      }
    }

    // Build updates array
    const updates: Array<{ key: string; value: string }> = [];

    if (typeof userTrackingEnabled === 'boolean') {
      updates.push({ key: 'tracking_user_enabled', value: String(userTrackingEnabled) });
    }
    if (typeof campaignTrackingEnabled === 'boolean') {
      updates.push({ key: 'tracking_campaign_enabled', value: String(campaignTrackingEnabled) });
    }
    if (retentionDays !== undefined) {
      updates.push({ key: 'tracking_retention_days', value: String(parseInt(retentionDays, 10)) });
    }
    if (typeof showUserDashboard === 'boolean') {
      updates.push({ key: 'tracking_show_user_dashboard', value: String(showUserDashboard) });
    }
    if (typeof excludeBots === 'boolean') {
      updates.push({ key: 'tracking_exclude_bots', value: String(excludeBots) });
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No valid settings provided to update',
        },
      });
    }

    // Upsert each setting
    for (const update of updates) {
      await db.query(
        `INSERT INTO organization_settings (organization_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [organizationId, update.key, update.value]
      );
    }

    // Fetch and return the updated settings
    const result = await db.query(
      `SELECT key, value FROM organization_settings
       WHERE organization_id = $1
       AND key = ANY($2)`,
      [organizationId, TRACKING_SETTINGS_KEYS]
    );

    const settings: TrackingSettings = { ...DEFAULT_TRACKING_SETTINGS };

    result.rows.forEach((row: { key: string; value: string }) => {
      switch (row.key) {
        case 'tracking_user_enabled':
          settings.userTrackingEnabled = row.value === 'true';
          break;
        case 'tracking_campaign_enabled':
          settings.campaignTrackingEnabled = row.value === 'true';
          break;
        case 'tracking_retention_days':
          settings.retentionDays = parseInt(row.value, 10) || DEFAULT_TRACKING_SETTINGS.retentionDays;
          break;
        case 'tracking_show_user_dashboard':
          settings.showUserDashboard = row.value === 'true';
          break;
        case 'tracking_exclude_bots':
          settings.excludeBots = row.value === 'true';
          break;
      }
    });

    logger.info('Updated tracking settings', { organizationId, updates: updates.map((u) => u.key) });

    res.json({
      success: true,
      data: settings,
      message: 'Tracking settings updated successfully',
    });
  } catch (error: any) {
    logger.error('Failed to update tracking settings', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update tracking settings' },
    });
  }
});

export default router;
