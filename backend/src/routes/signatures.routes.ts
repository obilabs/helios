import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { signatureTemplateService } from '../services/signature-template.service.js';
import { MERGE_FIELDS } from '../types/signatures.js';

const router = Router();

// =====================================================
// TEMPLATE TYPES
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/template-types:
 *   get:
 *     summary: Get available template types
 *     description: Returns all active template types organized by category
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of template types
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
 *                     properties:
 *                       id:
 *                         type: string
 *                       type_label:
 *                         type: string
 *                       category:
 *                         type: string
 *                       is_active:
 *                         type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/template-types', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT * FROM template_types WHERE is_active = true ORDER BY category, type_label`
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching template types:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch template types',
    });
  }
});

// =====================================================
// MERGE FIELDS
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/merge-fields:
 *   get:
 *     summary: Get merge fields grouped by category
 *     description: Returns available merge fields (placeholders) for use in signature templates, grouped by category
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Merge fields grouped by category
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
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         field:
 *                           type: string
 *                         label:
 *                           type: string
 *                         example:
 *                           type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/merge-fields', requireAuth, async (req: Request, res: Response) => {
  try {
    const grouped = signatureTemplateService.getAvailableMergeFields();
    return res.json({ success: true, data: grouped });
  } catch (error: any) {
    console.error('Error getting merge fields:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get merge fields',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/merge-fields/list:
 *   get:
 *     summary: Get flat list of merge fields
 *     description: Returns all available merge fields as a flat list
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Flat list of merge fields
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
 *                     properties:
 *                       field:
 *                         type: string
 *                       label:
 *                         type: string
 *                       category:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/merge-fields/list', requireAuth, async (req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: MERGE_FIELDS });
  } catch (error: any) {
    console.error('Error getting merge fields list:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get merge fields list',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/validate:
 *   post:
 *     summary: Validate merge fields in template HTML
 *     description: Extracts and validates all merge fields from HTML content, identifying any invalid fields
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - html_content
 *             properties:
 *               html_content:
 *                 type: string
 *                 description: HTML content containing merge fields to validate
 *     responses:
 *       200:
 *         description: Validation results
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
 *                     mergeFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     invalidFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     isValid:
 *                       type: boolean
 *       400:
 *         description: Missing html_content
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/templates/validate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { html_content } = req.body;

    if (!html_content) {
      return res.status(400).json({
        success: false,
        error: 'html_content is required',
      });
    }

    const mergeFields = signatureTemplateService.extractMergeFields(html_content);
    const invalidFields = signatureTemplateService.validateMergeFields(mergeFields);

    return res.json({
      success: true,
      data: {
        mergeFields,
        invalidFields,
        isValid: invalidFields.length === 0,
      },
    });
  } catch (error: any) {
    console.error('Error validating template:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate template',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/preview:
 *   post:
 *     summary: Preview rendered template
 *     description: Renders template HTML with user data or sample data for preview
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - html_content
 *             properties:
 *               html_content:
 *                 type: string
 *                 description: HTML template content with merge fields
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 description: Optional user ID to use real user data for preview
 *     responses:
 *       200:
 *         description: Rendered HTML preview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: string
 *                   description: HTML content with merge fields replaced
 *       400:
 *         description: Missing html_content
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/templates/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const { html_content, user_id } = req.body;

    if (!html_content) {
      return res.status(400).json({
        success: false,
        error: 'html_content is required',
      });
    }

    const rendered = await signatureTemplateService.previewTemplate(html_content, user_id);

    // Check if user tracking is enabled for the organization (if a user was selected)
    let trackingEnabled = false;
    if (user_id) {
      trackingEnabled = await signatureTemplateService.isUserTrackingEnabled(user_id);
    }

    return res.json({
      success: true,
      data: {
        ...rendered,
        trackingEnabled,
        trackingInfo: trackingEnabled ? {
          message: 'User tracking pixel will be included when signature is deployed',
          note: 'The tracking pixel is invisible and does not affect signature appearance',
        } : null,
      },
    });
  } catch (error: any) {
    console.error('Error previewing template:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to preview template',
    });
  }
});

// =====================================================
// SIGNATURE TEMPLATES
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/templates:
 *   post:
 *     summary: Create signature template
 *     description: Creates a new email signature template. Requires admin permission.
 *     tags: [Signatures]
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
 *               - html_content
 *             properties:
 *               name:
 *                 type: string
 *                 description: Template name (must be unique)
 *               description:
 *                 type: string
 *               html_content:
 *                 type: string
 *                 description: HTML content of the signature template
 *               mobile_html_content:
 *                 type: string
 *                 description: Mobile-optimized HTML content
 *               plain_text_content:
 *                 type: string
 *                 description: Plain text fallback
 *               thumbnail_asset_id:
 *                 type: string
 *                 format: uuid
 *               category:
 *                 type: string
 *               variables_used:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_active:
 *                 type: boolean
 *                 default: true
 *               is_default:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Template created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/SignatureTemplate'
 *       400:
 *         description: Missing required fields or duplicate name
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/templates', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    const {
      name,
      description,
      html_content,
      mobile_html_content,
      plain_text_content,
      thumbnail_asset_id,
      category,
      variables_used,
      is_active = true,
      is_default = false,
    } = req.body;

    // Validate required fields
    if (!name || !html_content) {
      return res.status(400).json({
        success: false,
        error: 'Name and html_content are required',
      });
    }

    // Check if template name already exists
    const existingTemplate = await db.query(
      `SELECT id FROM signature_templates WHERE organization_id = $1 AND name = $2`,
      [organizationId, name]
    );

    if (existingTemplate.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Template with this name already exists',
      });
    }

    // If this is set as default, unset other defaults
    if (is_default) {
      await db.query(
        `UPDATE signature_templates SET is_default = false WHERE organization_id = $1`,
        [organizationId]
      );
    }

    // Insert template
    const result = await db.query(
      `INSERT INTO signature_templates (
        organization_id,
        name,
        description,
        html_content,
        mobile_html_content,
        plain_text_content,
        thumbnail_asset_id,
        category,
        variables_used,
        is_active,
        is_default,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        organizationId,
        name,
        description || null,
        html_content,
        mobile_html_content || null,
        plain_text_content || null,
        thumbnail_asset_id || null,
        category || null,
        variables_used ? JSON.stringify(variables_used) : null,
        is_active,
        is_default,
        userId,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error creating template:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create template',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates:
 *   get:
 *     summary: List signature templates
 *     description: Returns paginated list of signature templates for the organization
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or description
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Paginated list of templates
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
 *                     $ref: '#/components/schemas/SignatureTemplate'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const {
      category,
      is_active,
      search,
      page = '1',
      per_page = '50',
    } = req.query;

    let query = `
      SELECT
        st.*,
        u.email as created_by_email,
        u.first_name || ' ' || u.last_name as created_by_name,
        pa.public_url as thumbnail_url,
        (SELECT COUNT(*) FROM signature_assignments sa WHERE sa.template_id = st.id AND sa.is_active = true) as assignment_count,
        (SELECT COUNT(*) FROM user_signatures us WHERE us.current_template_id = st.id) as usage_count
      FROM signature_templates st
      LEFT JOIN organization_users u ON u.id = st.created_by
      LEFT JOIN public_assets pa ON pa.id = st.thumbnail_asset_id
      WHERE st.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    // Filter by category
    if (category) {
      query += ` AND st.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Filter by active status
    if (is_active !== undefined) {
      query += ` AND st.is_active = $${paramIndex}`;
      params.push(is_active === 'true');
      paramIndex++;
    }

    // Search by name or description
    if (search) {
      query += ` AND (st.name ILIKE $${paramIndex} OR st.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await db.query(
      `SELECT COUNT(*) FROM (${query}) as count_query`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Add pagination and sorting
    const limit = parseInt(per_page as string);
    const offset = (parseInt(page as string) - 1) * limit;
    query += ` ORDER BY st.is_default DESC, st.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page as string),
        per_page: limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error listing templates:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list templates',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/{templateId}:
 *   get:
 *     summary: Get template details
 *     description: Returns detailed information about a specific signature template
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
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
 *                   $ref: '#/components/schemas/SignatureTemplate'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Template not found
 */
router.get('/templates/:templateId', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { templateId } = req.params;

    const result = await db.query(
      `SELECT
        st.*,
        u.email as created_by_email,
        u.first_name || ' ' || u.last_name as created_by_name,
        pa.public_url as thumbnail_url,
        (SELECT COUNT(*) FROM signature_assignments sa WHERE sa.template_id = st.id AND sa.is_active = true) as assignment_count,
        (SELECT COUNT(*) FROM user_signatures us WHERE us.current_template_id = st.id) as usage_count
      FROM signature_templates st
      LEFT JOIN organization_users u ON u.id = st.created_by
      LEFT JOIN public_assets pa ON pa.id = st.thumbnail_asset_id
      WHERE st.id = $1 AND st.organization_id = $2`,
      [templateId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error getting template:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get template',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/{templateId}:
 *   put:
 *     summary: Update signature template
 *     description: Updates an existing signature template. Requires admin permission.
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
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
 *               html_content:
 *                 type: string
 *               mobile_html_content:
 *                 type: string
 *               plain_text_content:
 *                 type: string
 *               thumbnail_asset_id:
 *                 type: string
 *                 format: uuid
 *               category:
 *                 type: string
 *               variables_used:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_active:
 *                 type: boolean
 *               is_default:
 *                 type: boolean
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
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/SignatureTemplate'
 *       400:
 *         description: No fields to update or duplicate name
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Template not found
 */
router.put('/templates/:templateId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { templateId } = req.params;

    const {
      name,
      description,
      html_content,
      mobile_html_content,
      plain_text_content,
      thumbnail_asset_id,
      category,
      variables_used,
      is_active,
      is_default,
    } = req.body;

    // Verify template exists and belongs to organization
    const templateCheck = await db.query(
      `SELECT id FROM signature_templates WHERE id = $1 AND organization_id = $2`,
      [templateId, organizationId]
    );

    if (templateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // If name is being changed, check for duplicates
    if (name) {
      const duplicateCheck = await db.query(
        `SELECT id FROM signature_templates WHERE organization_id = $1 AND name = $2 AND id != $3`,
        [organizationId, name, templateId]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Template with this name already exists',
        });
      }
    }

    // If setting as default, unset other defaults
    if (is_default === true) {
      await db.query(
        `UPDATE signature_templates SET is_default = false WHERE organization_id = $1 AND id != $2`,
        [organizationId, templateId]
      );
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${valueIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${valueIndex++}`);
      values.push(description);
    }
    if (html_content !== undefined) {
      updates.push(`html_content = $${valueIndex++}`);
      values.push(html_content);
    }
    if (mobile_html_content !== undefined) {
      updates.push(`mobile_html_content = $${valueIndex++}`);
      values.push(mobile_html_content);
    }
    if (plain_text_content !== undefined) {
      updates.push(`plain_text_content = $${valueIndex++}`);
      values.push(plain_text_content);
    }
    if (thumbnail_asset_id !== undefined) {
      updates.push(`thumbnail_asset_id = $${valueIndex++}`);
      values.push(thumbnail_asset_id);
    }
    if (category !== undefined) {
      updates.push(`category = $${valueIndex++}`);
      values.push(category);
    }
    if (variables_used !== undefined) {
      updates.push(`variables_used = $${valueIndex++}`);
      values.push(variables_used ? JSON.stringify(variables_used) : null);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${valueIndex++}`);
      values.push(is_active);
    }
    if (is_default !== undefined) {
      updates.push(`is_default = $${valueIndex++}`);
      values.push(is_default);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add template ID and organization ID to values
    values.push(templateId, organizationId);

    const result = await db.query(
      `UPDATE signature_templates
       SET ${updates.join(', ')}
       WHERE id = $${valueIndex} AND organization_id = $${valueIndex + 1}
       RETURNING *`,
      values
    );

    return res.json({
      success: true,
      message: 'Template updated successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating template:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update template',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/templates/{templateId}:
 *   delete:
 *     summary: Delete signature template
 *     description: |
 *       Soft-deletes a signature template by setting is_active to false.
 *       Cannot delete templates that are currently assigned to users or used in active campaigns.
 *       Requires admin permission.
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
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
 *       400:
 *         description: Template is in use and cannot be deleted
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Template not found
 */
router.delete('/templates/:templateId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { templateId } = req.params;

    // Check if template exists
    const templateCheck = await db.query(
      `SELECT id FROM signature_templates WHERE id = $1 AND organization_id = $2`,
      [templateId, organizationId]
    );

    if (templateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Check if template is in use
    const usageCheck = await db.query(
      `SELECT COUNT(*) as count FROM user_signatures WHERE current_template_id = $1`,
      [templateId]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete template - it is currently assigned to users',
        usage_count: usageCheck.rows[0].count,
      });
    }

    // Check if template is in active campaigns
    const campaignCheck = await db.query(
      `SELECT COUNT(*) as count FROM signature_campaigns
       WHERE template_id = $1 AND status IN ('active', 'scheduled')`,
      [templateId]
    );

    if (parseInt(campaignCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete template - it is used in active campaigns',
        campaign_count: campaignCheck.rows[0].count,
      });
    }

    // Soft delete - set is_active to false
    await db.query(
      `UPDATE signature_templates SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [templateId]
    );

    return res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting template:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete template',
    });
  }
});

// =====================================================
// SIGNATURE ASSIGNMENTS
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/assignments:
 *   post:
 *     summary: Create signature assignment
 *     description: |
 *       Creates a rule to assign a signature template to users.
 *       Templates can be assigned to individual users, departments, groups, OUs, or the entire organization.
 *       Priority determines which assignment wins when multiple apply (lower = higher priority).
 *       Requires admin permission.
 *     tags: [Signatures]
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
 *               - target_type
 *             properties:
 *               template_id:
 *                 type: string
 *                 format: uuid
 *               template_type:
 *                 type: string
 *               target_type:
 *                 type: string
 *                 enum: [organization, user, department, google_group, org_unit, microsoft_group]
 *               target_user_id:
 *                 type: string
 *                 format: uuid
 *                 description: Required when target_type is 'user'
 *               target_department_id:
 *                 type: string
 *                 format: uuid
 *                 description: Required when target_type is 'department'
 *               target_group_email:
 *                 type: string
 *                 description: Required when target_type is 'google_group' or 'microsoft_group'
 *               target_org_unit_path:
 *                 type: string
 *                 description: Required when target_type is 'org_unit'
 *               priority:
 *                 type: integer
 *                 description: Assignment priority (lower wins). Auto-calculated if not provided.
 *               is_active:
 *                 type: boolean
 *                 default: true
 *               activation_date:
 *                 type: string
 *                 format: date-time
 *               expiration_date:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Assignment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/SignatureAssignment'
 *       400:
 *         description: Invalid target_type or missing required fields
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Template not found
 */
router.post('/assignments', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    const {
      template_id,
      template_type,
      target_type,
      target_user_id,
      target_department_id,
      target_group_email,
      target_org_unit_path,
      priority,
      is_active = true,
      activation_date,
      expiration_date,
    } = req.body;

    // Validate required fields
    if (!template_id || !target_type) {
      return res.status(400).json({
        success: false,
        error: 'template_id and target_type are required',
      });
    }

    // Verify template exists
    const templateCheck = await db.query(
      `SELECT id, template_type FROM signature_templates WHERE id = $1 AND organization_id = $2`,
      [template_id, organizationId]
    );

    if (templateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Validate target_type
    const validTypes = ['organization', 'user', 'department', 'google_group', 'org_unit', 'microsoft_group'];
    if (!validTypes.includes(target_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid target_type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Auto-calculate priority if not provided
    let calculatedPriority = priority;
    if (!calculatedPriority) {
      const priorityMap: Record<string, number> = {
        user: 1,
        department: 2,
        google_group: 3,
        microsoft_group: 3,
        org_unit: 4,
        organization: 5,
      };
      calculatedPriority = priorityMap[target_type] || 5;
    }

    // Insert assignment
    const result = await db.query(
      `INSERT INTO template_assignments (
        organization_id,
        template_id,
        template_type,
        target_type,
        target_user_id,
        target_department_id,
        target_group_email,
        target_org_unit_path,
        priority,
        is_active,
        activation_date,
        expiration_date,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        organizationId,
        template_id,
        template_type || templateCheck.rows[0].template_type,
        target_type,
        target_user_id || null,
        target_department_id || null,
        target_group_email || null,
        target_org_unit_path || null,
        calculatedPriority,
        is_active,
        activation_date || null,
        expiration_date || null,
        userId,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Assignment created successfully',
      data: result.rows[0],
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
 * /api/v1/signatures/assignments:
 *   get:
 *     summary: List signature assignments
 *     description: Returns list of signature template assignment rules
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: template_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by template ID
 *       - in: query
 *         name: target_type
 *         schema:
 *           type: string
 *           enum: [organization, user, department, google_group, org_unit, microsoft_group]
 *         description: Filter by target type
 *     responses:
 *       200:
 *         description: List of assignments
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
 *                     $ref: '#/components/schemas/SignatureAssignment'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/assignments', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { template_id, target_type } = req.query;

    let query = `
      SELECT
        ta.*,
        st.name as template_name,
        st.template_category,
        CASE
          WHEN ta.target_type = 'user' THEN (SELECT first_name || ' ' || last_name FROM organization_users WHERE id = ta.target_user_id)
          WHEN ta.target_type = 'department' THEN (SELECT name FROM departments WHERE id = ta.target_department_id)
          WHEN ta.target_type = 'google_group' THEN ta.target_group_email
          WHEN ta.target_type = 'microsoft_group' THEN ta.target_group_email
          WHEN ta.target_type = 'org_unit' THEN ta.target_org_unit_path
          WHEN ta.target_type = 'organization' THEN 'Everyone'
          ELSE 'Unknown'
        END as target_display
      FROM template_assignments ta
      JOIN signature_templates st ON st.id = ta.template_id
      WHERE ta.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (template_id) {
      query += ` AND ta.template_id = $${paramIndex}`;
      params.push(template_id);
      paramIndex++;
    }

    if (target_type) {
      query += ` AND ta.target_type = $${paramIndex}`;
      params.push(target_type);
      paramIndex++;
    }

    query += ` ORDER BY ta.priority ASC, ta.created_at DESC`;

    const result = await db.query(query, params);

    return res.json({
      success: true,
      data: result.rows,
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
 * /api/v1/signatures/assignments/{assignmentId}:
 *   delete:
 *     summary: Delete signature assignment
 *     description: Permanently deletes a signature assignment rule. Requires admin permission.
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Assignment ID
 *     responses:
 *       200:
 *         description: Assignment deleted
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
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Assignment not found
 */
router.delete('/assignments/:assignmentId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { assignmentId } = req.params;

    const result = await db.query(
      `DELETE FROM template_assignments WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [assignmentId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
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
// TEMPLATE CAMPAIGNS
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/campaigns:
 *   post:
 *     summary: Create signature campaign
 *     description: |
 *       Creates a time-limited campaign that applies a signature template to users during a specific period.
 *       Campaigns can be scheduled for future dates and can optionally revert to previous signatures when ended.
 *       Requires admin permission.
 *     tags: [Signatures]
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
 *               - campaign_name
 *               - start_date
 *               - end_date
 *               - target_type
 *             properties:
 *               template_id:
 *                 type: string
 *                 format: uuid
 *               template_type:
 *                 type: string
 *               campaign_name:
 *                 type: string
 *               campaign_description:
 *                 type: string
 *               target_type:
 *                 type: string
 *                 enum: [organization, user, department, google_group, org_unit, microsoft_group]
 *               target_user_id:
 *                 type: string
 *                 format: uuid
 *               target_department_id:
 *                 type: string
 *                 format: uuid
 *               target_group_email:
 *                 type: string
 *               target_org_unit_path:
 *                 type: string
 *               target_multiple:
 *                 type: array
 *                 items:
 *                   type: object
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *                 default: UTC
 *               revert_to_previous:
 *                 type: boolean
 *                 default: true
 *               requires_approval:
 *                 type: boolean
 *                 default: false
 *               approver_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Campaign created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/SignatureCampaign'
 *       400:
 *         description: Missing required fields or invalid dates
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Template not found
 */
router.post('/campaigns', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    const {
      template_id,
      template_type,
      campaign_name,
      campaign_description,
      target_type,
      target_user_id,
      target_department_id,
      target_group_email,
      target_org_unit_path,
      target_multiple,
      start_date,
      end_date,
      timezone = 'UTC',
      revert_to_previous = true,
      requires_approval = false,
      approver_id,
    } = req.body;

    // Validate required fields
    if (!template_id || !campaign_name || !start_date || !end_date || !target_type) {
      return res.status(400).json({
        success: false,
        error: 'template_id, campaign_name, start_date, end_date, and target_type are required',
      });
    }

    // Validate dates
    if (new Date(end_date) <= new Date(start_date)) {
      return res.status(400).json({
        success: false,
        error: 'end_date must be after start_date',
      });
    }

    // Verify template exists
    const templateCheck = await db.query(
      `SELECT id, template_type FROM signature_templates WHERE id = $1 AND organization_id = $2`,
      [template_id, organizationId]
    );

    if (templateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Insert campaign
    const result = await db.query(
      `INSERT INTO template_campaigns (
        organization_id,
        template_id,
        template_type,
        campaign_name,
        campaign_description,
        target_type,
        target_user_id,
        target_department_id,
        target_group_email,
        target_org_unit_path,
        target_multiple,
        start_date,
        end_date,
        timezone,
        revert_to_previous,
        requires_approval,
        approver_id,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        organizationId,
        template_id,
        template_type || templateCheck.rows[0].template_type,
        campaign_name,
        campaign_description || null,
        target_type,
        target_user_id || null,
        target_department_id || null,
        target_group_email || null,
        target_org_unit_path || null,
        target_multiple ? JSON.stringify(target_multiple) : null,
        start_date,
        end_date,
        timezone,
        revert_to_previous,
        requires_approval,
        approver_id || null,
        new Date(start_date) <= new Date() ? 'active' : 'scheduled',
        userId,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error creating campaign:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns:
 *   get:
 *     summary: List signature campaigns
 *     description: Returns list of signature campaigns for the organization
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, scheduled, active, completed, cancelled]
 *         description: Filter by campaign status
 *       - in: query
 *         name: template_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by template ID
 *     responses:
 *       200:
 *         description: List of campaigns
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
 *                     $ref: '#/components/schemas/SignatureCampaign'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/campaigns', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { status, template_id } = req.query;

    let query = `
      SELECT
        tc.*,
        st.name as template_name,
        st.category as template_category
      FROM template_campaigns tc
      JOIN signature_templates st ON st.id = tc.template_id
      WHERE tc.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      query += ` AND tc.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (template_id) {
      query += ` AND tc.template_id = $${paramIndex}`;
      params.push(template_id);
      paramIndex++;
    }

    query += ` ORDER BY tc.start_date DESC`;

    const result = await db.query(query, params);

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error listing campaigns:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list campaigns',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}:
 *   get:
 *     summary: Get campaign details
 *     description: Returns detailed information about a specific signature campaign
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Campaign ID
 *     responses:
 *       200:
 *         description: Campaign details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SignatureCampaign'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Campaign not found
 */
router.get('/campaigns/:campaignId', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    const result = await db.query(
      `SELECT
        tc.*,
        st.name as template_name,
        st.category as template_category,
        u.email as created_by_email,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM template_campaigns tc
      JOIN signature_templates st ON st.id = tc.template_id
      LEFT JOIN organization_users u ON u.id = tc.created_by
      WHERE tc.id = $1 AND tc.organization_id = $2`,
      [campaignId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error getting campaign:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}:
 *   put:
 *     summary: Update signature campaign
 *     description: Updates an existing signature campaign. Requires admin permission.
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Campaign ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               campaign_name:
 *                 type: string
 *               campaign_description:
 *                 type: string
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [draft, scheduled, active, completed, cancelled]
 *     responses:
 *       200:
 *         description: Campaign updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/SignatureCampaign'
 *       400:
 *         description: No fields to update
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Campaign not found
 */
router.put('/campaigns/:campaignId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    const {
      campaign_name,
      campaign_description,
      start_date,
      end_date,
      status,
    } = req.body;

    // Verify campaign exists
    const campaignCheck = await db.query(
      `SELECT id FROM template_campaigns WHERE id = $1 AND organization_id = $2`,
      [campaignId, organizationId]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    if (campaign_name !== undefined) {
      updates.push(`campaign_name = $${valueIndex++}`);
      values.push(campaign_name);
    }
    if (campaign_description !== undefined) {
      updates.push(`campaign_description = $${valueIndex++}`);
      values.push(campaign_description);
    }
    if (start_date !== undefined) {
      updates.push(`start_date = $${valueIndex++}`);
      values.push(start_date);
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${valueIndex++}`);
      values.push(end_date);
    }
    if (status !== undefined) {
      updates.push(`status = $${valueIndex++}`);
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(campaignId, organizationId);

    const result = await db.query(
      `UPDATE template_campaigns
       SET ${updates.join(', ')}
       WHERE id = $${valueIndex} AND organization_id = $${valueIndex + 1}
       RETURNING *`,
      values
    );

    return res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating campaign:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}:
 *   delete:
 *     summary: Delete or cancel signature campaign
 *     description: |
 *       Deletes or cancels a signature campaign.
 *       Active or scheduled campaigns are cancelled (status set to 'cancelled').
 *       Completed or draft campaigns are permanently deleted.
 *       Requires admin permission.
 *     tags: [Signatures]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Campaign ID
 *     responses:
 *       200:
 *         description: Campaign deleted or cancelled
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
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Campaign not found
 */
router.delete('/campaigns/:campaignId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Check if campaign exists and get status
    const campaignCheck = await db.query(
      `SELECT id, status FROM template_campaigns WHERE id = $1 AND organization_id = $2`,
      [campaignId, organizationId]
    );

    if (campaignCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const { status } = campaignCheck.rows[0];

    // If active or scheduled, cancel it. If completed or draft, delete it.
    if (status === 'active' || status === 'scheduled') {
      await db.query(
        `UPDATE template_campaigns SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [campaignId]
      );
      return res.json({
        success: true,
        message: 'Campaign cancelled successfully',
      });
    } else {
      await db.query(
        `DELETE FROM template_campaigns WHERE id = $1`,
        [campaignId]
      );
      return res.json({
        success: true,
        message: 'Campaign deleted successfully',
      });
    }
  } catch (error: any) {
    console.error('Error deleting campaign:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete campaign',
    });
  }
});

// =====================================================
// USER SIGNATURES
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/users/{userId}:
 *   get:
 *     summary: Get user signature settings
 *     description: Returns the current signature settings and applied template for a specific user
 *     tags: [Signatures]
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
 *         description: User signature settings
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
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                     current_template_id:
 *                       type: string
 *                       format: uuid
 *                     template_name:
 *                       type: string
 *                     template_html:
 *                       type: string
 *                     user_email:
 *                       type: string
 *                     user_name:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: User signature not found
 */
router.get('/users/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { userId } = req.params;

    const result = await db.query(
      `SELECT
        us.*,
        st.name as template_name,
        st.html_content as template_html,
        ou.email as user_email,
        ou.first_name || ' ' || ou.last_name as user_name
      FROM user_signatures us
      LEFT JOIN signature_templates st ON st.id = us.current_template_id
      LEFT JOIN organization_users ou ON ou.id = us.user_id
      WHERE us.user_id = $1 AND us.organization_id = $2`,
      [userId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User signature not found',
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error getting user signature:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user signature',
    });
  }
});

export default router;
