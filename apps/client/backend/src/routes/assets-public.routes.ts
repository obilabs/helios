import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { mediaAssetCacheService } from '../services/media-asset-cache.service.js';
import { mediaAssetStorageService } from '../services/media-asset-storage.service.js';
import type { MediaAsset, StorageBackend } from '../types/media-assets.js';

const router = Router();

/**
 * Rate limiting state (simple in-memory for now)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function rateLimit(req: Request, res: Response, next: Function) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const state = rateLimitMap.get(ip);

  if (!state || now > state.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (state.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((state.resetAt - now) / 1000);
    res.set('Retry-After', retryAfter.toString());
    return res.status(429).json({ success: false, error: 'Too many requests', retryAfter });
  }

  state.count++;
  return next();
}

/**
 * Get asset from database by slug
 */
async function getAssetBySlug(slug: string): Promise<MediaAsset | null> {
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
        slug,
        visibility,
        access_count as "accessCount",
        last_accessed_at as "lastAccessedAt",
        created_by as "createdBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM media_assets
      WHERE slug = $1`,
      [slug]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as MediaAsset;
  } catch (error) {
    logger.error('Failed to get asset by slug', { slug, error });
    return null;
  }
}

/**
 * Update access stats (async, non-blocking)
 */
async function updateAccessStats(assetId: string): Promise<void> {
  try {
    await db.query(
      `UPDATE media_assets SET access_count = access_count + 1, last_accessed_at = NOW() WHERE id = $1`,
      [assetId]
    );
  } catch (error) {
    logger.warn('Failed to update asset access stats', { assetId, error });
  }
}

/**
 * @openapi
 * /assets/{slug}:
 *   get:
 *     summary: Get public asset by slug
 *     description: |
 *       Public asset endpoint using human-readable slugs.
 *       Example: /assets/company-logo
 *     tags: [Asset Proxy]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique slug for the asset (e.g., company-logo)
 *     responses:
 *       200:
 *         description: Asset content with proper Content-Type
 *       403:
 *         description: Asset is private
 *       404:
 *         description: Asset not found
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/:slug', rateLimit, async (req: Request, res: Response) => {
  const { slug } = req.params;

  try {
    const asset = await getAssetBySlug(slug);

    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    // Check visibility
    const visibility = (asset as any).visibility || 'public';
    if (visibility !== 'public') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Try cache
    const cached = await mediaAssetCacheService.get(asset.accessToken);
    if (cached) {
      updateAccessStats(asset.id);
      res.set({
        'Content-Type': cached.mimeType,
        'Content-Length': cached.data.length.toString(),
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'HIT',
      });
      return res.send(cached.data);
    }

    // Get from storage
    const fileResult = await mediaAssetStorageService.getFile(
      asset.organizationId,
      asset.storagePath,
      asset.storageType as StorageBackend
    );

    if (!fileResult.success || !fileResult.data) {
      return res.status(503).json({ success: false, error: 'Storage temporarily unavailable' });
    }

    // Cache for future requests
    const settings = await mediaAssetStorageService.getSettings(asset.organizationId);
    const cacheTTL = settings?.cacheTtlSeconds || 3600;
    mediaAssetCacheService.set(asset.accessToken, fileResult.data, asset.mimeType, cacheTTL);

    updateAccessStats(asset.id);

    res.set({
      'Content-Type': asset.mimeType,
      'Content-Length': fileResult.data.length.toString(),
      'Cache-Control': `public, max-age=${cacheTTL}`,
      'X-Cache': 'MISS',
    });

    return res.send(fileResult.data);
  } catch (error: any) {
    logger.error('Asset proxy error', { slug, error: error.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
