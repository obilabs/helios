import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { customFieldsService } from '../services/custom-fields.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Custom Fields
 *     description: Custom field definitions and user field values management
 */

// All routes require authentication
router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/organization/custom-fields/definitions:
 *   get:
 *     summary: Get custom field definitions
 *     description: Get all custom field definitions for the organization.
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Field definitions
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/definitions', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID not found'
      });
      return;
    }

    const fields = await customFieldsService.getFieldDefinitions(organizationId);

    res.json({
      success: true,
      data: fields
    });
  } catch (error: any) {
    logger.error('Failed to get custom field definitions', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get custom field definitions'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/custom-fields/definitions/category/{category}:
 *   get:
 *     summary: Get fields by category
 *     description: Get custom field definitions filtered by category.
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Field category
 *     responses:
 *       200:
 *         description: Field definitions for category
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/definitions/category/:category', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const { category } = req.params;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID not found'
      });
      return;
    }

    const fields = await customFieldsService.getFieldsByCategory(organizationId, category);

    res.json({
      success: true,
      data: fields
    });
  } catch (error: any) {
    logger.error('Failed to get fields by category', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get fields by category'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/custom-fields/signature-fields:
 *   get:
 *     summary: Get signature fields
 *     description: Get fields that can be used in email signatures.
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Signature-eligible fields
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/signature-fields', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID not found'
      });
      return;
    }

    const fields = await customFieldsService.getSignatureFields(organizationId);

    res.json({
      success: true,
      data: fields
    });
  } catch (error: any) {
    logger.error('Failed to get signature fields', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get signature fields'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/custom-fields/available-defaults:
 *   get:
 *     summary: Get available default fields
 *     description: Get available default fields that can be enabled.
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Available default fields
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/available-defaults', async (req: Request, res: Response): Promise<void> => {
  try {
    const fields = await customFieldsService.getAvailableDefaultFields();

    res.json({
      success: true,
      data: fields
    });
  } catch (error: any) {
    logger.error('Failed to get available default fields', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get available default fields'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/custom-fields/definitions:
 *   post:
 *     summary: Create or update field definition
 *     description: Create or update a custom field definition (admin only).
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fieldKey
 *               - fieldLabel
 *             properties:
 *               fieldKey:
 *                 type: string
 *               fieldLabel:
 *                 type: string
 *               fieldType:
 *                 type: string
 *               category:
 *                 type: string
 *     responses:
 *       200:
 *         description: Field definition saved
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Admin access required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/definitions', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!organizationId || !userId) {
      res.status(400).json({
        success: false,
        error: 'Organization or user ID not found'
      });
      return;
    }

    // Only admins can create/modify field definitions
    if (userRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Only administrators can manage custom field definitions'
      });
      return;
    }

    const fieldData = req.body;

    if (!fieldData.fieldKey || !fieldData.fieldLabel) {
      res.status(400).json({
        success: false,
        error: 'Field key and label are required'
      });
      return;
    }

    const field = await customFieldsService.upsertFieldDefinition(
      organizationId,
      fieldData,
      userId
    );

    res.json({
      success: true,
      data: field,
      message: 'Custom field definition saved successfully'
    });
  } catch (error: any) {
    logger.error('Failed to save custom field definition', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to save custom field definition'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/custom-fields/definitions/{fieldKey}:
 *   delete:
 *     summary: Delete field definition
 *     description: Delete (deactivate) a custom field definition (admin only).
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fieldKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Field key to delete
 *     responses:
 *       200:
 *         description: Field deleted
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Field not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/definitions/:fieldKey', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userRole = req.user?.role;
    const { fieldKey } = req.params;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID not found'
      });
      return;
    }

    // Only admins can delete field definitions
    if (userRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Only administrators can delete custom field definitions'
      });
      return;
    }

    const deleted = await customFieldsService.deleteFieldDefinition(organizationId, fieldKey);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Custom field definition not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Custom field definition deleted successfully'
    });
  } catch (error: any) {
    logger.error('Failed to delete custom field definition', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete custom field definition'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/custom-fields/user/{userId}:
 *   get:
 *     summary: Get user's field values
 *     description: Get a user's custom field values.
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     responses:
 *       200:
 *         description: User's field values
 *       403:
 *         description: Insufficient permissions
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.userId;
    const userRole = req.user?.role;

    // Users can only view their own fields unless they're admin
    if (userId !== requestingUserId && userRole !== 'admin' && userRole !== 'manager') {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions to view user custom fields'
      });
      return;
    }

    const fieldValues = await customFieldsService.getUserFieldValues(userId);

    res.json({
      success: true,
      data: fieldValues
    });
  } catch (error: any) {
    logger.error('Failed to get user custom field values', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get user custom field values'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/custom-fields/user/{userId}:
 *   put:
 *     summary: Update user's field values
 *     description: Update a user's custom field values.
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Field values updated
 *       403:
 *         description: Insufficient permissions
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.userId;
    const userRole = req.user?.role;
    const fieldValues = req.body;

    // Users can only update their own fields unless they're admin
    if (userId !== requestingUserId && userRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions to update user custom fields'
      });
      return;
    }

    await customFieldsService.updateUserFieldValues(userId, fieldValues);

    res.json({
      success: true,
      message: 'Custom field values updated successfully'
    });
  } catch (error: any) {
    logger.error('Failed to update user custom field values', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update custom field values'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/custom-fields/initialize-defaults:
 *   post:
 *     summary: Initialize default fields
 *     description: Initialize default custom fields for the organization (admin only).
 *     tags: [Custom Fields]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Default fields initialized
 *       403:
 *         description: Admin access required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/initialize-defaults', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!organizationId || !userId) {
      res.status(400).json({
        success: false,
        error: 'Organization or user ID not found'
      });
      return;
    }

    // Only admins can initialize defaults
    if (userRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Only administrators can initialize default fields'
      });
      return;
    }

    await customFieldsService.initializeDefaultFields(organizationId, userId);

    res.json({
      success: true,
      message: 'Default custom fields initialized successfully'
    });
  } catch (error: any) {
    logger.error('Failed to initialize default fields', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to initialize default fields'
    });
  }
});

export default router;