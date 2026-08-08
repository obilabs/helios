import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { hashApiKey, validateApiKeyFormat } from '../utils/apiKey.js';
import { db } from '../database/connection.js';

// Extend Express Request type to include API key context
declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        name: string;
        type: 'service' | 'vendor';
        organizationId: string;
        permissions: string[];
        vendorConfig?: any;
        serviceConfig?: any;
      };
      actorContext?: {
        type: string;
        name: string;
        email: string;
        id?: string;
        clientReference?: string;
      };
      organizationId?: string;
    }
  }
}

/**
 * API Key Authentication Middleware
 *
 * Authenticates requests using X-API-Key header.
 * Supports two key types:
 * - Service keys: For automation, no actor required
 * - Vendor keys: For human operators, REQUIRES actor attribution
 *
 * Authentication flow:
 * 1. Extract API key from X-API-Key header
 * 2. Validate key format
 * 3. Hash and lookup in database
 * 4. Check expiration, active status
 * 5. Check IP whitelist (if configured)
 * 6. For vendor keys: Enforce actor headers
 * 7. Validate against pre-approved actors (if configured)
 * 8. Update last_used_at timestamp
 * 9. Attach key and actor context to request
 */
export const authenticateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const apiKeyHeader = req.headers['x-api-key'] as string;

  // If no API key provided, skip API key auth (will try JWT)
  if (!apiKeyHeader) {
    return next();
  }

  try {
    // Validate format
    if (!validateApiKeyFormat(apiKeyHeader)) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key format',
        message: 'API key must be in format: helios_{env}_{random}',
      });
      return;
    }

    // Hash the key
    const keyHash = hashApiKey(apiKeyHeader);

    // Lookup key in database
    const result = await db.query(
      `SELECT
        id,
        organization_id,
        name,
        type,
        permissions,
        expires_at,
        is_active,
        vendor_config,
        service_config,
        ip_whitelist
      FROM api_keys
      WHERE key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      logger.warn('API key authentication failed: key not found', {
        keyPrefix: `${apiKeyHeader.substring(0, 20)}...`
      });
      res.status(401).json({
        success: false,
        error: 'Invalid API key',
        message: 'The provided API key is invalid',
      });
      return;
    }

    const key = result.rows[0];

    // Check if key is active
    if (!key.is_active) {
      logger.warn('API key authentication failed: key is revoked', {
        keyId: key.id,
        keyName: key.name
      });
      res.status(401).json({
        success: false,
        error: 'API key revoked',
        message: 'This API key has been revoked',
      });
      return;
    }

    // Check expiration
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      logger.warn('API key authentication failed: key expired', {
        keyId: key.id,
        keyName: key.name,
        expiresAt: key.expires_at
      });
      res.status(401).json({
        success: false,
        error: 'API key expired',
        message: 'This API key has expired',
        expiresAt: key.expires_at,
      });
      return;
    }

    // Check IP whitelist (if configured)
    if (key.ip_whitelist && Array.isArray(key.ip_whitelist) && key.ip_whitelist.length > 0) {
      const clientIp = req.ip || req.socket.remoteAddress || '';
      const isWhitelisted = key.ip_whitelist.some((allowedIp: string) => {
        // Simple IP matching (could be enhanced with CIDR support)
        return clientIp === allowedIp || clientIp.includes(allowedIp);
      });

      if (!isWhitelisted) {
        logger.warn('API key authentication failed: IP not whitelisted', {
          keyId: key.id,
          keyName: key.name,
          clientIp,
          whitelist: key.ip_whitelist
        });
        res.status(403).json({
          success: false,
          error: 'IP not whitelisted',
          message: 'Your IP address is not authorized to use this API key',
        });
        return;
      }
    }

    // Vendor key: Enforce actor attribution
    if (key.type === 'vendor') {
      const actorName = req.headers['x-actor-name'] as string;
      const actorEmail = req.headers['x-actor-email'] as string;

      // Check if actor headers are required (default: true for vendor keys)
      const requiresActor = key.vendor_config?.requiresActor !== false;

      if (requiresActor && (!actorName || !actorEmail)) {
        logger.warn('API key authentication failed: actor headers missing', {
          keyId: key.id,
          keyName: key.name,
          hasActorName: !!actorName,
          hasActorEmail: !!actorEmail
        });
        res.status(400).json({
          success: false,
          error: 'Actor information required',
          message: 'Vendor API keys require X-Actor-Name and X-Actor-Email headers',
          requiredHeaders: ['X-Actor-Name', 'X-Actor-Email'],
          optionalHeaders: ['X-Actor-ID', 'X-Client-Reference'],
        });
        return;
      }

      // Validate against pre-approved actors (if configured)
      if (key.vendor_config?.allowedActors && Array.isArray(key.vendor_config.allowedActors)) {
        const allowedActors: string[] = key.vendor_config.allowedActors;
        if (allowedActors.length > 0 && !allowedActors.includes(actorEmail)) {
          logger.warn('API key authentication failed: actor not pre-approved', {
            keyId: key.id,
            keyName: key.name,
            actorEmail,
            allowedActors
          });
          res.status(403).json({
            success: false,
            error: 'Actor not pre-approved',
            message: 'This user is not authorized to use this API key',
          });
          return;
        }
      }

      // Attach actor context to request
      req.actorContext = {
        type: (req.headers['x-actor-type'] as string) || 'human',
        name: actorName,
        email: actorEmail,
        id: req.headers['x-actor-id'] as string,
        clientReference: req.headers['x-client-reference'] as string,
      };
    }

    // Update last_used_at timestamp (async, don't wait)
    db.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [key.id]
    ).catch((error) => {
      logger.error('Failed to update API key last_used_at', {
        keyId: key.id,
        error: error.message
      });
    });

    // Attach API key context to request
    req.apiKey = {
      id: key.id,
      name: key.name,
      type: key.type,
      organizationId: key.organization_id,
      permissions: key.permissions || [],
      vendorConfig: key.vendor_config,
      serviceConfig: key.service_config,
    };

    // Also set organizationId for compatibility with existing code
    req.organizationId = key.organization_id;

    logger.info('API key authentication successful', {
      keyId: key.id,
      keyName: key.name,
      type: key.type,
      organizationId: key.organization_id,
      hasActor: !!req.actorContext
    });

    next();
  } catch (error: any) {
    logger.error('API key authentication error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during API key authentication',
    });
  }
};

/**
 * Permission checking middleware
 *
 * Verifies that the API key has the required permission scope
 *
 * @param requiredPermission - Permission scope (e.g., "read:users", "write:groups")
 * @returns Express middleware function
 */
export const requirePermission = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // If no API key, assume JWT auth (handled elsewhere)
    if (!req.apiKey) {
      return next();
    }

    const hasPermission = req.apiKey.permissions.includes(requiredPermission);

    if (!hasPermission) {
      logger.warn('API key permission denied', {
        keyId: req.apiKey.id,
        keyName: req.apiKey.name,
        requiredPermission,
        availablePermissions: req.apiKey.permissions
      });
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `This API key does not have the '${requiredPermission}' permission`,
        requiredPermission,
      });
      return;
    }

    next();
  };
};
