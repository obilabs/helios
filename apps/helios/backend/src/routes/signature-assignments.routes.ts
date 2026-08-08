/**
 * Signature Assignment Routes
 *
 * Routes for managing signature template assignments to users, groups, departments, etc.
 * Uses the signature_assignments table (migration 044).
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { signatureAssignmentService } from '../services/signature-assignment.service.js';
import { AssignmentType } from '../types/signatures.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Signature Assignments
 *     description: Signature template assignment management
 */

// =====================================================
// SIGNATURE ASSIGNMENTS CRUD
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/v2/assignments:
 *   get:
 *     summary: List signature assignments
 *     description: Get all signature assignments for the organization.
 *     tags: [Signature Assignments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: template_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: assignment_type
 *         schema:
 *           type: string
 *           enum: [user, group, dynamic_group, department, ou, organization]
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: include_details
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of assignments
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      template_id,
      assignment_type,
      is_active,
      include_details,
    } = req.query;

    const assignments = await signatureAssignmentService.getAssignments(
      organizationId,
      {
        templateId: template_id as string,
        assignmentType: assignment_type as AssignmentType,
        isActive: is_active === undefined ? undefined : is_active === 'true',
        includeDetails: include_details === 'true',
      }
    );

    return res.json({
      success: true,
      data: assignments,
    });
  } catch (error: any) {
    console.error('Error listing assignments:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list assignments',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/v2/assignments/{id}:
 *   get:
 *     summary: Get assignment by ID
 *     tags: [Signature Assignments]
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
 *         description: Assignment details
 *       404:
 *         description: Assignment not found
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const assignment = await signatureAssignmentService.getAssignment(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
      });
    }

    // Verify organization ownership
    if (assignment.organizationId !== req.user?.organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    return res.json({
      success: true,
      data: assignment,
    });
  } catch (error: any) {
    console.error('Error getting assignment:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get assignment',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/v2/assignments:
 *   post:
 *     summary: Create signature assignment
 *     tags: [Signature Assignments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - template_id
 *               - assignment_type
 *             properties:
 *               template_id:
 *                 type: string
 *               assignment_type:
 *                 type: string
 *                 enum: [user, group, dynamic_group, department, ou, organization]
 *               target_id:
 *                 type: string
 *               target_value:
 *                 type: string
 *               priority:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Assignment created
 *       400:
 *         description: Missing required fields
 */
router.post('/', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      template_id,
      assignment_type,
      target_id,
      target_value,
      priority,
      is_active,
    } = req.body;

    // Validate required fields
    if (!template_id || !assignment_type) {
      return res.status(400).json({
        success: false,
        error: 'template_id and assignment_type are required',
      });
    }

    // Validate assignment_type
    const validTypes: AssignmentType[] = ['user', 'group', 'dynamic_group', 'department', 'ou', 'organization'];
    if (!validTypes.includes(assignment_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid assignment_type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const assignment = await signatureAssignmentService.createAssignment(
      organizationId,
      {
        templateId: template_id,
        assignmentType: assignment_type,
        targetId: target_id,
        targetValue: target_value,
        priority,
        isActive: is_active,
      },
      userId
    );

    return res.status(201).json({
      success: true,
      message: 'Assignment created successfully',
      data: assignment,
    });
  } catch (error: any) {
    console.error('Error creating assignment:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create assignment',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/v2/assignments/{id}:
 *   put:
 *     summary: Update assignment
 *     tags: [Signature Assignments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priority:
 *                 type: integer
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Assignment updated
 *       404:
 *         description: Assignment not found
 */
router.put('/:id', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priority, is_active } = req.body;

    // Verify ownership before update
    const existing = await signatureAssignmentService.getAssignment(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
      });
    }

    if (existing.organizationId !== req.user?.organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const assignment = await signatureAssignmentService.updateAssignment(id, {
      priority,
      isActive: is_active,
    });

    return res.json({
      success: true,
      message: 'Assignment updated successfully',
      data: assignment,
    });
  } catch (error: any) {
    console.error('Error updating assignment:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update assignment',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/v2/assignments/{id}:
 *   delete:
 *     summary: Delete assignment
 *     tags: [Signature Assignments]
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
 *         description: Assignment deleted
 *       404:
 *         description: Assignment not found
 */
router.delete('/:id', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership before delete
    const existing = await signatureAssignmentService.getAssignment(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
      });
    }

    if (existing.organizationId !== req.user?.organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const deleted = await signatureAssignmentService.deleteAssignment(id);

    if (!deleted) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete assignment',
      });
    }

    return res.json({
      success: true,
      message: 'Assignment deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting assignment:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete assignment',
    });
  }
});

// =====================================================
// EFFECTIVE SIGNATURE RESOLUTION
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/v2/assignments/user/{userId}/effective:
 *   get:
 *     summary: Get effective signature for user
 *     description: Get the resolved signature assignment for a specific user.
 *     tags: [Signature Assignments]
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
 *         description: Effective signature
 */
router.get('/user/:userId/effective', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { userId } = req.params;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const effective = await signatureAssignmentService.getEffectiveSignature(userId);

    if (!effective) {
      return res.json({
        success: true,
        data: null,
        message: 'No signature assignment for this user',
      });
    }

    // Verify user is in the same organization
    if (effective.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    return res.json({
      success: true,
      data: effective,
    });
  } catch (error: any) {
    console.error('Error getting effective signature:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get effective signature',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/v2/assignments/effective/all:
 *   get:
 *     summary: Get all effective signatures
 *     description: Get effective signatures for all users in the organization.
 *     tags: [Signature Assignments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of effective signatures
 */
router.get('/effective/all', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const effectiveSignatures = await signatureAssignmentService.getAllEffectiveSignatures(
      organizationId
    );

    return res.json({
      success: true,
      data: effectiveSignatures,
    });
  } catch (error: any) {
    console.error('Error getting effective signatures:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get effective signatures',
    });
  }
});

// =====================================================
// ASSIGNMENT PREVIEW
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/v2/assignments/preview:
 *   post:
 *     summary: Preview assignment impact
 *     description: Preview which users would be affected by an assignment.
 *     tags: [Signature Assignments]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assignment_type
 *             properties:
 *               assignment_type:
 *                 type: string
 *               target_id:
 *                 type: string
 *               target_value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Affected users preview
 */
router.post('/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { assignment_type, target_id, target_value } = req.body;

    if (!assignment_type) {
      return res.status(400).json({
        success: false,
        error: 'assignment_type is required',
      });
    }

    const affectedUsers = await signatureAssignmentService.previewAffectedUsers(
      organizationId,
      assignment_type as AssignmentType,
      target_id,
      target_value
    );

    return res.json({
      success: true,
      data: {
        users: affectedUsers,
        count: affectedUsers.length,
      },
    });
  } catch (error: any) {
    console.error('Error previewing assignment:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to preview assignment',
    });
  }
});

// =====================================================
// AVAILABLE TARGETS
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/v2/assignments/targets/{type}:
 *   get:
 *     summary: Get targets by type
 *     description: Get available assignment targets for a specific type.
 *     tags: [Signature Assignments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, group, dynamic_group, department, ou, organization]
 *     responses:
 *       200:
 *         description: Available targets
 *       400:
 *         description: Invalid target type
 */
router.get('/targets/:type', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { type } = req.params;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const validTypes: AssignmentType[] = ['user', 'group', 'dynamic_group', 'department', 'ou', 'organization'];
    if (!validTypes.includes(type as AssignmentType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid target type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const targets = await signatureAssignmentService.getAvailableTargets(
      organizationId,
      type as AssignmentType
    );

    return res.json({
      success: true,
      data: targets,
    });
  } catch (error: any) {
    console.error('Error getting targets:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get targets',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/v2/assignments/targets:
 *   get:
 *     summary: Get all target types
 *     description: Get all available target types with counts.
 *     tags: [Signature Assignments]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Target types with counts
 */
router.get('/targets', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Get counts for each type
    const types: { type: AssignmentType; label: string; description: string }[] = [
      { type: 'user', label: 'Individual Users', description: 'Assign to specific users (highest priority)' },
      { type: 'dynamic_group', label: 'Dynamic Groups', description: 'Assign based on rule-based group membership' },
      { type: 'group', label: 'Static Groups', description: 'Assign to static access groups' },
      { type: 'department', label: 'Departments', description: 'Assign to all users in a department' },
      { type: 'ou', label: 'Organizational Units', description: 'Assign based on Google Workspace OU' },
      { type: 'organization', label: 'Organization Default', description: 'Apply to all users (lowest priority)' },
    ];

    const result = await Promise.all(
      types.map(async (t) => {
        const targets = await signatureAssignmentService.getAvailableTargets(organizationId, t.type);
        return {
          ...t,
          availableTargets: targets.length,
        };
      })
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error getting target types:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get target types',
    });
  }
});

export default router;
