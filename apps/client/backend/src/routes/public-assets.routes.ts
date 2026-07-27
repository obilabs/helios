/**
 * Public Assets Routes
 *
 * Serves assets at /public/{slug} without authentication.
 * All assets are publicly accessible via their slug.
 */

import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { s3Service } from '../services/s3.service.js';

const router = Router();

/**
 * GET /public/:slug
 * Serve a public asset by slug
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // Look up asset by slug
    const result = await db.query(`
      SELECT id, storage_path, mime_type, filename, size_bytes
      FROM media_assets
      WHERE slug = $1
    `, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const asset = result.rows[0];

    // Update access count and last accessed
    db.query(`
      UPDATE media_assets
      SET access_count = access_count + 1, last_accessed_at = NOW()
      WHERE id = $1
    `, [asset.id]).catch(err => {
      logger.warn('Failed to update access count', { assetId: asset.id, error: err.message });
    });

    // Get file from MinIO
    const fileBuffer = await s3Service.downloadFile(asset.storage_path, true);

    if (!fileBuffer) {
      logger.error('Asset file not found in storage', { slug, storagePath: asset.storage_path });
      return res.status(404).json({ error: 'Asset file not found' });
    }

    // Set appropriate headers
    res.set({
      'Content-Type': asset.mime_type,
      'Content-Length': asset.size_bytes,
      'Content-Disposition': `inline; filename="${asset.filename}"`,
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      'ETag': `"${asset.id}"`,
    });

    res.send(fileBuffer);
  } catch (error: any) {
    logger.error('Failed to serve public asset', { slug: req.params.slug, error: error.message });
    res.status(500).json({ error: 'Failed to serve asset' });
  }
});

/**
 * GET /public/:slug/info
 * Get asset metadata without downloading
 */
router.get('/:slug/info', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const result = await db.query(`
      SELECT
        id, name, filename, mime_type as "mimeType",
        size_bytes as "sizeBytes", slug, tags, scope,
        access_count as "accessCount", created_at as "createdAt"
      FROM media_assets
      WHERE slug = $1
    `, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const asset = result.rows[0];
    res.json({
      success: true,
      data: {
        ...asset,
        url: `/public/${slug}`,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get asset info', { slug: req.params.slug, error: error.message });
    res.status(500).json({ error: 'Failed to get asset info' });
  }
});

export default router;
