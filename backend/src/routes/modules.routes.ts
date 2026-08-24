import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { db } from '../database/connection.js';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
import { googleWorkspaceSyncService } from '../services/google-workspace-sync.service.js';
import { logger } from '../utils/logger.js';
import { encodeServiceAccountKey, decodeServiceAccountKey } from '../services/gw-credentials.js';
import { REQUIRED_SCOPES } from '../config/google-scopes.js';

const router = Router();

// Service-account key encryption lives in ../services/gw-credentials.ts — the
// single owner of the gw_credentials.service_account_key format. This file
// previously defined its OWN aes-256-cbc encrypt/decrypt, which is exactly how
// the column ended up with two incompatible writers (audit 2026-07-23).

/**
 * @openapi
 * /modules:
 *   get:
 *     summary: List all modules
 *     description: Get all available modules and their enabled status for the organization.
 *     tags: [Modules]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of modules
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
 *                     $ref: '#/components/schemas/Module'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    // Get all modules from modules table
    // Note: module_type, is_core, requires_modules columns don't exist in current schema
    const modulesResult = await db.query(`
      SELECT
        m.id,
        m.slug as slug,
        m.name as name,
        m.description,
        m.version,
        m.icon,
        m.is_available,
        COALESCE(om.is_enabled, false) as is_enabled,
        om.config,
        om.created_at as enabled_at
      FROM modules m
      LEFT JOIN organization_modules om
        ON om.module_id = m.id
        AND om.organization_id = $1
      WHERE m.is_available = true
      ORDER BY m.name
    `, [organizationId]);

    // Get stats for enabled modules
    const modules = await Promise.all(modulesResult.rows.map(async (module: any) => {
      const stats: any = {};

      if (module.is_enabled && module.slug === 'google_workspace') {
        // Get Google Workspace stats
        const userCountResult = await db.query(
          'SELECT COUNT(*) as count FROM gw_synced_users WHERE organization_id = $1',
          [organizationId]
        );
        const groupCountResult = await db.query(
          'SELECT COUNT(*) as count FROM gw_groups WHERE organization_id = $1',
          [organizationId]
        );

        stats.users = parseInt(userCountResult.rows[0].count);
        stats.groups = parseInt(groupCountResult.rows[0].count);
      }

      return {
        id: module.id,
        name: module.name,
        slug: module.slug,
        description: module.description,
        version: module.version,
        icon: module.icon,
        isAvailable: module.is_available,
        isEnabled: module.is_enabled,
        config: module.config,
        enabledAt: module.enabled_at,
        stats
      };
    }));

    res.json({
      success: true,
      data: modules
    });
  } catch (error: any) {
    logger.error('Failed to get modules', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve modules'
    });
  }
});

/**
 * GET /api/modules/:id
 * Get a single module by ID
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { id } = req.params;

    // Get module from modules table
    const moduleResult = await db.query(`
      SELECT
        m.id,
        m.slug as slug,
        m.name as name,
        m.description,
        m.version,
        m.icon,
        m.is_available,
        COALESCE(om.is_enabled, false) as is_enabled,
        om.config,
        om.created_at as enabled_at
      FROM modules m
      LEFT JOIN organization_modules om
        ON om.module_id = m.id
        AND om.organization_id = $1
      WHERE m.id = $2
    `, [organizationId, id]);

    if (moduleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Module not found'
      });
    }

    const module = moduleResult.rows[0];

    // Get stats if enabled
    const stats: any = {};
    if (module.is_enabled && module.slug === 'google_workspace') {
      const userCountResult = await db.query(
        'SELECT COUNT(*) as count FROM gw_synced_users WHERE organization_id = $1',
        [organizationId]
      );
      const groupCountResult = await db.query(
        'SELECT COUNT(*) as count FROM gw_groups WHERE organization_id = $1',
        [organizationId]
      );

      stats.users = parseInt(userCountResult.rows[0].count);
      stats.groups = parseInt(groupCountResult.rows[0].count);
    }

    res.json({
      success: true,
      data: {
        id: module.id,
        name: module.name,
        slug: module.slug,
        description: module.description,
        version: module.version,
        icon: module.icon,
        isAvailable: module.is_available,
        isEnabled: module.is_enabled,
        config: module.config,
        enabledAt: module.enabled_at,
        stats
      }
    });
  } catch (error: any) {
    logger.error('Failed to get module', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve module'
    });
  }
});

/**
 * @openapi
 * /modules/{moduleSlug}/enable:
 *   post:
 *     summary: Enable a module
 *     description: Enable a module for the organization. Requires admin permission.
 *     tags: [Modules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: moduleSlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Module slug (e.g., google_workspace, microsoft_365)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               config:
 *                 type: object
 *                 description: Module-specific configuration
 *     responses:
 *       200:
 *         description: Module enabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *       400:
 *         description: Module already enabled
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/:moduleSlug/enable', requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { moduleSlug } = req.params;
    const { config } = req.body;

    // Get module from modules table
    const moduleResult = await db.query(`
      SELECT
        m.id,
        m.slug,
        m.name,
        COALESCE(om.is_enabled, false) as is_enabled
      FROM modules m
      LEFT JOIN organization_modules om
        ON om.module_id = m.id
        AND om.organization_id = $1
      WHERE m.slug = $2
    `, [organizationId, moduleSlug]);

    if (moduleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Module not found'
      });
    }

    const module = moduleResult.rows[0];

    if (module.is_enabled) {
      return res.status(400).json({
        success: false,
        error: 'Module is already enabled'
      });
    }

    // Enable module (dependencies check removed - columns don't exist in current schema)
    await db.query(`
      INSERT INTO organization_modules (
        organization_id, module_id, is_enabled, config
      )
      VALUES ($1, $2, true, $3)
      ON CONFLICT (organization_id, module_id)
      DO UPDATE SET
        is_enabled = true,
        config = EXCLUDED.config,
        updated_at = NOW()
    `, [organizationId, module.id, config ? JSON.stringify(config) : null]);

    logger.info('Module enabled', {
      organizationId,
      moduleKey: moduleSlug,
      userId,
      moduleName: module.name
    });

    res.json({
      success: true,
      message: `${module.name} enabled successfully`
    });
  } catch (error: any) {
    logger.error('Failed to enable module', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to enable module'
    });
  }
});

/**
 * @openapi
 * /modules/{moduleSlug}/disable:
 *   post:
 *     summary: Disable a module
 *     description: Disable a module for the organization. Requires admin permission.
 *     tags: [Modules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: moduleSlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Module slug
 *     responses:
 *       200:
 *         description: Module disabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *       400:
 *         description: Module already disabled
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/:moduleSlug/disable', requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { moduleSlug } = req.params;

    // Get module from modules table
    const moduleResult = await db.query(`
      SELECT
        m.id,
        m.slug,
        m.name,
        COALESCE(om.is_enabled, false) as is_enabled
      FROM modules m
      LEFT JOIN organization_modules om
        ON om.module_id = m.id
        AND om.organization_id = $1
      WHERE m.slug = $2
    `, [organizationId, moduleSlug]);

    if (moduleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Module not found'
      });
    }

    const module = moduleResult.rows[0];

    if (!module.is_enabled) {
      return res.status(400).json({
        success: false,
        error: 'Module is already disabled'
      });
    }

    // Disable module (dependency checks removed - columns don't exist in current schema)
    await db.query(`
      UPDATE organization_modules
      SET
        is_enabled = false,
        updated_at = NOW()
      WHERE organization_id = $1
        AND module_id = $2
    `, [organizationId, module.id]);

    logger.info('Module disabled', {
      organizationId,
      moduleKey: moduleSlug,
      userId,
      moduleName: module.name
    });

    res.json({
      success: true,
      message: `${module.name} disabled successfully`
    });
  } catch (error: any) {
    logger.error('Failed to disable module', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to disable module'
    });
  }
});

/**
 * POST /api/modules/google-workspace/test
 * Test Google Workspace connection with domain-wide delegation
 */
router.post('/google-workspace/test', requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { serviceAccount, adminEmail, domain } = req.body;

    if (!serviceAccount || !adminEmail || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Service account, admin email, and domain are required'
      });
    }

    // Validate service account structure
    const requiredFields = [
      'type', 'project_id', 'private_key_id', 'private_key',
      'client_email', 'client_id', 'auth_uri', 'token_uri'
    ];

    const missingFields = requiredFields.filter(field => !serviceAccount[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid service account. Missing fields: ${missingFields.join(', ')}`
      });
    }

    // Test the connection
    const testResult = await googleWorkspaceService.testConnectionWithDelegation(
      serviceAccount,
      adminEmail,
      domain
    );

    if (testResult.success) {
      res.json({
        success: true,
        message: 'Connection successful',
        details: testResult.details
      });
    } else {
      res.status(400).json({
        success: false,
        error: testResult.error || 'Connection test failed'
      });
    }
  } catch (error: any) {
    logger.error('Failed to test Google Workspace connection', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to test connection'
    });
  }
});

/**
 * POST /api/modules/google-workspace/configure
 * Configure Google Workspace with domain-wide delegation
 */
router.post('/google-workspace/configure', requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { serviceAccount, adminEmail, domain } = req.body;

    if (!serviceAccount || !adminEmail || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Service account, admin email, and domain are required'
      });
    }

    // Encrypt the service account key
    const encryptedKey = encodeServiceAccountKey(serviceAccount);

    // Store credentials
    await db.query(`
      INSERT INTO gw_credentials (
        organization_id,
        service_account_key,
        admin_email,
        domain,
        scopes,
        is_valid,
        last_validated_at,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW(), NOW())
      ON CONFLICT (organization_id)
      DO UPDATE SET
        service_account_key = $2,
        admin_email = $3,
        domain = $4,
        scopes = $5,
        is_valid = true,
        last_validated_at = NOW(),
        updated_at = NOW()
    `, [
      organizationId,
      encryptedKey,
      adminEmail,
      domain,
      // Record the exact scope set Helios requests via DWD. Sourced from the
      // canonical list (config/google-scopes.ts) rather than an inline copy —
      // this column previously hardcoded only 5 of the 17 scopes, drifting from
      // what the runtime clients actually mint JWTs for.
      REQUIRED_SCOPES
    ]);

    // Mark module as configured
    const moduleResult = await db.query(
      'SELECT id FROM modules WHERE slug = $1',
      ['google_workspace']
    );

    if (moduleResult.rows.length > 0) {
      await db.query(`
        UPDATE organization_modules
        SET is_configured = true,
            config = $3,
            updated_at = NOW()
        WHERE organization_id = $1 AND module_id = $2
      `, [
        organizationId,
        moduleResult.rows[0].id,
        JSON.stringify({
          domain,
          adminEmail,
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email
        })
      ]);
    }

    res.json({
      success: true,
      message: 'Google Workspace configured successfully'
    });
  } catch (error: any) {
    logger.error('Failed to configure Google Workspace', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to save configuration'
    });
  }
});

/**
 * POST /api/modules/google-workspace/sync
 * Trigger Google Workspace sync
 */
router.post('/google-workspace/sync', requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    // Get credentials
    const credResult = await db.query(
      'SELECT * FROM gw_credentials WHERE organization_id = $1',
      [organizationId]
    );

    if (credResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Google Workspace not configured'
      });
    }

    const credentials = credResult.rows[0];

    // Decrypt service account key
    const serviceAccount = decodeServiceAccountKey(credentials.service_account_key);

    // Update sync status
    await db.query(`
      UPDATE organization_modules om
      SET sync_status = 'syncing', sync_error = NULL, updated_at = NOW()
      FROM modules m
      WHERE om.module_id = m.id
        AND om.organization_id = $1
        AND m.slug = 'google_workspace'
    `, [organizationId]);

    // Perform sync
    const syncResult = await googleWorkspaceSyncService.performFullSync(
      organizationId,
      credentials.domain,
      credentials.admin_email,
      serviceAccount
    );

    // Update sync status with results
    const status = syncResult.success ? 'success' : 'error';
    const error = syncResult.error || null;

    await db.query(`
      UPDATE organization_modules om
      SET sync_status = $2,
          sync_error = $3,
          last_sync_at = NOW(),
          updated_at = NOW()
      FROM modules m
      WHERE om.module_id = m.id
        AND om.organization_id = $1
        AND m.slug = 'google_workspace'
    `, [organizationId, status, error]);

    res.json(syncResult);
  } catch (error: any) {
    logger.error('Failed to sync Google Workspace', { error: error.message });

    // Update sync status to error
    await db.query(`
      UPDATE organization_modules om
      SET sync_status = 'error',
          sync_error = $2,
          updated_at = NOW()
      FROM modules m
      WHERE om.module_id = m.id
        AND om.organization_id = $1
        AND m.slug = 'google_workspace'
    `, [req.user?.organizationId, error.message]);

    res.status(500).json({
      success: false,
      error: 'Sync failed',
      details: error.message
    });
  }
});

/**
 * GET /api/modules/google-workspace/users
 * Get synced Google Workspace users
 */
router.get('/google-workspace/users', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { limit = 100, offset = 0, search } = req.query;

    let query = `
      SELECT
        id,
        google_id,
        email,
        given_name,
        family_name,
        full_name,
        is_admin,
        is_suspended,
        org_unit_path,
        department,
        job_title,
        last_login_time,
        creation_time,
        last_sync_at
      FROM gw_synced_users
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (search) {
      query += ` AND (email ILIKE $${params.length + 1} OR full_name ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY full_name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rowCount
    });
  } catch (error: any) {
    logger.error('Failed to get Google Workspace users', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users'
    });
  }
});

export default router;