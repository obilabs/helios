import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { dataQualityService } from '../services/data-quality.service.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Data Quality
 *     description: Data quality monitoring and orphan value resolution
 */

/**
 * @openapi
 * /api/v1/organization/data-quality/orphans:
 *   get:
 *     summary: Get all orphaned values
 *     description: Get all orphaned values (combined from departments, locations, cost centers).
 *     tags: [Data Quality]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of orphaned values
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/orphans', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const [deptQuality, locQuality, ccQuality] = await Promise.all([
      dataQualityService.getDepartmentQuality(organizationId),
      dataQualityService.getLocationQuality(organizationId),
      dataQualityService.getCostCenterQuality(organizationId)
    ]);

    // Combine all orphaned values with field indicator
    const orphans = [
      ...deptQuality.orphaned.map(o => ({ ...o, field: 'department' })),
      ...locQuality.orphaned.map(o => ({ ...o, field: 'location' })),
      ...ccQuality.orphaned.map(o => ({ ...o, field: 'cost_center' }))
    ];

    res.json({
      success: true,
      data: orphans
    });
  } catch (error: any) {
    logger.error('Failed to fetch orphaned values', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orphaned values'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/data-quality/report:
 *   get:
 *     summary: Get data quality report
 *     description: Get comprehensive data quality report.
 *     tags: [Data Quality]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Data quality report
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/report', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const report = await dataQualityService.getDataQualityReport(organizationId);

    res.json({
      success: true,
      data: report
    });
  } catch (error: any) {
    logger.error('Failed to fetch data quality report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch data quality report'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/data-quality/departments:
 *   get:
 *     summary: Get department data quality
 *     description: Get department-specific data quality metrics.
 *     tags: [Data Quality]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Department quality metrics
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/departments', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const quality = await dataQualityService.getDepartmentQuality(organizationId);

    res.json({
      success: true,
      data: quality
    });
  } catch (error: any) {
    logger.error('Failed to fetch department quality', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch department quality'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/data-quality/locations:
 *   get:
 *     summary: Get location data quality
 *     description: Get location-specific data quality metrics.
 *     tags: [Data Quality]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Location quality metrics
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/locations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const quality = await dataQualityService.getLocationQuality(organizationId);

    res.json({
      success: true,
      data: quality
    });
  } catch (error: any) {
    logger.error('Failed to fetch location quality', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location quality'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/data-quality/cost-centers:
 *   get:
 *     summary: Get cost center data quality
 *     description: Get cost center-specific data quality metrics.
 *     tags: [Data Quality]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cost center quality metrics
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/cost-centers', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const quality = await dataQualityService.getCostCenterQuality(organizationId);

    res.json({
      success: true,
      data: quality
    });
  } catch (error: any) {
    logger.error('Failed to fetch cost center quality', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cost center quality'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/data-quality/managers:
 *   get:
 *     summary: Get manager relationship quality
 *     description: Get manager relationship data quality metrics.
 *     tags: [Data Quality]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Manager relationship quality metrics
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/managers', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const quality = await dataQualityService.getManagerQuality(organizationId);

    res.json({
      success: true,
      data: quality
    });
  } catch (error: any) {
    logger.error('Failed to fetch manager quality', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch manager quality'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/data-quality/resolve-orphan:
 *   post:
 *     summary: Resolve an orphaned value
 *     description: Resolve an orphaned value by mapping to master data or creating new entry.
 *     tags: [Data Quality]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - orphanedValue
 *               - resolution
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [department, location, cost_center]
 *               orphanedValue:
 *                 type: string
 *               resolution:
 *                 type: string
 *                 enum: [map, create, ignore]
 *               targetId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Orphan resolved
 *       400:
 *         description: Invalid request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/resolve-orphan',
  authenticateToken,
  [
    body('entityType').isIn(['department', 'location', 'cost_center']).withMessage('Invalid entity type'),
    body('orphanedValue').trim().notEmpty().withMessage('Orphaned value is required'),
    body('resolution').isIn(['map', 'create', 'ignore']).withMessage('Invalid resolution type'),
    body('targetId').optional().isUUID().withMessage('Target ID must be a valid UUID'),
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

      if (!organizationId) {
        return res.status(401).json({
          success: false,
          error: 'Organization ID not found'
        });
      }

      const { entityType, orphanedValue, resolution, targetId } = req.body;

      // Validate that targetId is provided when resolution is 'map'
      if (resolution === 'map' && !targetId) {
        return res.status(400).json({
          success: false,
          error: 'Target ID is required when mapping to existing entity'
        });
      }

      let result: { affected: number };

      switch (entityType) {
        case 'department':
          result = await dataQualityService.resolveOrphanedDepartment(
            organizationId,
            orphanedValue,
            resolution,
            targetId
          );
          break;
        case 'location':
          result = await dataQualityService.resolveOrphanedLocation(
            organizationId,
            orphanedValue,
            resolution,
            targetId
          );
          break;
        case 'cost_center':
          // TODO: Implement cost center resolution
          return res.status(501).json({
            success: false,
            error: 'Cost center resolution not yet implemented'
          });
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid entity type'
          });
      }

      res.json({
        success: true,
        message: `Successfully resolved orphan. ${result.affected} users updated.`,
        data: result
      });
    } catch (error: any) {
      logger.error('Failed to resolve orphan', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to resolve orphan'
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/organization/data-quality/auto-import:
 *   post:
 *     summary: Auto-import master data
 *     description: Auto-import unique values from user records into master data.
 *     tags: [Data Quality]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [departments, locations, cost_centers]
 *     responses:
 *       200:
 *         description: Data imported
 *       400:
 *         description: Invalid entity type
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/auto-import',
  authenticateToken,
  [
    body('entityType').isIn(['departments', 'locations', 'cost_centers']).withMessage('Invalid entity type'),
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

      if (!organizationId) {
        return res.status(401).json({
          success: false,
          error: 'Organization ID not found'
        });
      }

      const { entityType } = req.body;

      const result = await dataQualityService.autoImportMasterData(organizationId, entityType);

      res.json({
        success: true,
        message: `Successfully imported ${result.imported} ${entityType}`,
        data: result
      });
    } catch (error: any) {
      logger.error('Failed to auto-import master data', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to auto-import master data'
      });
    }
  }
);

export default router;
