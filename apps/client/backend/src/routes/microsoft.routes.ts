import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { microsoftGraphService } from '../services/microsoft-graph.service.js';
import { microsoftSyncService } from '../services/microsoft-sync.service.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';

const router = Router();

// All Microsoft routes require authentication
router.use(authenticateToken);

/**
 * @openapi
 * /microsoft/status:
 *   get:
 *     summary: Get Microsoft 365 connection status
 *     description: Returns the current configuration and sync status for Microsoft 365 integration.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Microsoft 365 status
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
 *                     isConfigured:
 *                       type: boolean
 *                     isActive:
 *                       type: boolean
 *                     syncStatus:
 *                       type: string
 *                     lastSyncAt:
 *                       type: string
 *                       format: date-time
 *                     stats:
 *                       type: object
 *                       properties:
 *                         users:
 *                           type: integer
 *                         groups:
 *                           type: integer
 *                         licenses:
 *                           type: integer
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const status = await microsoftSyncService.getSyncStatus(organizationId);
    successResponse(res, status);
  } catch (error: any) {
    logger.error('Failed to get Microsoft status', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get Microsoft 365 status');
  }
});

/**
 * @openapi
 * /microsoft/connect:
 *   post:
 *     summary: Connect Microsoft 365
 *     description: Store Microsoft 365 credentials and test the connection.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *               - clientId
 *               - clientSecret
 *             properties:
 *               tenantId:
 *                 type: string
 *                 description: Azure AD Tenant ID
 *               clientId:
 *                 type: string
 *                 description: Application (Client) ID
 *               clientSecret:
 *                 type: string
 *                 description: Client Secret
 *     responses:
 *       200:
 *         description: Connection successful
 *       400:
 *         description: Invalid credentials or connection failed
 */
router.post('/connect', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { tenantId, clientId, clientSecret } = req.body;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    // Validate required fields
    if (!tenantId || !clientId || !clientSecret) {
      validationErrorResponse(res, [
        { field: 'credentials', message: 'Tenant ID, Client ID, and Client Secret are required' },
      ]);
      return;
    }

    // Test the connection first
    const testResult = await microsoftGraphService.testConnection({
      tenantId,
      clientId,
      clientSecret,
    });

    if (!testResult.success) {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, testResult.message);
      return;
    }

    // Store the credentials
    const storeResult = await microsoftGraphService.storeCredentials(
      organizationId,
      { tenantId, clientId, clientSecret },
      userId
    );

    if (!storeResult.success) {
      errorResponse(res, ErrorCode.INTERNAL_ERROR, storeResult.message);
      return;
    }

    // Trigger initial sync
    microsoftSyncService.syncAll(organizationId).catch((err) => {
      logger.error('Initial Microsoft sync failed', { organizationId, error: err.message });
    });

    successResponse(res, {
      message: 'Microsoft 365 connected successfully',
      details: testResult.details,
    });
  } catch (error: any) {
    logger.error('Failed to connect Microsoft 365', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to connect Microsoft 365');
  }
});

/**
 * @openapi
 * /microsoft/test:
 *   post:
 *     summary: Test Microsoft 365 credentials
 *     description: Test the provided credentials without saving them.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *               - clientId
 *               - clientSecret
 *             properties:
 *               tenantId:
 *                 type: string
 *               clientId:
 *                 type: string
 *               clientSecret:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test result
 */
router.post('/test', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenantId, clientId, clientSecret } = req.body;

    if (!tenantId || !clientId || !clientSecret) {
      validationErrorResponse(res, [
        { field: 'credentials', message: 'Tenant ID, Client ID, and Client Secret are required' },
      ]);
      return;
    }

    const result = await microsoftGraphService.testConnection({
      tenantId,
      clientId,
      clientSecret,
    });

    if (result.success) {
      successResponse(res, {
        success: true,
        message: result.message,
        details: result.details,
      });
    } else {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, result.message);
    }
  } catch (error: any) {
    logger.error('Microsoft test failed', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Connection test failed');
  }
});

/**
 * @openapi
 * /microsoft/sync:
 *   post:
 *     summary: Trigger Microsoft 365 sync
 *     description: Manually trigger a sync of users, groups, and licenses from Microsoft 365.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sync started
 */
router.post('/sync', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    // Start sync in background
    microsoftSyncService.syncAll(organizationId).then((result) => {
      if (!result.success) {
        logger.error('Microsoft sync failed', { organizationId, error: result.message });
      }
    });

    successResponse(res, { message: 'Sync started' });
  } catch (error: any) {
    logger.error('Failed to start Microsoft sync', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to start sync');
  }
});

/**
 * @openapi
 * /microsoft/disconnect:
 *   delete:
 *     summary: Disconnect Microsoft 365
 *     description: Remove Microsoft 365 credentials and disable the integration.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Disconnected successfully
 */
router.delete('/disconnect', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const result = await microsoftGraphService.removeCredentials(organizationId);

    if (result.success) {
      successResponse(res, { message: result.message });
    } else {
      errorResponse(res, ErrorCode.INTERNAL_ERROR, result.message);
    }
  } catch (error: any) {
    logger.error('Failed to disconnect Microsoft 365', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to disconnect Microsoft 365');
  }
});

// =====================================================
// USER MANAGEMENT ENDPOINTS
// =====================================================

/**
 * @openapi
 * /microsoft/users:
 *   get:
 *     summary: List synced Microsoft users
 *     description: Returns all users synced from Microsoft Entra ID.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of Microsoft users
 */
router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const result = await db.query(
      `SELECT id, ms_id, upn, display_name, given_name, surname, email,
              job_title, department, office_location, company_name,
              mobile_phone, business_phones, is_account_enabled, is_admin,
              assigned_licenses, last_sync_at
       FROM ms_synced_users
       WHERE organization_id = $1
       ORDER BY display_name`,
      [organizationId]
    );

    successResponse(res, result.rows);
  } catch (error: any) {
    logger.error('Failed to list Microsoft users', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list users');
  }
});

/**
 * @openapi
 * /microsoft/users/{id}:
 *   get:
 *     summary: Get a single Microsoft user
 *     description: Returns details for a specific Microsoft user by internal ID.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 */
router.get('/users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const result = await db.query(
      `SELECT id, ms_id, upn, display_name, given_name, surname, email,
              job_title, department, office_location, company_name,
              mobile_phone, business_phones, is_account_enabled, is_admin,
              assigned_licenses, raw_data, last_sync_at
       FROM ms_synced_users
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    );

    if (result.rows.length === 0) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'User not found');
      return;
    }

    successResponse(res, result.rows[0]);
  } catch (error: any) {
    logger.error('Failed to get Microsoft user', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get user');
  }
});

// =====================================================
// GROUP MANAGEMENT ENDPOINTS
// =====================================================

/**
 * @openapi
 * /microsoft/groups:
 *   get:
 *     summary: List synced Microsoft groups
 *     description: Returns all groups synced from Microsoft Entra ID.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of Microsoft groups
 */
router.get('/groups', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const result = await db.query(
      `SELECT id, ms_id, display_name, description, mail,
              mail_enabled, security_enabled, group_types, member_count, last_sync_at
       FROM ms_synced_groups
       WHERE organization_id = $1
       ORDER BY display_name`,
      [organizationId]
    );

    successResponse(res, result.rows);
  } catch (error: any) {
    logger.error('Failed to list Microsoft groups', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list groups');
  }
});

/**
 * @openapi
 * /microsoft/groups/{id}:
 *   get:
 *     summary: Get a single Microsoft group
 *     description: Returns details for a specific Microsoft group including members.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Group details with members
 *       404:
 *         description: Group not found
 */
router.get('/groups/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const groupResult = await db.query(
      `SELECT id, ms_id, display_name, description, mail,
              mail_enabled, security_enabled, group_types, member_count, raw_data, last_sync_at
       FROM ms_synced_groups
       WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    );

    if (groupResult.rows.length === 0) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'Group not found');
      return;
    }

    // Get members
    const membersResult = await db.query(
      `SELECT u.id, u.display_name, u.email, u.job_title
       FROM ms_group_memberships m
       JOIN ms_synced_users u ON m.user_id = u.id
       WHERE m.group_id = $1
       ORDER BY u.display_name`,
      [id]
    );

    successResponse(res, {
      ...groupResult.rows[0],
      members: membersResult.rows,
    });
  } catch (error: any) {
    logger.error('Failed to get Microsoft group', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get group');
  }
});

// =====================================================
// LICENSE MANAGEMENT ENDPOINTS
// =====================================================

/**
 * @openapi
 * /microsoft/licenses:
 *   get:
 *     summary: List available Microsoft licenses
 *     description: Returns all license SKUs available in the Microsoft 365 tenant.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of available licenses
 */
router.get('/licenses', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const result = await db.query(
      `SELECT id, sku_id, sku_part_number, display_name,
              total_units, consumed_units, available_units, last_sync_at
       FROM ms_licenses
       WHERE organization_id = $1
       ORDER BY display_name`,
      [organizationId]
    );

    successResponse(res, result.rows);
  } catch (error: any) {
    logger.error('Failed to list Microsoft licenses', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list licenses');
  }
});

/**
 * @openapi
 * /microsoft/users/{id}/licenses:
 *   get:
 *     summary: Get user's licenses
 *     description: Returns the licenses assigned to a specific user.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User's assigned licenses
 */
router.get('/users/:id/licenses', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    // Get user's assigned licenses from synced data
    const userResult = await db.query(
      `SELECT assigned_licenses FROM ms_synced_users WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    );

    if (userResult.rows.length === 0) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'User not found');
      return;
    }

    const assignedLicenses = userResult.rows[0].assigned_licenses || [];

    // Get license details
    const skuIds = assignedLicenses.map((l: any) => l.skuId);
    let licenses: any[] = [];

    if (skuIds.length > 0) {
      const licensesResult = await db.query(
        `SELECT sku_id, sku_part_number, display_name
         FROM ms_licenses
         WHERE organization_id = $1 AND sku_id = ANY($2::varchar[])`,
        [organizationId, skuIds]
      );
      licenses = licensesResult.rows;
    }

    successResponse(res, licenses);
  } catch (error: any) {
    logger.error('Failed to get user licenses', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get user licenses');
  }
});

/**
 * @openapi
 * /microsoft/users/{id}/licenses:
 *   post:
 *     summary: Assign licenses to a user
 *     description: Assigns one or more licenses to a Microsoft user.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - skuIds
 *             properties:
 *               skuIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Licenses assigned successfully
 */
router.post('/users/:id/licenses', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;
    const { skuIds } = req.body;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    if (!skuIds || !Array.isArray(skuIds) || skuIds.length === 0) {
      validationErrorResponse(res, [{ field: 'skuIds', message: 'At least one SKU ID is required' }]);
      return;
    }

    // Get the user's MS ID
    const userResult = await db.query(
      `SELECT ms_id FROM ms_synced_users WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    );

    if (userResult.rows.length === 0) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'User not found');
      return;
    }

    // Initialize the Graph service
    const initialized = await microsoftGraphService.initialize(organizationId);
    if (!initialized) {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Microsoft 365 not configured');
      return;
    }

    // Assign the licenses
    await microsoftGraphService.assignLicense(userResult.rows[0].ms_id, skuIds);

    successResponse(res, { message: 'Licenses assigned successfully' });
  } catch (error: any) {
    logger.error('Failed to assign licenses', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to assign licenses: ' + error.message);
  }
});

/**
 * @openapi
 * /microsoft/users/{id}/licenses/{skuId}:
 *   delete:
 *     summary: Remove a license from a user
 *     description: Removes a specific license from a Microsoft user.
 *     tags: [Microsoft 365]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: skuId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: License removed successfully
 */
router.delete('/users/:id/licenses/:skuId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id, skuId } = req.params;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    // Get the user's MS ID
    const userResult = await db.query(
      `SELECT ms_id FROM ms_synced_users WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    );

    if (userResult.rows.length === 0) {
      errorResponse(res, ErrorCode.NOT_FOUND, 'User not found');
      return;
    }

    // Initialize the Graph service
    const initialized = await microsoftGraphService.initialize(organizationId);
    if (!initialized) {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Microsoft 365 not configured');
      return;
    }

    // Remove the license
    await microsoftGraphService.removeLicense(userResult.rows[0].ms_id, [skuId]);

    successResponse(res, { message: 'License removed successfully' });
  } catch (error: any) {
    logger.error('Failed to remove license', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to remove license: ' + error.message);
  }
});

export default router;
