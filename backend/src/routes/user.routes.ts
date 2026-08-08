import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: User
 *     description: Current user profile and password management
 */

/**
 * @openapi
 * /api/v1/user/me:
 *   get:
 *     summary: Get current user
 *     description: Get the authenticated user's profile.
 *     tags: [User]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  try {
    // Get the authenticated user from the token
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const result = await db.query(
      `SELECT id, email, first_name, last_name, role, created_at, organization_id
       FROM organization_users
       WHERE id = $1 AND is_active = true`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          createdAt: user.created_at
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get user info', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user information'
    });
  }
}));

/**
 * @openapi
 * /api/v1/user/change-password:
 *   post:
 *     summary: Change password
 *     description: Change the current user's password.
 *     tags: [User]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               userId:
 *                 type: string
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Current password incorrect
 *       403:
 *         description: Cannot change another user's password
 *       404:
 *         description: User not found
 */
router.post('/change-password', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    // Validate inputs
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters'
      });
    }

    // Verify the user ID matches the authenticated user
    if (req.user?.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only change your own password'
      });
    }

    // Get current password hash
    const userResult = await db.query(
      'SELECT password_hash FROM organization_users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await db.query(
      'UPDATE organization_users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );

    // Log the password change
    await db.query(
      `INSERT INTO audit_logs (user_id, organization_id, action, resource, ip_address, user_agent)
       VALUES ($1, (SELECT organization_id FROM organization_users WHERE id = $1), 'password_change', 'user', $2, $3)`,
      [userId, req.ip, req.get('User-Agent') || 'Unknown']
    );

    logger.info('Password changed successfully', { userId });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Failed to change password', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
}));

export default router;