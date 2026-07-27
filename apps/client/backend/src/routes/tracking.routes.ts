/**
 * Tracking Routes
 *
 * Public endpoints for serving tracking pixels.
 * These endpoints do NOT require authentication - they are loaded
 * by email clients when recipients view emails.
 */

import { Router, Request, Response } from 'express';
import { trackingEventsService } from '../services/tracking-events.service.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Tracking
 *     description: Email open tracking pixel endpoints (public)
 */

// 1x1 transparent GIF (43 bytes)
// This is the smallest valid GIF possible
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// Rate limiting: Track recent IPs to prevent abuse
const recentRequests = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // Max requests per IP per minute

/**
 * Simple rate limiter for the tracking endpoint
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = recentRequests.get(ip);

  if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
    recentRequests.set(ip, { count: 1, timestamp: now });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// Periodically clean up old rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of recentRequests.entries()) {
    if (now - record.timestamp > RATE_LIMIT_WINDOW) {
      recentRequests.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

/**
 * @openapi
 * /api/v1/t/p/{token}.gif:
 *   get:
 *     summary: Tracking pixel
 *     description: Serves a 1x1 transparent GIF and records the open event. No auth required.
 *     tags: [Tracking]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transparent GIF
 *         content:
 *           image/gif:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/p/:token.gif', async (req: Request, res: Response) => {
  // Always return the GIF quickly - don't let tracking failures block the response
  const sendGif = () => {
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': TRANSPARENT_GIF.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      // Prevent caching in email clients
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(TRANSPARENT_GIF);
  };

  try {
    const { token } = req.params;

    if (!token || token.length < 10) {
      // Invalid token, but still return GIF
      sendGif();
      return;
    }

    // Get client IP (handle proxies)
    const ipAddress = (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.socket.remoteAddress ||
      ''
    ).split(',')[0].trim();

    // Rate limiting
    if (!checkRateLimit(ipAddress)) {
      sendGif();
      return;
    }

    // Record the tracking event asynchronously
    // Don't await - we want to return the GIF as fast as possible
    trackingEventsService.recordEvent({
      pixelToken: token,
      ipAddress,
      userAgent: req.headers['user-agent'],
      // GeoIP lookup could be added here if using a service like MaxMind
      // For now, we leave these empty - can be populated by a background job
      countryCode: undefined,
      region: undefined,
      city: undefined,
    }).catch(err => {
      console.error('Error recording tracking event:', err);
    });

    sendGif();
  } catch (error) {
    console.error('Error in tracking pixel endpoint:', error);
    sendGif();
  }
});

/**
 * @openapi
 * /api/v1/t/u/{token}.gif:
 *   get:
 *     summary: User tracking pixel (always-on)
 *     description: |
 *       Serves a 1x1 transparent GIF and records the user engagement event.
 *       This is for always-on user tracking (permanent in signature), not campaign tracking.
 *       No authentication required - called by email clients.
 *     tags: [Tracking]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique user tracking token
 *     responses:
 *       200:
 *         description: Transparent GIF
 *         content:
 *           image/gif:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/u/:token.gif', async (req: Request, res: Response) => {
  // Always return the GIF quickly - don't let tracking failures block the response
  const sendGif = () => {
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': TRANSPARENT_GIF.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      // Prevent caching in email clients
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(TRANSPARENT_GIF);
  };

  try {
    const { token } = req.params;

    if (!token || token.length < 10) {
      // Invalid token, but still return GIF
      sendGif();
      return;
    }

    // Get client IP (handle proxies)
    const ipAddress = (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.socket.remoteAddress ||
      ''
    ).split(',')[0].trim();

    // Rate limiting
    if (!checkRateLimit(ipAddress)) {
      sendGif();
      return;
    }

    // Record the user tracking event asynchronously
    // Don't await - we want to return the GIF as fast as possible
    trackingEventsService.recordUserEvent({
      userTrackingToken: token,
      ipAddress,
      userAgent: req.headers['user-agent'],
      countryCode: undefined,
      region: undefined,
      city: undefined,
    }).catch(err => {
      console.error('Error recording user tracking event:', err);
    });

    sendGif();
  } catch (error) {
    console.error('Error in user tracking pixel endpoint:', error);
    sendGif();
  }
});

/**
 * @openapi
 * /api/v1/t/health:
 *   get:
 *     summary: Health check
 *     description: Health check endpoint for the tracking service.
 *     tags: [Tracking]
 *     responses:
 *       200:
 *         description: Health status
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'tracking',
    timestamp: new Date().toISOString(),
  });
});

export default router;
