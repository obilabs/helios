import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { mediaAssetStorageService } from '../services/media-asset-storage.service.js';
import { mediaAssetCacheService } from '../services/media-asset-cache.service.js';
import { googleDriveService } from '../services/google-drive.service.js';
import type {
  MediaAsset,
  MediaAssetWithUrl,
  MediaAssetFolder,
  FolderTreeNode,
  CreateMediaAssetRequest,
  UpdateMediaAssetRequest,
  ListMediaAssetsQuery,
  CreateMediaAssetFolderRequest,
  UpdateMediaAssetSettingsRequest,
  MediaAssetSetupStatus,
  AssetCategory,
  StorageBackend,
  ALLOWED_MIME_TYPES,
} from '../types/media-assets.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Assets
 *     description: Media asset management for signatures and other images
 *
 * components:
 *   schemas:
 *     MediaAsset:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         organizationId:
 *           type: string
 *           format: uuid
 *         storageType:
 *           type: string
 *           enum: [google_drive, minio, local]
 *         storagePath:
 *           type: string
 *         name:
 *           type: string
 *         filename:
 *           type: string
 *         mimeType:
 *           type: string
 *         sizeBytes:
 *           type: integer
 *         folderId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         category:
 *           type: string
 *           enum: [logo, icon, banner, signature, other]
 *           nullable: true
 *         accessToken:
 *           type: string
 *         isPublic:
 *           type: boolean
 *         accessCount:
 *           type: integer
 *         publicUrl:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     MediaAssetFolder:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         path:
 *           type: string
 *         parentId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         driveFolderId:
 *           type: string
 *           nullable: true
 *         children:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MediaAssetFolder'
 */

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB default, will check org settings
  },
});

// All routes require authentication
router.use(authenticateToken);

// Helper: Get organization ID from request
function getOrganizationId(req: Request): string {
  return (req as any).user?.organizationId || (req as any).organizationId;
}

// Helper: Get user ID from request
function getUserId(req: Request): string | null {
  return (req as any).user?.id || null;
}

// Helper: Generate public URL for an asset
function getPublicUrl(accessToken: string, filename?: string): string {
  const baseUrl = process.env['PUBLIC_URL'] || process.env['BACKEND_URL'] || 'http://localhost:3001';
  if (filename) {
    return `${baseUrl}/a/${accessToken}/${encodeURIComponent(filename)}`;
  }
  return `${baseUrl}/a/${accessToken}`;
}

// ============================================================================
// Asset CRUD Routes (TASK-ASSET-009)
// ============================================================================

/**
 * @openapi
 * /api/v1/assets:
 *   get:
 *     summary: List media assets
 *     description: List assets with optional filters by folder, category, or search term.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by folder ID
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [logo, icon, banner, signature, other]
 *         description: Filter by category
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or filename
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: List of assets
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
 *                     assets:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/MediaAsset'
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);
  const { folderId, category, search, limit = '50', offset = '0' } = req.query as ListMediaAssetsQuery;

  try {
    let query = `
      SELECT
        id,
        organization_id as "organizationId",
        storage_type as "storageType",
        storage_path as "storagePath",
        name,
        filename,
        mime_type as "mimeType",
        size_bytes as "sizeBytes",
        folder_id as "folderId",
        category,
        access_token as "accessToken",
        is_public as "isPublic",
        access_count as "accessCount",
        last_accessed_at as "lastAccessedAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM media_assets
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (folderId) {
      query += ` AND folder_id = $${paramIndex}`;
      params.push(folderId);
      paramIndex++;
    }

    if (category) {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR filename ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM media_assets WHERE organization_id = $1${
        folderId ? ` AND folder_id = $${folderId ? 2 : 0}` : ''
      }${category ? ` AND category = $${category ? (folderId ? 3 : 2) : 0}` : ''}`,
      folderId ? (category ? [organizationId, folderId, category] : [organizationId, folderId]) :
      (category ? [organizationId, category] : [organizationId])
    );

    // Add ordering and pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string) || 50);
    params.push(parseInt(offset as string) || 0);

    const result = await db.query(query, params);

    // Add public URLs
    const assets: MediaAssetWithUrl[] = result.rows.map((row: MediaAsset) => ({
      ...row,
      publicUrl: getPublicUrl(row.accessToken, row.filename),
    }));

    res.json({
      success: true,
      data: {
        assets,
        total: parseInt(countResult.rows[0]?.total || '0'),
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
      },
    });
  } catch (error: any) {
    logger.error('Failed to list assets', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list assets' });
  }
});

/**
 * @openapi
 * /api/v1/assets/{id}:
 *   get:
 *     summary: Get asset by ID
 *     description: Retrieve a single media asset by its ID.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Asset ID
 *     responses:
 *       200:
 *         description: Asset details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MediaAsset'
 *       404:
 *         description: Asset not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id', async (req: Request, res: Response, next) => {
  const { id } = req.params;

  // Skip if id is not a valid UUID (let other routes handle it)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return next('route');
  }

  const organizationId = getOrganizationId(req);

  try {
    const result = await db.query(
      `SELECT
        id,
        organization_id as "organizationId",
        storage_type as "storageType",
        storage_path as "storagePath",
        name,
        filename,
        mime_type as "mimeType",
        size_bytes as "sizeBytes",
        folder_id as "folderId",
        category,
        access_token as "accessToken",
        is_public as "isPublic",
        access_count as "accessCount",
        last_accessed_at as "lastAccessedAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM media_assets
      WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    const asset: MediaAssetWithUrl = {
      ...result.rows[0],
      publicUrl: getPublicUrl(result.rows[0].accessToken, result.rows[0].filename),
    };

    res.json({ success: true, data: asset });
  } catch (error: any) {
    logger.error('Failed to get asset', { organizationId, id, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get asset' });
  }
});

/**
 * @openapi
 * /api/v1/assets:
 *   post:
 *     summary: Register a new asset
 *     description: Register an existing storage file as a media asset.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - filename
 *               - mimeType
 *               - storagePath
 *             properties:
 *               name:
 *                 type: string
 *               filename:
 *                 type: string
 *               mimeType:
 *                 type: string
 *               storagePath:
 *                 type: string
 *               storageType:
 *                 type: string
 *                 enum: [google_drive, minio, local]
 *               sizeBytes:
 *                 type: integer
 *               folderId:
 *                 type: string
 *                 format: uuid
 *               category:
 *                 type: string
 *                 enum: [logo, icon, banner, signature, other]
 *     responses:
 *       201:
 *         description: Asset created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MediaAsset'
 *       400:
 *         description: Missing required fields
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);
  const userId = getUserId(req);
  const body: CreateMediaAssetRequest = req.body;

  if (!body.name || !body.filename || !body.mimeType || !body.storagePath) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: name, filename, mimeType, storagePath',
    });
  }

  try {
    // Get settings to determine storage type
    const settings = await mediaAssetStorageService.getSettings(organizationId);
    const storageType = body.storageType || settings?.storageBackend || 'google_drive';

    const result = await db.query(
      `INSERT INTO media_assets (
        organization_id,
        storage_type,
        storage_path,
        name,
        filename,
        mime_type,
        size_bytes,
        folder_id,
        category,
        is_public,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
      RETURNING
        id,
        organization_id as "organizationId",
        storage_type as "storageType",
        storage_path as "storagePath",
        name,
        filename,
        mime_type as "mimeType",
        size_bytes as "sizeBytes",
        folder_id as "folderId",
        category,
        access_token as "accessToken",
        is_public as "isPublic",
        access_count as "accessCount",
        last_accessed_at as "lastAccessedAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        organizationId,
        storageType,
        body.storagePath,
        body.name,
        body.filename,
        body.mimeType,
        body.sizeBytes || null,
        body.folderId || null,
        body.category || null,
        userId,
      ]
    );

    const asset: MediaAssetWithUrl = {
      ...result.rows[0],
      publicUrl: getPublicUrl(result.rows[0].accessToken, result.rows[0].filename),
    };

    logger.info('Asset registered', { organizationId, assetId: asset.id, name: asset.name });
    res.status(201).json({ success: true, data: asset });
  } catch (error: any) {
    logger.error('Failed to register asset', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to register asset' });
  }
});

/**
 * @openapi
 * /api/v1/assets/{id}:
 *   put:
 *     summary: Update asset metadata
 *     description: Update name, folder, or category of an asset.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Asset ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               folderId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               category:
 *                 type: string
 *                 enum: [logo, icon, banner, signature, other]
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Asset updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MediaAsset'
 *       400:
 *         description: No fields to update
 *       404:
 *         description: Asset not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/:id', async (req: Request, res: Response, next) => {
  const { id } = req.params;

  // Skip if id is not a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return next('route');
  }

  const organizationId = getOrganizationId(req);
  const body: UpdateMediaAssetRequest = req.body;

  try {
    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [id, organizationId];
    let paramIndex = 3;

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(body.name);
      paramIndex++;
    }

    if (body.folderId !== undefined) {
      updates.push(`folder_id = $${paramIndex}`);
      params.push(body.folderId || null);
      paramIndex++;
    }

    if (body.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(body.category || null);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const result = await db.query(
      `UPDATE media_assets
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING
         id,
         organization_id as "organizationId",
         storage_type as "storageType",
         storage_path as "storagePath",
         name,
         filename,
         mime_type as "mimeType",
         size_bytes as "sizeBytes",
         folder_id as "folderId",
         category,
         access_token as "accessToken",
         is_public as "isPublic",
         access_count as "accessCount",
         last_accessed_at as "lastAccessedAt",
         created_by as "createdBy",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    const asset: MediaAssetWithUrl = {
      ...result.rows[0],
      publicUrl: getPublicUrl(result.rows[0].accessToken, result.rows[0].filename),
    };

    res.json({ success: true, data: asset });
  } catch (error: any) {
    logger.error('Failed to update asset', { organizationId, id, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update asset' });
  }
});

/**
 * @openapi
 * /api/v1/assets/{id}:
 *   delete:
 *     summary: Delete an asset
 *     description: Delete a media asset. Optionally delete the underlying file from storage.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Asset ID
 *       - in: query
 *         name: deleteFile
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Also delete the underlying file from storage
 *     responses:
 *       200:
 *         description: Asset deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Asset not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/:id', async (req: Request, res: Response, next) => {
  const { id } = req.params;

  // Skip if id is not a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return next('route');
  }

  const organizationId = getOrganizationId(req);

  try {
    // Get asset info first
    const assetResult = await db.query(
      `SELECT storage_type, storage_path, access_token
       FROM media_assets
       WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (assetResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    const asset = assetResult.rows[0];

    // Delete from storage (optional - might want to keep file)
    const deleteFromStorage = req.query.deleteFile === 'true';
    if (deleteFromStorage) {
      await mediaAssetStorageService.deleteFile(
        organizationId,
        asset.storage_path,
        asset.storage_type as StorageBackend
      );
    }

    // Invalidate cache
    await mediaAssetCacheService.invalidate(asset.access_token);

    // Delete from database
    await db.query(
      'DELETE FROM media_assets WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    logger.info('Asset deleted', { organizationId, assetId: id, deletedFromStorage: deleteFromStorage });
    res.json({ success: true, message: 'Asset deleted' });
  } catch (error: any) {
    logger.error('Failed to delete asset', { organizationId, id, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete asset' });
  }
});

// ============================================================================
// Asset Upload Route (TASK-ASSET-010)
// ============================================================================

/**
 * @openapi
 * /api/v1/assets/upload:
 *   post:
 *     summary: Upload a new asset
 *     description: Upload a new file and register it as a media asset.
 *     tags: [Assets]
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
 *                 description: The file to upload
 *               name:
 *                 type: string
 *                 description: Display name (defaults to filename)
 *               folderId:
 *                 type: string
 *                 format: uuid
 *                 description: Target folder ID
 *               category:
 *                 type: string
 *                 enum: [logo, icon, banner, signature, other]
 *     responses:
 *       201:
 *         description: Asset uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MediaAsset'
 *       400:
 *         description: No file provided or invalid file type
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);
  const userId = getUserId(req);

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file provided' });
  }

  const { name, folderId, category } = req.body;
  const file = req.file;

  // Validate mime type
  const settings = await mediaAssetStorageService.getSettings(organizationId);
  const allowedTypes = settings?.allowedMimeTypes || [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
    });
  }

  // Validate file size
  const maxSizeMb = settings?.maxFileSizeMb || 10;
  if (file.size > maxSizeMb * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      error: `File too large. Maximum size: ${maxSizeMb}MB`,
    });
  }

  try {
    // Get Drive folder ID if folderId provided
    let driveFolderId: string | undefined;
    if (folderId) {
      const folderResult = await db.query(
        'SELECT drive_folder_id FROM media_asset_folders WHERE id = $1 AND organization_id = $2',
        [folderId, organizationId]
      );
      if (folderResult.rows.length > 0 && folderResult.rows[0].drive_folder_id) {
        driveFolderId = folderResult.rows[0].drive_folder_id;
      }
    }

    // Upload to storage
    const uploadResult = await mediaAssetStorageService.uploadFile(
      organizationId,
      file.buffer,
      file.originalname,
      file.mimetype,
      driveFolderId
    );

    if (!uploadResult.success || !uploadResult.result) {
      return res.status(500).json({
        success: false,
        error: uploadResult.error || 'Failed to upload file to storage',
      });
    }

    // Register asset in database
    const result = await db.query(
      `INSERT INTO media_assets (
        organization_id,
        storage_type,
        storage_path,
        name,
        filename,
        mime_type,
        size_bytes,
        folder_id,
        category,
        is_public,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
      RETURNING
        id,
        organization_id as "organizationId",
        storage_type as "storageType",
        storage_path as "storagePath",
        name,
        filename,
        mime_type as "mimeType",
        size_bytes as "sizeBytes",
        folder_id as "folderId",
        category,
        access_token as "accessToken",
        is_public as "isPublic",
        access_count as "accessCount",
        last_accessed_at as "lastAccessedAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        organizationId,
        settings?.storageBackend || 'google_drive',
        uploadResult.result.storagePath,
        name || file.originalname,
        file.originalname,
        file.mimetype,
        file.size,
        folderId || null,
        category || null,
        userId,
      ]
    );

    const asset: MediaAssetWithUrl = {
      ...result.rows[0],
      publicUrl: getPublicUrl(result.rows[0].accessToken, result.rows[0].filename),
    };

    logger.info('Asset uploaded', { organizationId, assetId: asset.id, filename: file.originalname });
    res.status(201).json({ success: true, data: asset });
  } catch (error: any) {
    logger.error('Failed to upload asset', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to upload asset' });
  }
});

// ============================================================================
// Folder Management Routes (TASK-ASSET-011)
// ============================================================================

/**
 * @openapi
 * /api/v1/assets/folders:
 *   get:
 *     summary: Get folder tree
 *     description: Get the hierarchical folder tree for asset organization.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Folder tree
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
 *                     $ref: '#/components/schemas/MediaAssetFolder'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/folders', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);

  try {
    const result = await db.query(
      `SELECT
        id,
        organization_id as "organizationId",
        name,
        path,
        parent_id as "parentId",
        drive_folder_id as "driveFolderId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM media_asset_folders
      WHERE organization_id = $1
      ORDER BY path`,
      [organizationId]
    );

    // Build tree structure
    const folders = result.rows as MediaAssetFolder[];
    const folderMap = new Map<string, FolderTreeNode>();
    const rootFolders: FolderTreeNode[] = [];

    // First pass: create all nodes
    for (const folder of folders) {
      folderMap.set(folder.id, {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        driveFolderId: folder.driveFolderId,
        children: [],
      });
    }

    // Second pass: build tree
    for (const folder of folders) {
      const node = folderMap.get(folder.id)!;
      if (folder.parentId && folderMap.has(folder.parentId)) {
        folderMap.get(folder.parentId)!.children.push(node);
      } else {
        rootFolders.push(node);
      }
    }

    res.json({ success: true, data: rootFolders });
  } catch (error: any) {
    logger.error('Failed to get folders', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get folders' });
  }
});

/**
 * @openapi
 * /api/v1/assets/folders:
 *   post:
 *     summary: Create a new folder
 *     description: Create a new folder in the asset folder hierarchy.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               parentPath:
 *                 type: string
 *                 description: Path of parent folder (e.g., "/logos")
 *     responses:
 *       201:
 *         description: Folder created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MediaAssetFolder'
 *       400:
 *         description: Missing folder name
 *       409:
 *         description: Folder with this path already exists
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/folders', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);
  const body: CreateMediaAssetFolderRequest = req.body;

  if (!body.name) {
    return res.status(400).json({ success: false, error: 'Folder name is required' });
  }

  try {
    // Determine parent folder and path
    let parentId: string | null = null;
    let parentPath = '';

    if (body.parentPath) {
      const parentResult = await db.query(
        'SELECT id, path FROM media_asset_folders WHERE organization_id = $1 AND path = $2',
        [organizationId, body.parentPath]
      );
      if (parentResult.rows.length > 0) {
        parentId = parentResult.rows[0].id;
        parentPath = parentResult.rows[0].path;
      }
    }

    const folderPath = parentPath ? `${parentPath}/${body.name.toLowerCase().replace(/\s+/g, '-')}` : `/${body.name.toLowerCase().replace(/\s+/g, '-')}`;

    // Check if path already exists
    const existingResult = await db.query(
      'SELECT id FROM media_asset_folders WHERE organization_id = $1 AND path = $2',
      [organizationId, folderPath]
    );
    if (existingResult.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Folder with this path already exists' });
    }

    // Create folder in storage (Google Drive)
    let driveFolderId: string | null = null;
    const settings = await mediaAssetStorageService.getSettings(organizationId);

    if (settings?.isConfigured && settings.storageBackend === 'google_drive') {
      let driveParentId: string | undefined;

      if (parentId) {
        const parentFolderResult = await db.query(
          'SELECT drive_folder_id FROM media_asset_folders WHERE id = $1',
          [parentId]
        );
        if (parentFolderResult.rows.length > 0) {
          driveParentId = parentFolderResult.rows[0].drive_folder_id;
        }
      } else if (settings.driveSharedDriveId) {
        driveParentId = settings.driveSharedDriveId;
      }

      const createResult = await mediaAssetStorageService.createFolder(organizationId, body.name, driveParentId);
      if (createResult.success && createResult.folderId) {
        driveFolderId = createResult.folderId;
      }
    }

    // Insert folder record
    const result = await db.query(
      `INSERT INTO media_asset_folders (organization_id, name, path, parent_id, drive_folder_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id,
         organization_id as "organizationId",
         name,
         path,
         parent_id as "parentId",
         drive_folder_id as "driveFolderId",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [organizationId, body.name, folderPath, parentId, driveFolderId]
    );

    logger.info('Folder created', { organizationId, folderId: result.rows[0].id, path: folderPath });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to create folder', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create folder' });
  }
});

/**
 * @openapi
 * /api/v1/assets/folders/{id}:
 *   delete:
 *     summary: Delete a folder
 *     description: Delete an asset folder. The folder must be empty (no subfolders or assets).
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Folder ID
 *     responses:
 *       200:
 *         description: Folder deleted
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
 *         description: Cannot delete folder with subfolders or assets
 *       404:
 *         description: Folder not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/folders/:id', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);
  const { id } = req.params;

  try {
    // Check if folder exists
    const folderResult = await db.query(
      'SELECT id, path FROM media_asset_folders WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Folder not found' });
    }

    // Check if folder has children
    const childrenResult = await db.query(
      'SELECT COUNT(*) as count FROM media_asset_folders WHERE parent_id = $1',
      [id]
    );
    if (parseInt(childrenResult.rows[0].count) > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete folder with subfolders' });
    }

    // Check if folder has assets
    const assetsResult = await db.query(
      'SELECT COUNT(*) as count FROM media_assets WHERE folder_id = $1',
      [id]
    );
    if (parseInt(assetsResult.rows[0].count) > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete folder with assets' });
    }

    // Delete folder
    await db.query('DELETE FROM media_asset_folders WHERE id = $1', [id]);

    logger.info('Folder deleted', { organizationId, folderId: id });
    res.json({ success: true, message: 'Folder deleted' });
  } catch (error: any) {
    logger.error('Failed to delete folder', { organizationId, id, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete folder' });
  }
});

// ============================================================================
// Asset Settings Routes (TASK-ASSET-012)
// ============================================================================

/**
 * @openapi
 * /api/v1/assets/settings:
 *   get:
 *     summary: Get asset storage settings
 *     description: Get the current storage settings for media assets.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Storage settings
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
 *                     organizationId:
 *                       type: string
 *                       format: uuid
 *                     storageBackend:
 *                       type: string
 *                       enum: [google_drive, minio, local]
 *                     driveSharedDriveId:
 *                       type: string
 *                       nullable: true
 *                     driveRootFolderId:
 *                       type: string
 *                       nullable: true
 *                     cacheTtlSeconds:
 *                       type: integer
 *                     maxFileSizeMb:
 *                       type: integer
 *                     allowedMimeTypes:
 *                       type: array
 *                       items:
 *                         type: string
 *                     isConfigured:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/settings', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);

  try {
    const settings = await mediaAssetStorageService.getSettings(organizationId);

    if (!settings) {
      // Return defaults
      return res.json({
        success: true,
        data: {
          organizationId,
          storageBackend: 'google_drive',
          driveSharedDriveId: null,
          driveRootFolderId: null,
          cacheTtlSeconds: 3600,
          maxFileSizeMb: 10,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'],
          isConfigured: false,
        },
      });
    }

    res.json({ success: true, data: settings });
  } catch (error: any) {
    logger.error('Failed to get asset settings', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

/**
 * @openapi
 * /api/v1/assets/settings:
 *   put:
 *     summary: Update asset storage settings
 *     description: Update storage settings for media assets.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               storageBackend:
 *                 type: string
 *                 enum: [google_drive, minio, local]
 *               cacheTtlSeconds:
 *                 type: integer
 *               maxFileSizeMb:
 *                 type: integer
 *               allowedMimeTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Settings updated
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/settings', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);
  const body: UpdateMediaAssetSettingsRequest = req.body;

  try {
    const result = await mediaAssetStorageService.updateSettings(organizationId, {
      storageBackend: body.storageBackend,
      cacheTtlSeconds: body.cacheTtlSeconds,
      maxFileSizeMb: body.maxFileSizeMb,
      allowedMimeTypes: body.allowedMimeTypes,
    });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    const settings = await mediaAssetStorageService.getSettings(organizationId);
    res.json({ success: true, data: settings });
  } catch (error: any) {
    logger.error('Failed to update asset settings', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

/**
 * @openapi
 * /api/v1/assets/status:
 *   get:
 *     summary: Get asset storage status
 *     description: Get the setup status for asset storage including Google Workspace integration.
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Storage status
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
 *                     isConfigured:
 *                       type: boolean
 *                     storageBackend:
 *                       type: string
 *                     hasGoogleWorkspace:
 *                       type: boolean
 *                     hasDriveAccess:
 *                       type: boolean
 *                     sharedDriveName:
 *                       type: string
 *                     folderCount:
 *                       type: integer
 *                     assetCount:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/status', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);

  try {
    const status = await mediaAssetStorageService.getStatus(organizationId);
    const settings = await mediaAssetStorageService.getSettings(organizationId);

    // Get folder and asset counts
    const folderCountResult = await db.query(
      'SELECT COUNT(*) as count FROM media_asset_folders WHERE organization_id = $1',
      [organizationId]
    );
    const assetCountResult = await db.query(
      'SELECT COUNT(*) as count FROM media_assets WHERE organization_id = $1',
      [organizationId]
    );

    // Check if Google Workspace is configured and enabled
    const gwResult = await db.query(
      `SELECT om.is_enabled FROM organization_modules om
       JOIN modules m ON om.module_id = m.id
       WHERE om.organization_id = $1 AND m.slug = 'google_workspace'`,
      [organizationId]
    );
    const hasGoogleWorkspace = gwResult.rows.length > 0 && gwResult.rows[0].is_enabled;

    // Check if Drive API is accessible (independent of asset storage setup)
    // If already configured and can upload, use that
    // Otherwise, test Drive API access using the workspace credentials
    let hasDriveAccess = status.canUpload;
    if (!hasDriveAccess && hasGoogleWorkspace) {
      // Test Drive API access using Google Workspace service
      const driveTestResult = await googleDriveService.testConnection(organizationId);
      hasDriveAccess = driveTestResult.success;
    }

    const setupStatus: MediaAssetSetupStatus = {
      isConfigured: status.isConfigured,
      storageBackend: status.backend,
      hasGoogleWorkspace,
      hasDriveAccess,
      sharedDriveName: settings?.driveSharedDriveId ? 'Helios Assets' : undefined,
      folderCount: parseInt(folderCountResult.rows[0]?.count || '0'),
      assetCount: parseInt(assetCountResult.rows[0]?.count || '0'),
    };

    res.json({ success: true, data: setupStatus });
  } catch (error: any) {
    logger.error('Failed to get asset status', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

/**
 * @openapi
 * /api/v1/assets/setup:
 *   post:
 *     summary: Initialize asset storage
 *     description: Set up asset storage backend (create Shared Drive, folders, etc.).
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               backend:
 *                 type: string
 *                 enum: [google_drive, minio, local]
 *                 default: google_drive
 *     responses:
 *       200:
 *         description: Storage setup complete
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Failed to setup storage
 */
router.post('/setup', async (req: Request, res: Response) => {
  const organizationId = getOrganizationId(req);
  const { backend = 'google_drive' } = req.body;

  try {
    const result = await mediaAssetStorageService.setupStorage(organizationId, backend as StorageBackend);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    // Get updated status
    const status = await mediaAssetStorageService.getStatus(organizationId);

    logger.info('Asset storage setup complete', { organizationId, backend });
    res.json({ success: true, data: status });
  } catch (error: any) {
    logger.error('Failed to setup asset storage', { organizationId, error: error.message });
    res.status(500).json({ success: false, error: 'Failed to setup storage' });
  }
});

export default router;
