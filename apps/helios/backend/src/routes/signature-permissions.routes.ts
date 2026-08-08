/**
 * Signature Permissions Routes
 *
 * API endpoints for managing signature permission levels.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requireSignatureAdmin } from '../middleware/signature-auth.js';
import { signaturePermissionsService } from '../services/signature-permissions.service.js';
import { PermissionLevel, PERMISSION_CAPABILITIES } from '../types/signatures.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Signature Permissions
 *     description: Signature feature permission management
 */

// All routes require authentication
router.use(requireAuth);

// =====================================================
// PERMISSION INFO (Public to authenticated users)
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/permissions/me:
 *   get:
 *     summary: Get my permissions
 *     description: Get current user's signature permission level.
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User permissions
 *       404:
 *         description: User not found
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const permission = await signaturePermissionsService.getUserPermission(
      req.user!.userId,
      req.user!.organizationId
    );

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    return res.json({
      success: true,
      data: {
        effectivePermission: permission.effectivePermission,
        explicitPermission: permission.explicitPermission,
        isOrgAdmin: permission.isOrgAdmin,
        capabilities: PERMISSION_CAPABILITIES[permission.effectivePermission],
      },
    });
  } catch (error: any) {
    logger.error('Error getting user permission', {
      userId: req.user?.userId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get permission',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/permissions/levels:
 *   get:
 *     summary: Get permission levels
 *     description: Get available permission levels and their capabilities.
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Permission levels
 */
router.get('/levels', async (req: Request, res: Response) => {
  try {
    const levels = [
      {
        level: 'admin',
        displayName: 'Administrator',
        description: 'Full control over all signature features',
        capabilities: PERMISSION_CAPABILITIES.admin,
      },
      {
        level: 'designer',
        displayName: 'Designer',
        description: 'Create and edit templates, preview signatures',
        capabilities: PERMISSION_CAPABILITIES.designer,
      },
      {
        level: 'campaign_manager',
        displayName: 'Campaign Manager',
        description: 'Manage campaigns, assignments, and view analytics',
        capabilities: PERMISSION_CAPABILITIES.campaign_manager,
      },
      {
        level: 'helpdesk',
        displayName: 'Helpdesk',
        description: 'View status and re-sync individual users',
        capabilities: PERMISSION_CAPABILITIES.helpdesk,
      },
      {
        level: 'viewer',
        displayName: 'Viewer',
        description: 'View-only access to templates and campaigns',
        capabilities: PERMISSION_CAPABILITIES.viewer,
      },
    ];

    return res.json({
      success: true,
      data: levels,
    });
  } catch (error: any) {
    logger.error('Error getting permission levels', { error: error.message });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get permission levels',
    });
  }
});

// =====================================================
// PERMISSION MANAGEMENT (Admin only)
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/permissions:
 *   get:
 *     summary: List all permissions
 *     description: Get all users with their signature permissions (admin only).
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: permissionLevel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User permissions list
 */
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { includeInactive, permissionLevel } = req.query;

    const permissions = await signaturePermissionsService.getOrganizationPermissions(
      req.user!.organizationId,
      {
        includeInactive: includeInactive === 'true',
        permissionLevel: permissionLevel as PermissionLevel | undefined,
      }
    );

    return res.json({
      success: true,
      data: permissions,
    });
  } catch (error: any) {
    logger.error('Error getting organization permissions', {
      organizationId: req.user?.organizationId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get permissions',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/permissions/stats:
 *   get:
 *     summary: Get permission statistics
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Permission statistics
 */
router.get('/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await signaturePermissionsService.getPermissionStats(
      req.user!.organizationId
    );

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Error getting permission stats', {
      organizationId: req.user?.organizationId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get permission stats',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/permissions/users/{userId}:
 *   get:
 *     summary: Get user permission
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User permission
 *       404:
 *         description: User not found
 */
router.get('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const permission = await signaturePermissionsService.getUserPermission(
      userId,
      req.user!.organizationId
    );

    if (!permission) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    return res.json({
      success: true,
      data: permission,
    });
  } catch (error: any) {
    logger.error('Error getting user permission', {
      userId: req.params.userId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user permission',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/permissions:
 *   post:
 *     summary: Grant permission
 *     description: Grant or update permission for a user.
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - permissionLevel
 *             properties:
 *               userId:
 *                 type: string
 *               permissionLevel:
 *                 type: string
 *                 enum: [admin, designer, campaign_manager, helpdesk, viewer]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Permission granted
 *       400:
 *         description: Invalid request
 */
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, permissionLevel, expiresAt, notes } = req.body;

    if (!userId || !permissionLevel) {
      return res.status(400).json({
        success: false,
        error: 'userId and permissionLevel are required',
      });
    }

    const validLevels: PermissionLevel[] = [
      'admin', 'designer', 'campaign_manager', 'helpdesk', 'viewer'
    ];
    if (!validLevels.includes(permissionLevel)) {
      return res.status(400).json({
        success: false,
        error: `Invalid permission level. Valid levels: ${validLevels.join(', ')}`,
      });
    }

    const permission = await signaturePermissionsService.grantPermission(
      req.user!.organizationId,
      {
        userId,
        permissionLevel,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes,
      },
      req.user!.userId
    );

    return res.json({
      success: true,
      data: permission,
      message: `Permission granted: ${permissionLevel}`,
    });
  } catch (error: any) {
    logger.error('Error granting permission', {
      userId: req.body.userId,
      error: error.message,
    });

    if (error.message === 'User not found in organization') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to grant permission',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/permissions/users/{userId}:
 *   put:
 *     summary: Update user permission
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               - permissionLevel
 *             properties:
 *               permissionLevel:
 *                 type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Permission updated
 *       404:
 *         description: User not found
 */
router.put('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { permissionLevel, expiresAt, notes } = req.body;

    if (!permissionLevel) {
      return res.status(400).json({
        success: false,
        error: 'permissionLevel is required',
      });
    }

    const validLevels: PermissionLevel[] = [
      'admin', 'designer', 'campaign_manager', 'helpdesk', 'viewer'
    ];
    if (!validLevels.includes(permissionLevel)) {
      return res.status(400).json({
        success: false,
        error: `Invalid permission level. Valid levels: ${validLevels.join(', ')}`,
      });
    }

    const permission = await signaturePermissionsService.grantPermission(
      req.user!.organizationId,
      {
        userId,
        permissionLevel,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes,
      },
      req.user!.userId
    );

    return res.json({
      success: true,
      data: permission,
      message: `Permission updated: ${permissionLevel}`,
    });
  } catch (error: any) {
    logger.error('Error updating permission', {
      userId: req.params.userId,
      error: error.message,
    });

    if (error.message === 'User not found in organization') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update permission',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/permissions/users/{userId}:
 *   delete:
 *     summary: Revoke permission
 *     description: Revoke user's explicit permission (falls back to viewer).
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Permission revoked
 *       404:
 *         description: No permission to revoke
 */
router.delete('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const revoked = await signaturePermissionsService.revokePermission(
      req.user!.organizationId,
      userId
    );

    if (!revoked) {
      return res.status(404).json({
        success: false,
        error: 'No permission found to revoke',
      });
    }

    return res.json({
      success: true,
      message: 'Permission revoked. User now has viewer access.',
    });
  } catch (error: any) {
    logger.error('Error revoking permission', {
      userId: req.params.userId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to revoke permission',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/permissions/bulk:
 *   post:
 *     summary: Bulk grant permissions
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permissions
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Bulk operation result
 *       400:
 *         description: Invalid request
 */
router.post('/bulk', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { permissions } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'permissions array is required',
      });
    }

    const result = await signaturePermissionsService.bulkGrantPermissions(
      req.user!.organizationId,
      permissions,
      req.user!.userId
    );

    return res.json({
      success: true,
      data: result,
      message: `Granted ${result.granted} permissions, ${result.failed.length} failed`,
    });
  } catch (error: any) {
    logger.error('Error bulk granting permissions', { error: error.message });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to bulk grant permissions',
    });
  }
});

// =====================================================
// AUDIT LOG
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/permissions/audit:
 *   get:
 *     summary: Get audit log
 *     description: Get permission change audit log.
 *     tags: [Signature Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Audit log entries
 */
router.get('/audit', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, limit, offset } = req.query;

    const result = await signaturePermissionsService.getAuditLog(
      req.user!.organizationId,
      {
        userId: userId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      }
    );

    return res.json({
      success: true,
      data: result.entries,
      total: result.total,
    });
  } catch (error: any) {
    logger.error('Error getting audit log', {
      organizationId: req.user?.organizationId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get audit log',
    });
  }
});

export default router;
