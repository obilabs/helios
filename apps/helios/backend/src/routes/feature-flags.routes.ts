import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { featureFlagsService, FeatureFlag } from '../services/feature-flags.service.js';
import { successResponse, errorResponse, notFoundResponse, validationErrorResponse } from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * @openapi
 * /organization/feature-flags:
 *   get:
 *     summary: Get all feature flags
 *     description: |
 *       Returns a map of all feature flags and their enabled status.
 *       This is the main endpoint for the frontend to load feature flags.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Feature flags map
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: boolean
 *                   example:
 *                     "automation.workflows": false
 *                     "insights.reports": false
 *                     "integrations.google_workspace": true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const flags = await featureFlagsService.getAllFlagsMap();
    return successResponse(res, flags);
  } catch (error) {
    logger.error('Error fetching feature flags', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch feature flags');
  }
});

/**
 * @openapi
 * /organization/feature-flags/details:
 *   get:
 *     summary: Get all feature flags with details
 *     description: |
 *       Returns full details of all feature flags including name, description, category.
 *       This is for the admin UI to display and manage feature flags.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category (e.g., automation, insights, console)
 *     responses:
 *       200:
 *         description: List of feature flags with details
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
 *                     $ref: '#/components/schemas/FeatureFlag'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/details', requireAuth, async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    let flags: FeatureFlag[];
    if (category && typeof category === 'string') {
      flags = await featureFlagsService.getFlagsByCategory(category);
    } else {
      flags = await featureFlagsService.getAllFlags();
    }

    return successResponse(res, flags);
  } catch (error) {
    logger.error('Error fetching feature flags details', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch feature flags');
  }
});

/**
 * @openapi
 * /organization/feature-flags/categories:
 *   get:
 *     summary: Get all feature flag categories
 *     description: Returns list of all available feature flag categories.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of categories
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
 *                   example: ["automation", "console", "insights", "integrations", "navigation", "signatures", "users"]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/categories', requireAuth, async (req: Request, res: Response) => {
  try {
    const categories = await featureFlagsService.getCategories();
    return successResponse(res, categories);
  } catch (error) {
    logger.error('Error fetching feature flag categories', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch categories');
  }
});

/**
 * @openapi
 * /organization/feature-flags/bulk:
 *   put:
 *     summary: Bulk update feature flags
 *     description: Update multiple feature flags at once. Admin only.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - flags
 *             properties:
 *               flags:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     feature_key:
 *                       type: string
 *                     is_enabled:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Flags updated successfully
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
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.put('/bulk', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const { flags } = req.body;

    if (!Array.isArray(flags)) {
      return validationErrorResponse(res, [{ field: 'flags', message: 'Must be an array' }]);
    }

    // Validate each flag
    for (const flag of flags) {
      if (!flag.feature_key || typeof flag.is_enabled !== 'boolean') {
        return validationErrorResponse(res, [
          { field: 'flags', message: 'Each flag must have feature_key and is_enabled (boolean)' }
        ]);
      }
    }

    await featureFlagsService.setMultipleFlags(flags);

    logger.info('Feature flags bulk updated', {
      count: flags.length,
      userId: req.user?.userId
    });

    return successResponse(res, { message: `Updated ${flags.length} feature flags` });
  } catch (error) {
    logger.error('Error bulk updating feature flags', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update feature flags');
  }
});

/**
 * @openapi
 * /organization/feature-flags/{key}:
 *   get:
 *     summary: Get a single feature flag
 *     description: Returns details of a specific feature flag by its key.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Feature flag key (e.g., automation.workflows)
 *     responses:
 *       200:
 *         description: Feature flag details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FeatureFlag'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:key', requireAuth, async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const flag = await featureFlagsService.getFlag(key);

    if (!flag) {
      return notFoundResponse(res, 'Feature flag');
    }

    return successResponse(res, flag);
  } catch (error) {
    logger.error('Error fetching feature flag', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch feature flag');
  }
});

/**
 * @openapi
 * /organization/feature-flags/{key}:
 *   put:
 *     summary: Update a feature flag
 *     description: |
 *       Enable or disable a feature flag. Admin only.
 *       Changes take effect immediately (cache is invalidated).
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Feature flag key (e.g., automation.workflows)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_enabled
 *             properties:
 *               is_enabled:
 *                 type: boolean
 *                 description: Whether the feature should be enabled
 *     responses:
 *       200:
 *         description: Updated feature flag
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FeatureFlag'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:key', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { is_enabled } = req.body;

    if (typeof is_enabled !== 'boolean') {
      return validationErrorResponse(res, [{ field: 'is_enabled', message: 'Must be a boolean' }]);
    }

    const flag = await featureFlagsService.setFlag(key, is_enabled);

    if (!flag) {
      return notFoundResponse(res, 'Feature flag');
    }

    logger.info('Feature flag updated', {
      key,
      is_enabled,
      userId: req.user?.userId
    });

    return successResponse(res, flag);
  } catch (error) {
    logger.error('Error updating feature flag', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update feature flag');
  }
});

/**
 * @openapi
 * /organization/feature-flags:
 *   post:
 *     summary: Create a new feature flag
 *     description: Create a new feature flag. Admin only.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - feature_key
 *               - name
 *             properties:
 *               feature_key:
 *                 type: string
 *                 description: Unique key for the feature (e.g., myfeature.subfeature)
 *               name:
 *                 type: string
 *                 description: Human-readable name
 *               description:
 *                 type: string
 *                 description: Description of what the feature does
 *               is_enabled:
 *                 type: boolean
 *                 default: false
 *               category:
 *                 type: string
 *                 default: general
 *     responses:
 *       201:
 *         description: Feature flag created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FeatureFlag'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const { feature_key, name, description, is_enabled, category, metadata } = req.body;

    if (!feature_key || !name) {
      return validationErrorResponse(res, [
        { field: 'feature_key', message: 'Required' },
        { field: 'name', message: 'Required' }
      ]);
    }

    // Validate feature_key format (lowercase, dots and underscores allowed)
    if (!/^[a-z][a-z0-9_.]*$/.test(feature_key)) {
      return validationErrorResponse(res, [
        { field: 'feature_key', message: 'Must start with lowercase letter and contain only lowercase letters, numbers, dots, and underscores' }
      ]);
    }

    const flag = await featureFlagsService.createFlag({
      feature_key,
      name,
      description,
      is_enabled,
      category,
      metadata
    });

    logger.info('Feature flag created', {
      feature_key,
      userId: req.user?.userId
    });

    return res.status(201).json({
      success: true,
      data: flag
    });
  } catch (error: any) {
    if (error.code === '23505') { // unique_violation
      return validationErrorResponse(res, [
        { field: 'feature_key', message: 'A feature flag with this key already exists' }
      ]);
    }
    logger.error('Error creating feature flag', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to create feature flag');
  }
});

/**
 * @openapi
 * /organization/feature-flags/{key}:
 *   delete:
 *     summary: Delete a feature flag
 *     description: Delete a feature flag. Admin only. Use with caution.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Feature flag key to delete
 *     responses:
 *       200:
 *         description: Feature flag deleted
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
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:key', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const deleted = await featureFlagsService.deleteFlag(key);

    if (!deleted) {
      return notFoundResponse(res, 'Feature flag');
    }

    logger.info('Feature flag deleted', {
      key,
      userId: req.user?.userId
    });

    return successResponse(res, { message: 'Feature flag deleted' });
  } catch (error) {
    logger.error('Error deleting feature flag', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to delete feature flag');
  }
});

export default router;
