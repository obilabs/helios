import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secure_jwt_secret_key_here';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  type: 'access' | 'refresh';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResult {
  success: boolean;
  tokens?: AuthTokens;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  error?: string;
}

export class AuthService {
  /**
   * Generate JWT access token
   */
  generateAccessToken(userId: string, email: string, role: string, organizationId?: string): string {
    const payload: any = {
      userId,
      email,
      role,
      type: 'access' as const
    };

    // Include organizationId if provided
    if (organizationId) {
      payload.organizationId = organizationId;
    }

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    } as any);
  }

  /**
   * Generate JWT refresh token
   */
  generateRefreshToken(userId: string, email: string, role: string, organizationId?: string): string {
    const payload: any = {
      userId,
      email,
      role,
      type: 'refresh' as const
    };

    // Include organizationId if provided
    if (organizationId) {
      payload.organizationId = organizationId;
    }

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN
    } as any);
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      return decoded;
    } catch (error) {
      logger.warn('Token verification failed', { error });
      return null;
    }
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<LoginResult> {
    try {
      // Find user by email in organization_users table
      const result = await db.query(
        `SELECT ou.id, ou.email, ou.password_hash, ou.first_name, ou.last_name,
                ou.role, ou.is_active, ou.organization_id
         FROM organization_users ou
         WHERE ou.email = $1`,
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      const user = result.rows[0];

      // Check if user is active
      if (!user.is_active) {
        return {
          success: false,
          error: 'Account is disabled'
        };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        logger.warn('Failed login attempt', { email });
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Generate tokens with organizationId
      const accessToken = this.generateAccessToken(user.id, user.email, user.role, user.organization_id);
      const refreshToken = this.generateRefreshToken(user.id, user.email, user.role, user.organization_id);

      // Calculate expiration time in seconds
      const expiresIn = this.getTokenExpirationSeconds(JWT_EXPIRES_IN);

      // Update last login time
      await db.query(
        `UPDATE organization_users SET last_login = NOW() WHERE id = $1`,
        [user.id]
      );

      // Log successful login (if audit_logs table exists)
      try {
        await db.query(
          `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
           VALUES ($1, 'login', 'auth', $2, $3)`,
          [user.id, 'system', 'Organization Portal Login']
        );
      } catch (error) {
        // Audit logs table might not exist yet, ignore
      }

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        role: user.role
      });

      return {
        success: true,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role
        }
      };

    } catch (error) {
      logger.error('Login failed', error);
      return {
        success: false,
        error: 'Login failed due to server error'
      };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<LoginResult> {
    try {
      const decoded = this.verifyToken(refreshToken);

      if (!decoded || decoded.type !== 'refresh') {
        return {
          success: false,
          error: 'Invalid refresh token'
        };
      }

      // Verify user still exists and is active
      const result = await db.query(
        `SELECT id, email, first_name, last_name, role, is_active, organization_id
         FROM organization_users
         WHERE id = $1`,
        [decoded.userId]
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return {
          success: false,
          error: 'User not found or inactive'
        };
      }

      const user = result.rows[0];

      // Generate new tokens with organizationId
      const newAccessToken = this.generateAccessToken(user.id, user.email, user.role, user.organization_id);
      const newRefreshToken = this.generateRefreshToken(user.id, user.email, user.role, user.organization_id);
      const expiresIn = this.getTokenExpirationSeconds(JWT_EXPIRES_IN);

      return {
        success: true,
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role
        }
      };

    } catch (error) {
      logger.error('Token refresh failed', error);
      return {
        success: false,
        error: 'Token refresh failed'
      };
    }
  }

  /**
   * Logout user (client-side token removal)
   */
  async logout(userId: string): Promise<void> {
    try {
      // Log logout action
      await db.query(
        `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
         VALUES ($1, 'logout', 'auth', $2, $3)`,
        [userId, 'system', 'Owner Portal Logout']
      );

      logger.info('User logged out', { userId });
    } catch (error) {
      logger.error('Logout logging failed', error);
    }
  }

  /**
   * Convert time string to seconds
   */
  private getTokenExpirationSeconds(timeString: string): number {
    const unit = timeString.slice(-1);
    const value = parseInt(timeString.slice(0, -1));

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 86400; // Default 24 hours
    }
  }
}

export const authService = new AuthService();