import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { generateApiKey } from '../utils/apiKey.js';
import { db } from '../database/connection.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * SECURITY: API key management is an administrative capability.
 *
 * Previously this router required only authentication, so ANY authenticated
 * user could mint a key with an arbitrary `permissions` array taken straight
 * from the request body. Combined with the transparent proxies — which used to
 * hardcode `isAdmin: true` for any valid API key — that was a direct
 * privilege-escalation path from "logged-in user" to arbitrary domain-wide
 * delegation calls against the customer's Google Workspace and Microsoft tenant.
 *
 * Issuing, renewing, modifying and revoking credentials is admin-only. Do not
 * relax this to plain `authenticateToken` without a capability model that
 * constrains which permissions a non-admin may grant.
 */
router.use(requireAdmin);

/**
 * @openapi
 * /api/v1/organization/api-keys:
 *   post:
 *     summary: Create a new API key
 *     description: |
 *       Create a new API key for service-to-service integration or vendor access.
 *       The full key is only returned once - save it securely.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, permissions]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "My Service Key"
 *               description:
 *                 type: string
 *                 example: "Key for syncing users"
 *               type:
 *                 type: string
 *                 enum: [service, vendor]
 *                 example: service
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["read:users", "write:users"]
 *               expiresInDays:
 *                 type: integer
 *                 example: 90
 *               ipWhitelist:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["192.168.1.1", "10.0.0.0/24"]
 *     responses:
 *       201:
 *         description: API key created successfully
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
 *                   properties:
 *                     key:
 *                       type: string
 *                       description: Full API key (only shown once)
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     type:
 *                       type: string
 *                     keyPrefix:
 *                       type: string
 *                       description: Key prefix for identification
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      description,
      type,
      permissions,
      expiresInDays,
      serviceConfig,
      vendorConfig,
      ipWhitelist,
      rateLimitConfig,
    } = req.body;

    // Validate required fields
    if (!name || !type) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Name and type are required',
      });
      return;
    }

    // Validate type
    if (type !== 'service' && type !== 'vendor') {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Type must be "service" or "vendor"',
      });
      return;
    }

    // Validate permissions array
    if (!permissions || !Array.isArray(permissions)) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Permissions must be an array',
      });
      return;
    }

    // For vendor keys, ensure vendorConfig is provided
    if (type === 'vendor' && !vendorConfig) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Vendor configuration is required for vendor keys',
      });
      return;
    }

    // Get organization ID from authenticated user
    const organizationId = req.user?.organizationId;
    const createdBy = req.user?.userId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Authentication error',
        message: 'Organization ID not found',
      });
      return;
    }

    // Generate API key
    const { key, hash, prefix } = generateApiKey();

    // Calculate expiration date
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Insert into database
    const result = await db.query(
      `INSERT INTO api_keys (
        organization_id,
        name,
        description,
        type,
        key_hash,
        key_prefix,
        permissions,
        expires_at,
        created_by,
        service_config,
        vendor_config,
        ip_whitelist,
        rate_limit_config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, name, type, key_prefix, created_at, expires_at`,
      [
        organizationId,
        name,
        description,
        type,
        hash,
        prefix,
        JSON.stringify(permissions),
        expiresAt,
        createdBy,
        serviceConfig ? JSON.stringify(serviceConfig) : null,
        vendorConfig ? JSON.stringify(vendorConfig) : null,
        ipWhitelist ? JSON.stringify(ipWhitelist) : null,
        rateLimitConfig ? JSON.stringify(rateLimitConfig) : null,
      ]
    );

    const createdKey = result.rows[0];

    logger.info('API key created', {
      keyId: createdKey.id,
      keyName: name,
      type,
      organizationId,
      createdBy,
    });

    // Return the key (ONLY ONCE!)
    res.status(201).json({
      success: true,
      data: {
        // Full key - shown only once!
        key,
        // Metadata
        id: createdKey.id,
        name: createdKey.name,
        type: createdKey.type,
        keyPrefix: createdKey.key_prefix,
        createdAt: createdKey.created_at,
        expiresAt: createdKey.expires_at,
      },
      message: 'API key created successfully. Save it securely - it will not be shown again.',
    });
  } catch (error: any) {
    logger.error('Failed to create API key', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to create API key',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/api-keys:
 *   get:
 *     summary: List API keys
 *     description: Get all API keys for the organization with optional filters.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, expired, revoked]
 *         description: Filter by key status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [service, vendor]
 *         description: Filter by key type
 *     responses:
 *       200:
 *         description: List of API keys
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
 *                     $ref: '#/components/schemas/ApiKey'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Authentication error',
        message: 'Organization ID not found',
      });
      return;
    }

    // Optional filters
    const { status, type } = req.query;

    let query = `
      SELECT
        id,
        name,
        description,
        type,
        key_prefix,
        permissions,
        created_at,
        expires_at,
        is_active,
        last_used_at,
        vendor_config,
        service_config
      FROM api_keys
      WHERE organization_id = $1
    `;

    const params: any[] = [organizationId];

    // Filter by status
    if (status === 'active') {
      query += ' AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())';
    } else if (status === 'expired') {
      query += ' AND expires_at IS NOT NULL AND expires_at <= NOW()';
    } else if (status === 'revoked') {
      query += ' AND is_active = false';
    }

    // Filter by type
    if (type === 'service' || type === 'vendor') {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);

    // Calculate status for each key
    const keys = result.rows.map((key: any) => {
      let status = 'active';
      if (!key.is_active) {
        status = 'revoked';
      } else if (key.expires_at && new Date(key.expires_at) <= new Date()) {
        status = 'expired';
      } else if (key.expires_at) {
        const daysUntilExpiry = Math.floor(
          (new Date(key.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilExpiry <= 14) {
          status = 'expiring_soon';
        }
      }

      return {
        id: key.id,
        name: key.name,
        description: key.description,
        type: key.type,
        keyPrefix: key.key_prefix,
        permissions: key.permissions,
        status,
        createdAt: key.created_at,
        expiresAt: key.expires_at,
        lastUsedAt: key.last_used_at,
        vendorConfig: key.vendor_config,
        serviceConfig: key.service_config,
      };
    });

    res.json({
      success: true,
      data: keys,
    });
  } catch (error: any) {
    logger.error('Failed to list API keys', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to list API keys',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/api-keys/{id}:
 *   get:
 *     summary: Get API key details
 *     description: Get detailed information about a specific API key.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ApiKey'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const result = await db.query(
      `SELECT
        id,
        organization_id,
        name,
        description,
        type,
        key_prefix,
        permissions,
        created_at,
        created_by,
        expires_at,
        is_active,
        last_used_at,
        vendor_config,
        service_config,
        ip_whitelist,
        rate_limit_config
      FROM api_keys
      WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
      });
      return;
    }

    const key = result.rows[0];

    // Calculate status
    let status = 'active';
    if (!key.is_active) {
      status = 'revoked';
    } else if (key.expires_at && new Date(key.expires_at) <= new Date()) {
      status = 'expired';
    }

    res.json({
      success: true,
      data: {
        id: key.id,
        name: key.name,
        description: key.description,
        type: key.type,
        keyPrefix: key.key_prefix,
        permissions: key.permissions,
        status,
        createdAt: key.created_at,
        createdBy: key.created_by,
        expiresAt: key.expires_at,
        lastUsedAt: key.last_used_at,
        vendorConfig: key.vendor_config,
        serviceConfig: key.service_config,
        ipWhitelist: key.ip_whitelist,
        rateLimitConfig: key.rate_limit_config,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get API key', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get API key',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/api-keys/{id}:
 *   patch:
 *     summary: Update API key
 *     description: Update API key settings such as permissions, expiration, or IP whitelist.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: API key ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               ipWhitelist:
 *                 type: array
 *                 items:
 *                   type: string
 *               rateLimitConfig:
 *                 type: object
 *     responses:
 *       200:
 *         description: API key updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const { permissions, expiresAt, ipWhitelist, rateLimitConfig } = req.body;

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      values.push(JSON.stringify(permissions));
    }

    if (expiresAt !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(expiresAt);
    }

    if (ipWhitelist !== undefined) {
      updates.push(`ip_whitelist = $${paramIndex++}`);
      values.push(JSON.stringify(ipWhitelist));
    }

    if (rateLimitConfig !== undefined) {
      updates.push(`rate_limit_config = $${paramIndex++}`);
      values.push(JSON.stringify(rateLimitConfig));
    }

    if (updates.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No updates provided',
      });
      return;
    }

    // Add WHERE clause parameters
    values.push(id, organizationId);

    const query = `
      UPDATE api_keys
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND organization_id = $${paramIndex++}
      RETURNING id, name, type, key_prefix
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
      });
      return;
    }

    logger.info('API key updated', {
      keyId: id,
      updates: Object.keys(req.body),
    });

    res.json({
      success: true,
      data: result.rows[0],
      message: 'API key updated successfully',
    });
  } catch (error: any) {
    logger.error('Failed to update API key', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update API key',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/api-keys/{id}:
 *   delete:
 *     summary: Revoke API key
 *     description: Revoke an API key. This is a soft delete - the key cannot be reactivated.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key revoked
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    const result = await db.query(
      `UPDATE api_keys
       SET is_active = false
       WHERE id = $1 AND organization_id = $2
       RETURNING id, name, type`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
      });
      return;
    }

    logger.info('API key revoked', {
      keyId: id,
      keyName: result.rows[0].name,
    });

    res.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error: any) {
    logger.error('Failed to revoke API key', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to revoke API key',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/api-keys/{id}/renew:
 *   post:
 *     summary: Renew API key
 *     description: |
 *       Renew an expired API key. This revokes the old key and creates a new one
 *       with the same configuration. The new key is only shown once.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: API key ID to renew
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expiresInDays:
 *                 type: integer
 *                 example: 90
 *     responses:
 *       201:
 *         description: New API key created
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
 *                     key:
 *                       type: string
 *                       description: New API key (only shown once)
 *                     id:
 *                       type: string
 *                       format: uuid
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:id/renew', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const { expiresInDays } = req.body;

    // Get existing key
    const existing = await db.query(
      `SELECT * FROM api_keys WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
      });
      return;
    }

    const oldKey = existing.rows[0];

    // Generate new key
    const { key, hash, prefix } = generateApiKey();

    // Calculate new expiration
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Revoke old key
      await db.query('UPDATE api_keys SET is_active = false WHERE id = $1', [id]);

      // Create new key with same config
      const result = await db.query(
        `INSERT INTO api_keys (
          organization_id,
          name,
          description,
          type,
          key_hash,
          key_prefix,
          permissions,
          expires_at,
          created_by,
          service_config,
          vendor_config,
          ip_whitelist,
          rate_limit_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, name, type, key_prefix, created_at, expires_at`,
        [
          organizationId,
          oldKey.name,
          oldKey.description,
          oldKey.type,
          hash,
          prefix,
          oldKey.permissions,
          expiresAt,
          req.user?.userId,
          oldKey.service_config,
          oldKey.vendor_config,
          oldKey.ip_whitelist,
          oldKey.rate_limit_config,
        ]
      );

      await db.query('COMMIT');

      const newKey = result.rows[0];

      logger.info('API key renewed', {
        oldKeyId: id,
        newKeyId: newKey.id,
        keyName: newKey.name,
      });

      // Return new key (ONLY ONCE!)
      res.status(201).json({
        success: true,
        data: {
          key, // Full key - shown only once!
          id: newKey.id,
          name: newKey.name,
          type: newKey.type,
          keyPrefix: newKey.key_prefix,
          createdAt: newKey.created_at,
          expiresAt: newKey.expires_at,
        },
        message: 'API key renewed successfully. Save it securely - it will not be shown again.',
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error: any) {
    logger.error('Failed to renew API key', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to renew API key',
      message: error.message,
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/api-keys/{id}/usage:
 *   get:
 *     summary: Get API key usage history
 *     description: Get usage logs for a specific API key.
 *     tags: [API Keys]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: API key ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of logs to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of logs to skip
 *     responses:
 *       200:
 *         description: Usage logs
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
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       action:
 *                         type: string
 *                       httpMethod:
 *                         type: string
 *                       httpPath:
 *                         type: string
 *                       httpStatus:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/usage', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;
    const { limit = 100, offset = 0 } = req.query;

    // Verify key belongs to organization
    const keyCheck = await db.query(
      'SELECT id FROM api_keys WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (keyCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
      });
      return;
    }

    // Get usage logs
    const result = await db.query(
      `SELECT
        id,
        timestamp,
        action,
        resource_type,
        resource_id,
        result,
        actor_type,
        actor_name,
        actor_email,
        client_reference,
        ip_address,
        user_agent,
        request_duration,
        http_method,
        http_path,
        http_status,
        error_message
      FROM api_key_usage_logs
      WHERE api_key_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    logger.error('Failed to get API key usage', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get API key usage',
      message: error.message,
    });
  }
});

export default router;
