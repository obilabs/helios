import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  getLabels,
  updateLabels,
  resetLabelsToDefaults,
  getLabelsWithAvailability,
} from '../services/label.service.js';
import {
  getAvailableEntities,
  getAvailableEntitiesDetailed,
} from '../services/entity-availability.service.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/organization/labels:
 *   get:
 *     summary: Get custom labels
 *     description: Get all custom labels for the organization (e.g., "Department" -> "Team").
 *     tags: [Labels]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Custom labels configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *                   example:
 *                     department: "Team"
 *                     location: "Office"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
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

    const labels = await getLabels(organizationId);

    res.json({
      success: true,
      data: labels,
    });
  } catch (error: any) {
    logger.error('Failed to get labels', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get labels',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/labels/with-availability:
 *   get:
 *     summary: Get labels with entity availability
 *     description: Get labels along with information about which entities are available based on enabled modules.
 *     tags: [Labels]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Labels with availability information
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
 *                     labels:
 *                       type: object
 *                     availability:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/with-availability', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID not found',
      });
      return;
    }

    const result = await getLabelsWithAvailability(organizationId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Failed to get labels with availability', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get labels with availability',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/labels:
 *   patch:
 *     summary: Update custom labels
 *     description: Update custom labels for the organization. Admin only.
 *     tags: [Labels]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               labels:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                 example:
 *                   department: "Team"
 *                   location: "Office"
 *     responses:
 *       200:
 *         description: Labels updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.patch('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!organizationId || !userId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID or User ID not found',
      });
      return;
    }

    // Check admin role
    if (userRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only administrators can update custom labels',
      });
      return;
    }

    const { labels } = req.body;

    if (!labels || typeof labels !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Labels object is required',
      });
      return;
    }

    // Update labels
    const updatedLabels = await updateLabels(organizationId, labels, userId);

    res.json({
      success: true,
      data: updatedLabels,
      message: 'Labels updated successfully',
    });
  } catch (error: any) {
    logger.error('Failed to update labels', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update labels',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/labels/reset:
 *   post:
 *     summary: Reset labels to defaults
 *     description: Reset all custom labels to their default values. Admin only.
 *     tags: [Labels]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Labels reset to defaults
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/reset', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!organizationId || !userId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID or User ID not found',
      });
      return;
    }

    // Check admin role
    if (userRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only administrators can reset labels',
      });
      return;
    }

    const defaultLabels = await resetLabelsToDefaults(organizationId, userId);

    res.json({
      success: true,
      data: defaultLabels,
      message: 'Labels reset to defaults successfully',
    });
  } catch (error: any) {
    logger.error('Failed to reset labels', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to reset labels',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/labels/available-entities:
 *   get:
 *     summary: Get available entities
 *     description: Get list of available canonical entities based on enabled modules.
 *     tags: [Labels]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of available entities
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
 *                     type: string
 *                   example: ["users", "groups", "devices"]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/available-entities', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID not found',
      });
      return;
    }

    const entities = await getAvailableEntities(organizationId);

    res.json({
      success: true,
      data: entities,
    });
  } catch (error: any) {
    logger.error('Failed to get available entities', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get available entities',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/labels/available-entities/detailed:
 *   get:
 *     summary: Get detailed entity availability
 *     description: Get detailed availability info showing which modules provide which entities.
 *     tags: [Labels]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Detailed entity availability
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
 *                     entities:
 *                       type: object
 *                     modules:
 *                       type: array
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/available-entities/detailed', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID not found',
      });
      return;
    }

    const availability = await getAvailableEntitiesDetailed(organizationId);

    res.json({
      success: true,
      data: availability,
    });
  } catch (error: any) {
    logger.error('Failed to get detailed entity availability', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get detailed entity availability',
      message: error.message,
    });
  }
});

export default router;
