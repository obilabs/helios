/**
 * Login Activity Routes
 *
 * API endpoints for login activity monitoring and the login map widget.
 */

import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
import { geoipService } from '../services/geoip.service.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * SECURITY: deny by default (audit 2026-07-23).
 *
 * This router previously had NO authentication — all five endpoints were open
 * to anonymous callers, including:
 *
 *   - GET /       — who logged in, when, from which IP
 *   - GET /map    — geolocated login positions for the organization's users
 *   - GET /stats  — aggregate login statistics
 *   - POST /sync  — pulls login activity from Google Workspace
 *   - POST /enrich — triggers GeoIP enrichment
 *
 * The /map endpoint is the most serious: it exposes the physical locations of
 * a customer's staff to anyone who can reach the host. That is a privacy
 * incident, not merely a missing gate.
 *
 * FOLLOW-UP (not addressed here): /sync and /enrich cause outbound work
 * against Google Workspace and the GeoIP provider, so they should additionally
 * require an administrative capability rather than any authenticated session.
 */
router.use(authenticateToken);

/**
 * GET /api/v1/login-activity
 * Get recent login activity
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, message: 'No organization context' });
    }

    const { limit = '50', offset = '0', suspicious, country } = req.query;

    let query = `
      SELECT
        id, user_email, login_timestamp, login_type, ip_address,
        is_suspicious, is_successful, failure_reason,
        country_code, country_name, city, region, latitude, longitude
      FROM login_activity
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (suspicious === 'true') {
      query += ` AND is_suspicious = TRUE`;
    }

    if (country) {
      query += ` AND country_code = $${paramIndex}`;
      params.push(country);
      paramIndex++;
    }

    query += ` ORDER BY login_timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        events: result.rows,
        total: result.rows.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to fetch login activity', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch login activity' });
  }
});

/**
 * GET /api/v1/login-activity/map
 * Get login activity aggregated by country for map widget
 */
router.get('/map', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, message: 'No organization context' });
    }

    const { days = '7' } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days as string, 10));

    const result = await db.query(
      `SELECT
        country_code,
        country_name,
        COUNT(*) as login_count,
        COUNT(DISTINCT user_email) as unique_users,
        COUNT(*) FILTER (WHERE is_suspicious) as suspicious_count,
        MAX(login_timestamp) as last_login,
        AVG(latitude) as latitude,
        AVG(longitude) as longitude
      FROM login_activity
      WHERE organization_id = $1
        AND country_code IS NOT NULL
        AND login_timestamp >= $2
      GROUP BY country_code, country_name
      ORDER BY login_count DESC`,
      [organizationId, daysAgo.toISOString()]
    );

    // Get organization's expected countries (from user locations or settings)
    // For now, just return data. Later we can add "unexpected" flag.

    res.json({
      success: true,
      data: {
        countries: result.rows.map((row: any) => ({
          code: row.country_code,
          name: row.country_name,
          loginCount: parseInt(row.login_count, 10),
          uniqueUsers: parseInt(row.unique_users, 10),
          suspiciousCount: parseInt(row.suspicious_count, 10),
          lastLogin: row.last_login,
          latitude: parseFloat(row.latitude) || 0,
          longitude: parseFloat(row.longitude) || 0
        })),
        period: {
          start: daysAgo.toISOString(),
          end: new Date().toISOString()
        }
      }
    });
  } catch (error: any) {
    logger.error('Failed to fetch login map data', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch login map data' });
  }
});

/**
 * GET /api/v1/login-activity/stats
 * Get login activity statistics for dashboard
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, message: 'No organization context' });
    }

    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Get various stats
    const [totalResult, suspiciousResult, countriesResult, recentResult] = await Promise.all([
      // Total logins in last 7 days
      db.query(
        `SELECT COUNT(*) as count FROM login_activity
         WHERE organization_id = $1 AND login_timestamp >= $2`,
        [organizationId, weekAgo.toISOString()]
      ),
      // Suspicious logins in last 7 days
      db.query(
        `SELECT COUNT(*) as count FROM login_activity
         WHERE organization_id = $1 AND login_timestamp >= $2 AND is_suspicious = TRUE`,
        [organizationId, weekAgo.toISOString()]
      ),
      // Unique countries in last 7 days
      db.query(
        `SELECT COUNT(DISTINCT country_code) as count FROM login_activity
         WHERE organization_id = $1 AND login_timestamp >= $2 AND country_code IS NOT NULL`,
        [organizationId, weekAgo.toISOString()]
      ),
      // Logins in last 24 hours
      db.query(
        `SELECT COUNT(*) as count FROM login_activity
         WHERE organization_id = $1 AND login_timestamp >= $2`,
        [organizationId, dayAgo.toISOString()]
      )
    ]);

    res.json({
      success: true,
      data: {
        totalLogins7d: parseInt(totalResult.rows[0]?.count || '0', 10),
        suspiciousLogins7d: parseInt(suspiciousResult.rows[0]?.count || '0', 10),
        uniqueCountries7d: parseInt(countriesResult.rows[0]?.count || '0', 10),
        logins24h: parseInt(recentResult.rows[0]?.count || '0', 10)
      }
    });
  } catch (error: any) {
    logger.error('Failed to fetch login stats', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch login stats' });
  }
});

/**
 * POST /api/v1/login-activity/sync
 * Manually trigger login activity sync
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, message: 'No organization context' });
    }

    // Sync login activity from Google
    const syncResult = await googleWorkspaceService.syncLoginActivity(organizationId);

    if (syncResult.success && syncResult.stored > 0) {
      // Enrich with GeoIP data
      const geoResult = await geoipService.enrichLoginActivity(organizationId, syncResult.stored);

      res.json({
        success: true,
        data: {
          fetched: syncResult.fetched,
          stored: syncResult.stored,
          geoEnriched: geoResult.updated,
          errors: syncResult.errors + geoResult.errors
        }
      });
    } else {
      res.json({
        success: syncResult.success,
        data: {
          fetched: syncResult.fetched,
          stored: syncResult.stored,
          errors: syncResult.errors
        }
      });
    }
  } catch (error: any) {
    logger.error('Failed to sync login activity', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to sync login activity' });
  }
});

/**
 * POST /api/v1/login-activity/enrich
 * Enrich existing login activity with GeoIP data
 */
router.post('/enrich', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, message: 'No organization context' });
    }

    const { limit = 100 } = req.body;
    const result = await geoipService.enrichLoginActivity(organizationId, limit);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    logger.error('Failed to enrich login activity', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to enrich login activity' });
  }
});

export default router;
