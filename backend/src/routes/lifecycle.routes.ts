/**
 * Lifecycle Routes
 *
 * API endpoints for user lifecycle management:
 * - Onboarding templates
 * - Offboarding templates
 * - Scheduled actions
 * - Lifecycle logs
 */

import { Router, Request, Response } from 'express';
import { userOnboardingService } from '../services/user-onboarding.service.js';
import { userOffboardingService } from '../services/user-offboarding.service.js';
import { scheduledActionService } from '../services/scheduled-action.service.js';
import { lifecycleLogService } from '../services/lifecycle-log.service.js';
import { lifecycleRequestService, RequestStatus, RequestType } from '../services/lifecycle-request.service.js';
import { lifecycleTaskService, TaskStatus, AssigneeType } from '../services/lifecycle-task.service.js';
import { timelineGeneratorService } from '../services/timeline-generator.service.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Lifecycle
 *     description: User lifecycle management (onboarding, offboarding, scheduled actions)
 */

// All routes require authentication
router.use(authenticateToken);

// ==========================================
// ONBOARDING TEMPLATES
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/onboarding-templates:
 *   get:
 *     summary: List onboarding templates
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Onboarding templates
 */
router.get('/onboarding-templates', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { isActive, departmentId } = req.query;

    const templates = await userOnboardingService.getTemplates(organizationId, {
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      departmentId: departmentId as string | undefined,
    });

    res.json({ success: true, data: templates });
  } catch (error: any) {
    logger.error('Error listing onboarding templates', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/onboarding-templates/{id}:
 *   get:
 *     summary: Get onboarding template
 *     tags: [Lifecycle]
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
 *         description: Template details
 *       404:
 *         description: Template not found
 */
router.get('/onboarding-templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await userOnboardingService.getTemplate(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error: any) {
    logger.error('Error getting onboarding template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/onboarding-templates:
 *   post:
 *     summary: Create onboarding template
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Template created
 */
router.post('/onboarding-templates', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const template = await userOnboardingService.createTemplate(
      organizationId,
      req.body,
      req.user?.userId
    );

    res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    logger.error('Error creating onboarding template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/onboarding-templates/{id}:
 *   put:
 *     summary: Update onboarding template
 *     tags: [Lifecycle]
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
 *         description: Template updated
 *       404:
 *         description: Template not found
 */
router.put('/onboarding-templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await userOnboardingService.updateTemplate(req.params.id, req.body);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error: any) {
    logger.error('Error updating onboarding template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/onboarding-templates/{id}:
 *   delete:
 *     summary: Delete onboarding template
 *     tags: [Lifecycle]
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
 *         description: Template deleted
 *       404:
 *         description: Template not found
 */
router.delete('/onboarding-templates/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await userOnboardingService.deleteTemplate(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, message: 'Template deleted' });
  } catch (error: any) {
    logger.error('Error deleting onboarding template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// OFFBOARDING TEMPLATES
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/offboarding-templates:
 *   get:
 *     summary: List offboarding templates
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Offboarding templates
 */
router.get('/offboarding-templates', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { isActive } = req.query;

    const templates = await userOffboardingService.getTemplates(organizationId, {
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });

    res.json({ success: true, data: templates });
  } catch (error: any) {
    logger.error('Error listing offboarding templates', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/offboarding-templates/{id}:
 *   get:
 *     summary: Get offboarding template
 *     tags: [Lifecycle]
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
 *         description: Template details
 *       404:
 *         description: Template not found
 */
router.get('/offboarding-templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await userOffboardingService.getTemplate(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error: any) {
    logger.error('Error getting offboarding template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/offboarding-templates:
 *   post:
 *     summary: Create offboarding template
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Template created
 */
router.post('/offboarding-templates', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const template = await userOffboardingService.createTemplate(
      organizationId,
      req.body,
      req.user?.userId
    );

    res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    logger.error('Error creating offboarding template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/offboarding-templates/{id}:
 *   put:
 *     summary: Update offboarding template
 *     tags: [Lifecycle]
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
 *         description: Template updated
 *       404:
 *         description: Template not found
 */
router.put('/offboarding-templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await userOffboardingService.updateTemplate(req.params.id, req.body);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error: any) {
    logger.error('Error updating offboarding template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/offboarding-templates/{id}:
 *   delete:
 *     summary: Delete offboarding template
 *     tags: [Lifecycle]
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
 *         description: Template deleted
 *       404:
 *         description: Template not found
 */
router.delete('/offboarding-templates/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await userOffboardingService.deleteTemplate(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, message: 'Template deleted' });
  } catch (error: any) {
    logger.error('Error deleting offboarding template', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ONBOARDING ACTIONS
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/onboard:
 *   post:
 *     summary: Onboard a new user
 *     description: Onboard a new user immediately or schedule for later.
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               templateId:
 *                 type: string
 *               scheduledFor:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: User onboarded or scheduled
 *       207:
 *         description: Partial success
 *       400:
 *         description: Missing required fields
 */
router.post('/onboard', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const {
      templateId,
      email,
      firstName,
      lastName,
      personalEmail,
      jobTitle,
      managerId,
      departmentId,
      scheduledFor,
      configOverrides,
    } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Email, firstName, and lastName are required',
      });
    }

    // If scheduledFor is provided, schedule the action
    if (scheduledFor) {
      const action = await scheduledActionService.scheduleAction(
        organizationId,
        {
          actionType: 'onboard',
          targetEmail: email,
          targetFirstName: firstName,
          targetLastName: lastName,
          targetPersonalEmail: personalEmail,
          onboardingTemplateId: templateId,
          scheduledFor,
          configOverrides,
        },
        req.user?.userId
      );

      return res.status(201).json({
        success: true,
        data: action,
        message: `Onboarding scheduled for ${scheduledFor}`,
      });
    }

    // Execute immediately
    let result;
    if (templateId) {
      result = await userOnboardingService.executeFromTemplate(
        organizationId,
        templateId,
        {
          email,
          firstName,
          lastName,
          personalEmail,
          jobTitle,
          managerId,
          departmentId,
        },
        {
          triggeredBy: 'user',
          triggeredByUserId: req.user?.userId,
          configOverrides,
        }
      );
    } else {
      result = await userOnboardingService.executeOnboarding(
        organizationId,
        {
          email,
          firstName,
          lastName,
          personalEmail,
          jobTitle,
          managerId,
          departmentId,
          groupIds: [],
          sharedDriveAccess: [],
          calendarSubscriptions: [],
          sendWelcomeEmail: true,
          ...configOverrides,
        },
        {
          triggeredBy: 'user',
          triggeredByUserId: req.user?.userId,
        }
      );
    }

    res.status(result.success ? 201 : 207).json({
      success: result.success,
      data: {
        userId: result.userId,
        googleUserId: result.googleUserId,
        stepsCompleted: result.stepsCompleted,
        stepsFailed: result.stepsFailed,
        stepsSkipped: result.stepsSkipped,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    logger.error('Error onboarding user', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// OFFBOARDING ACTIONS
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/offboard:
 *   post:
 *     summary: Offboard a user
 *     description: Offboard a user immediately or schedule for later.
 *     tags: [Lifecycle]
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
 *             properties:
 *               userId:
 *                 type: string
 *               templateId:
 *                 type: string
 *               scheduledFor:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: User offboarded
 *       201:
 *         description: Offboarding scheduled
 *       207:
 *         description: Partial success
 */
router.post('/offboard', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const {
      userId,
      templateId,
      scheduledFor,
      lastDay,
      configOverrides,
    } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    // If scheduledFor is provided, schedule the action
    if (scheduledFor) {
      const action = await scheduledActionService.scheduleAction(
        organizationId,
        {
          actionType: 'offboard',
          userId,
          offboardingTemplateId: templateId,
          scheduledFor,
          configOverrides,
        },
        req.user?.userId
      );

      return res.status(201).json({
        success: true,
        data: action,
        message: `Offboarding scheduled for ${scheduledFor}`,
      });
    }

    // Execute immediately
    let result;
    if (templateId) {
      result = await userOffboardingService.executeFromTemplate(
        organizationId,
        templateId,
        userId,
        {
          triggeredBy: 'user',
          triggeredByUserId: req.user?.userId,
          lastDay: lastDay ? new Date(lastDay) : undefined,
          configOverrides,
        }
      );
    } else {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required for offboarding',
      });
    }

    res.status(result.success ? 200 : 207).json({
      success: result.success,
      data: {
        stepsCompleted: result.stepsCompleted,
        stepsFailed: result.stepsFailed,
        stepsSkipped: result.stepsSkipped,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    logger.error('Error offboarding user', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// SCHEDULED ACTIONS
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/scheduled-actions:
 *   get:
 *     summary: List scheduled actions
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: actionType
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scheduled actions
 */
router.get('/scheduled-actions', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { status, actionType, userId, fromDate, toDate, limit, offset } = req.query;

    const result = await scheduledActionService.getActions(organizationId, {
      status: status as any,
      actionType: actionType as any,
      userId: userId as string,
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({ success: true, data: result.actions, total: result.total });
  } catch (error: any) {
    logger.error('Error listing scheduled actions', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/scheduled-actions/pending-approval:
 *   get:
 *     summary: Get actions pending approval
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Actions pending approval
 */
router.get('/scheduled-actions/pending-approval', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const actions = await scheduledActionService.getActionsPendingApproval(organizationId);

    res.json({ success: true, data: actions });
  } catch (error: any) {
    logger.error('Error getting actions pending approval', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/scheduled-actions/{id}:
 *   get:
 *     summary: Get scheduled action
 *     tags: [Lifecycle]
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
 *         description: Action details
 *       404:
 *         description: Action not found
 */
router.get('/scheduled-actions/:id', async (req: Request, res: Response) => {
  try {
    const action = await scheduledActionService.getAction(req.params.id);

    if (!action) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    res.json({ success: true, data: action });
  } catch (error: any) {
    logger.error('Error getting scheduled action', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/scheduled-actions/{id}:
 *   put:
 *     summary: Update scheduled action
 *     tags: [Lifecycle]
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
 *         description: Action updated
 *       404:
 *         description: Action not found
 */
router.put('/scheduled-actions/:id', async (req: Request, res: Response) => {
  try {
    const action = await scheduledActionService.updateAction(req.params.id, req.body);

    if (!action) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    res.json({ success: true, data: action });
  } catch (error: any) {
    logger.error('Error updating scheduled action', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/scheduled-actions/{id}/approve:
 *   post:
 *     summary: Approve scheduled action
 *     tags: [Lifecycle]
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
 *         description: Action approved
 *       404:
 *         description: Action not found
 */
router.post('/scheduled-actions/:id/approve', async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;

    const action = await scheduledActionService.approveAction(
      req.params.id,
      req.user?.userId!,
      notes
    );

    if (!action) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    res.json({ success: true, data: action, message: 'Action approved' });
  } catch (error: any) {
    logger.error('Error approving scheduled action', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/scheduled-actions/{id}/reject:
 *   post:
 *     summary: Reject scheduled action
 *     tags: [Lifecycle]
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Action rejected
 *       400:
 *         description: Reason required
 *       404:
 *         description: Action not found
 */
router.post('/scheduled-actions/:id/reject', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }

    const action = await scheduledActionService.rejectAction(
      req.params.id,
      req.user?.userId!,
      reason
    );

    if (!action) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    res.json({ success: true, data: action, message: 'Action rejected' });
  } catch (error: any) {
    logger.error('Error rejecting scheduled action', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/scheduled-actions/{id}:
 *   delete:
 *     summary: Cancel scheduled action
 *     tags: [Lifecycle]
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
 *         description: Action cancelled
 *       404:
 *         description: Action not found
 */
router.delete('/scheduled-actions/:id', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;

    const action = await scheduledActionService.cancelAction(
      req.params.id,
      req.user?.userId!,
      reason
    );

    if (!action) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    res.json({ success: true, data: action, message: 'Action cancelled' });
  } catch (error: any) {
    logger.error('Error cancelling scheduled action', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// LIFECYCLE LOGS
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/logs:
 *   get:
 *     summary: Get lifecycle logs
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: actionId
 *         schema:
 *           type: string
 *       - in: query
 *         name: actionType
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lifecycle logs
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { userId, actionId, actionType, limit, offset } = req.query;

    // If actionId provided, get logs for that action
    if (actionId) {
      const logs = await lifecycleLogService.getLogsForAction(actionId as string);
      return res.json({ success: true, data: logs });
    }

    // If userId provided, get logs for that user
    if (userId) {
      const result = await lifecycleLogService.getLogsForUser(organizationId, userId as string, {
        actionType: actionType as any,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      return res.json({ success: true, data: result.logs, total: result.total });
    }

    // Otherwise, return activity feed
    const result = await lifecycleLogService.getActivityFeed(organizationId, {
      actionType: actionType as any,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({ success: true, data: result.items, total: result.total });
  } catch (error: any) {
    logger.error('Error getting lifecycle logs', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/logs/errors:
 *   get:
 *     summary: Get recent errors
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Recent errors
 */
router.get('/logs/errors', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { limit } = req.query;

    const errors = await lifecycleLogService.getRecentErrors(
      organizationId,
      limit ? parseInt(limit as string, 10) : 10
    );

    res.json({ success: true, data: errors });
  } catch (error: any) {
    logger.error('Error getting lifecycle errors', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/actions/{id}/summary:
 *   get:
 *     summary: Get action summary
 *     tags: [Lifecycle]
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
 *         description: Action summary
 *       404:
 *         description: Action not found
 */
router.get('/actions/:id/summary', async (req: Request, res: Response) => {
  try {
    const summary = await lifecycleLogService.getActionSummary(req.params.id);

    if (!summary) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    res.json({ success: true, data: summary });
  } catch (error: any) {
    logger.error('Error getting action summary', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// LIFECYCLE REQUESTS
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/requests:
 *   get:
 *     summary: List lifecycle requests
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: request_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lifecycle requests
 */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { status, request_type, search, requested_by, manager_id, from_date, to_date, limit, offset } = req.query;

    const result = await lifecycleRequestService.listRequests(organizationId, {
      status: status as RequestStatus | RequestStatus[],
      request_type: request_type as RequestType,
      requested_by: requested_by as string,
      manager_id: manager_id as string,
      from_date: from_date as string,
      to_date: to_date as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({ success: true, data: result.requests, total: result.total });
  } catch (error: any) {
    logger.error('Error listing lifecycle requests', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/requests/counts:
 *   get:
 *     summary: Get request counts by status
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Request counts
 */
router.get('/requests/counts', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const counts = await lifecycleRequestService.getRequestCounts(organizationId);

    res.json({ success: true, data: counts });
  } catch (error: any) {
    logger.error('Error getting request counts', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/requests:
 *   post:
 *     summary: Create a lifecycle request
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - request_type
 *               - email
 *               - first_name
 *               - last_name
 *             properties:
 *               request_type:
 *                 type: string
 *                 enum: [onboard, offboard, transfer]
 *               email:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               start_date:
 *                 type: string
 *               template_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Request created
 */
router.post('/requests', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const {
      request_type,
      email,
      first_name,
      last_name,
      personal_email,
      user_id,
      start_date,
      end_date,
      template_id,
      job_title,
      department_id,
      manager_id,
      location,
      metadata,
    } = req.body;

    // Validate required fields
    if (!request_type || !email || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        error: 'request_type, email, first_name, and last_name are required',
      });
    }

    const request = await lifecycleRequestService.createRequest({
      organization_id: organizationId,
      request_type,
      email,
      first_name,
      last_name,
      personal_email,
      user_id,
      start_date,
      end_date,
      template_id,
      job_title,
      department_id,
      manager_id,
      location,
      metadata,
      requested_by: req.user?.userId,
    });

    res.status(201).json({ success: true, data: request });
  } catch (error: any) {
    logger.error('Error creating lifecycle request', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/requests/{id}:
 *   get:
 *     summary: Get a lifecycle request
 *     tags: [Lifecycle]
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
 *         description: Request details
 *       404:
 *         description: Request not found
 */
router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const request = await lifecycleRequestService.getRequest(req.params.id, organizationId);

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    // Get associated tasks
    const { tasks } = await lifecycleTaskService.listTasks(organizationId, {
      request_id: req.params.id,
      limit: 100,
    });

    res.json({ success: true, data: { ...request, tasks } });
  } catch (error: any) {
    logger.error('Error getting lifecycle request', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/requests/{id}:
 *   patch:
 *     summary: Update a lifecycle request
 *     tags: [Lifecycle]
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
 *         description: Request updated
 *       404:
 *         description: Request not found
 */
router.patch('/requests/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const request = await lifecycleRequestService.updateRequest(
      req.params.id,
      organizationId,
      req.body
    );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    res.json({ success: true, data: request });
  } catch (error: any) {
    logger.error('Error updating lifecycle request', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/requests/{id}/approve:
 *   post:
 *     summary: Approve a lifecycle request
 *     tags: [Lifecycle]
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
 *         description: Request approved
 *       400:
 *         description: Cannot approve request
 *       404:
 *         description: Request not found
 */
router.post('/requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const request = await lifecycleRequestService.approveRequest(
      req.params.id,
      organizationId,
      req.user?.userId!
    );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    // Generate tasks from template timeline
    await timelineGeneratorService.generateFromRequest(request);

    // Refresh request to get updated task counts
    const updatedRequest = await lifecycleRequestService.getRequest(req.params.id, organizationId);

    res.json({ success: true, data: updatedRequest, message: 'Request approved and tasks generated' });
  } catch (error: any) {
    logger.error('Error approving lifecycle request', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/requests/{id}/reject:
 *   post:
 *     summary: Reject a lifecycle request
 *     tags: [Lifecycle]
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
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Request rejected
 *       400:
 *         description: Cannot reject request
 *       404:
 *         description: Request not found
 */
router.post('/requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { reason } = req.body;

    const request = await lifecycleRequestService.rejectRequest(
      req.params.id,
      organizationId,
      req.user?.userId!,
      reason
    );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    res.json({ success: true, data: request, message: 'Request rejected' });
  } catch (error: any) {
    logger.error('Error rejecting lifecycle request', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/requests/{id}:
 *   delete:
 *     summary: Cancel a lifecycle request
 *     tags: [Lifecycle]
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
 *         description: Request cancelled
 *       400:
 *         description: Cannot cancel request
 *       404:
 *         description: Request not found
 */
router.delete('/requests/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const request = await lifecycleRequestService.cancelRequest(
      req.params.id,
      organizationId,
      req.user?.userId!
    );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    res.json({ success: true, data: request, message: 'Request cancelled' });
  } catch (error: any) {
    logger.error('Error cancelling lifecycle request', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// LIFECYCLE TASKS
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/tasks:
 *   get:
 *     summary: List lifecycle tasks
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: request_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: assignee_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: overdue_only
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lifecycle tasks
 */
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const {
      request_id,
      user_id,
      assignee_type,
      assignee_id,
      status,
      category,
      overdue_only,
      due_before,
      due_after,
      limit,
      offset,
    } = req.query;

    const result = await lifecycleTaskService.listTasks(organizationId, {
      request_id: request_id as string,
      user_id: user_id as string,
      assignee_type: assignee_type as AssigneeType | AssigneeType[],
      assignee_id: assignee_id as string,
      status: status as TaskStatus | TaskStatus[],
      category: category as string,
      overdue_only: overdue_only === 'true',
      due_before: due_before as string,
      due_after: due_after as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({ success: true, data: result.tasks, total: result.total });
  } catch (error: any) {
    logger.error('Error listing lifecycle tasks', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/tasks/my:
 *   get:
 *     summary: Get my assigned tasks
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: My tasks
 */
router.get('/tasks/my', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId || !userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { status, limit, offset } = req.query;

    const result = await lifecycleTaskService.getMyTasks(organizationId, userId, {
      status: status ? (status as string).split(',') as TaskStatus[] : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({ success: true, data: result.tasks, total: result.total });
  } catch (error: any) {
    logger.error('Error getting my tasks', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/tasks/counts:
 *   get:
 *     summary: Get task counts
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Task counts
 */
router.get('/tasks/counts', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { user_id } = req.query;

    const counts = await lifecycleTaskService.getTaskCounts(
      organizationId,
      user_id as string || req.user?.userId
    );

    res.json({ success: true, data: counts });
  } catch (error: any) {
    logger.error('Error getting task counts', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/tasks/overdue:
 *   get:
 *     summary: Get overdue tasks
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Overdue tasks
 */
router.get('/tasks/overdue', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const tasks = await lifecycleTaskService.getOverdueTasks(organizationId);

    res.json({ success: true, data: tasks });
  } catch (error: any) {
    logger.error('Error getting overdue tasks', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/tasks/{id}:
 *   get:
 *     summary: Get a lifecycle task
 *     tags: [Lifecycle]
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
 *         description: Task details
 *       404:
 *         description: Task not found
 */
router.get('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const task = await lifecycleTaskService.getTask(req.params.id, organizationId);

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, data: task });
  } catch (error: any) {
    logger.error('Error getting lifecycle task', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/tasks/{id}/complete:
 *   post:
 *     summary: Complete a lifecycle task
 *     tags: [Lifecycle]
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
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task completed
 *       400:
 *         description: Cannot complete task
 *       404:
 *         description: Task not found
 */
router.post('/tasks/:id/complete', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { notes } = req.body;

    const task = await lifecycleTaskService.completeTask(
      req.params.id,
      organizationId,
      req.user?.userId!,
      notes
    );

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, data: task, message: 'Task completed' });
  } catch (error: any) {
    logger.error('Error completing lifecycle task', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/tasks/{id}/skip:
 *   post:
 *     summary: Skip a lifecycle task
 *     tags: [Lifecycle]
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
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task skipped
 *       400:
 *         description: Cannot skip task
 *       404:
 *         description: Task not found
 */
router.post('/tasks/:id/skip', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { reason } = req.body;

    const task = await lifecycleTaskService.skipTask(
      req.params.id,
      organizationId,
      req.user?.userId!,
      reason
    );

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, data: task, message: 'Task skipped' });
  } catch (error: any) {
    logger.error('Error skipping lifecycle task', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/tasks/{id}/start:
 *   post:
 *     summary: Mark task as in progress
 *     tags: [Lifecycle]
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
 *         description: Task started
 *       404:
 *         description: Task not found
 */
router.post('/tasks/:id/start', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const task = await lifecycleTaskService.startTask(req.params.id, organizationId);

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found or not pending' });
    }

    res.json({ success: true, data: task, message: 'Task started' });
  } catch (error: any) {
    logger.error('Error starting lifecycle task', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// DASHBOARD DATA
// ==========================================

/**
 * @openapi
 * /api/v1/lifecycle/dashboard/metrics:
 *   get:
 *     summary: Get HR dashboard metrics
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics
 */
router.get('/dashboard/metrics', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    // Get request counts
    const requestCounts = await lifecycleRequestService.getRequestCounts(organizationId);

    // Get task counts for current user
    const taskCounts = await lifecycleTaskService.getTaskCounts(organizationId, userId);

    // Get overdue tasks count
    const overdueTasks = await lifecycleTaskService.getOverdueTasks(organizationId);

    // Calculate completed this month (from request counts)
    const completedThisMonth = requestCounts.completed || 0;

    // Average onboarding days (placeholder - would need to calculate from completed requests)
    const avgOnboardingDays = 14; // Default placeholder

    res.json({
      success: true,
      data: {
        pendingRequests: requestCounts.pending || 0,
        activeOnboardings: requestCounts.in_progress || 0,
        overdueTasksCount: overdueTasks.length,
        myTasksCount: taskCounts.pending + taskCounts.in_progress,
        completedThisMonth,
        avgOnboardingDays,
      },
    });
  } catch (error: any) {
    logger.error('Error getting dashboard metrics', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/dashboard/active-onboardings:
 *   get:
 *     summary: Get active onboardings for dashboard
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Active onboardings with progress
 */
router.get('/dashboard/active-onboardings', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    // Get in-progress requests
    const { requests } = await lifecycleRequestService.listRequests(organizationId, {
      status: 'in_progress',
      request_type: 'onboard',
      limit: 20,
    });

    // Enrich with task data
    const onboardings = await Promise.all(
      requests.map(async (request: any) => {
        const { tasks } = await lifecycleTaskService.listTasks(organizationId, {
          request_id: request.id,
        });

        const totalTasks = tasks.length;
        const completedTasks = tasks.filter((t: any) => t.status === 'completed' || t.status === 'skipped').length;
        const overdueTasks = tasks.filter(
          (t: any) => t.status !== 'completed' && t.status !== 'skipped' && t.due_date && new Date(t.due_date) < new Date()
        ).length;
        const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        // Determine status
        let status: 'on_track' | 'at_risk' | 'overdue' = 'on_track';
        if (overdueTasks > 0) {
          status = 'overdue';
        } else if (progressPercentage < 50 && request.start_date && new Date(request.start_date) < new Date()) {
          status = 'at_risk';
        }

        return {
          id: request.id,
          user_name: `${request.first_name} ${request.last_name}`,
          user_email: request.email,
          start_date: request.start_date,
          template_name: request.template_name || 'Default Template',
          department: request.department_name,
          manager_name: request.manager_name,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          overdue_tasks: overdueTasks,
          progress_percentage: progressPercentage,
          status,
        };
      })
    );

    res.json({ success: true, data: { onboardings } });
  } catch (error: any) {
    logger.error('Error getting active onboardings', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/dashboard/attention:
 *   get:
 *     summary: Get items requiring attention
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Attention items
 */
router.get('/dashboard/attention', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const items: Array<{
      id: string;
      type: 'overdue_task' | 'stale_request' | 'blocked_onboarding';
      title: string;
      description: string;
      severity: 'warning' | 'critical';
      days_overdue?: number;
      related_user?: string;
    }> = [];

    // Get overdue tasks
    const overdueTasks = await lifecycleTaskService.getOverdueTasks(organizationId);
    for (const task of overdueTasks.slice(0, 5)) {
      const daysOverdue = Math.floor(
        (Date.now() - new Date(task.due_date!).getTime()) / (1000 * 60 * 60 * 24)
      );

      items.push({
        id: task.id,
        type: 'overdue_task',
        title: task.title,
        description: `Assigned to ${task.assignee_type}`,
        severity: daysOverdue > 3 ? 'critical' : 'warning',
        days_overdue: daysOverdue,
        related_user: (task as any).user_name || undefined,
      });
    }

    // Get stale pending requests (pending for more than 3 days)
    const { requests: pendingRequests } = await lifecycleRequestService.listRequests(organizationId, {
      status: 'pending',
      limit: 10,
    });

    for (const request of pendingRequests) {
      const daysWaiting = Math.floor(
        (Date.now() - new Date(request.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysWaiting >= 3) {
        items.push({
          id: request.id,
          type: 'stale_request',
          title: `${request.request_type} request pending`,
          description: `For ${request.first_name} ${request.last_name}`,
          severity: daysWaiting > 5 ? 'critical' : 'warning',
          days_overdue: daysWaiting,
          related_user: `${request.first_name} ${request.last_name}`,
        });
      }
    }

    res.json({ success: true, data: { items } });
  } catch (error: any) {
    logger.error('Error getting attention items', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/dashboard/manager:
 *   get:
 *     summary: Get manager dashboard data
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Manager dashboard data
 */
router.get('/dashboard/manager', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId || !userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Get requests where current user is the manager
    const { requests: teamOnboardings, total: teamOnboardingsTotal } = await lifecycleRequestService.listRequests(organizationId, {
      manager_id: userId,
      status: ['approved', 'in_progress'] as RequestStatus[],
      request_type: 'onboard',
      limit: 10,
    });

    // Get my pending tasks
    const { tasks: myTasks, total: myTasksTotal } = await lifecycleTaskService.getMyTasks(organizationId, userId, {
      status: ['pending', 'in_progress'],
      limit: 10,
    });

    // Get upcoming starts (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const today = new Date().toISOString().split('T')[0];

    const { requests: upcomingStarts } = await lifecycleRequestService.listRequests(organizationId, {
      manager_id: userId,
      status: ['approved', 'in_progress'] as RequestStatus[],
      request_type: 'onboard',
      from_date: today,
      to_date: thirtyDaysFromNow.toISOString().split('T')[0],
      limit: 10,
    });

    // Calculate metrics
    const overdueMyTasks = myTasks.filter(
      (t: any) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'skipped'
    );

    res.json({
      success: true,
      data: {
        teamOnboardings: {
          items: teamOnboardings.map((r: any) => ({
            id: r.id,
            user_name: `${r.first_name} ${r.last_name}`,
            email: r.email,
            start_date: r.start_date,
            status: r.status,
            department: r.department_name,
            job_title: r.job_title,
            progress_percentage: r.progress_percentage || 0,
          })),
          total: teamOnboardingsTotal,
        },
        myTasks: {
          items: myTasks.map((t: any) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            due_date: t.due_date,
            status: t.status,
            category: t.category,
            priority: t.priority,
            user_name: t.user_name,
          })),
          total: myTasksTotal,
        },
        upcomingStarts: upcomingStarts.map((r: any) => ({
          id: r.id,
          user_name: `${r.first_name} ${r.last_name}`,
          email: r.email,
          start_date: r.start_date,
          department: r.department_name,
          job_title: r.job_title,
        })),
        metrics: {
          teamOnboardingsCount: teamOnboardingsTotal,
          myPendingTasksCount: myTasks.filter((t: any) => t.status === 'pending').length,
          myInProgressTasksCount: myTasks.filter((t: any) => t.status === 'in_progress').length,
          overdueTasksCount: overdueMyTasks.length,
          upcomingStartsCount: upcomingStarts.length,
        },
      },
    });
  } catch (error: any) {
    logger.error('Error getting manager dashboard', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/dashboard/team-onboardings:
 *   get:
 *     summary: Get team onboardings for manager
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Team onboardings with progress
 */
router.get('/dashboard/team-onboardings', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId || !userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { limit, offset } = req.query;

    // Get requests where current user is the manager
    const { requests } = await lifecycleRequestService.listRequests(organizationId, {
      manager_id: userId,
      status: ['approved', 'in_progress'] as RequestStatus[],
      request_type: 'onboard',
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    // Enrich with task data
    const onboardings = await Promise.all(
      requests.map(async (request: any) => {
        const { tasks } = await lifecycleTaskService.listTasks(organizationId, {
          request_id: request.id,
        });

        const totalTasks = tasks.length;
        const completedTasks = tasks.filter((t: any) => t.status === 'completed' || t.status === 'skipped').length;
        const myPendingTasks = tasks.filter(
          (t: any) => t.assignee_id === userId && (t.status === 'pending' || t.status === 'in_progress')
        ).length;
        const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return {
          id: request.id,
          user_name: `${request.first_name} ${request.last_name}`,
          user_email: request.email,
          start_date: request.start_date,
          job_title: request.job_title,
          department: request.department_name,
          status: request.status,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          my_pending_tasks: myPendingTasks,
          progress_percentage: progressPercentage,
        };
      })
    );

    res.json({ success: true, data: { onboardings } });
  } catch (error: any) {
    logger.error('Error getting team onboardings', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/dashboard:
 *   get:
 *     summary: Get lifecycle dashboard data
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    // Get request counts
    const requestCounts = await lifecycleRequestService.getRequestCounts(organizationId);

    // Get active onboardings
    const activeOnboardings = await lifecycleRequestService.getActiveOnboardings(organizationId);

    // Get task counts for current user
    const taskCounts = await lifecycleTaskService.getTaskCounts(organizationId, userId);

    // Get overdue tasks
    const overdueTasks = await lifecycleTaskService.getOverdueTasks(organizationId);

    res.json({
      success: true,
      data: {
        requests: requestCounts,
        activeOnboardings,
        tasks: taskCounts,
        overdueTasks: overdueTasks.slice(0, 5), // Top 5 overdue
      },
    });
  } catch (error: any) {
    logger.error('Error getting lifecycle dashboard', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/lifecycle/templates/{id}/preview-tasks:
 *   get:
 *     summary: Preview tasks that would be generated from a template
 *     tags: [Lifecycle]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task preview
 */
router.get('/templates/:id/preview-tasks', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { start_date } = req.query;
    if (!start_date) {
      return res.status(400).json({ success: false, error: 'start_date is required' });
    }

    const preview = await timelineGeneratorService.previewTasks(
      req.params.id,
      organizationId,
      start_date as string
    );

    res.json({ success: true, data: preview });
  } catch (error: any) {
    logger.error('Error previewing tasks', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
