import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
import { EmailService } from './email.service.js';

interface PasswordSetupToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
}

export class PasswordSetupService {
  /**
   * Generate a secure random token
   */
  private static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a password setup token for a user
   */
  static async createPasswordSetupToken(
    userId: string,
    expiryHours: number = 48,
    createdBy?: string
  ): Promise<string> {
    try {
      const token = this.generateToken();
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      await db.query(
        `INSERT INTO password_setup_tokens (user_id, token, expires_at, created_by)
         VALUES ($1, $2, $3, $4)`,
        [userId, token, expiresAt, createdBy || null]
      );

      logger.info('Password setup token created', {
        userId,
        expiresAt,
        expiryHours
      });

      return token;

    } catch (error: any) {
      logger.error('Failed to create password setup token', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Verify a password setup token
   */
  static async verifyToken(token: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
    try {
      const result = await db.query(
        `SELECT id, user_id, expires_at, used
         FROM password_setup_tokens
         WHERE token = $1`,
        [token]
      );

      if (result.rows.length === 0) {
        return { valid: false, error: 'Invalid token' };
      }

      const tokenData = result.rows[0];

      if (tokenData.used) {
        return { valid: false, error: 'Token already used' };
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, userId: tokenData.user_id };

    } catch (error: any) {
      logger.error('Failed to verify token', { error: error.message });
      return { valid: false, error: 'Token verification failed' };
    }
  }

  /**
   * Mark a token as used
   */
  static async markTokenAsUsed(token: string): Promise<void> {
    try {
      await db.query(
        `UPDATE password_setup_tokens
         SET used = true, used_at = NOW()
         WHERE token = $1`,
        [token]
      );

      logger.info('Password setup token marked as used', { token: token.substring(0, 10) + '...' });

    } catch (error: any) {
      logger.error('Failed to mark token as used', { error: error.message });
      throw error;
    }
  }

  /**
   * Send password setup email
   */
  static async sendPasswordSetupEmail(
    userId: string,
    organizationId: string,
    alternateEmail: string,
    expiryHours: number = 48
  ): Promise<boolean> {
    try {
      // Get user info
      const userResult = await db.query(
        'SELECT email, first_name FROM organization_users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      // Create token
      const token = await this.createPasswordSetupToken(userId, expiryHours);

      // Build setup link
      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      const setupLink = `${baseUrl}/setup-password?token=${token}`;

      // Send email
      const emailService = new EmailService(organizationId);
      const sent = await emailService.sendPasswordSetupEmail(
        alternateEmail,
        user.first_name,
        setupLink,
        expiryHours
      );

      if (sent) {
        logger.info('Password setup email sent', {
          userId,
          to: alternateEmail
        });
      }

      return sent;

    } catch (error: any) {
      logger.error('Failed to send password setup email', {
        error: error.message,
        userId
      });
      return false;
    }
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  static async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await db.query(
        `DELETE FROM password_setup_tokens
         WHERE expires_at < NOW() OR (used = true AND used_at < NOW() - INTERVAL '7 days')
         RETURNING id`
      );

      const deletedCount = result.rowCount || 0;

      logger.info('Cleaned up expired password setup tokens', { deletedCount });

      return deletedCount;

    } catch (error: any) {
      logger.error('Failed to cleanup expired tokens', { error: error.message });
      return 0;
    }
  }
}
