import { Router, Request, Response } from 'express';
import multer from 'multer';
import { bulkOperationsService } from '../services/bulk-operations.service.js';
import { csvParserService, ValidationRule } from '../services/csv-parser.service.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Bulk Operations
 *     description: Bulk data operations with CSV import/export and Google Workspace sync
 *
 * components:
 *   schemas:
 *     BulkOperation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         operationType:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *         totalItems:
 *           type: integer
 *         processedItems:
 *           type: integer
 *         successCount:
 *           type: integer
 *         failureCount:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *     BulkTemplate:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         operationType:
 *           type: string
 *         templateData:
 *           type: object
 */

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      cb(new Error('Only CSV files are allowed'));
      return;
    }
    cb(null, true);
  },
});

/**
 * @openapi
 * /api/v1/bulk/upload:
 *   post:
 *     summary: Upload and validate CSV file
 *     description: Upload a CSV file for bulk operations. Returns validated and transformed data.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - operationType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               operationType:
 *                 type: string
 *                 enum: [user_update, user_create, group_membership_add, group_membership_remove, user_suspend, user_delete]
 *     responses:
 *       200:
 *         description: CSV validated successfully
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
 *                     type: object
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                 meta:
 *                   type: object
 *                 headers:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Invalid CSV or missing file
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/upload', authenticateToken, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { operationType } = req.body;
    if (!operationType) {
      return res.status(400).json({
        success: false,
        error: 'Operation type is required',
      });
    }

    // Parse CSV
    const csvContent = req.file.buffer.toString('utf-8');
    const parseResult = csvParserService.parseCSV(csvContent);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to parse CSV',
        errors: parseResult.errors,
      });
    }

    // Define validation rules based on operation type
    const validationRules = getValidationRules(operationType);

    // Validate data
    const validationResult = csvParserService.validateData(
      parseResult.data || [],
      validationRules
    );

    // Transform to system format
    const transformedData = csvParserService.transformToSystemFormat(
      validationResult.data || [],
      operationType
    );

    res.json({
      success: validationResult.success,
      data: transformedData,
      errors: validationResult.errors,
      meta: validationResult.meta,
      headers: parseResult.headers,
    });
  } catch (error: any) {
    logger.error('CSV upload error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process CSV file',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/preview:
 *   post:
 *     summary: Preview bulk operation changes
 *     description: Preview changes before executing a bulk operation.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operationType
 *               - items
 *             properties:
 *               operationType:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Preview generated
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
 *                     operationType:
 *                       type: string
 *                     totalItems:
 *                       type: integer
 *                     sampleItems:
 *                       type: array
 *                     estimatedTime:
 *                       type: integer
 *       400:
 *         description: Invalid request body
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/preview', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { operationType, items } = req.body;

    if (!operationType || !items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
      });
    }

    // Generate preview summary
    const preview = {
      operationType,
      totalItems: items.length,
      sampleItems: items.slice(0, 5), // Show first 5 items
      estimatedTime: Math.ceil(items.length / 10) * 2, // Rough estimate: 10 items per 2 seconds
    };

    res.json({
      success: true,
      data: preview,
    });
  } catch (error: any) {
    logger.error('Preview error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate preview',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/execute:
 *   post:
 *     summary: Execute bulk operation
 *     description: Queue a bulk operation for background processing.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operationType
 *               - items
 *             properties:
 *               operationType:
 *                 type: string
 *               operationName:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Operation queued
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
 *                     bulkOperationId:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                     totalItems:
 *                       type: integer
 *       400:
 *         description: Invalid request body
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/execute', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { operationType, operationName, items } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!operationType || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
      });
    }

    // Create bulk operation
    const operation = await bulkOperationsService.createBulkOperation({
      organizationId,
      operationType,
      operationName,
      items,
      createdBy: userId,
    });

    // Queue for processing
    await bulkOperationsService.queueBulkOperation(operation.id);

    res.json({
      success: true,
      data: {
        bulkOperationId: operation.id,
        status: operation.status,
        totalItems: operation.totalItems,
      },
      message: 'Bulk operation queued for processing',
    });
  } catch (error: any) {
    logger.error('Execute error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute bulk operation',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/status/{id}:
 *   get:
 *     summary: Get bulk operation status
 *     description: Get the current status and progress of a bulk operation.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Bulk operation ID
 *     responses:
 *       200:
 *         description: Operation status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/BulkOperation'
 *                     - type: object
 *                       properties:
 *                         progress:
 *                           type: integer
 *                           description: Progress percentage
 *       404:
 *         description: Operation not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/status/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const operation = await bulkOperationsService.getBulkOperation(id);

    if (!operation) {
      return res.status(404).json({
        success: false,
        error: 'Bulk operation not found',
      });
    }

    // Calculate progress percentage
    const progress = operation.totalItems > 0
      ? Math.floor((operation.processedItems / operation.totalItems) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        ...operation,
        progress,
      },
    });
  } catch (error: any) {
    logger.error('Status error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get bulk operation status',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/history:
 *   get:
 *     summary: Get bulk operation history
 *     description: Get list of past bulk operations for the organization.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: Operation history
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
 *                     $ref: '#/components/schemas/BulkOperation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const operations = await bulkOperationsService.getBulkOperations(organizationId, limit);

    res.json({
      success: true,
      data: operations,
    });
  } catch (error: any) {
    logger.error('History error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get bulk operation history',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/template/{operationType}:
 *   get:
 *     summary: Download CSV template
 *     description: Download a CSV template for a specific operation type.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: operationType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user_update, user_create, group_membership_add, group_membership_remove, user_suspend, user_delete]
 *         description: Operation type
 *     responses:
 *       200:
 *         description: CSV template file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         description: Template not found for this operation type
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/template/:operationType', authenticateToken, (req: Request, res: Response) => {
  try {
    const { operationType } = req.params;
    const template = csvParserService.generateTemplate(operationType);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found for this operation type',
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${operationType}_template.csv"`);
    res.send(template);
  } catch (error: any) {
    logger.error('Template error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate template',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/export:
 *   post:
 *     summary: Export data to CSV
 *     description: Export data array to a CSV file.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: array
 *                 items:
 *                   type: object
 *               headers:
 *                 type: array
 *                 items:
 *                   type: string
 *               filename:
 *                 type: string
 *                 default: export.csv
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid data
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/export', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { data, headers, filename } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid data',
      });
    }

    const csv = csvParserService.exportToCSV(data, headers);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'export.csv'}"`);
    res.send(csv);
  } catch (error: any) {
    logger.error('Export error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export data',
    });
  }
});

// ===== TEMPLATE MANAGEMENT ROUTES =====

/**
 * @openapi
 * /api/v1/bulk/templates:
 *   post:
 *     summary: Create a bulk operation template
 *     description: Create a reusable template for bulk operations.
 *     tags: [Bulk Operations]
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
 *               - operationType
 *               - templateData
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               operationType:
 *                 type: string
 *               templateData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Template created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BulkTemplate'
 *       400:
 *         description: Missing required fields
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/templates', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name, description, operationType, templateData } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!name || !operationType || !templateData) {
      return res.status(400).json({
        success: false,
        error: 'Name, operationType, and templateData are required',
      });
    }

    const template = await bulkOperationsService.createTemplate({
      organizationId,
      name,
      description,
      operationType,
      templateData,
      createdBy: userId,
    });

    res.json({
      success: true,
      data: template,
      message: 'Template created successfully',
    });
  } catch (error: any) {
    logger.error('Create template error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create template',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/templates:
 *   get:
 *     summary: List bulk operation templates
 *     description: Get all bulk operation templates for the organization.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Template list
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
 *                     $ref: '#/components/schemas/BulkTemplate'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/templates', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const templates = await bulkOperationsService.getTemplates(organizationId);

    res.json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    logger.error('Get templates error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get templates',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/templates/{id}:
 *   get:
 *     summary: Get template by ID
 *     description: Get a single bulk operation template by ID.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BulkTemplate'
 *       404:
 *         description: Template not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/templates/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const template = await bulkOperationsService.getTemplate(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error: any) {
    logger.error('Get template error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get template',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/templates/{id}:
 *   put:
 *     summary: Update template
 *     description: Update a bulk operation template.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               templateData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Template updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BulkTemplate'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/templates/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, templateData } = req.body;

    const template = await bulkOperationsService.updateTemplate(id, {
      name,
      description,
      templateData,
    });

    res.json({
      success: true,
      data: template,
      message: 'Template updated successfully',
    });
  } catch (error: any) {
    logger.error('Update template error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update template',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/templates/{id}:
 *   delete:
 *     summary: Delete template
 *     description: Delete a bulk operation template.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/templates/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await bulkOperationsService.deleteTemplate(id);

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete template error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete template',
    });
  }
});

// ===== GOOGLE WORKSPACE SYNC ROUTES =====

/**
 * @openapi
 * /api/v1/bulk/sync/users:
 *   post:
 *     summary: Bulk update users with Google Workspace sync
 *     description: Bulk update users locally and sync changes to Google Workspace.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *               syncToGoogleWorkspace:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Users updated
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
 *                     totalItems:
 *                       type: integer
 *                     localResults:
 *                       type: object
 *                     googleWorkspaceResults:
 *                       type: object
 *       400:
 *         description: Invalid items
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/sync/users', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { items, syncToGoogleWorkspace = true } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required and must not be empty',
      });
    }

    // Get estimated time
    const estimate = bulkOperationsService.estimateBulkOperationTime(
      items.length,
      syncToGoogleWorkspace
    );

    // Process with sync
    const result = await bulkOperationsService.processBulkUserUpdatesWithSync(
      organizationId,
      items,
      userId
    );

    res.json({
      success: result.failureCount === 0,
      data: {
        totalItems: items.length,
        localResults: {
          successCount: result.localResults.filter(r => r.success).length,
          failureCount: result.localResults.filter(r => !r.success).length,
        },
        googleWorkspaceResults: {
          successCount: result.gwResults.filter(r => r.success).length,
          failureCount: result.gwResults.filter(r => !r.success).length,
          synced: result.gwResults.length > 0,
        },
        estimatedTime: estimate,
      },
      message: result.failureCount === 0
        ? 'Bulk update completed successfully'
        : `Completed with ${result.failureCount} failures`,
    });
  } catch (error: any) {
    logger.error('Bulk sync users error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process bulk user updates',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/sync/suspend:
 *   post:
 *     summary: Bulk suspend users with Google Workspace sync
 *     description: Suspend multiple users locally and in Google Workspace.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userEmails
 *             properties:
 *               userEmails:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *     responses:
 *       200:
 *         description: Users suspended
 *       400:
 *         description: Invalid user emails
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/sync/suspend', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userEmails } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!userEmails || !Array.isArray(userEmails) || userEmails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userEmails array is required and must not be empty',
      });
    }

    const result = await bulkOperationsService.processBulkSuspendWithSync(
      organizationId,
      userEmails,
      userId
    );

    res.json({
      success: result.failureCount === 0,
      data: {
        totalItems: userEmails.length,
        localResults: {
          successCount: result.localResults.filter(r => r.success).length,
          failureCount: result.localResults.filter(r => !r.success).length,
        },
        googleWorkspaceResults: {
          successCount: result.gwResults.filter(r => r.success).length,
          failureCount: result.gwResults.filter(r => !r.success).length,
          synced: result.gwResults.length > 0,
        },
      },
      message: result.failureCount === 0
        ? 'Bulk suspend completed successfully'
        : `Completed with ${result.failureCount} failures`,
    });
  } catch (error: any) {
    logger.error('Bulk sync suspend error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process bulk suspend',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/sync/move-ou:
 *   post:
 *     summary: Bulk move users to organizational unit
 *     description: Move multiple users to a new organizational unit in Google Workspace.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userEmails
 *               - targetOU
 *             properties:
 *               userEmails:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               targetOU:
 *                 type: string
 *                 description: Target organizational unit path
 *     responses:
 *       200:
 *         description: Users moved
 *       400:
 *         description: Invalid request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/sync/move-ou', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userEmails, targetOU } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!userEmails || !Array.isArray(userEmails) || userEmails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userEmails array is required and must not be empty',
      });
    }

    if (!targetOU) {
      return res.status(400).json({
        success: false,
        error: 'targetOU is required',
      });
    }

    const result = await bulkOperationsService.processBulkMoveOUWithSync(
      organizationId,
      userEmails,
      targetOU,
      userId
    );

    res.json({
      success: result.failureCount === 0,
      data: {
        totalItems: userEmails.length,
        targetOU,
        localResults: {
          successCount: result.localResults.filter(r => r.success).length,
          failureCount: result.localResults.filter(r => !r.success).length,
        },
        googleWorkspaceResults: {
          successCount: result.gwResults.filter(r => r.success).length,
          failureCount: result.gwResults.filter(r => !r.success).length,
          synced: result.gwResults.length > 0,
        },
      },
      message: result.failureCount === 0
        ? 'Bulk OU move completed successfully'
        : `Completed with ${result.failureCount} failures`,
    });
  } catch (error: any) {
    logger.error('Bulk sync move OU error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process bulk OU move',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/sync/group-members:
 *   post:
 *     summary: Bulk manage group memberships
 *     description: Add or remove multiple group members with Google Workspace sync.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operations
 *             properties:
 *               operations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - userEmail
 *                     - groupId
 *                     - operation
 *                   properties:
 *                     userEmail:
 *                       type: string
 *                       format: email
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                     operation:
 *                       type: string
 *                       enum: [add, remove]
 *     responses:
 *       200:
 *         description: Group memberships updated
 *       400:
 *         description: Invalid operations
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/sync/group-members', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { operations } = req.body;
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'operations array is required and must not be empty',
      });
    }

    // Validate each operation
    for (const op of operations) {
      if (!op.userEmail || !op.groupId || !['add', 'remove'].includes(op.operation)) {
        return res.status(400).json({
          success: false,
          error: 'Each operation must have userEmail, groupId, and operation (add/remove)',
        });
      }
    }

    const result = await bulkOperationsService.processBulkGroupMembershipWithSync(
      organizationId,
      operations,
      userId
    );

    res.json({
      success: result.failureCount === 0,
      data: {
        totalOperations: operations.length,
        localResults: {
          successCount: result.localResults.filter(r => r.success).length,
          failureCount: result.localResults.filter(r => !r.success).length,
        },
        googleWorkspaceResults: {
          successCount: result.gwResults.filter(r => r.success).length,
          failureCount: result.gwResults.filter(r => !r.success).length,
          synced: result.gwResults.length > 0,
        },
      },
      message: result.failureCount === 0
        ? 'Bulk group membership operations completed successfully'
        : `Completed with ${result.failureCount} failures`,
    });
  } catch (error: any) {
    logger.error('Bulk sync group members error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process bulk group membership operations',
    });
  }
});

/**
 * @openapi
 * /api/v1/bulk/sync/estimate:
 *   get:
 *     summary: Get estimated time for bulk operation
 *     description: Get an estimated completion time for a bulk operation based on item count.
 *     tags: [Bulk Operations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: itemCount
 *         required: true
 *         schema:
 *           type: integer
 *         description: Number of items to process
 *       - in: query
 *         name: syncToGoogleWorkspace
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include Google Workspace sync time
 *     responses:
 *       200:
 *         description: Time estimate
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
 *                     estimatedSeconds:
 *                       type: number
 *                     estimatedMinutes:
 *                       type: number
 *       400:
 *         description: Invalid item count
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/sync/estimate', authenticateToken, (req: Request, res: Response) => {
  try {
    const itemCount = parseInt(req.query.itemCount as string) || 0;
    const includeGoogleWorkspace = req.query.syncToGoogleWorkspace === 'true';

    if (itemCount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'itemCount must be a positive number',
      });
    }

    const estimate = bulkOperationsService.estimateBulkOperationTime(
      itemCount,
      includeGoogleWorkspace
    );

    res.json({
      success: true,
      data: estimate,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate estimate',
    });
  }
});

/**
 * Helper function to get validation rules based on operation type
 */
function getValidationRules(operationType: string): ValidationRule[] {
  switch (operationType) {
    case 'user_update':
    case 'user_create':
      return [
        { field: 'email', required: true, type: 'email' },
        { field: 'firstName', required: operationType === 'user_create' },
        { field: 'lastName', required: operationType === 'user_create' },
        { field: 'department', required: false },
        { field: 'jobTitle', required: false },
        { field: 'organizationalUnit', required: false },
      ];

    case 'group_membership_add':
    case 'group_membership_remove':
      return [
        { field: 'groupEmail', required: true, type: 'email' },
        { field: 'userEmail', required: true, type: 'email' },
      ];

    case 'user_suspend':
    case 'user_delete':
      return [
        { field: 'email', required: true, type: 'email' },
      ];

    default:
      return [];
  }
}

export default router;
