import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { featureFlagsService, FeatureFlag, FeatureFlagError } from '../services/feature-flags.service.js';
import { successResponse, errorResponse, notFoundResponse, validationErrorResponse } from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';
import { logger } from '../utils/logger.js';

const router = Router();

/** Registry/profile violations are the caller's mistake, not a server error. */
function flagErrorResponse(res: Response, error: FeatureFlagError): Response {
  return error.code === 'unknown_flag'
    ? notFoundResponse(res, 'Feature flag')
    : errorResponse(res, ErrorCode.CONFLICT, error.message);
}

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
 * /organization/feature-flags/profile:
 *   get:
 *     summary: Get the active feature profile
 *     description: |
 *       Returns the release profile (`release` or `development`) this server runs
 *       with, set by HELIOS_FEATURE_PROFILE. See docs/RELEASING.md.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Active profile
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/profile', requireAuth, async (_req: Request, res: Response) => {
  return successResponse(res, { profile: featureFlagsService.profile });
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
    if (error instanceof FeatureFlagError) return flagErrorResponse(res, error);
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

    logger.info('Feature flag updated', {
      key,
      is_enabled,
      userId: req.user?.userId
    });

    return successResponse(res, flag);
  } catch (error) {
    if (error instanceof FeatureFlagError) return flagErrorResponse(res, error);
    logger.error('Error updating feature flag', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update feature flag');
  }
});

/**
 * @openapi
 * /organization/feature-flags/{key}:
 *   delete:
 *     summary: Reset a feature flag to its default
 *     description: |
 *       Removes the organization's override so the registry default for the
 *       active profile applies again. Flags themselves are defined in code
 *       (backend/src/config/feature-registry.ts) and cannot be created or
 *       deleted through the API. Admin only.
 *     tags: [Feature Flags]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Feature flag key to reset
 *     responses:
 *       200:
 *         description: Override removed; returns the resolved flag
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
    const flag = await featureFlagsService.clearOverride(key);

    if (!flag) {
      return notFoundResponse(res, 'Feature flag');
    }

    logger.info('Feature flag override cleared', {
      key,
      userId: req.user?.userId
    });

    return successResponse(res, flag);
  } catch (error) {
    logger.error('Error resetting feature flag', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to reset feature flag');
  }
});

export default router;
