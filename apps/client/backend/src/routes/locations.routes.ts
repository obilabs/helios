import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /api/v1/organization/locations:
 *   get:
 *     summary: List locations
 *     description: Get all locations for the organization.
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of locations
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
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [headquarters, office, remote, region, warehouse, datacenter]
 *                       city:
 *                         type: string
 *                       country:
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
        l.id,
        l.name,
        l.code,
        l.type,
        l.description,
        l.parent_id as "parentId",
        l.address_line1 as "addressLine1",
        l.address_line2 as "addressLine2",
        l.city,
        l.state_province as "stateProvince",
        l.postal_code as "postalCode",
        l.country,
        l.timezone,
        l.latitude,
        l.longitude,
        l.is_active as "isActive",
        l.created_at as "createdAt",
        l.updated_at as "updatedAt",
        parent.name as "parentName",
        (SELECT COUNT(*) FROM organization_users WHERE location_id = l.id) as "userCount"
      FROM locations l
      LEFT JOIN locations parent ON l.parent_id = parent.id
      WHERE l.organization_id = $1
      ORDER BY l.type = 'region' DESC, l.name
    `, [organizationId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    logger.error('Failed to fetch locations', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch locations'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/locations/tree:
 *   get:
 *     summary: Get location tree
 *     description: Get locations as a hierarchical tree structure.
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Location tree
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   description: Root locations with children
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/tree', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    const result = await db.query(`
      WITH RECURSIVE location_tree AS (
        -- Base case: root locations (no parent)
        SELECT
          l.id,
          l.name,
          l.code,
          l.type,
          l.description,
          l.parent_id,
          l.is_active,
          0 as depth,
          ARRAY[l.id] as path
        FROM locations l
        WHERE l.organization_id = $1 AND l.parent_id IS NULL

        UNION ALL

        -- Recursive case: children
        SELECT
          l.id,
          l.name,
          l.code,
          l.type,
          l.description,
          l.parent_id,
          l.is_active,
          lt.depth + 1,
          lt.path || l.id
        FROM locations l
        JOIN location_tree lt ON l.parent_id = lt.id
        WHERE l.organization_id = $1
      )
      SELECT
        lt.*,
        (SELECT COUNT(*) FROM organization_users WHERE location_id = lt.id) as "userCount"
      FROM location_tree lt
      ORDER BY path
    `, [organizationId]);

    // Build the tree structure
    const locations = result.rows;
    const locationMap = new Map();
    const roots: any[] = [];

    // First pass: create all nodes
    locations.forEach((loc: any) => {
      locationMap.set(loc.id, {
        id: loc.id,
        name: loc.name,
        code: loc.code,
        type: loc.type,
        description: loc.description,
        parentId: loc.parent_id,
        isActive: loc.is_active,
        userCount: parseInt(loc.userCount) || 0,
        depth: loc.depth,
        children: []
      });
    });

    // Second pass: build hierarchy
    locations.forEach((loc: any) => {
      const node = locationMap.get(loc.id);
      if (loc.parent_id) {
        const parent = locationMap.get(loc.parent_id);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    res.json({
      success: true,
      data: roots
    });
  } catch (error: any) {
    logger.error('Failed to fetch location tree', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location tree'
    });
  }
});

/**
 * GET /api/locations/:id
 * Get a specific location
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const result = await db.query(`
      SELECT
        l.id,
        l.name,
        l.code,
        l.type,
        l.description,
        l.parent_id as "parentId",
        l.address_line1 as "addressLine1",
        l.address_line2 as "addressLine2",
        l.city,
        l.state_province as "stateProvince",
        l.postal_code as "postalCode",
        l.country,
        l.timezone,
        l.latitude,
        l.longitude,
        l.is_active as "isActive",
        l.created_at as "createdAt",
        l.updated_at as "updatedAt",
        parent.name as "parentName",
        (SELECT COUNT(*) FROM organization_users WHERE location_id = l.id) as "userCount"
      FROM locations l
      LEFT JOIN locations parent ON l.parent_id = parent.id
      WHERE l.id = $1 AND l.organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    logger.error('Failed to fetch location', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/locations:
 *   post:
 *     summary: Create location
 *     description: Create a new location.
 *     tags: [Locations]
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
 *               code:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [headquarters, office, remote, region, warehouse, datacenter]
 *               description:
 *                 type: string
 *               parentId:
 *                 type: string
 *                 format: uuid
 *               addressLine1:
 *                 type: string
 *               city:
 *                 type: string
 *               country:
 *                 type: string
 *               timezone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Location created
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: Location name already exists
 */
router.post('/',
  authenticateToken,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('code').optional().trim(),
    body('type').optional().isIn(['headquarters', 'office', 'remote', 'region', 'warehouse', 'datacenter']),
    body('description').optional().trim(),
    body('parentId').optional().isUUID(),
    body('addressLine1').optional().trim(),
    body('addressLine2').optional().trim(),
    body('city').optional().trim(),
    body('stateProvince').optional().trim(),
    body('postalCode').optional().trim(),
    body('country').optional().trim(),
    body('timezone').optional().trim(),
    body('latitude').optional().isDecimal(),
    body('longitude').optional().isDecimal(),
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
        name,
        code,
        type,
        description,
        parentId,
        addressLine1,
        addressLine2,
        city,
        stateProvince,
        postalCode,
        country,
        timezone,
        latitude,
        longitude
      } = req.body;

      // Check if location name already exists at the same level
      const existing = await db.query(
        `SELECT id FROM locations
         WHERE organization_id = $1
         AND LOWER(name) = LOWER($2)
         AND (parent_id IS NOT DISTINCT FROM $3)`,
        [organizationId, name, parentId || null]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Location with this name already exists at this level'
        });
      }

      const result = await db.query(`
        INSERT INTO locations (
          organization_id,
          name,
          code,
          type,
          description,
          parent_id,
          address_line1,
          address_line2,
          city,
          state_province,
          postal_code,
          country,
          timezone,
          latitude,
          longitude,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING
          id,
          name,
          code,
          type,
          description,
          parent_id as "parentId",
          address_line1 as "addressLine1",
          address_line2 as "addressLine2",
          city,
          state_province as "stateProvince",
          postal_code as "postalCode",
          country,
          timezone,
          latitude,
          longitude,
          is_active as "isActive",
          created_at as "createdAt"
      `, [
        organizationId,
        name,
        code || null,
        type || 'office',
        description || null,
        parentId || null,
        addressLine1 || null,
        addressLine2 || null,
        city || null,
        stateProvince || null,
        postalCode || null,
        country || null,
        timezone || null,
        latitude || null,
        longitude || null,
        userId
      ]);

      logger.info('Location created', {
        locationId: result.rows[0].id,
        name,
        createdBy: userId
      });

      res.status(201).json({
        success: true,
        message: 'Location created successfully',
        data: result.rows[0]
      });
    } catch (error: any) {
      logger.error('Failed to create location', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create location'
      });
    }
  }
);

/**
 * PUT /api/locations/:id
 * Update a location
 */
router.put('/:id',
  authenticateToken,
  [
    body('name').optional().trim().notEmpty(),
    body('code').optional().trim(),
    body('type').optional().isIn(['headquarters', 'office', 'remote', 'region', 'warehouse', 'datacenter']),
    body('description').optional().trim(),
    body('parentId').optional().isUUID(),
    body('addressLine1').optional().trim(),
    body('addressLine2').optional().trim(),
    body('city').optional().trim(),
    body('stateProvince').optional().trim(),
    body('postalCode').optional().trim(),
    body('country').optional().trim(),
    body('timezone').optional().trim(),
    body('latitude').optional().isDecimal(),
    body('longitude').optional().isDecimal(),
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
        name,
        code,
        type,
        description,
        parentId,
        addressLine1,
        addressLine2,
        city,
        stateProvince,
        postalCode,
        country,
        timezone,
        latitude,
        longitude,
        isActive
      } = req.body;

      // Check if location exists
      const existing = await db.query(
        'SELECT id FROM locations WHERE id = $1 AND organization_id = $2',
        [id, organizationId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Location not found'
        });
      }

      // Prevent circular reference
      if (parentId === id) {
        return res.status(400).json({
          success: false,
          error: 'Location cannot be its own parent'
        });
      }

      const result = await db.query(`
        UPDATE locations SET
          name = COALESCE($1, name),
          code = COALESCE($2, code),
          type = COALESCE($3, type),
          description = COALESCE($4, description),
          parent_id = COALESCE($5, parent_id),
          address_line1 = COALESCE($6, address_line1),
          address_line2 = COALESCE($7, address_line2),
          city = COALESCE($8, city),
          state_province = COALESCE($9, state_province),
          postal_code = COALESCE($10, postal_code),
          country = COALESCE($11, country),
          timezone = COALESCE($12, timezone),
          latitude = COALESCE($13, latitude),
          longitude = COALESCE($14, longitude),
          is_active = COALESCE($15, is_active),
          updated_at = NOW()
        WHERE id = $16 AND organization_id = $17
        RETURNING
          id,
          name,
          code,
          type,
          description,
          parent_id as "parentId",
          address_line1 as "addressLine1",
          address_line2 as "addressLine2",
          city,
          state_province as "stateProvince",
          postal_code as "postalCode",
          country,
          timezone,
          latitude,
          longitude,
          is_active as "isActive",
          updated_at as "updatedAt"
      `, [
        name,
        code,
        type,
        description,
        parentId,
        addressLine1,
        addressLine2,
        city,
        stateProvince,
        postalCode,
        country,
        timezone,
        latitude,
        longitude,
        isActive,
        id,
        organizationId
      ]);

      logger.info('Location updated', {
        locationId: id,
        updatedBy: req.user?.userId
      });

      res.json({
        success: true,
        message: 'Location updated successfully',
        data: result.rows[0]
      });
    } catch (error: any) {
      logger.error('Failed to update location', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to update location'
      });
    }
  }
);

/**
 * DELETE /api/locations/:id
 * Delete a location (only if no users assigned)
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    // Check if location exists
    const locResult = await db.query(
      'SELECT id, name FROM locations WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (locResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    // Check if any users are assigned
    const userCount = await db.query(
      'SELECT COUNT(*) as count FROM organization_users WHERE location_id = $1',
      [id]
    );

    if (parseInt(userCount.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete location with assigned users. Please reassign users first.'
      });
    }

    // Check if any child locations exist
    const childCount = await db.query(
      'SELECT COUNT(*) as count FROM locations WHERE parent_id = $1',
      [id]
    );

    if (parseInt(childCount.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete location with child locations. Please delete or reassign child locations first.'
      });
    }

    await db.query(
      'DELETE FROM locations WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    logger.info('Location deleted', {
      locationId: id,
      locationName: locResult.rows[0].name,
      deletedBy: req.user?.userId
    });

    res.json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (error: any) {
    logger.error('Failed to delete location', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete location'
    });
  }
});

/**
 * GET /api/locations/:id/users
 * Get users assigned to a location
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
      WHERE u.location_id = $1 AND u.organization_id = $2
      ORDER BY u.last_name, u.first_name
    `, [id, organizationId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    logger.error('Failed to fetch location users', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch location users'
    });
  }
});

export default router;
