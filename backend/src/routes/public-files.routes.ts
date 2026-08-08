import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { db } from '../database/connection.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Public Files
 *     description: Public file/asset management for organization
 */

// =====================================================
// MULTER CONFIGURATION
// =====================================================

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const ensureUploadsDir = async (orgId: string) => {
  const orgDir = path.join(UPLOADS_DIR, orgId);
  await fs.mkdir(orgDir, { recursive: true });
  return orgDir;
};

// Storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return cb(new Error('Organization ID not found'), '');
      }
      const orgDir = await ensureUploadsDir(organizationId);
      cb(null, orgDir);
    } catch (error: any) {
      cb(error, '');
    }
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

// File filter - only images and common file types
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`));
  }
};

// Multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

// =====================================================
// ROUTES
// =====================================================

/**
 * @openapi
 * /api/v1/public-files/upload:
 *   post:
 *     summary: Upload public file
 *     description: Upload a new public file (admin only).
 *     tags: [Public Files]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               asset_key:
 *                 type: string
 *               asset_type:
 *                 type: string
 *               module_source:
 *                 type: string
 *               tags:
 *                 type: string
 *     responses:
 *       201:
 *         description: File uploaded
 *       400:
 *         description: No file or asset key exists
 */
router.post('/upload', requireAuth, requirePermission('admin'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const {
      asset_key,
      asset_type = 'image',
      module_source,
      tags,
    } = req.body;

    // Generate asset_key if not provided
    const finalAssetKey = asset_key || `asset_${uuidv4().substring(0, 8)}`;

    // Check if asset_key already exists
    const existingAsset = await db.query(
      `SELECT id FROM public_assets WHERE organization_id = $1 AND asset_key = $2`,
      [organizationId, finalAssetKey]
    );

    if (existingAsset.rows.length > 0) {
      // Delete uploaded file
      await fs.unlink(file.path);
      return res.status(400).json({
        success: false,
        error: 'Asset key already exists',
      });
    }

    // Process image metadata
    let width: number | null = null;
    let height: number | null = null;

    if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
      try {
        const metadata = await sharp(file.path).metadata();
        width = metadata.width || null;
        height = metadata.height || null;

        // Optional: Create thumbnail for large images
        if (width && height && (width > 1920 || height > 1080)) {
          await sharp(file.path)
            .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
            .toFile(file.path + '.optimized');

          // Replace original with optimized
          await fs.unlink(file.path);
          await fs.rename(file.path + '.optimized', file.path);

          // Update metadata
          const newMetadata = await sharp(file.path).metadata();
          width = newMetadata.width || null;
          height = newMetadata.height || null;
        }
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }

    // Generate public URL
    const publicUrl = `/uploads/${organizationId}/${file.filename}`;

    // Parse tags if provided
    let parsedTags = null;
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (error) {
        console.error('Error parsing tags:', error);
      }
    }

    // Insert into database
    const result = await db.query(
      `INSERT INTO public_assets (
        organization_id,
        asset_key,
        asset_type,
        module_source,
        file_name,
        original_file_name,
        file_path,
        public_url,
        mime_type,
        file_size_bytes,
        width,
        height,
        uploaded_by,
        tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        organizationId,
        finalAssetKey,
        asset_type,
        module_source || null,
        file.filename,
        file.originalname,
        file.path,
        publicUrl,
        file.mimetype,
        file.size,
        width,
        height,
        userId,
        parsedTags ? JSON.stringify(parsedTags) : null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Asset uploaded successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error uploading asset:', error);

    // Clean up file if error occurs
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload asset',
    });
  }
});

/**
 * @openapi
 * /api/v1/public-files:
 *   get:
 *     summary: List public files
 *     tags: [Public Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: asset_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: module_source
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of files
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const {
      asset_type,
      module_source,
      search,
      page = '1',
      per_page = '50',
    } = req.query;

    let query = `
      SELECT
        a.*,
        u.email as uploaded_by_email,
        u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM public_assets a
      LEFT JOIN organization_users u ON u.id = a.uploaded_by
      WHERE a.organization_id = $1
        AND a.is_active = true
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    // Filter by asset_type
    if (asset_type) {
      query += ` AND a.asset_type = $${paramIndex}`;
      params.push(asset_type);
      paramIndex++;
    }

    // Filter by module_source
    if (module_source) {
      query += ` AND a.module_source = $${paramIndex}`;
      params.push(module_source);
      paramIndex++;
    }

    // Search by file name
    if (search) {
      query += ` AND (a.file_name ILIKE $${paramIndex} OR a.original_file_name ILIKE $${paramIndex} OR a.asset_key ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await db.query(
      `SELECT COUNT(*) FROM (${query}) as count_query`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    const limit = parseInt(per_page as string);
    const offset = (parseInt(page as string) - 1) * limit;
    query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
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
    console.error('Error listing assets:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list assets',
    });
  }
});

/**
 * @openapi
 * /api/v1/public-files/{assetId}:
 *   get:
 *     summary: Get public file details
 *     description: Get details of a specific public file.
 *     tags: [Public Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: File details
 *       404:
 *         description: Asset not found
 */
router.get('/:assetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { assetId } = req.params;

    const result = await db.query(
      `SELECT
        a.*,
        u.email as uploaded_by_email,
        u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM public_assets a
      LEFT JOIN organization_users u ON u.id = a.uploaded_by
      WHERE a.id = $1 AND a.organization_id = $2`,
      [assetId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found',
      });
    }

    // Update last_accessed_at
    await db.query(
      `UPDATE public_assets SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [assetId]
    );

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error getting asset:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get asset',
    });
  }
});

/**
 * @openapi
 * /api/v1/public-files/{assetId}/usage:
 *   get:
 *     summary: Get file usage information
 *     description: Get usage statistics and references for a public file.
 *     tags: [Public Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Usage information
 *       404:
 *         description: Asset not found
 */
router.get('/:assetId/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { assetId } = req.params;

    // Verify asset belongs to organization
    const assetCheck = await db.query(
      `SELECT id, usage_count FROM public_assets WHERE id = $1 AND organization_id = $2`,
      [assetId, organizationId]
    );

    if (assetCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found',
      });
    }

    // Get usage details
    const usageResult = await db.query(
      `SELECT
        au.resource_type,
        au.resource_id,
        au.usage_context,
        au.created_at,
        CASE
          WHEN au.resource_type = 'signature_template' THEN (
            SELECT st.name FROM signature_templates st WHERE st.id = au.resource_id
          )
          WHEN au.resource_type = 'signature_campaign' THEN (
            SELECT sc.name FROM signature_campaigns sc WHERE sc.id = au.resource_id
          )
          ELSE NULL
        END as resource_name
      FROM asset_usage au
      WHERE au.asset_id = $1 AND au.organization_id = $2
      ORDER BY au.created_at DESC`,
      [assetId, organizationId]
    );

    return res.json({
      success: true,
      data: {
        asset_id: assetId,
        usage_count: assetCheck.rows[0].usage_count,
        usage_details: usageResult.rows,
      },
    });
  } catch (error: any) {
    console.error('Error getting asset usage:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get asset usage',
    });
  }
});

/**
 * @openapi
 * /api/v1/public-files/{assetId}/tag:
 *   post:
 *     summary: Add tags to file
 *     description: Add tags to a public file (admin only).
 *     tags: [Public Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tags
 *             properties:
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Tags updated
 *       400:
 *         description: Invalid tags format
 *       404:
 *         description: Asset not found
 */
router.post('/:assetId/tag', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { assetId } = req.params;
    const { tags } = req.body;

    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: 'Tags must be an array',
      });
    }

    // Verify asset belongs to organization
    const assetCheck = await db.query(
      `SELECT id, tags FROM public_assets WHERE id = $1 AND organization_id = $2`,
      [assetId, organizationId]
    );

    if (assetCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found',
      });
    }

    // Merge existing tags with new tags
    const existingTags = assetCheck.rows[0].tags || [];
    const mergedTags = [...new Set([...existingTags, ...tags])];

    // Update tags
    const result = await db.query(
      `UPDATE public_assets SET tags = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [JSON.stringify(mergedTags), assetId]
    );

    return res.json({
      success: true,
      message: 'Tags updated successfully',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error updating tags:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update tags',
    });
  }
});

/**
 * @openapi
 * /api/v1/public-files/{assetId}:
 *   delete:
 *     summary: Delete public file
 *     description: Delete a public file (admin only). Cannot delete files in use.
 *     tags: [Public Files]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: File deleted
 *       400:
 *         description: File in use, cannot delete
 *       404:
 *         description: Asset not found
 */
router.delete('/:assetId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { assetId } = req.params;

    // Get asset details
    const assetResult = await db.query(
      `SELECT * FROM public_assets WHERE id = $1 AND organization_id = $2`,
      [assetId, organizationId]
    );

    if (assetResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found',
      });
    }

    const asset = assetResult.rows[0];

    // Check if asset is in use
    if (asset.usage_count > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete asset - it is currently in use',
        usage_count: asset.usage_count,
      });
    }

    // Delete file from storage
    try {
      await fs.unlink(asset.file_path);
    } catch (error) {
      console.error('Error deleting file:', error);
      // Continue anyway - file might already be deleted
    }

    // Soft delete in database (set is_active = false)
    await db.query(
      `UPDATE public_assets SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [assetId]
    );

    return res.json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting asset:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete asset',
    });
  }
});

export default router;
