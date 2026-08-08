import express from 'express';
import { requireAuth, requireEmployee } from '../middleware/auth.js';
import { peopleService } from '../services/people.service.js';
import { mediaUploadService } from '../services/media-upload.service.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * All people routes require employee access
 * External admins (MSPs, consultants) cannot access the people directory
 */
router.use(requireAuth);
router.use(requireEmployee);

/**
 * @openapi
 * /api/v1/people:
 *   get:
 *     summary: List people
 *     description: |
 *       List people in the organization directory with pagination and filtering.
 *       Only accessible by employees (not external admins).
 *     tags: [People Directory]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, department, startDate]
 *           default: name
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *       - in: query
 *         name: newJoinersOnly
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Only show new joiners (last 30 days)
 *     responses:
 *       200:
 *         description: List of people
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
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      search,
      department,
      location,
      limit = '20',
      offset = '0',
      sortBy = 'name',
      sortOrder = 'asc',
      newJoinersOnly = 'false',
      hasMedia = 'false',
    } = req.query;

    const result = await peopleService.listPeople({
      organizationId,
      search: search as string,
      department: department as string,
      location: location as string,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      sortBy: sortBy as 'name' | 'department' | 'startDate',
      sortOrder: sortOrder as 'asc' | 'desc',
      newJoinersOnly: newJoinersOnly === 'true',
      hasMedia: hasMedia === 'true',
    });

    res.json({
      success: true,
      data: result.people,
      pagination: {
        total: result.total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        hasMore: parseInt(offset as string, 10) + result.people.length < result.total,
      },
    });
  } catch (error: any) {
    logger.error('Error listing people:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/people/search:
 *   get:
 *     summary: Search people
 *     description: Search people by name, skills, or interests.
 *     tags: [People Directory]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query (min 2 characters)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of results
 *       - in: query
 *         name: fields
 *         schema:
 *           type: string
 *         description: Comma-separated search fields (name,skills,interests)
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/search', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { q, limit = '10', fields } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters',
      });
    }

    // Parse search fields
    let searchFields: ('name' | 'skills' | 'interests')[] = ['name', 'skills', 'interests'];
    if (fields && typeof fields === 'string') {
      searchFields = fields.split(',') as ('name' | 'skills' | 'interests')[];
    }

    const people = await peopleService.searchPeople(organizationId, q.trim(), {
      limit: parseInt(limit as string, 10),
      searchFields,
    });

    res.json({
      success: true,
      data: people,
    });
  } catch (error: any) {
    logger.error('Error searching people:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/people/new:
 *   get:
 *     summary: Get new joiners
 *     description: Get recently joined people (last 30 days).
 *     tags: [People Directory]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: New joiners
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/new', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { limit = '10' } = req.query;

    const people = await peopleService.getNewJoiners(
      organizationId,
      parseInt(limit as string, 10)
    );

    res.json({
      success: true,
      data: people,
    });
  } catch (error: any) {
    logger.error('Error getting new joiners:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/people/filters
 * Get available filter options (departments, locations)
 */
router.get('/filters', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const filters = await peopleService.getFilterOptions(organizationId);

    res.json({
      success: true,
      data: filters,
    });
  } catch (error: any) {
    logger.error('Error getting filter options:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/people/by-skill/:topic
 * Find people with specific expertise
 */
router.get('/by-skill/:topic', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { topic } = req.params;
    const { limit = '10' } = req.query;

    if (!topic || topic.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Topic must be at least 2 characters',
      });
    }

    const people = await peopleService.findByExpertise(
      organizationId,
      topic.trim(),
      parseInt(limit as string, 10)
    );

    res.json({
      success: true,
      data: people,
    });
  } catch (error: any) {
    logger.error('Error finding people by skill:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/people/:id
 * Get a single person's profile
 */
router.get('/:id', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const viewerId = req.user?.userId;

    if (!organizationId || !viewerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid person ID' });
    }

    const profile = await peopleService.getPersonProfile(id, viewerId, organizationId);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Person not found' });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    logger.error('Error getting person profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/people/:id/media/:type
 * Get a person's media (voice intro, video intro, name pronunciation)
 * Returns presigned URL for playback
 */
router.get('/:id/media/:type', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const viewerId = req.user?.userId;

    if (!organizationId || !viewerId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id, type } = req.params;

    // Validate media type
    const validTypes = ['voice_intro', 'video_intro', 'name_pronunciation'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid media type' });
    }

    // Get media with presigned URL
    const media = await mediaUploadService.getMedia(id, type as any);

    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    res.json({
      success: true,
      data: media,
    });
  } catch (error: any) {
    logger.error('Error getting person media:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
