/**
 * Signature Templates Routes
 *
 * API endpoints for email signature template management:
 * - Template CRUD operations
 * - Template preview and rendering
 * - Merge field information
 */

import { Router, Request, Response } from 'express';
import { signatureTemplateService } from '../services/signature-template.service.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  CreateSignatureTemplateDTO,
  UpdateSignatureTemplateDTO,
  SignatureTemplateStatus,
  MERGE_FIELDS,
} from '../types/signatures.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Signature Templates
 *     description: Email signature template management
 */

// All routes require authentication
router.use(authenticateToken);

// ==========================================
// MERGE FIELDS
// ==========================================

/**
 * @openapi
 * /api/v1/signatures/templates/merge-fields:
 *   get:
 *     summary: Get merge fields
 *     description: Get available merge fields grouped by category.
 *     tags: [Signature Templates]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Grouped merge fields
 */
router.get('/merge-fields', async (req: Request, res: Response) => {
  try {
    const grouped = signatureTemplateService.getAvailableMergeFields();
    res.json({ success: true, data: grouped });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error getting merge fields', { error: message });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/merge-fields/list:
 *   get:
 *     summary: Get merge fields list
 *     description: Get flat list of all merge fields.
 *     tags: [Signature Templates]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Flat merge fields list
 */
router.get('/merge-fields/list', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: MERGE_FIELDS });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error getting merge fields list', { error: message });
    res.status(500).json({ success: false, error: message });
  }
});

// ==========================================
// TEMPLATE CRUD
// ==========================================

/**
 * @openapi
 * /api/v1/signatures/templates:
 *   get:
 *     summary: List templates
 *     tags: [Signature Templates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: isCampaignTemplate
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: includeAssignments
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of templates
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const { status, isCampaignTemplate, includeAssignments } = req.query;

    const templates = await signatureTemplateService.getTemplates(organizationId, {
      status: status as SignatureTemplateStatus | undefined,
      isCampaignTemplate: isCampaignTemplate === 'true' ? true : isCampaignTemplate === 'false' ? false : undefined,
      includeAssignmentCounts: includeAssignments === 'true',
    });

    res.json({ success: true, data: templates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error listing signature templates', { error: message });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/{id}:
 *   get:
 *     summary: Get template by ID
 *     tags: [Signature Templates]
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
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const template = await signatureTemplateService.getTemplate(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    // Verify organization access
    if (template.organizationId !== req.user?.organizationId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error getting signature template', { error: message, templateId: req.params.id });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates:
 *   post:
 *     summary: Create template
 *     tags: [Signature Templates]
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
 *               - htmlContent
 *             properties:
 *               name:
 *                 type: string
 *               htmlContent:
 *                 type: string
 *               status:
 *                 type: string
 *               isCampaignTemplate:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Template created
 *       400:
 *         description: Validation failed
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID required' });
    }

    const data: CreateSignatureTemplateDTO = req.body;

    // Validation
    if (!data.name || !data.name.trim()) {
      return res.status(400).json({ success: false, error: 'Template name is required' });
    }

    if (!data.htmlContent || !data.htmlContent.trim()) {
      return res.status(400).json({ success: false, error: 'HTML content is required' });
    }

    const template = await signatureTemplateService.createTemplate(
      organizationId,
      data,
      userId
    );

    res.status(201).json({ success: true, data: template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating signature template', { error: message });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/{id}:
 *   put:
 *     summary: Update template
 *     tags: [Signature Templates]
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
 *               name:
 *                 type: string
 *               htmlContent:
 *                 type: string
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template updated
 *       404:
 *         description: Template not found
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    // Verify template exists and belongs to organization
    const existing = await signatureTemplateService.getTemplate(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    if (existing.organizationId !== organizationId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const data: UpdateSignatureTemplateDTO = req.body;
    const template = await signatureTemplateService.updateTemplate(req.params.id, data);

    res.json({ success: true, data: template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating signature template', { error: message, templateId: req.params.id });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/{id}:
 *   delete:
 *     summary: Delete template
 *     tags: [Signature Templates]
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
 *       400:
 *         description: Template has active assignments
 *       404:
 *         description: Template not found
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    // Verify template exists and belongs to organization
    const existing = await signatureTemplateService.getTemplate(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    if (existing.organizationId !== organizationId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const deleted = await signatureTemplateService.deleteTemplate(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, message: 'Template deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error deleting signature template', { error: message, templateId: req.params.id });

    // Handle specific error for templates with assignments
    if (message.includes('active assignments')) {
      return res.status(400).json({ success: false, error: message });
    }

    res.status(500).json({ success: false, error: message });
  }
});

// ==========================================
// TEMPLATE ACTIONS
// ==========================================

/**
 * @openapi
 * /api/v1/signatures/templates/{id}/clone:
 *   post:
 *     summary: Clone template
 *     tags: [Signature Templates]
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Template cloned
 *       404:
 *         description: Template not found
 */
router.post('/:id/clone', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    // Verify template exists and belongs to organization
    const existing = await signatureTemplateService.getTemplate(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    if (existing.organizationId !== organizationId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'New template name is required' });
    }

    const template = await signatureTemplateService.cloneTemplate(req.params.id, name, userId);

    res.status(201).json({ success: true, data: template });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error cloning signature template', { error: message, templateId: req.params.id });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/{id}/preview:
 *   post:
 *     summary: Preview template
 *     description: Preview template rendered with user data.
 *     tags: [Signature Templates]
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
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rendered preview
 *       404:
 *         description: Template not found
 */
router.post('/:id/preview', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    // Verify template exists and belongs to organization
    const existing = await signatureTemplateService.getTemplate(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    if (existing.organizationId !== organizationId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { userId } = req.body;

    // If userId provided, render with that user's data
    // Otherwise render with sample data
    const rendered = await signatureTemplateService.previewTemplate(
      existing.htmlContent,
      userId
    );

    res.json({
      success: true,
      data: {
        template: existing,
        rendered,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error previewing signature template', { error: message, templateId: req.params.id });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/preview-raw:
 *   post:
 *     summary: Preview raw HTML
 *     description: Preview raw HTML content for live preview.
 *     tags: [Signature Templates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - htmlContent
 *             properties:
 *               htmlContent:
 *                 type: string
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rendered preview
 *       400:
 *         description: HTML content required
 */
router.post('/preview-raw', async (req: Request, res: Response) => {
  try {
    const { htmlContent, userId } = req.body;

    if (!htmlContent) {
      return res.status(400).json({ success: false, error: 'HTML content is required' });
    }

    const rendered = await signatureTemplateService.previewTemplate(htmlContent, userId);

    res.json({ success: true, data: rendered });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error previewing raw signature content', { error: message });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/validate:
 *   post:
 *     summary: Validate merge fields
 *     tags: [Signature Templates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - htmlContent
 *             properties:
 *               htmlContent:
 *                 type: string
 *     responses:
 *       200:
 *         description: Validation result
 *       400:
 *         description: HTML content required
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { htmlContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({ success: false, error: 'HTML content is required' });
    }

    const mergeFields = signatureTemplateService.extractMergeFields(htmlContent);
    const invalidFields = signatureTemplateService.validateMergeFields(mergeFields);

    res.json({
      success: true,
      data: {
        mergeFields,
        invalidFields,
        isValid: invalidFields.length === 0,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error validating signature template', { error: message });
    res.status(500).json({ success: false, error: message });
  }
});

// ==========================================
// BATCH OPERATIONS
// ==========================================

/**
 * @openapi
 * /api/v1/signatures/templates/bulk-status:
 *   post:
 *     summary: Bulk update status
 *     tags: [Signature Templates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateIds
 *               - status
 *             properties:
 *               templateIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [draft, active, archived]
 *     responses:
 *       200:
 *         description: Bulk update result
 *       400:
 *         description: Invalid request
 */
router.post('/bulk-status', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { templateIds, status } = req.body;

    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Template IDs are required' });
    }

    if (!['draft', 'active', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of templateIds) {
      try {
        // Verify access
        const template = await signatureTemplateService.getTemplate(id);
        if (!template || template.organizationId !== organizationId) {
          results.push({ id, success: false, error: 'Not found or access denied' });
          continue;
        }

        await signatureTemplateService.updateTemplate(id, { status });
        results.push({ id, success: true });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ id, success: false, error: errMsg });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      data: {
        total: templateIds.length,
        updated: successCount,
        failed: templateIds.length - successCount,
        results,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error bulk updating signature templates', { error: message });
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
