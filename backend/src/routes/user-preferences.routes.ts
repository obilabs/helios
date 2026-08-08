import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../database/connection.js';

const router = express.Router();

/**
 * @openapi
 * tags:
 *   - name: User Preferences
 *     description: User preference management
 */

/**
 * @openapi
 * /api/v1/user-preferences:
 *   get:
 *     summary: Get preferences
 *     description: Get current user's preferences.
 *     tags: [User Preferences]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User preferences
 *       404:
 *         description: User not found
 */
router.get('/', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const result = await db.query(
      `SELECT user_preferences FROM organization_users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const preferences = result.rows[0].user_preferences || {};

    res.json({ success: true, data: preferences });
  } catch (error: any) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/user-preferences:
 *   put:
 *     summary: Update preferences
 *     description: Update current user's preferences.
 *     tags: [User Preferences]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - preferences
 *             properties:
 *               preferences:
 *                 type: object
 *     responses:
 *       200:
 *         description: Preferences updated
 *       400:
 *         description: Invalid preferences
 *       404:
 *         description: User not found
 */
router.put('/', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.userId;
    const { preferences } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid preferences object'
      });
    }

    // Update user preferences
    const result = await db.query(
      `UPDATE organization_users
       SET user_preferences = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING user_preferences`,
      [JSON.stringify(preferences), userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: result.rows[0].user_preferences,
      message: 'Preferences saved successfully'
    });
  } catch (error: any) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/user-preferences/dashboard-widgets:
 *   patch:
 *     summary: Update dashboard widgets
 *     tags: [User Preferences]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - widgets
 *             properties:
 *               widgets:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Widgets updated
 *       400:
 *         description: Invalid widgets array
 */
router.patch('/dashboard-widgets', requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const userId = req.user?.userId;
    const { widgets } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!Array.isArray(widgets)) {
      return res.status(400).json({
        success: false,
        error: 'Widgets must be an array'
      });
    }

    // Get current preferences
    const current = await db.query(
      `SELECT user_preferences FROM organization_users WHERE id = $1`,
      [userId]
    );

    const currentPreferences = current.rows[0]?.user_preferences || {};

    // Update only dashboard widgets
    const updatedPreferences = {
      ...currentPreferences,
      dashboardWidgets: widgets
    };

    // Save back
    const result = await db.query(
      `UPDATE organization_users
       SET user_preferences = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING user_preferences`,
      [JSON.stringify(updatedPreferences), userId]
    );

    res.json({
      success: true,
      data: result.rows[0].user_preferences,
      message: 'Dashboard widgets updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating dashboard widgets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
