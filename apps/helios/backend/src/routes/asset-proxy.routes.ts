import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { mediaAssetCacheService } from '../services/media-asset-cache.service.js';
import { mediaAssetStorageService } from '../services/media-asset-storage.service.js';
import type { MediaAsset, StorageBackend } from '../types/media-assets.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Asset Proxy
 *     description: Public asset proxy endpoints for serving media files
 */

/**
 * @openapi
 * /a/_health:
 *   get:
 *     summary: Asset proxy health check
 *     description: Returns the health status of the asset proxy service including cache statistics.
 *     tags: [Asset Proxy]
 *     responses:
 *       200:
 *         description: Health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 service:
 *                   type: string
 *                   example: asset-proxy
 *                 cache:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                     keyCount:
 *                       type: integer
 */
router.get('/_health', async (_req: Request, res: Response) => {
  const cacheStats = await mediaAssetCacheService.getStats();

  res.json({
    success: true,
    service: 'asset-proxy',
    cache: {
      connected: cacheStats.connected,
      keyCount: cacheStats.keyCount,
    },
  });
});

/**
 * Rate limiting state (simple in-memory for now)
 * In production, use Redis for distributed rate limiting
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100; // requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Simple rate limiter middleware
 */
function rateLimit(req: Request, res: Response, next: Function) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  const state = rateLimitMap.get(ip);

  if (!state || now > state.resetAt) {
    // New window
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (state.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((state.resetAt - now) / 1000);
    res.set('Retry-After', retryAfter.toString());
    return res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfter,
    });
  }

  state.count++;
  return next();
}

/**
 * Get asset from database by token
 */
async function getAssetByToken(accessToken: string): Promise<MediaAsset | null> {
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
      WHERE access_token = $1`,
      [accessToken]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as MediaAsset;
  } catch (error) {
    logger.error('Failed to get asset by token', { accessToken, error });
    return null;
  }
}

/**
 * Update access stats (async, non-blocking)
 */
async function updateAccessStats(assetId: string): Promise<void> {
  try {
    await db.query(
      `UPDATE media_assets
       SET access_count = access_count + 1,
           last_accessed_at = NOW()
       WHERE id = $1`,
      [assetId]
    );
  } catch (error) {
    // Log but don't fail the request
    logger.warn('Failed to update asset access stats', { assetId, error });
  }
}

/**
 * @openapi
 * /a/{token}:
 *   get:
 *     summary: Get public asset by token
 *     description: |
 *       Public asset proxy endpoint - no authentication required.
 *       Serves media assets with proper Content-Type and caching headers.
 *       Assets are cached in Redis for improved performance.
 *     tags: [Asset Proxy]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique access token for the asset
 *     responses:
 *       200:
 *         description: Asset content
 *         headers:
 *           Content-Type:
 *             description: MIME type of the asset
 *             schema:
 *               type: string
 *           Cache-Control:
 *             description: Caching directives
 *             schema:
 *               type: string
 *           X-Cache:
 *             description: Cache status (HIT or MISS)
 *             schema:
 *               type: string
 *               enum: [HIT, MISS]
 *       403:
 *         description: Asset is not public
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Access denied
 *       404:
 *         description: Asset not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Asset not found
 *       429:
 *         description: Rate limit exceeded
 *         headers:
 *           Retry-After:
 *             description: Seconds until rate limit resets
 *             schema:
 *               type: integer
 *       503:
 *         description: Storage temporarily unavailable
 *
 * /a/{token}/{filename}:
 *   get:
 *     summary: Get public asset with filename
 *     description: |
 *       Same as /a/{token} but includes filename in URL for better SEO and browser filename hints.
 *     tags: [Asset Proxy]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique access token for the asset
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: The filename (used for Content-Disposition hint)
 *     responses:
 *       200:
 *         description: Asset content
 *       403:
 *         description: Asset is not public
 *       404:
 *         description: Asset not found
 *       429:
 *         description: Rate limit exceeded
 *       503:
 *         description: Storage temporarily unavailable
 */
router.get(
  ['/:token', '/:token/:filename'],
  rateLimit,
  async (req: Request, res: Response) => {
    const { token } = req.params;

    try {
      // Try cache first
      const cached = await mediaAssetCacheService.get(token);
      if (cached) {
        // Update stats asynchronously
        const asset = await getAssetByToken(token);
        if (asset) {
          updateAccessStats(asset.id); // Don't await
        }

        // Serve from cache
        res.set({
          'Content-Type': cached.mimeType,
          'Content-Length': cached.data.length.toString(),
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'HIT',
        });
        return res.send(cached.data);
      }

      // Cache miss - get asset metadata from database
      const asset = await getAssetByToken(token);

      if (!asset) {
        logger.debug('Asset not found', { token });
        return res.status(404).json({
          success: false,
          error: 'Asset not found',
        });
      }

      // Check if asset is public
      if (!asset.isPublic) {
        logger.debug('Asset is not public', { token, assetId: asset.id });
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      // Get file from storage
      const fileResult = await mediaAssetStorageService.getFile(
        asset.organizationId,
        asset.storagePath,
        asset.storageType as StorageBackend
      );

      if (!fileResult.success || !fileResult.data) {
        logger.error('Failed to retrieve asset from storage', {
          token,
          assetId: asset.id,
          error: fileResult.error,
        });
        return res.status(503).json({
          success: false,
          error: 'Storage temporarily unavailable',
        });
      }

      // Cache the file for future requests
      // Get cache TTL from organization settings
      const settings = await mediaAssetStorageService.getSettings(asset.organizationId);
      const cacheTTL = settings?.cacheTtlSeconds || 3600;

      // Cache asynchronously (don't wait)
      mediaAssetCacheService.set(token, fileResult.data, asset.mimeType, cacheTTL);

      // Update access stats asynchronously
      updateAccessStats(asset.id);

      // Serve the file
      res.set({
        'Content-Type': asset.mimeType,
        'Content-Length': fileResult.data.length.toString(),
        'Cache-Control': `public, max-age=${cacheTTL}`,
        'X-Cache': 'MISS',
      });

      return res.send(fileResult.data);
    } catch (error: any) {
      logger.error('Asset proxy error', { token, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

export default router;
