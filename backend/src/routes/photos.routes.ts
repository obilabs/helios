import { Router, Request, Response } from 'express';
import multer from 'multer';
import { photoService } from '../services/photo.service.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * SECURITY: deny by default (audit 2026-07-23).
 *
 * This router previously had NO authentication of any kind — it did not even
 * import an auth middleware. That left three holes open to anonymous callers:
 *
 *   - POST /upload-avatar  — unauthenticated file upload (multer, 5MB)
 *   - POST /upload-logo    — unauthenticated file upload
 *   - DELETE /:assetId     — anonymous deletion of stored assets
 *
 * Unauthenticated file upload is a storage-abuse and content-injection vector;
 * unauthenticated delete is straightforward destruction of customer data.
 *
 * Note that mounting does NOT provide auth: `registerRoute()` in index.ts only
 * calls app.use() on two paths, and the app-level `authenticateApiKey` returns
 * next() when no API key header is present. Every router is solely responsible
 * for its own gate.
 *
 * FOLLOW-UP (not addressed here): these handlers still do not verify that the
 * caller OWNS the avatar/asset being modified. Authentication is closed;
 * per-object authorization is a separate fix.
 */
router.use(authenticateToken);

/**
 * @openapi
 * tags:
 *   - name: Photos
 *     description: User avatar and company logo management
 */

// Configure multer for memory storage (we'll process the buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

/**
 * @openapi
 * /api/v1/photos/upload-avatar:
 *   post:
 *     summary: Upload user avatar
 *     description: Upload user avatar photo with automatic resizing.
 *     tags: [Photos]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *               - userId
 *               - organizationId
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *               userId:
 *                 type: string
 *               organizationId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Avatar uploaded
 *       400:
 *         description: No file or missing fields
 */
router.post('/upload-avatar', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { userId, organizationId } = req.body;

    if (!userId || !organizationId) {
      return res.status(400).json({
        success: false,
        error: 'userId and organizationId are required'
      });
    }

    logger.info('Uploading avatar photo', { userId, organizationId, size: req.file.size });

    const result = await photoService.uploadPhoto(req.file.buffer, {
      userId,
      organizationId,
      photoType: 'avatar',
      aspectRatio: 1.0 // Square
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: {
          assetId: result.assetId,
          urls: result.urls
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error: any) {
    logger.error('Avatar upload failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to upload avatar'
    });
  }
});

/**
 * @openapi
 * /api/v1/photos/upload-logo:
 *   post:
 *     summary: Upload company logo
 *     description: Upload company logo with automatic resizing.
 *     tags: [Photos]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *               - organizationId
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *               organizationId:
 *                 type: string
 *               aspectRatio:
 *                 type: number
 *     responses:
 *       200:
 *         description: Logo uploaded
 *       400:
 *         description: No file or missing fields
 */
router.post('/upload-logo', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { organizationId, aspectRatio } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required'
      });
    }

    logger.info('Uploading company logo', { organizationId, size: req.file.size });

    const result = await photoService.uploadPhoto(req.file.buffer, {
      organizationId,
      photoType: 'logo',
      aspectRatio: aspectRatio ? parseFloat(aspectRatio) : 1.0
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Logo uploaded successfully',
        data: {
          assetId: result.assetId,
          urls: result.urls
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error: any) {
    logger.error('Logo upload failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to upload logo'
    });
  }
});

/**
 * @openapi
 * /api/v1/photos/{entityType}/{entityId}:
 *   get:
 *     summary: Get photo URLs
 *     description: Get photo URLs for a user or organization.
 *     tags: [Photos]
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, organization]
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Photo URLs
 *       400:
 *         description: Invalid entity type
 *       404:
 *         description: Photo not found
 */
router.get('/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;

    if (entityType !== 'user' && entityType !== 'organization') {
      return res.status(400).json({
        success: false,
        error: 'Invalid entity type. Must be "user" or "organization"'
      });
    }

    const urls = await photoService.getPhotoUrls(entityId, entityType);

    if (!urls) {
      return res.status(404).json({
        success: false,
        error: 'Photo not found'
      });
    }

    res.json({
      success: true,
      data: { urls }
    });

  } catch (error: any) {
    logger.error('Failed to get photo URLs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get photo URLs'
    });
  }
});

/**
 * @openapi
 * /api/v1/photos/{assetId}:
 *   delete:
 *     summary: Delete photo
 *     description: Delete a photo and all its sizes.
 *     tags: [Photos]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Photo deleted
 *       400:
 *         description: Deletion failed
 */
router.delete('/:assetId', async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;

    const result = await photoService.deletePhoto(assetId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Photo deleted successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error: any) {
    logger.error('Photo deletion failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete photo'
    });
  }
});

export default router;
