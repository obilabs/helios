import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { auth } from '../lib/auth.js';

import { getJwtSecret } from '../config/secrets.js';
import { isAdminRole } from '../utils/roles.js';

export { isAdminRole };

/**
 * Determine if user is an employee (can access user/employee UI)
 * External admins (MSPs, consultants) are NOT employees.
 */
function isEmployeeUser(isExternalAdmin: boolean | undefined): boolean {
  // External admins are not employees
  return isExternalAdmin !== true;
}

// Express Request type extensions are defined in types/express.d.ts

interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  isAdmin: boolean;
  isEmployee: boolean;
}

/**
 * Try to get user from better-auth session cookie
 * Returns null if no valid session
 */
async function getUserFromSession(req: Request): Promise<AuthenticatedUser | null> {
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
 * The user carried by a valid `Authorization: Bearer <access token>`, or null.
 *
 * The token is always passed to jwt.verify (an absent or malformed header
 * becomes an empty token, which fails verification), so the outcome depends
 * only on verification, never on the shape of the header alone.
 */
function userFromBearerToken(req: Request): AuthenticatedUser | null {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.substring(7) : '';
  try {
    const decoded: any = jwt.verify(token, getJwtSecret());
    if (decoded?.type !== 'access') return null;
    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      organizationId: decoded.organizationId,
      isAdmin: isAdminRole(decoded.role),
      isEmployee: isEmployeeUser(decoded.isExternalAdmin)
    };
  } catch (error) {
    if (token) {
      logger.debug('JWT auth failed, trying session', { error: (error as Error).message });
    }
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
    // Method 1: JWT Bearer token
    const bearerUser = userFromBearerToken(req);
    if (bearerUser) {
      req.user = bearerUser;
      return next();
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
 * The canonical admin guard. Apply it to every route that mutates
 * organization-wide state or reads org-wide sensitive data.
 *
 * Order-independent: if no authentication middleware has run yet it
 * authenticates the request itself first, so `router.post('/x', requireAdmin, ...)`
 * is safe even on a router without `router.use(authenticateToken)`.
 *
 * Admin = isAdminRole(role) (utils/roles.ts): admin, super_admin, platform_owner.
 * Enforced by __tests__/route-authorization.test.ts.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return authenticateToken(req, res, () => checkAdmin(req, res, next));
  }
  return checkAdmin(req, res, next);
};

function checkAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (!isAdminRole(req.user.role)) {
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
}

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
  // Method 1: JWT Bearer token
  const bearerUser = userFromBearerToken(req);
  if (bearerUser) {
    req.user = bearerUser;
    return next();
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
    // Method 1: JWT Bearer token
    const bearerUser = userFromBearerToken(req);
    let authenticated = false;
    if (bearerUser) {
      req.user = bearerUser;
      authenticated = true;
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
    if (permission === 'admin' && !isAdminRole(req.user!.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `${permission} permission required`
      });
    }

    next();
  };
};