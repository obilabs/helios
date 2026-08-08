import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../database/connection.js';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
import { activityTracker } from '../services/activity-tracker.service.js';
import { dynamicGroupService, DynamicGroupField, DynamicGroupOperator, RuleLogic } from '../services/dynamic-group.service.js';
import {
  successResponse,
  createdResponse,
  errorResponse,
  notFoundResponse,
  validationErrorResponse
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @openapi
 * /organization/access-groups:
 *   get:
 *     summary: List all access groups
 *     description: |
 *       Get all access groups for the organization including member counts.
 *       Groups can be static (manual membership) or dynamic (rule-based).
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of access groups
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
 *                     $ref: '#/components/schemas/Group'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID not found');
      return;
    }

    const result = await db.query(
      `SELECT
        ag.id,
        ag.name,
        ag.description,
        ag.email,
        ag.platform,
        ag.group_type,
        ag.external_id,
        ag.external_url,
        ag.is_active,
        ag.created_at,
        ag.synced_at,
        ag.metadata,
        COUNT(DISTINCT agm.user_id) as member_count
      FROM access_groups ag
      LEFT JOIN access_group_members agm ON ag.id = agm.access_group_id
      WHERE ag.organization_id = $1 AND ag.is_active = true
      GROUP BY ag.id
      ORDER BY ag.name ASC`,
      [organizationId]
    );

    successResponse(res, result.rows);
  } catch (error: any) {
    logger.error('Failed to list access groups', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list access groups');
  }
});

/**
 * @openapi
 * /organization/access-groups/{id}:
 *   get:
 *     summary: Get access group details
 *     description: |
 *       Get detailed information about a specific access group including its members.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Access group ID
 *     responses:
 *       200:
 *         description: Group details with members
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
 *                     group:
 *                       $ref: '#/components/schemas/Group'
 *                     members:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           user_id:
 *                             type: string
 *                             format: uuid
 *                           email:
 *                             type: string
 *                             format: email
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                           member_type:
 *                             type: string
 *                             enum: [member, owner, manager]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    // Get group
    const groupResult = await db.query(
      `SELECT * FROM access_groups WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (groupResult.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    // Get members
    const membersResult = await db.query(
      `SELECT
        agm.id,
        agm.member_type,
        agm.is_active,
        agm.joined_at,
        ou.id as user_id,
        ou.email,
        ou.first_name,
        ou.last_name
      FROM access_group_members agm
      JOIN organization_users ou ON ou.id = agm.user_id
      WHERE agm.access_group_id = $1 AND agm.is_active = true
      ORDER BY ou.first_name, ou.last_name`,
      [id]
    );

    successResponse(res, {
      group: groupResult.rows[0],
      members: membersResult.rows,
    });
  } catch (error: any) {
    logger.error('Failed to get access group', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get access group');
  }
});

/**
 * @openapi
 * /organization/access-groups/{id}:
 *   put:
 *     summary: Update an access group
 *     description: Update the name, description, or email of an access group.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Access group ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Group name
 *               description:
 *                 type: string
 *                 description: Group description
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Group email address
 *     responses:
 *       200:
 *         description: Group updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Group'
 *                 message:
 *                   type: string
 *                   example: Access group updated successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { name, description, email } = req.body;

    // Verify group exists and belongs to org
    const existing = await db.query(
      'SELECT * FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (existing.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    const oldGroup = existing.rows[0];

    // Update the group
    const result = await db.query(
      `UPDATE access_groups SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        email = COALESCE($3, email),
        updated_at = NOW()
      WHERE id = $4 AND organization_id = $5
      RETURNING *`,
      [name, description, email, id, organizationId]
    );

    // Track the activity
    const changes: any = {};
    if (name && name !== oldGroup.name) changes.name = { from: oldGroup.name, to: name };
    if (description !== undefined && description !== oldGroup.description) {
      changes.description = { from: oldGroup.description, to: description };
    }
    if (email !== undefined && email !== oldGroup.email) {
      changes.email = { from: oldGroup.email, to: email };
    }

    if (Object.keys(changes).length > 0) {
      await activityTracker.trackGroupChange(
        organizationId,
        id,
        userId!,
        req.user?.email!,
        'updated',
        {
          groupName: result.rows[0].name,
          changes
        }
      );
    }

    logger.info('Access group updated', {
      groupId: id,
      organizationId,
      changes
    });

    successResponse(res, { ...result.rows[0], message: 'Access group updated successfully' });
  } catch (error: any) {
    logger.error('Failed to update access group', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update access group');
  }
});

/**
 * @openapi
 * /organization/access-groups/{id}:
 *   delete:
 *     summary: Delete an access group
 *     description: Soft-delete an access group by setting is_active to false.
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Access group ID
 *     responses:
 *       200:
 *         description: Group deleted successfully
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
 *                   example: Access group deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    // Verify group exists and belongs to org
    const existing = await db.query(
      'SELECT * FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (existing.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    const group = existing.rows[0];

    // Soft delete by setting is_active = false
    await db.query(
      `UPDATE access_groups SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    // Track the activity
    await activityTracker.trackGroupChange(
      organizationId,
      id,
      userId!,
      req.user?.email!,
      'deleted',
      {
        groupName: group.name
      }
    );

    logger.info('Access group deleted', {
      groupId: id,
      groupName: group.name,
      organizationId
    });

    successResponse(res, { message: 'Access group deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete access group', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to delete access group');
  }
});

/**
 * @openapi
 * /organization/access-groups:
 *   post:
 *     summary: Create an access group
 *     description: Create a new manual access group (not synced from external platform).
 *     tags: [Groups]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Group name
 *                 example: Sales Team
 *               description:
 *                 type: string
 *                 description: Group description
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Group email address
 *     responses:
 *       201:
 *         description: Group created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Group'
 *                 message:
 *                   type: string
 *                   example: Access group created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { name, description, email } = req.body;

    if (!name) {
      validationErrorResponse(res, [{ field: 'name', message: 'Group name is required' }]);
      return;
    }

    const result = await db.query(
      `INSERT INTO access_groups (
        organization_id,
        name,
        description,
        email,
        platform,
        group_type,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [organizationId, name, description, email, 'manual', 'manual', userId]
    );

    // Track the activity
    await activityTracker.trackGroupChange(
      organizationId,
      result.rows[0].id,
      userId!,
      req.user?.email!,
      'created',
      {
        groupName: name,
        description: description || null,
        email: email || null
      }
    );

    logger.info('Access group created', {
      groupId: result.rows[0].id,
      name,
      organizationId,
    });

    createdResponse(res, { ...result.rows[0], message: 'Access group created successfully' });
  } catch (error: any) {
    logger.error('Failed to create access group', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to create access group');
  }
});

/**
 * POST /api/organization/access-groups/:id/members
 * Add a member to an access group
 */
router.post('/:id/members', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const { userId, memberType } = req.body;

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    // Add member
    await db.query(
      `INSERT INTO access_group_members (access_group_id, user_id, member_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (access_group_id, user_id) DO UPDATE SET member_type = $3, is_active = true`,
      [id, userId, memberType || 'member']
    );

    // Sync to Google Workspace if this is a Google group
    const groupResult = await db.query(
      'SELECT name, external_id, platform FROM access_groups WHERE id = $1',
      [id]
    );

    const userResult = await db.query(
      'SELECT email, first_name, last_name FROM organization_users WHERE id = $1',
      [userId]
    );

    // Track the activity
    const actorId = req.user?.userId!;
    const actorEmail = req.user?.email!;

    if (userResult.rows[0] && groupResult.rows[0]) {
      await activityTracker.trackGroupChange(
        organizationId,
        id,
        actorId,
        actorEmail,
        'member_added',
        {
          memberEmail: userResult.rows[0].email,
          memberName: `${userResult.rows[0].first_name} ${userResult.rows[0].last_name}`,
          groupName: groupResult.rows[0].name
        }
      );
    }

    if (groupResult.rows[0]?.platform === 'google_workspace' &&
        groupResult.rows[0]?.external_id &&
        userResult.rows[0]?.email) {

      const syncResult = await googleWorkspaceService.addUserToGroup(
        organizationId,
        userResult.rows[0].email,
        groupResult.rows[0].external_id
      );

      if (!syncResult.success) {
        logger.warn('Failed to sync group membership to Google Workspace', {
          userId,
          groupId: id,
          error: syncResult.error
        });
      } else {
        logger.info('Group membership synced to Google Workspace', {
          userId,
          groupId: id
        });
      }
    }

    successResponse(res, { message: 'Member added to access group' });
  } catch (error: any) {
    logger.error('Failed to add access group member', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to add member');
  }
});

/**
 * DELETE /api/organization/access-groups/:id/members/:userId
 * Remove a member from an access group
 */
router.delete('/:id/members/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, userId } = req.params;
    const organizationId = req.user?.organizationId;

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    // Remove member (soft delete by setting is_active = false)
    await db.query(
      `UPDATE access_group_members
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE access_group_id = $1 AND user_id = $2`,
      [id, userId]
    );

    // Get group and user info for activity tracking and sync
    const groupResult = await db.query(
      'SELECT name, external_id, platform FROM access_groups WHERE id = $1',
      [id]
    );

    const userResult = await db.query(
      'SELECT email, first_name, last_name FROM organization_users WHERE id = $1',
      [userId]
    );

    // Track the activity
    if (userResult.rows[0] && groupResult.rows[0]) {
      await activityTracker.trackGroupChange(
        organizationId!,
        id,
        req.user?.userId!,
        req.user?.email!,
        'member_removed',
        {
          memberEmail: userResult.rows[0].email,
          memberName: `${userResult.rows[0].first_name} ${userResult.rows[0].last_name}`,
          groupName: groupResult.rows[0].name
        }
      );
    }

    if (groupResult.rows[0]?.platform === 'google_workspace' &&
        groupResult.rows[0]?.external_id &&
        userResult.rows[0]?.email) {

      const syncResult = await googleWorkspaceService.removeUserFromGroup(
        organizationId,
        userResult.rows[0].email,
        groupResult.rows[0].external_id
      );

      if (!syncResult.success) {
        logger.warn('Failed to sync group removal to Google Workspace', {
          userId,
          groupId: id,
          error: syncResult.error
        });
      } else {
        logger.info('Group removal synced to Google Workspace', {
          userId,
          groupId: id
        });
      }
    }

    successResponse(res, { message: 'Member removed from access group' });
  } catch (error: any) {
    logger.error('Failed to remove access group member', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to remove member');
  }
});

// =====================================================
// DYNAMIC GROUP RULES ENDPOINTS
// =====================================================

/**
 * GET /api/organization/access-groups/:id/rules
 * Get all rules for a dynamic group
 */
router.get('/:id/rules', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id, membership_type, rule_logic FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    const rules = await dynamicGroupService.getRules(id);

    successResponse(res, {
      rules,
      groupConfig: {
        membershipType: groupCheck.rows[0].membership_type,
        ruleLogic: groupCheck.rows[0].rule_logic
      }
    });
  } catch (error: any) {
    logger.error('Failed to get group rules', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get group rules');
  }
});

/**
 * POST /api/organization/access-groups/:id/rules
 * Add a rule to a dynamic group
 */
router.post('/:id/rules', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { field, operator, value, caseSensitive, includeNested } = req.body;

    // Validate required fields
    if (!field || !operator || value === undefined) {
      validationErrorResponse(res, [
        { field: 'field', message: 'Field is required' },
        { field: 'operator', message: 'Operator is required' },
        { field: 'value', message: 'Value is required' }
      ]);
      return;
    }

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id, name FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    const rule = await dynamicGroupService.addRule(
      id,
      {
        field: field as DynamicGroupField,
        operator: operator as DynamicGroupOperator,
        value,
        caseSensitive,
        includeNested
      },
      userId
    );

    // Track activity
    await activityTracker.trackGroupChange(
      organizationId,
      id,
      userId!,
      req.user?.email!,
      'rule_added',
      {
        groupName: groupCheck.rows[0].name,
        ruleId: rule.id,
        field,
        operator
      }
    );

    createdResponse(res, { ...rule, message: 'Rule added successfully' });
  } catch (error: any) {
    logger.error('Failed to add group rule', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to add rule');
  }
});

/**
 * PUT /api/organization/access-groups/:id/rules/:ruleId
 * Update a rule
 */
router.put('/:id/rules/:ruleId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, ruleId } = req.params;
    const organizationId = req.user?.organizationId;
    const { field, operator, value, caseSensitive, includeNested, sortOrder } = req.body;

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    // Verify rule belongs to this group
    const ruleCheck = await db.query(
      'SELECT id FROM dynamic_group_rules WHERE id = $1 AND access_group_id = $2',
      [ruleId, id]
    );

    if (ruleCheck.rows.length === 0) {
      notFoundResponse(res, 'Rule');
      return;
    }

    const updatedRule = await dynamicGroupService.updateRule(ruleId, {
      field,
      operator,
      value,
      caseSensitive,
      includeNested,
      sortOrder
    });

    successResponse(res, { ...updatedRule, message: 'Rule updated successfully' });
  } catch (error: any) {
    logger.error('Failed to update group rule', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update rule');
  }
});

/**
 * DELETE /api/organization/access-groups/:id/rules/:ruleId
 * Delete a rule
 */
router.delete('/:id/rules/:ruleId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, ruleId } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id, name FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    const deleted = await dynamicGroupService.deleteRule(ruleId);

    if (!deleted) {
      notFoundResponse(res, 'Rule');
      return;
    }

    // Track activity
    await activityTracker.trackGroupChange(
      organizationId,
      id,
      userId!,
      req.user?.email!,
      'rule_deleted',
      {
        groupName: groupCheck.rows[0].name,
        ruleId
      }
    );

    successResponse(res, { message: 'Rule deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete group rule', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to delete rule');
  }
});

/**
 * POST /api/organization/access-groups/:id/evaluate
 * Evaluate rules and return matching users (preview)
 */
router.post('/:id/evaluate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const { returnUsers, limit } = req.body;

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    const result = await dynamicGroupService.evaluateRules(id, {
      returnUsers: returnUsers ?? true,
      limit: limit ?? 50
    });

    successResponse(res, result);
  } catch (error: any) {
    logger.error('Failed to evaluate group rules', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to evaluate rules');
  }
});

/**
 * POST /api/organization/access-groups/:id/apply-rules
 * Apply rules and update group membership
 */
router.post('/:id/apply-rules', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id, name, membership_type FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    if (groupCheck.rows[0].membership_type !== 'dynamic') {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, 'This is not a dynamic group. Change membership type to dynamic first.');
      return;
    }

    const result = await dynamicGroupService.applyRules(id, userId);

    // Track activity
    await activityTracker.trackGroupChange(
      organizationId,
      id,
      userId!,
      req.user?.email!,
      'rules_applied',
      {
        groupName: groupCheck.rows[0].name,
        added: result.added,
        removed: result.removed,
        unchanged: result.unchanged
      }
    );

    successResponse(res, {
      ...result,
      message: `Rules applied: ${result.added} added, ${result.removed} removed, ${result.unchanged} unchanged`
    });
  } catch (error: any) {
    logger.error('Failed to apply group rules', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to apply rules');
  }
});

/**
 * PUT /api/organization/access-groups/:id/membership-type
 * Update group membership type (static/dynamic)
 */
router.put('/:id/membership-type', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { membershipType, ruleLogic, refreshInterval } = req.body;

    if (!membershipType || !['static', 'dynamic'].includes(membershipType)) {
      validationErrorResponse(res, [{ field: 'membershipType', message: 'Must be "static" or "dynamic"' }]);
      return;
    }

    // Verify group exists and belongs to org
    const groupCheck = await db.query(
      'SELECT id, name, membership_type FROM access_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (groupCheck.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    await dynamicGroupService.setMembershipType(id, membershipType, {
      ruleLogic: ruleLogic as RuleLogic,
      refreshInterval
    });

    // Track activity
    await activityTracker.trackGroupChange(
      organizationId,
      id,
      userId!,
      req.user?.email!,
      'membership_type_changed',
      {
        groupName: groupCheck.rows[0].name,
        from: groupCheck.rows[0].membership_type,
        to: membershipType
      }
    );

    successResponse(res, { message: `Group membership type changed to ${membershipType}` });
  } catch (error: any) {
    logger.error('Failed to update membership type', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update membership type');
  }
});

// =====================================================
// GROUP SYNC ENDPOINTS
// =====================================================

/**
 * POST /api/organization/access-groups/:id/sync/google
 * Sync group members to Google Workspace
 */
router.post('/:id/sync/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { direction = 'push' } = req.body;

    if (!organizationId) {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID not found');
      return;
    }

    // Verify group exists and is a Google Workspace group
    const groupResult = await db.query(
      `SELECT
        ag.id, ag.name, ag.platform, ag.external_id,
        ag.synced_at
      FROM access_groups ag
      WHERE ag.id = $1 AND ag.organization_id = $2`,
      [id, organizationId]
    );

    if (groupResult.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    const group = groupResult.rows[0];

    if (group.platform !== 'google_workspace') {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, 'This group is not a Google Workspace group');
      return;
    }

    if (!group.external_id) {
      errorResponse(res, ErrorCode.VALIDATION_ERROR, 'This group does not have a Google Workspace ID');
      return;
    }

    // Get current Helios members
    const membersResult = await db.query(
      `SELECT ou.email
       FROM access_group_members agm
       JOIN organization_users ou ON agm.user_id = ou.id
       WHERE agm.access_group_id = $1 AND agm.is_active = true`,
      [id]
    );

    const heliosMembers = membersResult.rows.map((row: any) => row.email);

    // Perform sync
    const syncResult = await googleWorkspaceService.syncGroupMembers(
      organizationId,
      id,
      group.external_id,
      heliosMembers,
      direction
    );

    // Update synced_at timestamp
    await db.query(
      'UPDATE access_groups SET synced_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );

    // Track activity
    await activityTracker.trackGroupChange(
      organizationId,
      id,
      userId!,
      req.user?.email!,
      'synced_to_google',
      {
        groupName: group.name,
        direction,
        added: syncResult.added,
        removed: syncResult.removed,
        errors: syncResult.errors.length
      }
    );

    successResponse(res, {
      added: syncResult.added,
      removed: syncResult.removed,
      errors: syncResult.errors,
      details: syncResult.details,
      message: syncResult.success
        ? `Sync completed: ${syncResult.added} added, ${syncResult.removed} removed`
        : `Sync completed with errors: ${syncResult.errors.length} failures`
    });
  } catch (error: any) {
    logger.error('Failed to sync group to Google Workspace', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to sync group');
  }
});

/**
 * GET /api/organization/access-groups/:id/sync/status
 * Get sync status for a group
 */
router.get('/:id/sync/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    // Get group with sync info
    const groupResult = await db.query(
      `SELECT
        ag.id, ag.name, ag.platform, ag.external_id,
        ag.synced_at, ag.created_at, ag.updated_at
      FROM access_groups ag
      WHERE ag.id = $1 AND ag.organization_id = $2`,
      [id, organizationId]
    );

    if (groupResult.rows.length === 0) {
      notFoundResponse(res, 'Access group');
      return;
    }

    const group = groupResult.rows[0];

    // Get member counts
    const memberCountResult = await db.query(
      'SELECT COUNT(*) as count FROM access_group_members WHERE access_group_id = $1 AND is_active = true',
      [id]
    );

    // If Google Workspace group, get Google member count
    let googleMemberCount = null;
    if (group.platform === 'google_workspace' && group.external_id) {
      const gwResult = await googleWorkspaceService.getGroupMemberEmails(organizationId!, group.external_id);
      if (gwResult.success && gwResult.members) {
        googleMemberCount = gwResult.members.length;
      }
    }

    successResponse(res, {
      groupId: group.id,
      name: group.name,
      platform: group.platform,
      externalId: group.external_id,
      lastSynced: group.synced_at,
      heliosMemberCount: parseInt(memberCountResult.rows[0].count),
      googleMemberCount,
      syncAvailable: group.platform === 'google_workspace' && !!group.external_id
    });
  } catch (error: any) {
    logger.error('Failed to get sync status', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get sync status');
  }
});

export default router;
