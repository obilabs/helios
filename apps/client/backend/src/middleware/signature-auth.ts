/**
 * Signature Permission Middleware
 *
 * Middleware to check signature-specific permissions.
 * Permission levels: admin, designer, campaign_manager, helpdesk, viewer
 */

import { Request, Response, NextFunction } from 'express';
import { signaturePermissionsService } from '../services/signature-permissions.service.js';
import { PermissionLevel, hasCapability } from '../types/signatures.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to require a minimum signature permission level.
 *
 * Usage:
 *   router.get('/templates', requireSignaturePermission('designer'), handler);
 *
 * Permission hierarchy:
 *   admin > designer
 *   admin > campaign_manager
 *   admin > helpdesk > viewer
 *
 * Note: Org admins (role='admin') automatically have 'admin' signature permission.
 */
export const requireSignaturePermission = (requiredLevel: PermissionLevel) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'You must be logged in to access this resource',
      });
    }

    try {
      const hasPermission = await signaturePermissionsService.hasPermission(
        req.user.userId,
        requiredLevel
      );

      if (!hasPermission) {
        logger.warn('Signature permission denied', {
          userId: req.user.userId,
          requiredLevel,
          path: req.path,
          method: req.method,
        });

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `Signature ${requiredLevel} permission required`,
          requiredPermission: requiredLevel,
        });
      }

      next();
    } catch (error) {
      logger.error('Error checking signature permission', {
        userId: req.user.userId,
        requiredLevel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return res.status(500).json({
        success: false,
        error: 'Permission check failed',
        message: 'An error occurred while checking permissions',
      });
    }
  };
};

/**
 * Middleware to require a specific capability.
 *
 * Usage:
 *   router.post('/campaigns/:id/launch', requireSignatureCapability('campaigns.launch'), handler);
 *
 * This is more granular than permission levels, checking specific actions.
 */
export const requireSignatureCapability = (capability: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'You must be logged in to access this resource',
      });
    }

    try {
      const hasCapabilityResult = await signaturePermissionsService.hasCapabilityForUser(
        req.user.userId,
        capability
      );

      if (!hasCapabilityResult) {
        logger.warn('Signature capability denied', {
          userId: req.user.userId,
          capability,
          path: req.path,
          method: req.method,
        });

        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          message: `Signature permission required: ${capability}`,
          requiredCapability: capability,
        });
      }

      next();
    } catch (error) {
      logger.error('Error checking signature capability', {
        userId: req.user.userId,
        capability,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return res.status(500).json({
        success: false,
        error: 'Permission check failed',
        message: 'An error occurred while checking permissions',
      });
    }
  };
};

/**
 * Middleware that attaches the user's signature permission level to the request.
 * Does NOT block - just enriches the request with permission info.
 *
 * Usage:
 *   router.use(attachSignaturePermission);
 *   // Then in handler: req.signaturePermission?.level
 */
export const attachSignaturePermission = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next();
  }

  try {
    const level = await signaturePermissionsService.getEffectivePermissionLevel(
      req.user.userId
    );

    // Extend request with signature permission info
    (req as any).signaturePermission = {
      level,
      hasCapability: (cap: string) => hasCapability(level, cap),
    };
  } catch (error) {
    // Non-blocking, just log and continue
    logger.warn('Failed to attach signature permission', {
      userId: req.user.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  next();
};

/**
 * Middleware to require signature admin permission (full access).
 * Shorthand for requireSignaturePermission('admin').
 */
export const requireSignatureAdmin = requireSignaturePermission('admin');

/**
 * Middleware to require at least helpdesk permission (view + sync).
 * Shorthand for requireSignaturePermission('helpdesk').
 */
export const requireSignatureHelpdesk = requireSignaturePermission('helpdesk');

/**
 * Type augmentation for request with signature permission
 */
declare global {
  namespace Express {
    interface Request {
      signaturePermission?: {
        level: PermissionLevel;
        hasCapability: (capability: string) => boolean;
      };
    }
  }
}
