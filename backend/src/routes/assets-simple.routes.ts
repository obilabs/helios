/**
 * Simplified Assets Routes - MinIO Only
 *
 * All assets are stored in MinIO and publicly accessible.
 * - Shared: Organization-wide assets (logos, banners)
 * - Personal: User-owned assets (badges, certifications)
 *
 * Assets can be tagged for dynamic references in templates.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { s3Service } from '../services/s3.service.js';
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse,
  paginatedResponse,
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';
import crypto from 'crypto';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// All routes require authentication
router.use(authenticateToken);

// Helper to get organization ID
function getOrganizationId(req: Request): string {
  return req.user?.organizationId || '';
}

// Helper to get user ID
function getUserId(req: Request): string {
  return req.user?.userId || '';
}

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Helper to ensure unique slug
async function ensureUniqueSlug(organizationId: string, baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query = excludeId
      ? 'SELECT id FROM media_assets WHERE organization_id = $1 AND slug = $2 AND id != $3'
      : 'SELECT id FROM media_assets WHERE organization_id = $1 AND slug = $2';
    const params = excludeId ? [organizationId, slug, excludeId] : [organizationId, slug];
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return slug;
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

/**
 * GET /assets
 * List assets with filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const { scope, tag, search, limit = '50', offset = '0' } = req.query;

    let query = `
      SELECT
        id, organization_id as "organizationId", storage_type as "storageType",
        storage_path as "storagePath", name, filename, mime_type as "mimeType",
        size_bytes as "sizeBytes", category, access_token as "accessToken",
        slug, scope, tags, access_count as "accessCount",
        last_accessed_at as "lastAccessedAt", created_by as "createdBy",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM media_assets
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    // Filter by scope
    if (scope === 'shared') {
      query += ` AND scope = 'shared'`;
    } else if (scope === 'personal') {
      query += ` AND scope = 'personal' AND created_by = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    // Filter by tag
    if (tag) {
      query += ` AND $${paramIndex} = ANY(tags)`;
      params.push(tag);
      paramIndex++;
    }

    // Search by name
    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR filename ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Add ordering and pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM media_assets WHERE organization_id = $1`;
    const countParams: any[] = [organizationId];
    if (scope === 'shared') {
      countQuery += ` AND scope = 'shared'`;
    } else if (scope === 'personal') {
      countQuery += ` AND scope = 'personal' AND created_by = $2`;
      countParams.push(userId);
    }
    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // Add public URL to each asset
    const assets = result.rows.map((asset: any) => ({
      ...asset,
      publicUrl: asset.slug
        ? `/public/${asset.slug}`
        : `/api/v1/assets/${asset.accessToken}/file`,
    }));

    paginatedResponse(
      res,
      assets,
      total,
      parseInt(limit as string),
      parseInt(offset as string)
    );
  } catch (error: any) {
    logger.error('Failed to list assets', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list assets');
  }
});

/**
 * POST /assets/upload
 * Upload a new asset
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const file = req.file;

    if (!file) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'No file provided');
    }

    const { name, scope = 'shared', tags = '' } = req.body;
    const assetName = name || file.originalname.replace(/\.[^/.]+$/, '');

    // Generate slug
    const baseSlug = generateSlug(assetName);
    const slug = await ensureUniqueSlug(organizationId, baseSlug);

    // Parse tags (comma-separated string to array)
    const tagArray = tags ? tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];

    // Upload to MinIO (always public bucket since all assets are publicly accessible)
    const uploadResult = await s3Service.uploadFile(
      file.buffer,
      {
        organizationId,
        userId,
        category: 'public',
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
      true // isPublic = true
    );

    if (!uploadResult.success || !uploadResult.key) {
      return errorResponse(res, ErrorCode.INTERNAL_ERROR, uploadResult.error || 'Failed to upload file');
    }

    // Generate access token
    const accessToken = crypto.randomBytes(32).toString('hex');

    // Insert into database
    const insertResult = await db.query(`
      INSERT INTO media_assets (
        organization_id, storage_type, storage_path, name, filename,
        mime_type, size_bytes, category, access_token, slug, scope, tags, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      organizationId,
      'minio',
      uploadResult.key,
      assetName,
      file.originalname,
      file.mimetype,
      file.size,
      'public',
      accessToken,
      slug,
      scope,
      tagArray,
      userId,
    ]);

    const asset = insertResult.rows[0];

    logger.info('Asset uploaded', { organizationId, assetId: asset.id, slug });

    createdResponse(res, {
      id: asset.id,
      name: asset.name,
      filename: asset.filename,
      slug: asset.slug,
      scope: asset.scope,
      tags: asset.tags,
      mimeType: asset.mime_type,
      sizeBytes: asset.size_bytes,
      publicUrl: `/public/${slug}`,
      createdAt: asset.created_at,
    });
  } catch (error: any) {
    logger.error('Failed to upload asset', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to upload asset');
  }
});

/**
 * GET /assets/:id
 * Get asset details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const result = await db.query(`
      SELECT
        id, organization_id as "organizationId", storage_type as "storageType",
        storage_path as "storagePath", name, filename, mime_type as "mimeType",
        size_bytes as "sizeBytes", category, access_token as "accessToken",
        slug, scope, tags, access_count as "accessCount",
        last_accessed_at as "lastAccessedAt", created_by as "createdBy",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM media_assets
      WHERE id = $1 AND organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return notFoundResponse(res, 'Asset not found');
    }

    const asset = result.rows[0];
    successResponse(res, {
      ...asset,
      publicUrl: asset.slug ? `/public/${asset.slug}` : `/api/v1/assets/${asset.accessToken}/file`,
    });
  } catch (error: any) {
    logger.error('Failed to get asset', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get asset');
  }
});

/**
 * PUT /assets/:id
 * Update asset (name, tags, scope)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const { id } = req.params;
    const { name, tags, scope } = req.body;

    // Check asset exists and user has permission
    const checkResult = await db.query(`
      SELECT id, scope, created_by, slug FROM media_assets
      WHERE id = $1 AND organization_id = $2
    `, [id, organizationId]);

    if (checkResult.rows.length === 0) {
      return notFoundResponse(res, 'Asset not found');
    }

    const asset = checkResult.rows[0];

    // Personal assets can only be edited by owner
    if (asset.scope === 'personal' && asset.created_by !== userId) {
      return errorResponse(res, ErrorCode.FORBIDDEN, 'Cannot edit another user\'s personal asset');
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;

      // Update slug if name changed
      const baseSlug = generateSlug(name);
      const newSlug = await ensureUniqueSlug(organizationId, baseSlug, id);
      updates.push(`slug = $${paramIndex}`);
      params.push(newSlug);
      paramIndex++;
    }

    if (tags !== undefined) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean);
      updates.push(`tags = $${paramIndex}`);
      params.push(tagArray);
      paramIndex++;
    }

    if (scope !== undefined && ['shared', 'personal'].includes(scope)) {
      updates.push(`scope = $${paramIndex}`);
      params.push(scope);
      paramIndex++;
    }

    if (updates.length === 0) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'No updates provided');
    }

    updates.push(`updated_at = NOW()`);
    params.push(id, organizationId);

    const updateQuery = `
      UPDATE media_assets SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await db.query(updateQuery, params);
    const updated = result.rows[0];

    successResponse(res, {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      scope: updated.scope,
      tags: updated.tags,
      publicUrl: `/public/${updated.slug}`,
    });
  } catch (error: any) {
    logger.error('Failed to update asset', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update asset');
  }
});

/**
 * DELETE /assets/:id
 * Delete an asset
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    // Check asset exists and user has permission
    const checkResult = await db.query(`
      SELECT id, scope, created_by, storage_path FROM media_assets
      WHERE id = $1 AND organization_id = $2
    `, [id, organizationId]);

    if (checkResult.rows.length === 0) {
      return notFoundResponse(res, 'Asset not found');
    }

    const asset = checkResult.rows[0];

    // Personal assets can only be deleted by owner
    if (asset.scope === 'personal' && asset.created_by !== userId) {
      return errorResponse(res, ErrorCode.FORBIDDEN, 'Cannot delete another user\'s personal asset');
    }

    // Delete from MinIO
    await s3Service.deleteFile(asset.storage_path, true);

    // Delete from database
    await db.query('DELETE FROM media_assets WHERE id = $1', [id]);

    logger.info('Asset deleted', { organizationId, assetId: id });
    successResponse(res, { message: 'Asset deleted' });
  } catch (error: any) {
    logger.error('Failed to delete asset', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to delete asset');
  }
});

/**
 * GET /assets/tags/list
 * Get all unique tags used in the organization
 */
router.get('/tags/list', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const result = await db.query(`
      SELECT DISTINCT unnest(tags) as tag
      FROM media_assets
      WHERE organization_id = $1 AND array_length(tags, 1) > 0
      ORDER BY tag
    `, [organizationId]);

    successResponse(res, result.rows.map((r: { tag: string }) => r.tag));
  } catch (error: any) {
    logger.error('Failed to list tags', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list tags');
  }
});

/**
 * GET /assets/user/:userId/tagged/:tag
 * Get a user's asset by tag (for template rendering)
 */
router.get('/user/:userId/tagged/:tag', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { userId, tag } = req.params;

    const result = await db.query(`
      SELECT slug, storage_path, mime_type as "mimeType"
      FROM media_assets
      WHERE organization_id = $1
        AND created_by = $2
        AND scope = 'personal'
        AND $3 = ANY(tags)
      ORDER BY created_at DESC
      LIMIT 1
    `, [organizationId, userId, tag.toLowerCase()]);

    if (result.rows.length === 0) {
      return notFoundResponse(res, 'No asset found with that tag');
    }

    const asset = result.rows[0];
    successResponse(res, {
      url: `/public/${asset.slug}`,
      mimeType: asset.mimeType,
    });
  } catch (error: any) {
    logger.error('Failed to get user tagged asset', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get asset');
  }
});

export default router;
