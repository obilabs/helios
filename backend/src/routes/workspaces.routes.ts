import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../database/connection.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Workspaces
 *     description: Organization workspace management
 */

// All routes require authentication
router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/organization/workspaces:
 *   get:
 *     summary: List workspaces
 *     description: List all workspaces for the organization.
 *     tags: [Workspaces]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of workspaces
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID not found',
      });
      return;
    }

    const result = await db.query(
      `SELECT
        id,
        name,
        description,
        email,
        platform,
        external_id,
        external_url,
        workspace_type,
        is_active,
        is_archived,
        created_at,
        synced_at,
        metadata
      FROM workspaces
      WHERE organization_id = $1 AND is_active = true
      ORDER BY name ASC`,
      [organizationId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    logger.error('Failed to list workspaces', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list workspaces',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/workspaces/{id}:
 *   get:
 *     summary: Get workspace details
 *     description: Get workspace details including members.
 *     tags: [Workspaces]
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
 *         description: Workspace details
 *       404:
 *         description: Workspace not found
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    // Get workspace
    const workspaceResult = await db.query(
      `SELECT * FROM workspaces WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (workspaceResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
      return;
    }

    // Get members
    const membersResult = await db.query(
      `SELECT
        wm.id,
        wm.role,
        wm.is_active,
        wm.joined_at,
        ou.id as user_id,
        ou.email,
        ou.first_name,
        ou.last_name
      FROM workspace_members wm
      JOIN organization_users ou ON ou.id = wm.user_id
      WHERE wm.workspace_id = $1 AND wm.is_active = true
      ORDER BY ou.first_name, ou.last_name`,
      [id]
    );

    res.json({
      success: true,
      data: {
        workspace: workspaceResult.rows[0],
        members: membersResult.rows,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get workspace', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get workspace',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/workspaces:
 *   post:
 *     summary: Create workspace
 *     description: Create a new manual workspace.
 *     tags: [Workspaces]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               workspaceType:
 *                 type: string
 *     responses:
 *       201:
 *         description: Workspace created
 *       400:
 *         description: Name required
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { name, description, workspaceType } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: 'Workspace name is required',
      });
      return;
    }

    const result = await db.query(
      `INSERT INTO workspaces (
        organization_id,
        name,
        description,
        platform,
        workspace_type,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [organizationId, name, description, 'manual', workspaceType || 'general', userId]
    );

    logger.info('Workspace created', {
      workspaceId: result.rows[0].id,
      name,
      organizationId,
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Workspace created successfully',
    });
  } catch (error: any) {
    logger.error('Failed to create workspace', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to create workspace',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/workspaces/{id}/members:
 *   post:
 *     summary: Add workspace member
 *     tags: [Workspaces]
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member added
 *       404:
 *         description: Workspace not found
 */
router.post('/:id/members', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const { userId, role } = req.body;

    // Verify workspace exists and belongs to org
    const workspaceCheck = await db.query(
      'SELECT id FROM workspaces WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (workspaceCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
      return;
    }

    // Add member
    await db.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = $3, is_active = true`,
      [id, userId, role || 'member']
    );

    res.json({
      success: true,
      message: 'Member added to workspace',
    });
  } catch (error: any) {
    logger.error('Failed to add workspace member', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to add member',
      message: error.message,
    });
  }
});

export default router;
