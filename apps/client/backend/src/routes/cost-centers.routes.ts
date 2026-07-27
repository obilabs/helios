import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /api/v1/organization/cost-centers:
 *   get:
 *     summary: List cost centers
 *     description: Get all cost centers for the organization.
 *     tags: [Cost Centers]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of cost centers
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
 *                         format: uuid
 *                       code:
 *                         type: string
 *                       name:
 *                         type: string
 *                       budgetAmount:
 *                         type: number
 *                       budgetCurrency:
 *                         type: string
 *                       userCount:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const result = await db.query(`
      SELECT
        cc.id,
        cc.code,
        cc.name,
        cc.description,
        cc.department_id as "departmentId",
        cc.budget_amount as "budgetAmount",
        cc.budget_currency as "budgetCurrency",
        cc.fiscal_year as "fiscalYear",
        cc.is_active as "isActive",
        cc.created_at as "createdAt",
        cc.updated_at as "updatedAt",
        d.name as "departmentName",
        (SELECT COUNT(*) FROM organization_users WHERE cost_center_id = cc.id) as "userCount"
      FROM cost_centers cc
      LEFT JOIN departments d ON cc.department_id = d.id
      WHERE cc.organization_id = $1
      ORDER BY cc.code
    `, [organizationId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    logger.error('Failed to fetch cost centers', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cost centers'
    });
  }
});

/**
 * GET /api/cost-centers/:id
 * Get a specific cost center
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const result = await db.query(`
      SELECT
        cc.id,
        cc.code,
        cc.name,
        cc.description,
        cc.department_id as "departmentId",
        cc.budget_amount as "budgetAmount",
        cc.budget_currency as "budgetCurrency",
        cc.fiscal_year as "fiscalYear",
        cc.is_active as "isActive",
        cc.created_at as "createdAt",
        cc.updated_at as "updatedAt",
        d.name as "departmentName",
        (SELECT COUNT(*) FROM organization_users WHERE cost_center_id = cc.id) as "userCount"
      FROM cost_centers cc
      LEFT JOIN departments d ON cc.department_id = d.id
      WHERE cc.id = $1 AND cc.organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cost center not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    logger.error('Failed to fetch cost center', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cost center'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/cost-centers:
 *   post:
 *     summary: Create cost center
 *     description: Create a new cost center.
 *     tags: [Cost Centers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               departmentId:
 *                 type: string
 *                 format: uuid
 *               budgetAmount:
 *                 type: number
 *               budgetCurrency:
 *                 type: string
 *               fiscalYear:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Cost center created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: Cost center code already exists
 */
router.post('/',
  authenticateToken,
  [
    body('code').trim().notEmpty().withMessage('Code is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('description').optional().trim(),
    body('departmentId').optional().isUUID(),
    body('budgetAmount').optional().isDecimal(),
    body('budgetCurrency').optional().isLength({ min: 3, max: 3 }),
    body('fiscalYear').optional().isInt({ min: 2000, max: 2100 }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    try {
      const organizationId = req.user?.organizationId;
      const userId = req.user?.userId;
      const {
        code,
        name,
        description,
        departmentId,
        budgetAmount,
        budgetCurrency,
        fiscalYear
      } = req.body;

      // Check if cost center code already exists
      const existing = await db.query(
        'SELECT id FROM cost_centers WHERE organization_id = $1 AND LOWER(code) = LOWER($2)',
        [organizationId, code]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Cost center with this code already exists'
        });
      }

      const result = await db.query(`
        INSERT INTO cost_centers (
          organization_id,
          code,
          name,
          description,
          department_id,
          budget_amount,
          budget_currency,
          fiscal_year,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id,
          code,
          name,
          description,
          department_id as "departmentId",
          budget_amount as "budgetAmount",
          budget_currency as "budgetCurrency",
          fiscal_year as "fiscalYear",
          is_active as "isActive",
          created_at as "createdAt"
      `, [
        organizationId,
        code,
        name,
        description || null,
        departmentId || null,
        budgetAmount || null,
        budgetCurrency || 'USD',
        fiscalYear || null,
        userId
      ]);

      logger.info('Cost center created', {
        costCenterId: result.rows[0].id,
        code,
        createdBy: userId
      });

      res.status(201).json({
        success: true,
        message: 'Cost center created successfully',
        data: result.rows[0]
      });
    } catch (error: any) {
      logger.error('Failed to create cost center', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create cost center'
      });
    }
  }
);

/**
 * PUT /api/cost-centers/:id
 * Update a cost center
 */
router.put('/:id',
  authenticateToken,
  [
    body('code').optional().trim().notEmpty(),
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('departmentId').optional().isUUID(),
    body('budgetAmount').optional().isDecimal(),
    body('budgetCurrency').optional().isLength({ min: 3, max: 3 }),
    body('fiscalYear').optional().isInt({ min: 2000, max: 2100 }),
    body('isActive').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    try {
      const { id } = req.params;
      const organizationId = req.user?.organizationId;
      const {
        code,
        name,
        description,
        departmentId,
        budgetAmount,
        budgetCurrency,
        fiscalYear,
        isActive
      } = req.body;

      // Check if cost center exists
      const existing = await db.query(
        'SELECT id FROM cost_centers WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Cost center not found'
        });
      }

      const result = await db.query(`
        UPDATE cost_centers SET
          code = COALESCE($1, code),
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          department_id = COALESCE($4, department_id),
          budget_amount = COALESCE($5, budget_amount),
          budget_currency = COALESCE($6, budget_currency),
          fiscal_year = COALESCE($7, fiscal_year),
          is_active = COALESCE($8, is_active),
          updated_at = NOW()
        WHERE id = $9 AND organization_id = $10
        RETURNING
          id,
          code,
          name,
          description,
          department_id as "departmentId",
          budget_amount as "budgetAmount",
          budget_currency as "budgetCurrency",
          fiscal_year as "fiscalYear",
          is_active as "isActive",
          updated_at as "updatedAt"
      `, [
        code,
        name,
        description,
        departmentId,
        budgetAmount,
        budgetCurrency,
        fiscalYear,
        isActive,
        id,
        organizationId
      ]);

      logger.info('Cost center updated', {
        costCenterId: id,
        updatedBy: req.user?.userId
      });

      res.json({
        success: true,
        message: 'Cost center updated successfully',
        data: result.rows[0]
      });
    } catch (error: any) {
      logger.error('Failed to update cost center', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to update cost center'
      });
    }
  }
);

/**
 * DELETE /api/cost-centers/:id
 * Delete a cost center (only if no users assigned)
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    // Check if cost center exists
    const ccResult = await db.query(
      'SELECT id, code, name FROM cost_centers WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (ccResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cost center not found'
      });
    }

    // Check if any users are assigned
    const userCount = await db.query(
      'SELECT COUNT(*) as count FROM organization_users WHERE cost_center_id = $1',
      [id]
    );

    if (parseInt(userCount.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete cost center with assigned users. Please reassign users first.'
      });
    }

    await db.query(
      'DELETE FROM cost_centers WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    logger.info('Cost center deleted', {
      costCenterId: id,
      costCenterCode: ccResult.rows[0].code,
      deletedBy: req.user?.userId
    });

    res.json({
      success: true,
      message: 'Cost center deleted successfully'
    });
  } catch (error: any) {
    logger.error('Failed to delete cost center', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete cost center'
    });
  }
});

/**
 * GET /api/cost-centers/:id/users
 * Get users assigned to a cost center
 */
router.get('/:id/users', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const result = await db.query(`
      SELECT
        u.id,
        u.email,
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.job_title as "jobTitle",
        u.department,
        u.status
      FROM organization_users u
      WHERE u.cost_center_id = $1 AND u.organization_id = $2
      ORDER BY u.last_name, u.first_name
    `, [id, organizationId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    logger.error('Failed to fetch cost center users', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cost center users'
    });
  }
});

export default router;
