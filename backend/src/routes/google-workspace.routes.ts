import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import { syncScheduler } from '../services/sync-scheduler.service.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { decodeServiceAccountKey } from '../services/gw-credentials.js';

const router = Router();

/**
 * SECURITY: deny by default.
 *
 * Every route in this router requires an authenticated session. Previously
 * `authenticateToken` was imported but applied to only 4 of 23 handlers, which
 * made the file *read* as guarded while leaving 19 routes open — including
 * `POST /setup`, which accepts a Google service-account credential blob and an
 * arbitrary organizationId and writes it with ON CONFLICT DO UPDATE. That
 * allowed an unauthenticated caller to overwrite any organization's Google
 * credentials.
 *
 * Do NOT add a route to this router that bypasses this. If a genuinely public
 * endpoint is ever needed, it belongs in a separate router with an explicit
 * justification, not an exception here.
 */
router.use(authenticateToken);

/**
 * Validation middleware
 */
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return next();
};

/**
 * @openapi
 * /api/v1/google-workspace/setup:
 *   post:
 *     summary: Setup Google Workspace integration
 *     description: |
 *       Upload service account credentials and configure Domain-Wide Delegation.
 *       Triggers initial sync after successful setup.
 *     tags: [Google Workspace]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, domain, credentials]
 *             properties:
 *               organizationId:
 *                 type: string
 *                 format: uuid
 *               domain:
 *                 type: string
 *                 example: example.com
 *               adminEmail:
 *                 type: string
 *                 format: email
 *               credentials:
 *                 type: object
 *                 required: [client_email, private_key, client_id]
 *                 properties:
 *                   client_email:
 *                     type: string
 *                   private_key:
 *                     type: string
 *                   client_id:
 *                     type: string
 *     responses:
 *       200:
 *         description: Setup successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 delegationInfo:
 *                   type: object
 *                 syncTriggered:
 *                   type: boolean
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/setup', requireAdmin, [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
  body('domain').notEmpty().withMessage('Domain is required'),
  body('organizationName').optional().notEmpty().withMessage('Organization name required if provided'),
  body('adminEmail').optional().isEmail().withMessage('Valid admin email required if provided'),
  body('credentials').isObject().withMessage('Service account credentials are required'),
  body('credentials.client_email').isEmail().withMessage('Valid service account email is required'),
  body('credentials.private_key').notEmpty().withMessage('Private key is required'),
  body('credentials.client_id').notEmpty().withMessage('Client ID is required'),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { organizationId, domain, organizationName, adminEmail, credentials } = req.body;

    logger.info('Setting up Google Workspace DWD', { organizationId, domain });

    // Check if organization exists
    const orgResult = await db.query(
      'SELECT id FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (orgResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const result = await googleWorkspaceService.storeServiceAccountCredentials(
      organizationId,
      domain,
      credentials,
      adminEmail
    );

    if (result.success) {
      // Trigger initial sync after successful setup (do not wait for it)
      logger.info('Triggering initial sync after Google Workspace setup', { organizationId, domain });
      syncScheduler.manualSync(organizationId).then((syncResult) => {
        if (syncResult.success) {
          logger.info('Initial Google Workspace sync completed', {
            organizationId,
            domain,
            userCount: syncResult.stats?.total_users || 0
          });
        } else {
          logger.warn('Initial Google Workspace sync failed', {
            organizationId,
            domain,
            error: syncResult.message
          });
        }
      }).catch((err) => {
        logger.error('Initial Google Workspace sync error', {
          organizationId,
          domain,
          error: err.message
        });
      });

      res.json({
        success: true,
        message: result.message,
        delegationInfo: googleWorkspaceService.getDomainWideDelegationInfo(),
        syncTriggered: true
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }
  } catch (error: any) {
    logger.error('Google Workspace setup failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error during setup'
    });
  }
});

/**
 * @openapi
 * /api/v1/google-workspace/test-connection:
 *   post:
 *     summary: Test connection with stored credentials
 *     description: Test Domain-Wide Delegation connection using credentials stored in the database.
 *     tags: [Google Workspace]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, domain]
 *             properties:
 *               organizationId:
 *                 type: string
 *                 format: uuid
 *               domain:
 *                 type: string
 *               adminEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Connection test result
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
 */
router.post('/test-connection', requireAdmin, [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
  body('domain').notEmpty().withMessage('Domain is required'),
  body('adminEmail').optional().isEmail().withMessage('Admin email must be valid if provided'),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { organizationId, domain } = req.body;
    let { adminEmail } = req.body;

    logger.info('Testing Google Workspace DWD connection', { organizationId, domain });

    // If adminEmail not provided, get it from the database
    if (!adminEmail) {
      const credResult = await db.query(
        'SELECT admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (credResult.rows.length > 0) {
        adminEmail = credResult.rows[0].admin_email;
      }
    }

    const result = await googleWorkspaceService.testConnection(organizationId, domain, adminEmail);

    res.json(result);
  } catch (error: any) {
    logger.error('Google Workspace connection test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error during connection test'
    });
  }
});

/**
 * POST /api/google-workspace/test-credentials
 * Test Domain-Wide Delegation connection with inline credentials (for wizard)
 */
router.post('/test-credentials', requireAdmin, [
  body('serviceAccount').isObject().withMessage('Service account credentials are required'),
  body('serviceAccount.client_email').isEmail().withMessage('Valid service account email is required'),
  body('serviceAccount.private_key').notEmpty().withMessage('Private key is required'),
  body('domain').notEmpty().withMessage('Domain is required'),
  body('adminEmail').isEmail().withMessage('Valid admin email is required'),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { serviceAccount, domain, adminEmail } = req.body;

    logger.info('Testing Google Workspace DWD with inline credentials', { domain });

    const result = await googleWorkspaceService.testConnectionWithCredentials(
      serviceAccount,
      domain,
      adminEmail
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Google Workspace credential test failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error during credential test'
    });
  }
});

/**
 * GET /api/google-workspace/users
 * Get Google Workspace users via Domain-Wide Delegation
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { organizationId, domain, adminEmail, maxResults } = req.query;

    if (!organizationId || !domain) {
      return res.status(400).json({
        success: false,
        error: 'organizationId and domain are required'
      });
    }

    logger.info('Fetching Google Workspace users via DWD', { organizationId, domain });

    const result = await googleWorkspaceService.getUsers(
      organizationId as string,
      domain as string,
      adminEmail as string,
      maxResults ? parseInt(maxResults as string) : 100
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to fetch Google Workspace users', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error while fetching users'
    });
  }
});

/**
 * GET /api/google-workspace/delegation-info
 * Get Domain-Wide Delegation setup information
 */
router.get('/delegation-info', async (req: Request, res: Response) => {
  try {
    const info = googleWorkspaceService.getDomainWideDelegationInfo();

    res.json({
      success: true,
      ...info
    });
  } catch (error: any) {
    logger.error('Failed to get delegation info', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/google-workspace/sync-now
 * Trigger manual sync for an organization
 */
router.post('/sync-now', requireAdmin, [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body;

    logger.info('Manual sync triggered', { organizationId });

    const result = await syncScheduler.manualSync(organizationId);

    res.json(result);
  } catch (error: any) {
    logger.error('Manual sync failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Manual sync failed'
    });
  }
});

/**
 * GET /api/google-workspace/organization-stats/:organizationId
 * Get dashboard stats for an organization
 */
router.get('/organization-stats/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    const stats = await syncScheduler.getOrganizationStats(organizationId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Failed to get organization stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get organization stats'
    });
  }
});

/**
 * GET /api/google-workspace/cached-users/:organizationId
 * Get cached Google Workspace users for an organization
 */
router.get('/cached-users/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    const users = await syncScheduler.getCachedUsers(organizationId);

    res.json({
      success: true,
      data: {
        users,
        count: users.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to get cached users', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get cached users'
    });
  }
});

/**
 * GET /api/google-workspace/org-units/:organizationId
 * Get organizational units from Google Workspace
 */
router.get('/org-units/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    logger.info('Fetching Google Workspace organizational units', { organizationId });

    const result = await googleWorkspaceService.getOrgUnits(organizationId);

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to fetch org units', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organizational units'
    });
  }
});

/**
 * POST /api/google-workspace/sync-org-units
 * Sync organizational units from Google Workspace to database
 */
router.post('/sync-org-units', requireAdmin, [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body;

    logger.info('Syncing Google Workspace org units', { organizationId });

    const result = await googleWorkspaceService.syncOrgUnits(organizationId);

    res.json(result);
  } catch (error: any) {
    logger.error('Org units sync failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to sync organizational units'
    });
  }
});

/**
 * GET /api/google-workspace/module-status/:organizationId
 * Get Google Workspace module status for an organization
 */
router.get('/module-status/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    // Module enable-state (may be absent if the module was never enabled). Note
    // the canonical slug is 'google_workspace' (underscore) — the value seeded
    // into `modules` and used by every other read/write path.
    const result = await db.query(`
      SELECT
        om.is_enabled,
        om.is_configured,
        om.config,
        om.updated_at,
        om.last_sync_at,
        om.sync_status
      FROM organization_modules om
      JOIN modules m ON m.id = om.module_id
      WHERE om.organization_id = $1 AND m.slug = 'google_workspace'
    `, [organizationId]);
    const moduleRow = result.rows[0] || null;

    // Stored credentials are the source of truth for "is Google Workspace
    // configured". They can exist even when the enable-row does not (e.g. a
    // legacy install where the enable-write was skipped), so the frontend can
    // offer a one-click enable / re-sync instead of forcing a full re-upload of
    // the service-account key.
    const credentialsResult = await db.query(
      'SELECT service_account_key, admin_email, domain, is_valid FROM gw_credentials WHERE organization_id = $1',
      [organizationId]
    );
    const credRow = credentialsResult.rows[0] || null;
    const hasCredentials = !!(credRow && credRow.is_valid);

    // Get actual user count from gw_synced_users
    const userCountResult = await db.query(
      'SELECT COUNT(*) as count FROM gw_synced_users WHERE organization_id = $1',
      [organizationId]
    );
    const userCount = parseInt(userCountResult.rows[0]?.count || '0');

    // Build configuration details, preferring the decoded service account.
    let configuration: any = moduleRow?.config || null;
    if (credRow) {
      try {
        const serviceAccount = decodeServiceAccountKey(credRow.service_account_key);
        configuration = {
          ...(moduleRow?.config || {}),
          domain: credRow.domain,
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          adminEmail: credRow.admin_email
        };
      } catch (error) {
        // If parsing fails, fall back to whatever config the module row holds.
        configuration = moduleRow?.config || null;
      }
    }

    res.json({
      success: true,
      data: {
        isEnabled: moduleRow?.is_enabled === true,
        isConfigured: moduleRow?.is_configured === true || hasCredentials,
        hasCredentials,
        userCount: userCount,
        lastSync: moduleRow?.last_sync_at || null,
        syncStatus: moduleRow?.sync_status || null,
        configuration,
        updatedAt: moduleRow?.updated_at || null
      }
    });
  } catch (error: any) {
    logger.error('Failed to get module status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get module status'
    });
  }
});

/**
 * GET /api/google-workspace/groups/:organizationId
 * Get Google Workspace groups
 */
router.get('/groups/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    logger.info('Fetching Google Workspace groups', { organizationId });

    const result = await googleWorkspaceService.getGroups(organizationId);

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to fetch groups', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch groups'
    });
  }
});

/**
 * POST /api/google-workspace/sync-groups
 * Sync groups from Google Workspace to database
 */
router.post('/sync-groups', requireAdmin, [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body;

    logger.info('Syncing Google Workspace groups', { organizationId });

    const result = await googleWorkspaceService.syncGroups(organizationId);

    res.json(result);
  } catch (error: any) {
    logger.error('Groups sync failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to sync groups'
    });
  }
});

/**
 * GET /api/google-workspace/groups/:groupId/members
 * Get members of a specific group
 */
router.get('/groups/:groupId/members', async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required'
      });
    }

    logger.info('Fetching group members', { groupId, organizationId });

    const result = await googleWorkspaceService.getGroupMembers(
      organizationId as string,
      groupId
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to fetch group members', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group members'
    });
  }
});

/**
 * POST /api/google-workspace/groups/:groupId/members
 * Add a member to a group
 */
router.post('/groups/:groupId/members', [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['MEMBER', 'MANAGER', 'OWNER']).withMessage('Invalid role')
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { organizationId, email, role } = req.body;

    logger.info('Adding member to group', { groupId, email, role });

    const result = await googleWorkspaceService.addGroupMember(
      organizationId,
      groupId,
      email,
      role || 'MEMBER'
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to add group member', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to add member to group'
    });
  }
});

/**
 * DELETE /api/google-workspace/groups/:groupId/members/:memberEmail
 * Remove a member from a group
 */
router.delete('/groups/:groupId/members/:memberEmail', async (req: Request, res: Response) => {
  try {
    const { groupId, memberEmail } = req.params;
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required'
      });
    }

    logger.info('Removing member from group', { groupId, memberEmail });

    const result = await googleWorkspaceService.removeGroupMember(
      organizationId as string,
      groupId,
      memberEmail
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to remove group member', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to remove member from group'
    });
  }
});

/**
 * POST /api/google-workspace/groups
 * Create a new group
 */
router.post('/groups', [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').notEmpty().withMessage('Group name is required'),
  body('description').optional().isString()
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { organizationId, email, name, description } = req.body;

    logger.info('Creating new group', { email, name });

    const result = await googleWorkspaceService.createGroup(
      organizationId,
      email,
      name,
      description || ''
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to create group', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create group'
    });
  }
});

/**
 * PATCH /api/google-workspace/groups/:groupId
 * Update group settings
 */
router.patch('/groups/:groupId', [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
  body('name').optional().isString(),
  body('description').optional().isString()
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const { organizationId, name, description } = req.body;

    logger.info('Updating group', { groupId, name, description });

    const result = await googleWorkspaceService.updateGroup(
      organizationId,
      groupId,
      { name, description }
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to update group', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update group'
    });
  }
});

/**
 * POST /api/google-workspace/disable/:organizationId
 * Disable Google Workspace module for an organization
 */
router.post('/disable/:organizationId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    logger.info('Disabling Google Workspace module', { organizationId });

    // Get Google Workspace module ID (canonical slug: underscore).
    const moduleResult = await db.query(
      `SELECT id FROM modules WHERE slug = 'google_workspace' LIMIT 1`
    );

    if (moduleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Google Workspace module not found'
      });
    }

    const moduleId = moduleResult.rows[0].id;

    // Disable the module for this organization
    await db.query(`
      UPDATE organization_modules
      SET is_enabled = false,
          updated_at = NOW()
      WHERE organization_id = $1 AND module_id = $2
    `, [organizationId, moduleId]);

    logger.info('Google Workspace module disabled', { organizationId });

    res.json({
      success: true,
      message: 'Google Workspace module has been disabled'
    });
  } catch (error: any) {
    logger.error('Failed to disable Google Workspace module', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to disable Google Workspace module'
    });
  }
});

/**
 * POST /api/google-workspace/enable
 * Re-enable the Google Workspace module for an organization that ALREADY has
 * valid stored credentials — without forcing a re-upload of the service-account
 * key. Backs the Settings "Enable" action when credentials already exist, so
 * enabling a previously-configured module never re-opens the full setup wizard.
 */
router.post('/enable', requireAdmin, [
  body('organizationId').notEmpty().withMessage('Organization ID is required'),
], validateRequest, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.body;

    const credResult = await db.query(
      'SELECT domain, admin_email, is_valid FROM gw_credentials WHERE organization_id = $1',
      [organizationId]
    );

    if (credResult.rows.length === 0) {
      // No stored credentials — the caller must run the full setup wizard.
      return res.status(400).json({
        success: false,
        error: 'No stored Google Workspace credentials. Run setup first.'
      });
    }

    const cred = credResult.rows[0];

    await googleWorkspaceService.markModuleEnabled(
      organizationId,
      { domain: cred.domain, adminEmail: cred.admin_email },
      'syncing'
    );

    logger.info('Google Workspace module enabled from stored credentials', { organizationId });

    // Refresh the directory in the background (best-effort, do not block).
    syncScheduler.manualSync(organizationId).catch((err) => {
      logger.error('Re-enable sync error', { organizationId, error: err.message });
    });

    return res.json({
      success: true,
      message: 'Google Workspace module enabled',
      syncTriggered: true
    });
  } catch (error: any) {
    logger.error('Failed to enable Google Workspace module', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to enable Google Workspace module'
    });
  }
});

/**
 * @openapi
 * /api/v1/google-workspace/users:
 *   post:
 *     summary: Create a user in Google Workspace
 *     description: |
 *       Creates a user in Google Workspace from an existing Helios user,
 *       or creates both a new Helios user and Google Workspace user.
 *     tags: [Google Workspace]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, firstName, lastName]
 *             properties:
 *               heliosUserId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of existing Helios user to link
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               jobTitle:
 *                 type: string
 *               department:
 *                 type: string
 *               orgUnitPath:
 *                 type: string
 *                 default: /
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/users', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const {
      heliosUserId,
      email,
      firstName,
      lastName,
      jobTitle,
      department,
      orgUnitPath,
      mobilePhone
    } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Email, first name, and last name are required'
      });
    }

    // Check if Google Workspace is enabled
    const gwStatus = await googleWorkspaceService.getSetupStatus(organizationId);
    if (!gwStatus.isConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Google Workspace integration is not enabled'
      });
    }

    // Generate a temporary password
    const crypto = await import('crypto');
    const tempPassword = crypto.randomBytes(16).toString('base64').slice(0, 16) + 'Aa1!';

    // Create the user in Google Workspace
    const gwResult = await googleWorkspaceService.createUser(organizationId, {
      email: email.toLowerCase(),
      firstName,
      lastName,
      password: tempPassword,
      orgUnitPath: orgUnitPath || '/',
      jobTitle: jobTitle || undefined,
      department: department || undefined,
      changePasswordAtNextLogin: true,
      phones: mobilePhone ? [{ type: 'mobile', value: mobilePhone }] : undefined
    });

    if (!gwResult.success) {
      return res.status(400).json({
        success: false,
        error: gwResult.error || 'Failed to create user in Google Workspace'
      });
    }

    // If a Helios user ID was provided, link the Google Workspace user
    if (heliosUserId && gwResult.userId) {
      await db.query(
        `UPDATE organization_users
         SET google_workspace_id = $1,
             google_workspace_sync_status = 'synced',
             google_workspace_last_sync = NOW()
         WHERE id = $2 AND organization_id = $3`,
        [gwResult.userId, heliosUserId, organizationId]
      );

      logger.info('Linked existing Helios user to Google Workspace', {
        heliosUserId,
        googleWorkspaceId: gwResult.userId,
        email
      });
    }

    res.status(201).json({
      success: true,
      message: 'User created in Google Workspace successfully',
      data: {
        googleWorkspaceId: gwResult.userId,
        email,
        firstName,
        lastName,
        linkedToHeliosUser: !!heliosUserId
      }
    });
  } catch (error: any) {
    logger.error('Failed to create Google Workspace user', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create user in Google Workspace'
    });
  }
});

// ============================================================
// GOOGLE WORKSPACE RESOURCES API (Buildings, Rooms, Equipment)
// ============================================================

/**
 * @openapi
 * /api/google-workspace/resources/buildings/{organizationId}:
 *   get:
 *     summary: List all buildings
 *     description: List all buildings configured in Google Workspace Admin Console.
 *     tags: [Google Workspace]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of buildings
 */
router.get('/resources/buildings/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    const result = await googleWorkspaceService.listBuildings(organizationId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: {
        buildings: result.buildings || []
      }
    });
  } catch (error: any) {
    logger.error('Failed to list buildings', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list buildings'
    });
  }
});

/**
 * @openapi
 * /api/google-workspace/resources/calendars/{organizationId}:
 *   get:
 *     summary: List calendar resources (rooms, equipment)
 *     description: List all calendar resources like meeting rooms and equipment.
 *     tags: [Google Workspace]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *         description: Filter by building ID
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *           enum: [room, equipment]
 *         description: Filter by resource type
 *     responses:
 *       200:
 *         description: List of calendar resources
 */
router.get('/resources/calendars/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { buildingId, resourceType } = req.query;

    const result = await googleWorkspaceService.listCalendarResources(organizationId, {
      buildingId: buildingId as string,
      resourceType: resourceType as string
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: {
        resources: result.resources || []
      }
    });
  } catch (error: any) {
    logger.error('Failed to list calendar resources', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list calendar resources'
    });
  }
});

/**
 * @openapi
 * /api/google-workspace/calendar/acl/{organizationId}/{calendarId}:
 *   get:
 *     summary: List calendar ACLs
 *     description: List access control entries for a calendar.
 *     tags: [Google Workspace]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: calendarId
 *         required: true
 *         schema:
 *           type: string
 *         description: Calendar ID or 'primary'
 *     responses:
 *       200:
 *         description: List of ACL entries
 */
router.get('/calendar/acl/:organizationId/:calendarId', async (req: Request, res: Response) => {
  try {
    const { organizationId, calendarId } = req.params;

    const result = await googleWorkspaceService.listCalendarAcl(organizationId, calendarId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: {
        acl: result.acl || []
      }
    });
  } catch (error: any) {
    logger.error('Failed to list calendar ACL', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list calendar ACL'
    });
  }
});

export default router;