import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @openapi
 * /api/v1/organization/security-events:
 *   get:
 *     summary: List security events
 *     description: Get security events for the organization with optional filtering.
 *     tags: [Security Events]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *       - in: query
 *         name: acknowledged
 *         schema:
 *           type: boolean
 *         description: Filter by acknowledgment status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Security events list
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
 *                       eventType:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       title:
 *                         type: string
 *                       acknowledged:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 unacknowledgedCount:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { severity, acknowledged, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        id,
        event_type,
        severity,
        user_id,
        user_email,
        title,
        description,
        details,
        source,
        acknowledged,
        acknowledged_by,
        acknowledged_at,
        created_at
      FROM security_events
      WHERE organization_id = $1
    `;

    const params: any[] = [organizationId];

    if (severity) {
      params.push(severity);
      query += ` AND severity = $${params.length}`;
    }

    if (acknowledged === 'true') {
      query += ` AND acknowledged = true`;
    } else if (acknowledged === 'false') {
      query += ` AND acknowledged = false`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get unacknowledged count
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM security_events WHERE organization_id = $1 AND acknowledged = false',
      [organizationId]
    );

    res.json({
      success: true,
      data: result.rows,
      unacknowledgedCount: parseInt(countResult.rows[0].count)
    });
  } catch (error: any) {
    logger.error('Failed to fetch security events', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch security events' });
  }
});

/**
 * @openapi
 * /api/v1/organization/security-events/{id}/acknowledge:
 *   patch:
 *     summary: Acknowledge security event
 *     description: Mark a security event as acknowledged with optional note.
 *     tags: [Security Events]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *                 description: Optional note about acknowledgment
 *     responses:
 *       200:
 *         description: Event acknowledged
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
 */
router.patch('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const organizationId = req.user?.organizationId;

    await db.query(`
      UPDATE security_events
      SET
        acknowledged = true,
        acknowledged_by = $1,
        acknowledged_at = NOW(),
        acknowledged_note = $2
      WHERE id = $3 AND organization_id = $4
    `, [req.user?.userId, note, id, organizationId]);

    res.json({ success: true, message: 'Security event acknowledged' });
  } catch (error: any) {
    logger.error('Failed to acknowledge security event', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to acknowledge event' });
  }
});

export default router;
