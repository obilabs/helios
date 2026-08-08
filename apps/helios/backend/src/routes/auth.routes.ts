import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { PasswordSetupService } from '../services/password-setup.service.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse,
  notFoundResponse
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';
import { securityAudit, AuditActions } from '../services/security-audit.service.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secure_jwt_secret_key_here';

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: User login
 *     description: |
 *       Authenticate with email and password to receive JWT tokens.
 *       Returns access and refresh tokens along with user details.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "********"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     organization:
 *                       $ref: '#/components/schemas/Organization'
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                           description: JWT access token (24h expiry)
 *                         refreshToken:
 *                           type: string
 *                           description: JWT refresh token (7d expiry)
 *                         expiresIn:
 *                           type: integer
 *                           example: 86400
 *                           description: Token expiry time in seconds
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               success: false
 *               error:
 *                 code: UNAUTHORIZED
 *                 message: Invalid email or password
 */
router.post('/login',
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array().map(e => ({
        field: (e as any).path || (e as any).param,
        message: e.msg
      })));
    }

    const { email, password } = req.body;

    // Find user with admin/employee flags
    const result = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, role, is_active, organization_id,
              COALESCE(is_external_admin, false) as is_external_admin,
              default_view
       FROM organization_users
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // Log failed login attempt (user not found) - need org ID for audit
      // Since we don't know org, use a placeholder or skip detailed audit
      logger.warn('Failed login attempt - user not found', { email });
      return unauthorizedResponse(res, 'Invalid email or password');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      // Log disabled account login attempt
      await securityAudit.logAuth({
        action: AuditActions.AUTH_LOGIN_FAILURE,
        outcome: 'blocked',
        userId: user.id,
        email: user.email,
        organizationId: user.organization_id,
        ip: req.ip || undefined,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId,
        errorMessage: 'Account is disabled',
      });
      return unauthorizedResponse(res, 'Account is disabled');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      logger.warn('Failed login attempt', { email });
      // Log failed password attempt
      await securityAudit.logAuth({
        action: AuditActions.AUTH_LOGIN_FAILURE,
        outcome: 'failure',
        userId: user.id,
        email: user.email,
        organizationId: user.organization_id,
        ip: req.ip || undefined,
        userAgent: req.get('User-Agent'),
        requestId: req.requestId,
        errorMessage: 'Invalid password',
      });
      return unauthorizedResponse(res, 'Invalid email or password');
    }

    // Determine if user is external admin
    const isExternalAdmin = user.is_external_admin === true;

    // Generate tokens (include isExternalAdmin for access control)
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, organizationId: user.organization_id, isExternalAdmin, type: 'access' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, organizationId: user.organization_id, isExternalAdmin, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update last login
    await db.query('UPDATE organization_users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Log login to legacy audit_logs table (for backwards compatibility)
    await db.query(
      `INSERT INTO audit_logs (user_id, organization_id, action, resource, ip_address, user_agent)
       VALUES ($1, $2, 'login', 'auth', $3, $4)`,
      [user.id, user.organization_id, req.ip, req.get('User-Agent') || 'Unknown']
    );

    // Log to security audit (comprehensive)
    await securityAudit.logAuth({
      action: AuditActions.AUTH_LOGIN_SUCCESS,
      outcome: 'success',
      userId: user.id,
      email: user.email,
      organizationId: user.organization_id,
      ip: req.ip || undefined,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId,
    });

    // Get organization details
    const orgResult = await db.query(
      'SELECT id, name, domain FROM organizations WHERE id = $1',
      [user.organization_id]
    );

    const organization = orgResult.rows[0];

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Determine access capabilities
    // isExternalAdmin already determined above for JWT
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isEmployee = !isExternalAdmin; // Internal users are employees

    // Determine default view
    // External admin: always admin
    // Internal admin: use saved preference or default to admin
    // Regular user: always user
    let defaultView = 'admin';
    if (!isAdmin) {
      defaultView = 'user';
    } else if (isEmployee) {
      // Internal admin - check for saved preference from default_view column
      if (user.default_view === 'user') {
        defaultView = 'user';
      }
    }

    return successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
        // Access control flags
        isAdmin,
        isEmployee,
        isExternalAdmin,
        canAccessAdminUI: isAdmin,
        canAccessUserUI: isEmployee,
        canSwitchViews: isAdmin && isEmployee,
        defaultView
      },
      organization: {
        id: organization.id,
        name: organization.name,
        domain: organization.domain
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 86400
      },
      message: 'Login successful'
    });
  })
);

/**
 * @openapi
 * /auth/verify:
 *   get:
 *     summary: Verify token validity
 *     description: |
 *       Verify that the current JWT token is valid and return user details.
 *       Use this endpoint to check authentication status on page load.
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/verify', asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorizedResponse(res, 'No token provided');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Verify user still exists and is active
    const result = await db.query(
      `SELECT id, email, first_name, last_name, role, is_active, organization_id,
              COALESCE(is_external_admin, false) as is_external_admin,
              default_view
       FROM organization_users
       WHERE id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return unauthorizedResponse(res, 'User not found');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return unauthorizedResponse(res, 'Account is disabled');
    }

    // Determine access capabilities
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isExternalAdmin = user.is_external_admin === true;
    const isEmployee = !isExternalAdmin; // Internal users are employees

    // Determine default view
    let defaultView = 'admin';
    if (!isAdmin) {
      defaultView = 'user';
    } else if (isEmployee) {
      if (user.default_view === 'user') {
        defaultView = 'user';
      }
    }

    return successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id,
        // Access control flags
        isAdmin,
        isEmployee,
        isExternalAdmin,
        canAccessAdminUI: isAdmin,
        canAccessUserUI: isEmployee,
        canSwitchViews: isAdmin && isEmployee,
        defaultView
      }
    });
  } catch (error: any) {
    logger.warn('Token verification failed', { error: error.message });
    return unauthorizedResponse(res, 'Invalid or expired token');
  }
}));

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: User logout
 *     description: |
 *       Log out the current user. Records logout in audit log.
 *       Client should discard tokens after calling this endpoint.
 *     tags: [Authentication]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional user ID for audit logging
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 */
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.body.userId;
  const userEmail = req.body.email || (req as any).user?.email;
  const organizationId = req.body.organizationId || (req as any).user?.organizationId;

  if (userId) {
    // Legacy audit log
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource, ip_address, user_agent)
       VALUES ($1, 'logout', 'auth', $2, $3)`,
      [userId, req.ip, req.get('User-Agent') || 'Unknown']
    );

    // Security audit log
    if (organizationId) {
      await securityAudit.logAuth({
        organizationId,
        action: AuditActions.AUTH_LOGOUT,
        userId,
        email: userEmail,
        ip: req.ip || undefined,
        userAgent: req.get('User-Agent') || undefined,
        outcome: 'success',
      });
    }

    logger.info('User logged out', { userId });
  }

  return successResponse(res, { message: 'Logged out successfully' });
}));

/**
 * @openapi
 * /auth/verify-setup-token:
 *   get:
 *     summary: Verify password setup token
 *     description: |
 *       Verify that a password setup token is valid. Used during new user onboarding
 *       when setting their initial password.
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The password setup token sent to the user's email
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       format: email
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *       400:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/verify-setup-token', asyncHandler(async (req: Request, res: Response) => {
  const token = req.query.token as string;

  if (!token) {
    return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Token is required');
  }

  const verification = await PasswordSetupService.verifyToken(token);

  if (!verification.valid) {
    return errorResponse(res, ErrorCode.VALIDATION_ERROR, verification.error || 'Invalid token');
  }

  // Get user info for display (without sensitive data)
  const userResult = await db.query(
    'SELECT email, first_name, last_name FROM organization_users WHERE id = $1',
    [verification.userId]
  );

  if (userResult.rows.length === 0) {
    return notFoundResponse(res, 'User');
  }

  const user = userResult.rows[0];

  return successResponse(res, {
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name
  });
}));

/**
 * @openapi
 * /auth/setup-password:
 *   post:
 *     summary: Set initial password
 *     description: |
 *       Set the initial password for a new user account using a valid setup token.
 *       Returns JWT tokens for automatic login after password setup.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Password setup token from email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: New password (minimum 8 characters)
 *     responses:
 *       200:
 *         description: Password set successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password set successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     organization:
 *                       $ref: '#/components/schemas/Organization'
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         accessToken:
 *                           type: string
 *                         refreshToken:
 *                           type: string
 *                         expiresIn:
 *                           type: integer
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/setup-password',
  [
    body('token').notEmpty().withMessage('Token is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return validationErrorResponse(res, errors.array().map(e => ({
        field: (e as any).path || (e as any).param,
        message: e.msg
      })));
    }

    const { token, password } = req.body;

    // Verify token
    const verification = await PasswordSetupService.verifyToken(token);

    if (!verification.valid) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, verification.error || 'Invalid or expired token');
    }

    const userId = verification.userId!;

    // Hash the new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user password and activate account
    await db.query(
      `UPDATE organization_users
       SET password_hash = $1, status = 'active', is_active = true
       WHERE id = $2`,
      [passwordHash, userId]
    );

    // Mark token as used
    await PasswordSetupService.markTokenAsUsed(token);

    // Get updated user info
    const userResult = await db.query(
      `SELECT id, email, first_name, last_name, role, organization_id
       FROM organization_users
       WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];

    // Generate JWT tokens for auto-login
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, organizationId: user.organization_id, type: 'access' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, organizationId: user.organization_id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Get organization details
    const orgResult = await db.query(
      'SELECT id, name, domain FROM organizations WHERE id = $1',
      [user.organization_id]
    );

    const organization = orgResult.rows[0];

    logger.info('Password setup completed', {
      userId: user.id,
      email: user.email
    });

    return successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        organizationId: user.organization_id
      },
      organization: {
        id: organization.id,
        name: organization.name,
        domain: organization.domain
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 86400
      },
      message: 'Password set successfully'
    });
  })
);

export default router;