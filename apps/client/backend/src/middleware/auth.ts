import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { auth } from '../lib/auth.js';

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
  // External admins are not employees
  return isExternalAdmin !== true;
}

// Express Request type extensions are defined in types/express.d.ts

/**
 * Try to get user from better-auth session cookie
 * Returns null if no valid session
 */
async function getUserFromSession(req: Request): Promise<{
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  isAdmin: boolean;
  isEmployee: boolean;
} | null> {
  try {
    // Convert Express request to a Headers object for better-auth
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      }
    }

    // Get session from better-auth
    const session = await auth.api.getSession({ headers });

    if (!session || !session.user) {
      return null;
    }

    const user = session.user as any;

    return {
      userId: user.id,
      email: user.email,
      role: user.role || 'user',
      organizationId: user.organizationId,
      isAdmin: isAdminRole(user.role || 'user'),
      isEmployee: isEmployeeUser(user.isExternalAdmin)
    };
  } catch (error) {
    logger.debug('Session auth failed', { error: (error as Error).message });
    return null;
  }
}

/**
 * Middleware to verify authentication (JWT token or session cookie)
 *
 * Supports two authentication methods:
 * 1. JWT Bearer token in Authorization header (for API keys, legacy)
 * 2. better-auth session cookie (for frontend, XSS-resistant)
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    // Method 1: Check for JWT Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);

        if (decoded && decoded.type === 'access') {
          // Attach user info from JWT
          req.user = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            organizationId: decoded.organizationId,
            isAdmin: isAdminRole(decoded.role),
            isEmployee: isEmployeeUser(decoded.isExternalAdmin)
          };
          next();
          return;
        }
      } catch (jwtError) {
        // JWT invalid, try session auth below
        logger.debug('JWT auth failed, trying session', { error: (jwtError as Error).message });
      }
    }

    // Method 2: Check for better-auth session cookie
    const sessionUser = await getUserFromSession(req);
    if (sessionUser) {
      req.user = sessionUser;
      return next();
    }

    // No valid authentication found
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'No valid authorization token or session provided'
    });
  } catch (error) {
    logger.error('Auth middleware error', { error: (error as Error).message });
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

/**
 * Middleware to require admin privileges
 * Use for routes that require administrative access
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (!req.user.isAdmin) {
    logger.warn('Unauthorized admin access attempt', {
      userId: req.user.userId,
      role: req.user.role,
      path: req.path
    });

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  next();
};

/**
 * Middleware to require employee status
 * Use for routes that require employee/user access (People, My Team, My Profile)
 */
export const requireEmployee = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (!req.user.isEmployee) {
    logger.warn('Unauthorized employee access attempt', {
      userId: req.user.userId,
      role: req.user.role,
      path: req.path
    });

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Employee access required. External admins cannot access this feature.'
    });
  }

  next();
};

/**
 * Middleware to require platform owner role
 */
export const requirePlatformOwner = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'platform_owner') {
    logger.warn('Unauthorized access attempt', {
      userId: req.user.userId,
      role: req.user.role,
      path: req.path
    });

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Platform owner access required'
    });
  }

  next();
};

/**
 * Optional authentication - attaches user if token/session is valid, but doesn't fail if missing
 * Supports both JWT tokens and better-auth session cookies.
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  // Method 1: Check for JWT Bearer token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);

      if (decoded && decoded.type === 'access') {
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          organizationId: decoded.organizationId,
          isAdmin: isAdminRole(decoded.role),
          isEmployee: isEmployeeUser(decoded.isExternalAdmin)
        };
        return next();
      }
    } catch (error) {
      // Token invalid, try session auth
    }
  }

  // Method 2: Check for better-auth session cookie
  const sessionUser = await getUserFromSession(req);
  if (sessionUser) {
    req.user = sessionUser;
  }

  next();
};

/**
 * Alias for authenticateToken for better naming consistency
 */
export const requireAuth = authenticateToken;

/**
 * Middleware to require specific permission/role
 * This middleware also handles authentication, so no need to call requireAuth separately
 * Supports both JWT tokens and better-auth session cookies.
 */
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    let authenticated = false;

    // Method 1: Check for JWT Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);

        if (decoded && decoded.type === 'access') {
          req.user = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            organizationId: decoded.organizationId,
            isAdmin: isAdminRole(decoded.role),
            isEmployee: isEmployeeUser(decoded.isExternalAdmin)
          };
          authenticated = true;
        }
      } catch (error) {
        // JWT invalid, try session auth
      }
    }

    // Method 2: Check for better-auth session cookie
    if (!authenticated) {
      const sessionUser = await getUserFromSession(req);
      if (sessionUser) {
        req.user = sessionUser;
        authenticated = true;
      }
    }

    if (!authenticated) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No valid authorization token or session provided'
      });
    }

    // Now check permission
    if (permission === 'admin' && !req.user!.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `${permission} permission required`
      });
    }

    next();
  };
};