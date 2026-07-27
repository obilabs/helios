import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse,
  validationErrorResponse
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';

const router = Router();

/**
 * @openapi
 * /organization/job-titles:
 *   get:
 *     summary: List all job titles
 *     description: Get all job titles for the organization including user counts.
 *     tags: [Job Titles]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of job titles
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       departmentId:
 *                         type: string
 *                         format: uuid
 *                       departmentName:
 *                         type: string
 *                       userCount:
 *                         type: integer
 *                       isActive:
 *                         type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
    }

    // Check if job_titles table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'job_titles'
      ) as exists
    `);

    if (!tableCheck.rows[0]?.exists) {
      // Table doesn't exist yet - return empty array
      logger.debug('job_titles table does not exist yet');
      return successResponse(res, []);
    }

    const result = await db.query(`
      SELECT
        jt.id,
        jt.name,
        jt.description,
        jt.department_id as "departmentId",
        jt.is_active as "isActive",
        jt.created_at as "createdAt",
        jt.updated_at as "updatedAt",
        d.name as "departmentName",
        (SELECT COUNT(*) FROM organization_users WHERE LOWER(job_title) = LOWER(jt.name) AND organization_id = $1) as "userCount"
      FROM job_titles jt
      LEFT JOIN departments d ON jt.department_id = d.id
      WHERE jt.organization_id = $1
      ORDER BY jt.name
    `, [organizationId]);

    successResponse(res, result.rows);
  } catch (error: any) {
    logger.error('Failed to fetch job titles', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch job titles');
  }
});

/**
 * @openapi
 * /organization/job-titles/{id}:
 *   get:
 *     summary: Get a job title
 *     description: Get details of a specific job title including user count.
 *     tags: [Job Titles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job Title ID
 *     responses:
 *       200:
 *         description: Job title details
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const result = await db.query(`
      SELECT
        jt.id,
        jt.name,
        jt.description,
        jt.department_id as "departmentId",
        jt.is_active as "isActive",
        jt.created_at as "createdAt",
        jt.updated_at as "updatedAt",
        d.name as "departmentName",
        (SELECT COUNT(*) FROM organization_users WHERE LOWER(job_title) = LOWER(jt.name) AND organization_id = $2) as "userCount"
      FROM job_titles jt
      LEFT JOIN departments d ON jt.department_id = d.id
      WHERE jt.id = $1 AND jt.organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return notFoundResponse(res, 'Job Title');
    }

    successResponse(res, result.rows[0]);
  } catch (error: any) {
    logger.error('Failed to fetch job title', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch job title');
  }
});

/**
 * @openapi
 * /organization/job-titles:
 *   post:
 *     summary: Create a job title
 *     description: Create a new job title in the organization.
 *     tags: [Job Titles]
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
 *                 description: Job title name
 *                 example: Software Engineer
 *               description:
 *                 type: string
 *               departmentId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional department association
 *     responses:
 *       201:
 *         description: Job title created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: Job title name already exists
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/',
  authenticateToken,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('description').optional().trim(),
    body('departmentId').optional().isUUID(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array().map(e => ({ field: (e as any).path, message: e.msg })));
    }

    try {
      const organizationId = req.user?.organizationId;
      const userId = req.user?.userId;
      const { name, description, departmentId } = req.body;

      // Check if job title name already exists
      const existing = await db.query(
        'SELECT id FROM job_titles WHERE organization_id = $1 AND LOWER(name) = LOWER($2)',
        [organizationId, name]
      );

      if (existing.rows.length > 0) {
        return errorResponse(res, ErrorCode.CONFLICT, 'Job title with this name already exists');
      }

      const result = await db.query(`
        INSERT INTO job_titles (
          organization_id,
          name,
          description,
          department_id,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          name,
          description,
          department_id as "departmentId",
          is_active as "isActive",
          created_at as "createdAt"
      `, [
        organizationId,
        name,
        description || null,
        departmentId || null,
        userId
      ]);

      logger.info('Job title created', {
        jobTitleId: result.rows[0].id,
        name,
        createdBy: userId
      });

      createdResponse(res, result.rows[0]);
    } catch (error: any) {
      logger.error('Failed to create job title', { error: error.message });
      errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to create job title');
    }
  }
);

/**
 * @openapi
 * /organization/job-titles/{id}:
 *   put:
 *     summary: Update a job title
 *     description: Update an existing job title.
 *     tags: [Job Titles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job Title ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               departmentId:
 *                 type: string
 *                 format: uuid
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Job title updated
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.put('/:id',
  authenticateToken,
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('departmentId').optional().isUUID(),
    body('isActive').optional().isBoolean(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array().map(e => ({ field: (e as any).path, message: e.msg })));
    }

    try {
      const { id } = req.params;
      const organizationId = req.user?.organizationId;
      const { name, description, departmentId, isActive } = req.body;

      // Check if job title exists
      const existing = await db.query(
        'SELECT id FROM job_titles WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
      );

      if (existing.rows.length === 0) {
        return notFoundResponse(res, 'Job Title');
      }

      const result = await db.query(`
        UPDATE job_titles SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          department_id = COALESCE($3, department_id),
          is_active = COALESCE($4, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND organization_id = $6
        RETURNING
          id,
          name,
          description,
          department_id as "departmentId",
          is_active as "isActive",
          updated_at as "updatedAt"
      `, [
        name,
        description,
        departmentId,
        isActive,
        id,
        organizationId
      ]);

      logger.info('Job title updated', {
        jobTitleId: id,
        updatedBy: req.user?.userId
      });

      successResponse(res, result.rows[0]);
    } catch (error: any) {
      logger.error('Failed to update job title', { error: error.message });
      errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update job title');
    }
  }
);

/**
 * @openapi
 * /organization/job-titles/{id}:
 *   delete:
 *     summary: Delete a job title
 *     description: |
 *       Delete a job title. This does not affect users who have this job title.
 *       Users will retain their job title text value.
 *     tags: [Job Titles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Job Title ID
 *     responses:
 *       200:
 *         description: Job title deleted
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    // Check if job title exists
    const jtResult = await db.query(
      'SELECT id, name FROM job_titles WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (jtResult.rows.length === 0) {
      return notFoundResponse(res, 'Job Title');
    }

    await db.query(
      'DELETE FROM job_titles WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    logger.info('Job title deleted', {
      jobTitleId: id,
      jobTitleName: jtResult.rows[0].name,
      deletedBy: req.user?.userId
    });

    successResponse(res, { message: 'Job title deleted successfully' });
  } catch (error: any) {
    logger.error('Failed to delete job title', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to delete job title');
  }
});

export default router;
