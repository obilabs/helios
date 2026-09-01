import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { microsoftGraphService } from '../services/microsoft-graph.service.js';
import { microsoftSyncService } from '../services/microsoft-sync.service.js';
import { migrationPlanService } from '../services/migration/migration-plan.service.js';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
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
// GROUP WRITE ENDPOINTS (create / update / delete / membership)
// =====================================================

/**
 * App-only Graph (Group.ReadWrite.All) can fully manage pure security groups and
 * Unified/M365 groups. It CANNOT manage: mail-enabled security / distribution
 * groups (need Exchange Online), dynamic-membership groups (need Entra ID P1 +
 * membershipRule), or role-assignable groups (need RoleManagement.ReadWrite.
 * Directory). Refuse those up front with a clear message rather than letting
 * Graph reject them — or, worse, silently "succeed" — which is the exact
 * silent-failure mode to avoid. Returns an error message, or null when OK.
 */
function unmanageableM365GroupReason(body: any): string | null {
  const groupTypes: string[] = Array.isArray(body?.groupTypes) ? body.groupTypes : [];
  if (groupTypes.includes('DynamicMembership')) {
    return 'Dynamic-membership groups require Entra ID P1 and a membershipRule, and cannot be managed with the app-only Graph permissions Helios holds.';
  }
  if (body?.isAssignableToRole === true) {
    return 'Role-assignable groups require RoleManagement.ReadWrite.Directory, which Helios is not consented for.';
  }
  if (body?.mailEnabled === true && !groupTypes.includes('Unified')) {
    return 'Distribution lists and mail-enabled security groups require Exchange Online and cannot be managed with app-only Graph permissions.';
  }
  return null;
}

/** POST /microsoft/groups — create a security or Unified/M365 group. */
router.post('/groups', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) { validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]); return; }
    const { displayName, description, mailNickname, securityEnabled, mailEnabled } = req.body || {};
    if (!displayName) { validationErrorResponse(res, [{ field: 'displayName', message: 'displayName is required' }]); return; }
    const reason = unmanageableM365GroupReason(req.body);
    if (reason) { errorResponse(res, ErrorCode.VALIDATION_ERROR, reason); return; }
    const initialized = await microsoftGraphService.initialize(organizationId);
    if (!initialized) { errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Microsoft 365 not configured'); return; }

    const created: any = await microsoftGraphService.createGroup({ displayName, description, mailNickname, securityEnabled, mailEnabled });

    try {
      if (created?.id) {
        await db.query(
          `INSERT INTO ms_synced_groups (organization_id, ms_id, display_name, description, mail, mail_enabled, security_enabled, group_types, raw_data, member_count, last_sync_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,NOW())
           ON CONFLICT (organization_id, ms_id) DO UPDATE SET
             display_name = EXCLUDED.display_name, description = EXCLUDED.description,
             mail = EXCLUDED.mail, mail_enabled = EXCLUDED.mail_enabled,
             security_enabled = EXCLUDED.security_enabled, group_types = EXCLUDED.group_types,
             raw_data = EXCLUDED.raw_data, last_sync_at = NOW()`,
          [organizationId, created.id, created.displayName || displayName, created.description ?? description ?? null,
            created.mail ?? null, created.mailEnabled ?? !!mailEnabled, created.securityEnabled ?? (securityEnabled ?? true),
            JSON.stringify(created.groupTypes || []), JSON.stringify(created)]
        );
      }
    } catch (mErr) { logger.warn('Group created in M365 but local mirror upsert failed', { error: (mErr as Error).message }); }

    successResponse(res, created);
  } catch (error: any) {
    logger.error('Failed to create Microsoft group', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to create group: ' + error.message);
  }
});

/** PATCH /microsoft/groups/:id — update group metadata (displayName/description/mailNickname). */
router.patch('/groups/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;
    if (!organizationId) { validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]); return; }
    const g = await db.query('SELECT id, ms_id FROM ms_synced_groups WHERE organization_id = $1 AND id = $2', [organizationId, id]);
    if (g.rows.length === 0) { errorResponse(res, ErrorCode.NOT_FOUND, 'Group not found'); return; }
    const initialized = await microsoftGraphService.initialize(organizationId);
    if (!initialized) { errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Microsoft 365 not configured'); return; }

    const { displayName, description, mailNickname } = req.body || {};
    const updates: { displayName?: string; description?: string; mailNickname?: string } = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (description !== undefined) updates.description = description;
    if (mailNickname !== undefined) updates.mailNickname = mailNickname;
    if (Object.keys(updates).length === 0) { validationErrorResponse(res, [{ field: 'body', message: 'No updatable fields provided' }]); return; }

    await microsoftGraphService.updateGroup(g.rows[0].ms_id, updates);
    try {
      await db.query(
        'UPDATE ms_synced_groups SET display_name = COALESCE($3, display_name), description = COALESCE($4, description), last_sync_at = NOW() WHERE organization_id = $1 AND id = $2',
        [organizationId, id, displayName ?? null, description ?? null]
      );
    } catch (mErr) { logger.warn('Group updated in M365 but local mirror update failed', { error: (mErr as Error).message }); }

    successResponse(res, { message: 'Group updated successfully' });
  } catch (error: any) {
    logger.error('Failed to update Microsoft group', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update group: ' + error.message);
  }
});

/** DELETE /microsoft/groups/:id — delete a group (memberships cascade in the mirror). */
router.delete('/groups/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;
    if (!organizationId) { validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]); return; }
    const g = await db.query('SELECT id, ms_id FROM ms_synced_groups WHERE organization_id = $1 AND id = $2', [organizationId, id]);
    if (g.rows.length === 0) { errorResponse(res, ErrorCode.NOT_FOUND, 'Group not found'); return; }
    const initialized = await microsoftGraphService.initialize(organizationId);
    if (!initialized) { errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Microsoft 365 not configured'); return; }

    await microsoftGraphService.deleteGroup(g.rows[0].ms_id);
    try {
      await db.query('DELETE FROM ms_synced_groups WHERE organization_id = $1 AND id = $2', [organizationId, id]);
    } catch (mErr) { logger.warn('Group deleted in M365 but local mirror delete failed', { error: (mErr as Error).message }); }

    successResponse(res, { message: 'Group deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete Microsoft group', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to delete group: ' + error.message);
  }
});

/** POST /microsoft/groups/:id/members { userId } — add a member. */
router.post('/groups/:id/members', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;
    const { userId } = req.body || {};
    if (!organizationId) { validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]); return; }
    if (!userId) { validationErrorResponse(res, [{ field: 'userId', message: 'userId is required' }]); return; }
    const g = await db.query('SELECT id, ms_id FROM ms_synced_groups WHERE organization_id = $1 AND id = $2', [organizationId, id]);
    if (g.rows.length === 0) { errorResponse(res, ErrorCode.NOT_FOUND, 'Group not found'); return; }
    const u = await db.query('SELECT id, ms_id FROM ms_synced_users WHERE organization_id = $1 AND id = $2', [organizationId, userId]);
    if (u.rows.length === 0) { errorResponse(res, ErrorCode.NOT_FOUND, 'User not found'); return; }
    const initialized = await microsoftGraphService.initialize(organizationId);
    if (!initialized) { errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Microsoft 365 not configured'); return; }

    await microsoftGraphService.addGroupMember(g.rows[0].ms_id, u.rows[0].ms_id);
    try {
      await db.query(
        'INSERT INTO ms_group_memberships (organization_id, group_id, user_id) VALUES ($1, $2, $3) ON CONFLICT (group_id, user_id) DO NOTHING',
        [organizationId, g.rows[0].id, u.rows[0].id]
      );
      await db.query('UPDATE ms_synced_groups SET member_count = (SELECT COUNT(*) FROM ms_group_memberships WHERE group_id = $1) WHERE id = $1', [g.rows[0].id]);
    } catch (mErr) { logger.warn('Member added in M365 but local mirror insert failed', { error: (mErr as Error).message }); }

    successResponse(res, { message: 'Member added successfully' });
  } catch (error: any) {
    logger.error('Failed to add Microsoft group member', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to add member: ' + error.message);
  }
});

/** DELETE /microsoft/groups/:id/members/:userId — remove a member. */
router.delete('/groups/:id/members/:userId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { id, userId } = req.params;
    if (!organizationId) { validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]); return; }
    const g = await db.query('SELECT id, ms_id FROM ms_synced_groups WHERE organization_id = $1 AND id = $2', [organizationId, id]);
    if (g.rows.length === 0) { errorResponse(res, ErrorCode.NOT_FOUND, 'Group not found'); return; }
    const u = await db.query('SELECT id, ms_id FROM ms_synced_users WHERE organization_id = $1 AND id = $2', [organizationId, userId]);
    if (u.rows.length === 0) { errorResponse(res, ErrorCode.NOT_FOUND, 'User not found'); return; }
    const initialized = await microsoftGraphService.initialize(organizationId);
    if (!initialized) { errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Microsoft 365 not configured'); return; }

    await microsoftGraphService.removeGroupMember(g.rows[0].ms_id, u.rows[0].ms_id);
    try {
      await db.query('DELETE FROM ms_group_memberships WHERE group_id = $1 AND user_id = $2', [g.rows[0].id, u.rows[0].id]);
      await db.query('UPDATE ms_synced_groups SET member_count = (SELECT COUNT(*) FROM ms_group_memberships WHERE group_id = $1) WHERE id = $1', [g.rows[0].id]);
    } catch (mErr) { logger.warn('Member removed in M365 but local mirror delete failed', { error: (mErr as Error).message }); }

    successResponse(res, { message: 'Member removed successfully' });
  } catch (error: any) {
    logger.error('Failed to remove Microsoft group member', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to remove member: ' + error.message);
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

/**
 * GET /microsoft/migration/plan
 * The saved M365->Google migration plan (or a freshly generated default),
 * mapping each M365 user to a chosen Google destination. Read-only; execution
 * stays out-of-band until the migration scopes + destination are in place.
 */
router.get('/migration/plan', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }
    const plan =
      (await migrationPlanService.loadPlan(organizationId)) ??
      (await migrationPlanService.generateDefaultPlan(organizationId));
    successResponse(res, { plan, validation: migrationPlanService.validatePlan(plan) });
  } catch (error: any) {
    logger.error('Failed to load migration plan', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to load migration plan');
  }
});

/**
 * PUT /microsoft/migration/plan
 * Persist an edited plan — destination overrides, including migrating source X
 * into a DIFFERENT Google account Y. Returns validation (unmapped targets and
 * destinations that do not yet exist and must be created + licensed first).
 */
router.put('/migration/plan', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }
    const plan = req.body?.plan;
    if (!plan || plan.organizationId !== organizationId || !Array.isArray(plan.targets)) {
      validationErrorResponse(res, [
        { field: 'plan', message: 'A plan with a matching organizationId and targets[] is required' },
      ]);
      return;
    }
    // Existence of each chosen destination is re-derived server-side (client
    // flags are not trusted), then persisted.
    const reconciled = await migrationPlanService.reconcileExistence(plan);
    await migrationPlanService.savePlan(reconciled);
    successResponse(res, {
      plan: reconciled,
      validation: migrationPlanService.validatePlan(reconciled),
    });
  } catch (error: any) {
    logger.error('Failed to save migration plan', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to save migration plan');
  }
});

/**
 * GET /microsoft/migration/plan/csv
 * The source->destination mapping as CSV for Google's native Data Migration
 * import (READY targets only — both accounts must already exist).
 */
router.get('/migration/plan/csv', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }
    const plan =
      (await migrationPlanService.loadPlan(organizationId)) ??
      (await migrationPlanService.generateDefaultPlan(organizationId));
    const csv = migrationPlanService.toGoogleMigrationCsv(plan);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="m365-google-migration-mapping.csv"');
    res.status(200).send(csv);
  } catch (error: any) {
    logger.error('Failed to export migration plan CSV', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to export migration plan CSV');
  }
});

/**
 * GET /microsoft/migration/plan/scope-csv[?header=...]
 * SOURCE-ONLY CSV for import steps that take a scope list (e.g. Google's OneDrive
 * import "Step 2: Set data import scope"). READY targets only. The mapping step
 * (OneDrive Step 3) uses /plan/csv, whose columns already match Google's sample.
 */
router.get('/migration/plan/scope-csv', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }
    const header = typeof req.query.header === 'string' && req.query.header.trim()
      ? req.query.header.trim()
      : 'Source OneDrive User';
    const plan =
      (await migrationPlanService.loadPlan(organizationId)) ??
      (await migrationPlanService.generateDefaultPlan(organizationId));
    const csv = migrationPlanService.toGoogleScopeCsv(plan, header);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="m365-google-migration-scope.csv"');
    res.status(200).send(csv);
  } catch (error: any) {
    logger.error('Failed to export migration scope CSV', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to export migration scope CSV');
  }
});

/**
 * POST /microsoft/migration/provision[?execute=true]
 * Provision the Google DESTINATIONS the migration plan needs — Google's native
 * importer never creates accounts. Dry-run unless ?execute=true. Honors each
 * target's destinationType (mailbox / delegated licensed mailbox / Google Group).
 * Requires the destination domain to already be added to the Google workspace.
 */
router.post('/migration/provision', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }
    const execute = req.query.execute === 'true';
    const result = await migrationPlanService.provisionMigrationDestinations(organizationId, execute);
    successResponse(res, result);
  } catch (error: any) {
    logger.error('Failed to provision migration destinations', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to provision migration destinations');
  }
});

/**
 * GET /microsoft/migration/status[?days=N][&maxPages=N]
 * Read-only migration progress from Google's `data_migration` audit stream
 * (Reports API). Google's cross-cloud transfer is console-triggered — there is no
 * start API — so this surfaces the transfer's progress (setup + per-object events
 * + failures) inside Helios. Uses the admin.reports.audit.readonly scope Helios
 * already holds. Window defaults to 7 days (1–60).
 *
 * The service pages through the whole window so counts reflect the TRUE totals
 * (not a single 1000-event page), bounded by `maxPages` (default 30, 1–100) to
 * cap quota/latency; when the cap is hit `summary.truncated` is set. The response
 * also carries per-item `failures` detail and a per-user/per-execution `byTarget`
 * breakdown.
 */
router.get('/migration/status', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? '7'), 10) || 7, 1), 60);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
    // Optional ops override for very large migrations; service clamps to 1–100.
    const maxPages = req.query.maxPages !== undefined
      ? parseInt(String(req.query.maxPages), 10) || undefined
      : undefined;
    const result = await googleWorkspaceService.fetchDataMigrationActivity(organizationId, { startTime, endTime, maxPages });
    successResponse(res, result);
  } catch (error: any) {
    logger.error('Failed to fetch migration status', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch migration status');
  }
});

export default router;
