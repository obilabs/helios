/**
 * Session-based Authentication Middleware (better-auth)
 *
 * This middleware validates better-auth sessions from httpOnly cookies.
 * Falls back to JWT Bearer token for backward compatibility with:
 * - Mobile apps
 * - API clients
 * - Legacy frontend during migration
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { auth } from '../lib/auth.js';
import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secure_jwt_secret_key_here';

/**
 * Determine if a role has admin privileges
 */
function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'platform_owner';
}

/**
 * Determine if user is an employee (can access user/employee UI)
 * External admins (MSPs, consultants) are NOT employees.
 */
function isEmployeeUser(isExternalAdmin: boolean | undefined): boolean {
  return isExternalAdmin !== true;
}

/**
 * Get session from better-auth cookies
 */
async function getSessionFromCookies(req: Request): Promise<{
  session: any;
  user: any;
} | null> {
  try {
    // Create a headers object from the request
    const headers = new Headers();
    Object.entries(req.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      }
    });

    // Use better-auth's session API
    const session = await auth.api.getSession({
      headers,
    });

    if (session?.session && session?.user) {
      return {
        session: session.session,
        user: session.user,
      };
    }

    return null;
  } catch (error) {
    logger.debug('Failed to get session from cookies', { error });
    return null;
  }
}

/**
 * Get user from JWT token (fallback)
 */
function getUserFromJWT(req: Request): {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  isExternalAdmin?: boolean;
} | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);

    if (decoded && decoded.type === 'access') {
      return {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        organizationId: decoded.organizationId,
        isExternalAdmin: decoded.isExternalAdmin,
      };
    }
  } catch (error) {
    // Token invalid
  }

  return null;
}

/**
 * Primary authentication middleware
 * Checks for better-auth session first, then falls back to JWT
 */
export const authenticateSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Track authentication start time
  req.startTime = Date.now();

  // Try session-based auth first (better-auth cookies)
  const sessionData = await getSessionFromCookies(req);

  if (sessionData) {
    const { user } = sessionData;

    // Fetch additional user data from database for complete user object
    try {
      const result = await db.query(
        `SELECT id, email, role, organization_id,
                COALESCE(is_external_admin, false) as is_external_admin,
                default_view
         FROM organization_users
         WHERE id = $1 AND is_active = true`,
        [user.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Authentication failed',
          message: 'User account not found or inactive',
        });
      }

      const dbUser = result.rows[0];

      req.user = {
        userId: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        organizationId: dbUser.organization_id,
        isAdmin: isAdminRole(dbUser.role),
        isEmployee: isEmployeeUser(dbUser.is_external_admin),
        authMethod: 'session',
      };

      return next();
    } catch (error) {
      logger.error('Database error during session auth', { error });
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Authentication failed due to internal error',
      });
    }
  }

  // Fall back to JWT authentication
  const jwtUser = getUserFromJWT(req);

  if (jwtUser) {
    req.user = {
      userId: jwtUser.userId,
      email: jwtUser.email,
      role: jwtUser.role,
      organizationId: jwtUser.organizationId,
      isAdmin: isAdminRole(jwtUser.role),
      isEmployee: isEmployeeUser(jwtUser.isExternalAdmin),
      authMethod: 'jwt',
    };

    return next();
  }

  // No valid authentication found
  return res.status(401).json({
    success: false,
    error: 'Authentication required',
    message: 'No valid session or token provided',
  });
};

/**
 * Optional authentication middleware
 * Attaches user if authenticated, but doesn't fail if not
 */
export const optionalSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Try session-based auth
  const sessionData = await getSessionFromCookies(req);

  if (sessionData) {
    const { user } = sessionData;

    try {
      const result = await db.query(
        `SELECT id, email, role, organization_id,
                COALESCE(is_external_admin, false) as is_external_admin
         FROM organization_users
         WHERE id = $1 AND is_active = true`,
        [user.id]
      );

      if (result.rows.length > 0) {
        const dbUser = result.rows[0];
        req.user = {
          userId: dbUser.id,
          email: dbUser.email,
          role: dbUser.role,
          organizationId: dbUser.organization_id,
          isAdmin: isAdminRole(dbUser.role),
          isEmployee: isEmployeeUser(dbUser.is_external_admin),
          authMethod: 'session',
        };
      }
    } catch (error) {
      logger.debug('Database error during optional session auth', { error });
    }
  } else {
    // Try JWT
    const jwtUser = getUserFromJWT(req);

    if (jwtUser) {
      req.user = {
        userId: jwtUser.userId,
        email: jwtUser.email,
        role: jwtUser.role,
        organizationId: jwtUser.organizationId,
        isAdmin: isAdminRole(jwtUser.role),
        isEmployee: isEmployeeUser(jwtUser.isExternalAdmin),
        authMethod: 'jwt',
      };
    }
  }

  next();
};

/**
 * Require admin role (works with both session and JWT auth)
 */
export const requireSessionAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  if (!req.user.isAdmin) {
    logger.warn('Unauthorized admin access attempt', {
      userId: req.user.userId,
      role: req.user.role,
      path: req.path,
    });

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }

  next();
};

/**
 * Require employee status (works with both session and JWT auth)
 */
export const requireSessionEmployee = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  if (!req.user.isEmployee) {
    logger.warn('Unauthorized employee access attempt', {
      userId: req.user.userId,
      role: req.user.role,
      path: req.path,
    });

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Employee access required. External admins cannot access this feature.',
    });
  }

  next();
};

// Re-export for convenience
export {
  authenticateSession as requireAuth,
  requireSessionAdmin as requireAdmin,
  requireSessionEmployee as requireEmployee,
  optionalSession as optionalAuth,
};
