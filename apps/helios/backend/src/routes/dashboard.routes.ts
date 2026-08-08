import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { cacheService } from '../services/cache.service.js';
import { activityTracker } from '../services/activity-tracker.service.js';
import { oauthTokenSyncService } from '../services/oauth-token-sync.service.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';

const router = Router();
router.use(authenticateToken);

/**
 * @openapi
 * /dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     description: |
 *       Returns aggregated statistics for the organization dashboard.
 *       Includes user counts by status, Google Workspace sync status,
 *       and integration connection states.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
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
 *                     google:
 *                       type: object
 *                       properties:
 *                         connected:
 *                           type: boolean
 *                         totalUsers:
 *                           type: integer
 *                         suspendedUsers:
 *                           type: integer
 *                         adminUsers:
 *                           type: integer
 *                         lastSync:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                     helios:
 *                       type: object
 *                       properties:
 *                         totalUsers:
 *                           type: integer
 *                         guestUsers:
 *                           type: integer
 *                         orphanedUsers:
 *                           type: integer
 *                     microsoft:
 *                       type: object
 *                       properties:
 *                         connected:
 *                           type: boolean
 *                         totalUsers:
 *                           type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const cacheKey = cacheService.keys.dashboardStats(organizationId);

    const stats = await cacheService.remember(cacheKey, async () => {
      // Get real statistics from database
      const [
        totalUsers,
        activeUsers,
        suspendedUsers,
        deletedUsers,
        totalGroups,
        googleUsers,
        localUsers,
        guestUsers,
        admins,
        orphanedUsers
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND is_active = true', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND is_active = false', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND status = \'deleted\'', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM access_groups WHERE organization_id = $1', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND google_workspace_id IS NOT NULL', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND google_workspace_id IS NULL', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND is_guest = true', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND role = \'admin\'', [organizationId]),
        // Orphaned users: no manager assigned, not CEO, active
        db.query(`
          SELECT COUNT(*) as count FROM organization_users
          WHERE organization_id = $1
            AND is_active = true
            AND status != 'deleted'
            AND reporting_manager_id IS NULL
            AND job_title NOT LIKE '%Chief Executive%'
            AND COALESCE(job_title, '') NOT IN ('CEO', '')
        `, [organizationId])
      ]);

      // Check if Google Workspace is configured
      const gwConfig = await db.query(
        'SELECT COUNT(*) as count FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      const isGoogleConfigured = gwConfig.rows[0].count > 0;

      // Get last sync time if Google Workspace is configured
      // Use gw_synced_users updated_at as a proxy for last sync
      let lastSync: string | null = null;
      if (isGoogleConfigured) {
        const syncResult = await db.query(`
          SELECT MAX(updated_at) as last_sync
          FROM gw_synced_users
          WHERE organization_id = $1
        `, [organizationId]);
        lastSync = syncResult.rows[0]?.last_sync || null;
      }

      // Get security stats (unified 2FA across all sources + OAuth)
      let securityStats = null;
      try {
        // Get unified 2FA status from all sources (Helios, Google, M365)
        const unified2FAData = await oauthTokenSyncService.getUnified2FAStatus(organizationId);

        // Get OAuth apps data if Google is configured
        let oauthAppsData = null;
        if (isGoogleConfigured) {
          oauthAppsData = await oauthTokenSyncService.getOAuthApps(organizationId, {
            sortBy: 'userCount',
            sortOrder: 'desc',
            limit: 5
          });
        }

        securityStats = {
          twoFactor: {
            total: unified2FAData.summary.total,
            enrolled: unified2FAData.summary.enrolled,
            notEnrolled: unified2FAData.summary.notEnrolled,
            percentage: unified2FAData.summary.percentage,
            bySource: unified2FAData.summary.bySource
          },
          oauthApps: oauthAppsData ? {
            totalApps: oauthAppsData.total,
            totalGrants: oauthAppsData.totalGrants,
            topApps: oauthAppsData.apps.map(app => ({
              displayName: app.displayName || 'Unknown App',
              userCount: app.userCount
            }))
          } : null
        };
      } catch (err) {
        // Security stats are optional, don't fail the whole request
        logger.debug('Failed to get security stats for dashboard', { error: (err as Error).message });
      }

      return {
        google: isGoogleConfigured ? {
          connected: true,
          totalUsers: parseInt(googleUsers.rows[0].count),
          suspendedUsers: parseInt(suspendedUsers.rows[0].count),
          adminUsers: parseInt(admins.rows[0].count),
          lastSync: lastSync
        } : {
          connected: false,
          totalUsers: 0,
          suspendedUsers: 0,
          adminUsers: 0,
          lastSync: null as string | null
        },
        helios: {
          totalUsers: parseInt(localUsers.rows[0].count),
          guestUsers: parseInt(guestUsers.rows[0].count),
          orphanedUsers: parseInt(orphanedUsers.rows[0].count)
        },
        microsoft: {
          connected: false,
          totalUsers: 0,
          disabledUsers: 0,
          adminUsers: 0,
          lastSync: null as string | null
        },
        security: securityStats
      };
    }, 60); // Cache for 1 minute

    successResponse(res, stats);
  } catch (error: any) {
    logger.error('Failed to get dashboard stats', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get dashboard statistics');
  }
});

/**
 * @openapi
 * /dashboard/activity:
 *   get:
 *     summary: Get recent activity
 *     description: Returns the 10 most recent activity events for the organization.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Recent activity events
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
 *                       id:
 *                         type: string
 *                       action:
 *                         type: string
 *                       actor:
 *                         type: string
 *                       target:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/activity', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const activity = await activityTracker.getRecentActivity(organizationId, 10);

    successResponse(res, activity);
  } catch (error: any) {
    logger.error('Failed to get activity', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get activity');
  }
});

/**
 * @openapi
 * /dashboard/alerts:
 *   get:
 *     summary: Get system alerts
 *     description: |
 *       Returns actionable system alerts such as suspended users,
 *       sync failures, and configuration recommendations.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System alerts
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
 *                       id:
 *                         type: string
 *                       severity:
 *                         type: string
 *                         enum: [info, warning, error]
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       link:
 *                         type: string
 *                       action:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/alerts', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const alerts = [];

    // Check for suspended users
    const suspendedResult = await db.query(
      'SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND is_active = false',
      [organizationId]
    );
    const suspendedCount = parseInt(suspendedResult.rows[0].count);

    if (suspendedCount > 0) {
      alerts.push({
        id: 'suspended-users',
        severity: 'warning',
        title: `${suspendedCount} suspended users`,
        description: 'Review and restore or remove suspended users',
        link: '/users?status=suspended'
      });
    }

    // Check for sync issues
    const syncResult = await db.query(`
      SELECT COUNT(*) as count
      FROM security_events
      WHERE organization_id = $1
      AND event_type = 'sync.failed'
      AND created_at > NOW() - INTERVAL '24 hours'
    `, [organizationId]);
    const failedSyncs = parseInt(syncResult.rows[0].count);

    if (failedSyncs > 0) {
      alerts.push({
        id: 'sync-failures',
        severity: 'error',
        title: `${failedSyncs} sync failures in last 24 hours`,
        description: 'Check Google Workspace configuration',
        link: '/settings'
      });
    }

    // Check if Google Workspace needs initial sync
    const gwCheck = await db.query(`
      SELECT gc.created_at,
             (SELECT COUNT(*) FROM organization_users WHERE organization_id = $1 AND google_workspace_id IS NOT NULL) as synced_users
      FROM gw_credentials gc
      WHERE gc.organization_id = $1
    `, [organizationId]);

    if (gwCheck.rows.length > 0 && gwCheck.rows[0].synced_users === '0') {
      alerts.push({
        id: 'initial-sync',
        severity: 'info',
        title: 'Initial Google Workspace sync recommended',
        description: 'Sync users from Google Workspace to get started',
        link: '/settings',
        action: 'Sync Now'
      });
    }

    successResponse(res, alerts);
  } catch (error: any) {
    logger.error('Failed to get alerts', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get alerts');
  }
});

/**
 * @openapi
 * /dashboard/widgets:
 *   get:
 *     summary: Get widget preferences
 *     description: Returns the user's dashboard widget configuration and layout.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Widget preferences
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
 *                       widgetId:
 *                         type: string
 *                       position:
 *                         type: integer
 *                       isVisible:
 *                         type: boolean
 *                       config:
 *                         type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/widgets', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      validationErrorResponse(res, [{ field: 'userId', message: 'User ID not found' }]);
      return;
    }

    const cacheKey = cacheService.keys.dashboardWidgets(userId);

    const widgets = await cacheService.remember(cacheKey, async () => {
      const result = await db.query(`
        SELECT widget_id, position, is_visible, config
        FROM user_dashboard_widgets
        WHERE user_id = $1
        ORDER BY position
      `, [userId]);

      // If no widgets configured, return defaults matching frontend widget registry
      if (result.rows.length === 0) {
        return [
          { widgetId: 'google-total-users', position: 0, isVisible: true },
          { widgetId: 'google-suspended', position: 1, isVisible: true },
          { widgetId: 'google-admins', position: 2, isVisible: true },
          { widgetId: 'helios-total-users', position: 3, isVisible: true },
          { widgetId: 'helios-guests', position: 4, isVisible: true },
          { widgetId: 'system-alerts', position: 5, isVisible: true }
        ];
      }

      return result.rows.map((row: any) => ({
        widgetId: row.widget_id,
        position: row.position,
        isVisible: row.is_visible,
        config: row.config
      }));
    }, 300); // Cache for 5 minutes

    successResponse(res, widgets);
  } catch (error: any) {
    logger.error('Failed to get widgets', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get widget preferences');
  }
});

/**
 * @openapi
 * /dashboard/widgets:
 *   put:
 *     summary: Save widget preferences
 *     description: Saves the user's dashboard widget configuration and layout.
 *     tags: [Dashboard]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               widgets:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     widgetId:
 *                       type: string
 *                     isVisible:
 *                       type: boolean
 *                     config:
 *                       type: object
 *     responses:
 *       200:
 *         description: Preferences saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/widgets', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const widgets = req.body.widgets;

    if (!userId) {
      validationErrorResponse(res, [{ field: 'userId', message: 'User ID not found' }]);
      return;
    }

    if (!Array.isArray(widgets)) {
      validationErrorResponse(res, [{ field: 'widgets', message: 'Invalid widget data' }]);
      return;
    }

    // Begin transaction
    await db.query('BEGIN');

    try {
      // Clear existing widgets
      await db.query('DELETE FROM user_dashboard_widgets WHERE user_id = $1', [userId]);

      // Insert new widget preferences
      for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        await db.query(`
          INSERT INTO user_dashboard_widgets (user_id, widget_id, position, is_visible, config)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, widget.widgetId, i, widget.isVisible !== false, JSON.stringify(widget.config || {})]);
      }

      await db.query('COMMIT');

      // Clear cache
      await cacheService.del(cacheService.keys.dashboardWidgets(userId));

      successResponse(res, { message: 'Widget preferences saved' });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error: any) {
    logger.error('Failed to save widgets', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to save widget preferences');
  }
});

export default router;