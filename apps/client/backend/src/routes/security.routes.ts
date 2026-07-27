import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { authenticateToken } from '../middleware/auth.js';
import { oauthTokenSyncService } from '../services/oauth-token-sync.service.js';
import { securityAudit, AuditActions } from '../services/security-audit.service.js';
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  paginatedResponse
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * @openapi
 * /organization/security/2fa-status:
 *   get:
 *     summary: Get 2FA enrollment status for all users
 *     description: Returns 2FA enrollment summary and per-user status. Legacy endpoint (Google Workspace only). Use /unified-2fa for multi-source status.
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [all, enrolled, not-enrolled]
 *         description: Filter users by 2FA status
 *     responses:
 *       200:
 *         description: 2FA status data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         enrolled:
 *                           type: integer
 *                         notEnrolled:
 *                           type: integer
 *                         percentage:
 *                           type: number
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           email:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           isEnrolled2Sv:
 *                             type: boolean
 *                           lastLogin:
 *                             type: string
 *                             format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/2fa-status', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const filter = req.query.filter as string || 'all';
    const data = await oauthTokenSyncService.get2FAStatus(organizationId);

    // Apply filter if specified
    let filteredUsers = data.users;
    if (filter === 'enrolled') {
      filteredUsers = data.users.filter(u => u.isEnrolled2Sv);
    } else if (filter === 'not-enrolled') {
      filteredUsers = data.users.filter(u => !u.isEnrolled2Sv);
    }

    successResponse(res, {
      summary: data.summary,
      users: filteredUsers
    });
  } catch (error: any) {
    logger.error('Failed to get 2FA status', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get 2FA status');
  }
});

/**
 * @openapi
 * /organization/security/unified-2fa:
 *   get:
 *     summary: Get unified 2FA status across all identity sources
 *     description: Returns 2FA enrollment status from Helios, Google Workspace, and M365
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [all, helios, google, m365]
 *         description: Filter by identity source
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter by specific user email
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [all, enrolled, not-enrolled]
 *         description: Filter users by 2FA status
 *     responses:
 *       200:
 *         description: Unified 2FA status data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         enrolled:
 *                           type: integer
 *                         notEnrolled:
 *                           type: integer
 *                         percentage:
 *                           type: number
 *                         bySource:
 *                           type: object
 *                           properties:
 *                             helios:
 *                               type: object
 *                               properties:
 *                                 total:
 *                                   type: integer
 *                                 enrolled:
 *                                   type: integer
 *                             google:
 *                               type: object
 *                               properties:
 *                                 total:
 *                                   type: integer
 *                                 enrolled:
 *                                   type: integer
 *                             m365:
 *                               type: object
 *                               properties:
 *                                 total:
 *                                   type: integer
 *                                 enrolled:
 *                                   type: integer
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           email:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           source:
 *                             type: string
 *                             enum: [helios, google, m365]
 *                           isEnrolled:
 *                             type: boolean
 *                           isEnforced:
 *                             type: boolean
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 */
router.get('/unified-2fa', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const source = req.query.source as 'helios' | 'google' | 'm365' | 'all' | undefined;
    const email = req.query.email as string | undefined;
    const filter = req.query.filter as 'all' | 'enrolled' | 'not-enrolled' | undefined;

    const data = await oauthTokenSyncService.getUnified2FAStatus(organizationId, {
      source: source || 'all',
      email,
      filter: filter || 'all'
    });

    successResponse(res, data);
  } catch (error: any) {
    logger.error('Failed to get unified 2FA status', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get unified 2FA status');
  }
});

/**
 * @openapi
 * /organization/security/unified-2fa/{email}:
 *   get:
 *     summary: Get unified 2FA status for a specific user
 *     description: Returns 2FA status across all identity sources for a specific user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User's unified 2FA status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     sources:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           source:
 *                             type: string
 *                             enum: [helios, google, m365]
 *                           isEnrolled:
 *                             type: boolean
 *                           isEnforced:
 *                             type: boolean
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     anyEnrolled:
 *                       type: boolean
 *                     allEnrolled:
 *                       type: boolean
 *       404:
 *         description: User not found
 */
router.get('/unified-2fa/:email', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const { email } = req.params;
    const data = await oauthTokenSyncService.getUserUnified2FAStatus(organizationId, email);

    if (!data) {
      return notFoundResponse(res, 'User not found');
    }

    successResponse(res, data);
  } catch (error: any) {
    logger.error('Failed to get user unified 2FA status', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get user unified 2FA status');
  }
});

/**
 * @openapi
 * /organization/security/2fa-status/{email}:
 *   get:
 *     summary: Get 2FA status for a specific user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User 2FA status
 *       404:
 *         description: User not found
 */
router.get('/2fa-status/:email', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const { email } = req.params;
    const security = await oauthTokenSyncService.getUserSecurity(organizationId, email);

    if (!security) {
      return notFoundResponse(res, 'User not found');
    }

    successResponse(res, {
      email,
      twoFactor: security.twoFactor
    });
  } catch (error: any) {
    logger.error('Failed to get user 2FA status', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get user 2FA status');
  }
});

/**
 * @openapi
 * /organization/security/oauth-apps:
 *   get:
 *     summary: Get all OAuth apps connected to the organization
 *     description: Returns aggregated view of third-party apps with user counts
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by app name
 *       - in: query
 *         name: riskLevel
 *         schema:
 *           type: string
 *           enum: [low, medium, high, unknown]
 *         description: Filter by risk level
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [userCount, lastSeen, name]
 *         default: userCount
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         default: desc
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: OAuth apps list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalApps:
 *                           type: integer
 *                         totalGrants:
 *                           type: integer
 *                     apps:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           clientId:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                           scopes:
 *                             type: array
 *                             items:
 *                               type: string
 *                           riskLevel:
 *                             type: string
 *                           userCount:
 *                             type: integer
 *                           firstSeen:
 *                             type: string
 *                             format: date-time
 *                           lastSeen:
 *                             type: string
 *                             format: date-time
 */
router.get('/oauth-apps', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const options = {
      search: req.query.search as string,
      riskLevel: req.query.riskLevel as string,
      sortBy: req.query.sortBy as 'userCount' | 'lastSeen' | 'name',
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0
    };

    const data = await oauthTokenSyncService.getOAuthApps(organizationId, options);

    successResponse(res, {
      summary: {
        totalApps: data.total,
        totalGrants: data.totalGrants
      },
      apps: data.apps.map(app => ({
        clientId: app.clientId,
        displayName: app.displayName,
        scopes: app.scopes,
        riskLevel: app.riskLevel,
        userCount: app.userCount,
        firstSeen: app.firstSeenAt,
        lastSeen: app.lastSeenAt
      })),
      pagination: {
        total: data.total,
        limit: options.limit,
        offset: options.offset
      }
    });
  } catch (error: any) {
    logger.error('Failed to get OAuth apps', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get OAuth apps');
  }
});

/**
 * @openapi
 * /organization/security/oauth-apps/{clientId}/users:
 *   get:
 *     summary: Get users who have granted access to a specific app
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users with this app
 */
router.get('/oauth-apps/:clientId/users', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const { clientId } = req.params;
    const data = await oauthTokenSyncService.getAppUsers(organizationId, clientId);

    successResponse(res, data);
  } catch (error: any) {
    logger.error('Failed to get app users', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get app users');
  }
});

/**
 * @openapi
 * /organization/security/oauth-apps/{clientId}:
 *   delete:
 *     summary: Revoke an OAuth app from all users
 *     description: Bulk revokes the specified app from all users in the organization
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Revoke result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     revokedCount:
 *                       type: integer
 *                     failedCount:
 *                       type: integer
 */
router.delete('/oauth-apps/:clientId', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const { clientId } = req.params;

    // Audit log the action
    await securityAudit.log({
      organizationId,
      action: AuditActions.SECURITY_BULK_REVOKE,
      actorId: req.user?.userId,
      actorEmail: req.user?.email || 'unknown',
      targetId: clientId,
      outcome: 'success'
    });

    const result = await oauthTokenSyncService.revokeAppFromAll(organizationId, clientId);

    successResponse(res, {
      message: result.success ? 'App revoked from all users' : 'Partial revocation completed',
      revokedCount: result.revokedCount,
      failedCount: result.failedCount,
      errors: result.errors.length > 0 ? result.errors : undefined
    });
  } catch (error: any) {
    logger.error('Failed to bulk revoke OAuth app', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to revoke OAuth app');
  }
});

/**
 * @openapi
 * /organization/security/oauth-apps/sync:
 *   post:
 *     summary: Trigger manual OAuth token sync
 *     description: Syncs OAuth tokens from Google Workspace for all users
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync result
 */
router.post('/oauth-apps/sync', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    logger.info('Manual OAuth token sync triggered', { organizationId });

    const result = await oauthTokenSyncService.syncAllTokens(organizationId);

    successResponse(res, {
      message: result.success ? 'Token sync completed' : 'Token sync completed with errors',
      appsFound: result.appsFound,
      tokensProcessed: result.tokensProcessed,
      usersProcessed: result.usersProcessed,
      errors: result.errors
    });
  } catch (error: any) {
    logger.error('Failed to sync OAuth tokens', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to sync OAuth tokens');
  }
});

/**
 * @openapi
 * /organization/users/{email}/oauth-tokens:
 *   get:
 *     summary: Get OAuth tokens for a specific user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User's OAuth tokens
 */
router.get('/users/:email/oauth-tokens', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const { email } = req.params;
    const tokens = await oauthTokenSyncService.getUserTokens(organizationId, email);

    successResponse(res, {
      email,
      tokens: tokens.map(token => ({
        id: token.id,
        clientId: token.clientId,
        displayName: token.displayName,
        scopes: token.scopes,
        nativeApp: token.nativeApp,
        lastTimeUsed: token.lastTimeUsed,
        syncedAt: token.syncedAt
      }))
    });
  } catch (error: any) {
    logger.error('Failed to get user tokens', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get user tokens');
  }
});

/**
 * @openapi
 * /organization/users/{email}/oauth-tokens/{clientId}:
 *   delete:
 *     summary: Revoke a specific OAuth token for a user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token revoked successfully
 *       404:
 *         description: Token not found
 */
router.delete('/users/:email/oauth-tokens/:clientId', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const { email, clientId } = req.params;

    // Audit log the action
    await securityAudit.log({
      organizationId,
      action: AuditActions.SECURITY_TOKEN_REVOKE,
      actorId: req.user?.userId,
      actorEmail: req.user?.email || 'unknown',
      targetIdentifier: email,
      outcome: 'success'
    });

    const result = await oauthTokenSyncService.revokeToken(organizationId, email, clientId);

    if (!result.success) {
      return errorResponse(res, ErrorCode.INTERNAL_ERROR, result.error || 'Failed to revoke token');
    }

    successResponse(res, {
      message: 'Token revoked successfully',
      email,
      clientId
    });
  } catch (error: any) {
    logger.error('Failed to revoke token', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to revoke token');
  }
});

/**
 * @openapi
 * /organization/users/{email}/security:
 *   get:
 *     summary: Get security overview for a specific user
 *     description: Returns unified 2FA status (Helios + Google), passkeys, and connected apps for a user
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User security information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     twoFactor:
 *                       type: object
 *                       properties:
 *                         helios:
 *                           type: object
 *                           properties:
 *                             isEnrolled:
 *                               type: boolean
 *                         google:
 *                           type: object
 *                           properties:
 *                             isEnrolled:
 *                               type: boolean
 *                             isEnforced:
 *                               type: boolean
 *                         anyEnrolled:
 *                           type: boolean
 *                         allEnrolled:
 *                           type: boolean
 *                     passkeys:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                         devices:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                     connectedApps:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: User not found
 */
router.get('/users/:email/security', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.UNAUTHORIZED, 'Organization not found');
    }

    const { email } = req.params;

    // Get unified 2FA status
    const unified2FA = await oauthTokenSyncService.getUserUnified2FAStatus(organizationId, email);

    // Get legacy security data (for OAuth tokens)
    const security = await oauthTokenSyncService.getUserSecurity(organizationId, email);

    // Get passkeys for this user
    const passkeys = await oauthTokenSyncService.getUserPasskeys(organizationId, email);

    // If neither source has data, user not found
    if (!unified2FA && !security) {
      return notFoundResponse(res, 'User not found');
    }

    // Build unified twoFactor response
    const heliosSource = unified2FA?.sources.find(s => s.source === 'helios');
    const googleSource = unified2FA?.sources.find(s => s.source === 'google');

    successResponse(res, {
      email,
      twoFactor: {
        helios: heliosSource ? {
          isEnrolled: heliosSource.isEnrolled,
          updatedAt: heliosSource.updatedAt
        } : null,
        google: googleSource ? {
          isEnrolled: googleSource.isEnrolled,
          isEnforced: googleSource.isEnforced,
          updatedAt: googleSource.updatedAt
        } : (security?.twoFactor || null),
        anyEnrolled: unified2FA?.anyEnrolled || false,
        allEnrolled: unified2FA?.allEnrolled || false
      },
      passkeys: passkeys ? {
        count: passkeys.count,
        devices: passkeys.devices
      } : null,
      connectedApps: (security?.tokens || []).map(token => ({
        id: token.id,
        clientId: token.clientId,
        displayName: token.displayName,
        scopes: token.scopes,
        nativeApp: token.nativeApp,
        lastTimeUsed: token.lastTimeUsed
      }))
    });
  } catch (error: any) {
    logger.error('Failed to get user security', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get user security');
  }
});

export default router;
