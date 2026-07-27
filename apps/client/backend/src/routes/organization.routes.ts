import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { authService } from '../services/auth.service.js';
import { authenticateToken } from '../middleware/auth.js';
import { PasswordSetupService } from '../services/password-setup.service.js';
import { syncScheduler } from '../services/sync-scheduler.service.js';
import { googleWorkspaceService } from '../services/google-workspace.service.js';
import { activityTracker } from '../services/activity-tracker.service.js';
import { securityAudit, AuditActions } from '../services/security-audit.service.js';
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse,
  validationErrorResponse,
  forbiddenResponse,
  paginatedResponse
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';

const router = Router();

/**
 * @openapi
 * /organization/setup/status:
 *   get:
 *     summary: Check setup status
 *     description: Check if the organization has been set up with at least one admin user.
 *     tags: [Organization]
 *     responses:
 *       200:
 *         description: Setup status information
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
 *                     isSetupComplete:
 *                       type: boolean
 *                       description: True if organization and admin exist
 *                     hasOrganization:
 *                       type: boolean
 *                     hasAdmin:
 *                       type: boolean
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/setup/status', async (req: Request, res: Response) => {
  try {
    // Check if any organization exists
    const orgResult = await db.query('SELECT COUNT(*) as count FROM organizations');
    const orgCount = parseInt(orgResult.rows[0].count);

    // Check if any admin exists
    const adminResult = await db.query("SELECT COUNT(*) as count FROM organization_users WHERE role = 'admin'");
    const adminCount = parseInt(adminResult.rows[0].count);

    successResponse(res, {
      isSetupComplete: orgCount > 0 && adminCount > 0,
      hasOrganization: orgCount > 0,
      hasAdmin: adminCount > 0
    });
  } catch (error) {
    logger.error('Failed to check setup status', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to check setup status');
  }
});

/**
 * @openapi
 * /organization/setup:
 *   post:
 *     summary: Initial organization setup
 *     description: |
 *       Create the organization and initial admin account.
 *       Can only be called once - returns 409 if organization already exists.
 *     tags: [Organization]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationName, organizationDomain, adminEmail, adminPassword, adminFirstName, adminLastName]
 *             properties:
 *               organizationName:
 *                 type: string
 *                 example: Acme Corp
 *               organizationDomain:
 *                 type: string
 *                 example: acme.com
 *               adminEmail:
 *                 type: string
 *                 format: email
 *                 example: admin@acme.com
 *               adminPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               adminFirstName:
 *                 type: string
 *               adminLastName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Organization created successfully
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     organization:
 *                       type: object
 *                     admin:
 *                       type: object
 *                     token:
 *                       type: string
 *                       description: JWT for auto-login
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Organization already exists
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const {
      organizationName,
      organizationDomain,
      adminEmail,
      adminPassword,
      adminFirstName,
      adminLastName
    } = req.body;

    // Validate input
    if (!organizationName || !organizationDomain || !adminEmail || !adminPassword || !adminFirstName || !adminLastName) {
      return validationErrorResponse(res, [{ message: 'All fields are required' }]);
    }

    // Check if organization already exists
    const existingOrg = await db.query('SELECT id FROM organizations LIMIT 1');
    if (existingOrg.rows.length > 0) {
      return errorResponse(res, ErrorCode.CONFLICT, 'Organization already exists');
    }

    // Check if admin already exists
    const existingAdmin = await db.query('SELECT id FROM organization_users WHERE email = $1', [adminEmail]);
    if (existingAdmin.rows.length > 0) {
      return errorResponse(res, ErrorCode.CONFLICT, 'Admin user already exists');
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Create organization
      const orgResult = await db.query(
        `INSERT INTO organizations (name, domain, is_setup_complete)
         VALUES ($1, $2, true)
         RETURNING id, name, domain`,
        [organizationName, organizationDomain]
      );
      const organization = orgResult.rows[0];

      // Hash password
      const passwordHash = await bcrypt.hash(adminPassword, 12);

      // Create admin user
      const userResult = await db.query(
        `INSERT INTO organization_users (
          email, password_hash, first_name, last_name,
          role, organization_id, is_active, email_verified
        )
         VALUES ($1, $2, $3, $4, 'admin', $5, true, true)
         RETURNING id, email, first_name, last_name, role`,
        [adminEmail, passwordHash, adminFirstName, adminLastName, organization.id]
      );
      const admin = userResult.rows[0];

      // Create auth_accounts entry for better-auth login
      await db.query(
        `INSERT INTO auth_accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
         VALUES (gen_random_uuid()::text, $1, $2, 'credential', $3, NOW(), NOW())`,
        [admin.id, adminEmail, passwordHash]
      );

      // Create default organization settings
      await db.query(
        `INSERT INTO organization_settings (organization_id, key, value)
         VALUES ($1, 'google_workspace_enabled', 'false')`,
        [organization.id]
      );
      await db.query(
        `INSERT INTO organization_settings (organization_id, key, value)
         VALUES ($1, 'microsoft_365_enabled', 'false')`,
        [organization.id]
      );

      // Insert default modules (use underscores to match existing seeded modules)
      // Skip if modules already exist from migrations/seeds
      const modules = [
        { name: 'Google Workspace', slug: 'google_workspace', description: 'Sync users and groups from Google Workspace' },
        { name: 'Microsoft 365', slug: 'microsoft_365', description: 'Sync users and groups from Microsoft 365' },
        { name: 'User Management', slug: 'user_management', description: 'Manage organization users' },
        { name: 'Audit Logs', slug: 'audit_logs', description: 'Track all system activities' }
      ];

      for (const module of modules) {
        await db.query(
          `INSERT INTO modules (name, slug, description, version, config_schema)
           VALUES ($1, $2, $3, '1.0.0', '{}')
           ON CONFLICT (name) DO NOTHING`,
          [module.name, module.slug, module.description]
        );
      }

      // Commit transaction
      await db.query('COMMIT');

      // Generate token for auto-login with organizationId
      const token = authService.generateAccessToken(
        admin.id,
        admin.email,
        admin.role,
        organization.id
      );

      logger.info('Organization setup completed', {
        organizationId: organization.id,
        adminId: admin.id
      });

      // Log organization setup to security audit
      // Note: The database triggers will also log user.create and organizations.create,
      // but this provides the "setup complete" context with IP/user-agent
      await securityAudit.log({
        action: 'setup.complete',
        actionCategory: 'admin',
        actorType: 'anonymous', // No user yet during setup
        actorEmail: adminEmail,
        actorIp: req.ip || undefined,
        actorUserAgent: req.get('User-Agent'),
        targetType: 'organization',
        targetId: organization.id,
        targetIdentifier: organization.name,
        organizationId: organization.id,
        requestId: req.requestId,
        outcome: 'success',
        changesAfter: {
          organizationName: organization.name,
          domain: organization.domain,
          adminEmail: admin.email,
          adminName: `${admin.first_name} ${admin.last_name}`
        }
      });

      successResponse(res, {
        message: 'Organization setup completed successfully',
        organization: {
          id: organization.id,
          name: organization.name,
          domain: organization.domain
        },
        admin: {
          id: admin.id,
          email: admin.email,
          firstName: admin.first_name,
          lastName: admin.last_name,
          role: admin.role
        },
        token
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error('Failed to setup organization', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to setup organization');
  }
});

/**
 * @openapi
 * /organization/current:
 *   get:
 *     summary: Get current organization
 *     description: Get details of the current organization.
 *     tags: [Organization]
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Organization'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/current', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, name, domain, is_setup_complete, created_at
       FROM organizations
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return notFoundResponse(res, 'Organization');
    }

    successResponse(res, result.rows[0]);
  } catch (error) {
    logger.error('Failed to get organization', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get organization');
  }
});

// Update organization settings
router.put('/settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name, domain } = req.body;

    // Validate input
    if (!name && !domain) {
      return validationErrorResponse(res, [{ field: 'name', message: 'At least one field (name or domain) is required' }]);
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (domain) {
      updates.push(`domain = $${paramIndex++}`);
      values.push(domain);
    }

    const result = await db.query(
      `UPDATE organizations
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = (SELECT id FROM organizations LIMIT 1)
       RETURNING id, name, domain, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return notFoundResponse(res, 'Organization');
    }

    logger.info('Organization settings updated', { name, domain });
    successResponse(res, result.rows[0]);
  } catch (error) {
    logger.error('Failed to update organization settings', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update organization settings');
  }
});

/**
 * PUT /api/organization/sync-settings
 * Update sync settings (interval, auto sync, deletion policy, sync direction)
 */
router.put('/sync-settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { syncInterval, autoSyncEnabled, deletionPolicy, syncDirection } = req.body;

    // Get the organization
    const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
    if (orgResult.rows.length === 0) {
      return notFoundResponse(res, 'Organization');
    }
    const organizationId = orgResult.rows[0].id;

    // Update or insert sync settings in organization_settings
    const settingsResult = await db.query(
      `INSERT INTO organization_settings (organization_id, settings, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (organization_id)
       DO UPDATE SET
         settings = organization_settings.settings || $2,
         updated_at = NOW()
       RETURNING *`,
      [organizationId, JSON.stringify({
        sync: {
          interval: parseInt(syncInterval) || 900,
          autoSyncEnabled: autoSyncEnabled !== false,
          deletionPolicy: deletionPolicy || 'delete',
          syncDirection: syncDirection || 'google-to-helios'
        }
      })]
    );

    logger.info('Sync settings updated', { syncInterval, autoSyncEnabled, deletionPolicy, syncDirection });
    successResponse(res, {
      syncInterval,
      autoSyncEnabled,
      deletionPolicy,
      syncDirection
    });
  } catch (error) {
    logger.error('Failed to update sync settings', error);
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update sync settings');
  }
});

// Get all users for the organization
router.get('/users', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Get organizationId from authenticated user or query parameter (fallback to database)
    let organizationId = req.user?.organizationId || req.query.organizationId;

    // Get status filter from query params (active, staged, deleted, suspended, all)
    const statusFilter = (req.query.status as string)?.toLowerCase() || 'all';

    // Get user type filter from query params (staff, guest, contact)
    const userType = req.query.userType as string;

    // Get includeDeleted flag for counting purposes
    const includeDeleted = req.query.includeDeleted === 'true';

    // Get guest filter from query params (deprecated - use userType instead)
    const guestOnly = req.query.guestOnly === 'true';

    // Get platform filter from query params (local, google_workspace, microsoft_365, all)
    const platformFilter = (req.query.platform as string)?.toLowerCase() || 'all';

    // If no organizationId, get the only organization (single-organization)
    if (!organizationId) {
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        organizationId = orgResult.rows[0].id;
      } else {
        return notFoundResponse(res, 'Organization');
      }
    }

    logger.info('Fetching users for organization', { organizationId, statusFilter, platformFilter, guestOnly, includeDeleted });

    // Check if Google Workspace is enabled
    const moduleCheckResult = await db.query(`
      SELECT om.is_enabled
      FROM organization_modules om
      JOIN modules m ON m.id = om.module_id
      WHERE om.organization_id = $1 AND m.slug = 'google_workspace'
    `, [organizationId]);

    const googleWorkspaceEnabled = moduleCheckResult.rows.length > 0 && moduleCheckResult.rows[0].is_enabled;

    let users = [];
    const userEmailMap = new Map(); // Track users by email to avoid duplicates

    // Build status filter condition (using 'status' column, not 'user_status')
    let statusCondition = '';
    if (includeDeleted) {
      // When includeDeleted is true, don't filter by deletion status at all
      statusCondition = '';
    } else if (statusFilter === 'active') {
      statusCondition = "AND ou.status = 'active'";
    } else if (statusFilter === 'pending' || statusFilter === 'staged') {
      statusCondition = "AND ou.status = 'staged'";
    } else if (statusFilter === 'suspended') {
      statusCondition = "AND ou.status = 'suspended'";
    } else if (statusFilter === 'deleted') {
      statusCondition = "AND ou.status = 'deleted'";
    } else {
      // 'all' means all non-deleted users by default (excludes soft-deleted)
      statusCondition = "AND (ou.status IS NULL OR ou.status != 'deleted')";
    }

    // Add user type filter condition
    if (userType) {
      // Map 'guests' to 'guest' for frontend compatibility
      const dbUserType = userType === 'guests' ? 'guest' : userType === 'contacts' ? 'contact' : userType;
      statusCondition += ` AND ou.user_type = '${dbUserType}'`;
    } else if (guestOnly) {
      // Fallback to old guest filter for backwards compatibility
      statusCondition += " AND ou.is_guest = true";
    }

    // Add platform filter condition
    if (platformFilter === 'local') {
      // Local-only users have no platform IDs
      statusCondition += " AND ou.google_workspace_id IS NULL AND ou.microsoft_365_id IS NULL";
    } else if (platformFilter === 'google_workspace') {
      statusCondition += " AND ou.google_workspace_id IS NOT NULL";
    } else if (platformFilter === 'microsoft_365') {
      statusCondition += " AND ou.microsoft_365_id IS NOT NULL";
    }
    // 'all' means no platform filter

    // Always fetch local organization users first
    logger.info('Fetching users from local database');
    const localUsersResult = await db.query(`
      SELECT
        ou.id,
        ou.email,
        ou.first_name as "firstName",
        ou.last_name as "lastName",
        ou.role,
        ou.is_active as "isActive",
        ou.status as "userStatus",
        ou.is_guest as "isGuest",
        ou.user_type as "userType",
        ou.guest_expires_at as "guestExpiresAt",
        ou.guest_invited_by as "guestInvitedBy",
        ou.guest_invited_at as "guestInvitedAt",
        ou.created_at as "createdAt",
        ou.updated_at as "updatedAt",
        ou.job_title as "jobTitle",
        ou.department,
        ou.department_id as "departmentId",
        d.name as "departmentName",
        d.org_unit_path as "orgUnitPath",
        ou.organizational_unit as "organizationalUnit",
        ou.location,
        ou.reporting_manager_id as "reportingManagerId",
        ou.employee_id as "employeeId",
        ou.employee_type as "employeeType",
        ou.cost_center as "costCenter",
        ou.start_date as "startDate",
        ou.end_date as "endDate",
        ou.bio,
        ou.mobile_phone as "mobilePhone",
        ou.work_phone as "workPhone",
        ou.work_phone_extension as "workPhoneExtension",
        ou.timezone,
        ou.preferred_language as "preferredLanguage",
        ou.google_workspace_id as "googleWorkspaceId",
        ou.microsoft_365_id as "microsoft365Id",
        ou.github_username as "githubUsername",
        ou.slack_user_id as "slackUserId",
        ou.jumpcloud_user_id as "jumpcloudUserId",
        ou.associate_id as "associateId",
        ou.avatar_url as "avatarUrl",
        ou.google_workspace_sync_status as "googleWorkspaceSyncStatus",
        ou.google_workspace_last_sync as "googleWorkspaceLastSync",
        ou.microsoft_365_sync_status as "microsoft365SyncStatus",
        ou.microsoft_365_last_sync as "microsoft365LastSync",
        ou.last_login as "lastLogin"
      FROM organization_users ou
      LEFT JOIN departments d ON ou.department_id = d.id
      WHERE ou.organization_id = $1 ${statusCondition}
      ORDER BY ou.first_name, ou.last_name, ou.email
    `, [organizationId]);

    // Add local users to the map
    localUsersResult.rows.forEach((user: any) => {
      // Determine platforms based on platform IDs
      const platforms = [];
      if (user.googleWorkspaceId) platforms.push('google_workspace');
      if (user.microsoft365Id) platforms.push('microsoft_365');
      if (platforms.length === 0) platforms.push('local'); // Only local if no platform IDs

      const userData = {
        ...user,
        displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        platforms: platforms,
        source: user.googleWorkspaceId ? 'google_workspace' : (user.microsoft365Id ? 'microsoft_365' : 'local')
      };
      userEmailMap.set(user.email.toLowerCase(), userData);
    });

    // If Google Workspace is enabled, also fetch synced users
    if (googleWorkspaceEnabled) {
      logger.info('Fetching users from Google Workspace cache');
      const gwUsersResult = await db.query(`
        SELECT
          id,
          google_id as external_id,
          email,
          given_name as "firstName",
          family_name as "lastName",
          full_name as "displayName",
          is_admin,
          is_suspended,
          org_unit_path,
          department,
          job_title,
          last_login_time,
          creation_time,
          last_sync_at
        FROM gw_synced_users
        WHERE organization_id = $1
        ORDER BY full_name, email
      `, [organizationId]);

      // Helper function to extract department name from OU path
      // e.g., "/Staff/Sales" -> "Sales", "/Admins" -> "Admins"
      const extractDepartmentFromOUPath = (ouPath: string | null): string | null => {
        if (!ouPath) return null;
        // Split by "/" and get the last non-empty segment
        const segments = ouPath.split('/').filter(s => s.trim());
        return segments.length > 0 ? segments[segments.length - 1] : null;
      };

      gwUsersResult.rows.forEach((user: any) => {
        const email = user.email.toLowerCase();
        const platforms = ['google_workspace'];
        // Use explicit department field, or extract from OU path as fallback
        const gwDepartment = user.department || extractDepartmentFromOUPath(user.org_unit_path);

        // If user already exists locally, add google_workspace to their platforms if not already present
        if (userEmailMap.has(email)) {
          const existingUser = userEmailMap.get(email);
          if (!existingUser.platforms.includes('google_workspace')) {
            existingUser.platforms.push('google_workspace');
            // Remove 'local' if we now have a real platform
            const localIndex = existingUser.platforms.indexOf('local');
            if (localIndex > -1) {
              existingUser.platforms.splice(localIndex, 1);
            }
          }
          existingUser.googleWorkspaceData = {
            googleId: user.external_id,
            department: gwDepartment,
            orgUnitPath: user.org_unit_path,
            jobTitle: user.job_title,
            lastLogin: user.last_login_time,
            isSuspended: user.is_suspended
          };
          // If GW shows suspended, update status (GW is authoritative for access)
          if (user.is_suspended) {
            existingUser.status = 'suspended';
            existingUser.isActive = false;
          }
        } else if (statusFilter === 'all' || includeDeleted) {
          // Only add GW-only users when not filtering by a specific status
          // When filtering by active/deleted/suspended/etc, only show users
          // that match the filter from organization_users
          userEmailMap.set(email, {
            id: user.id,
            email: user.email,
            firstName: user.firstName || user.email.split('@')[0],
            lastName: user.lastName || '',
            displayName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            role: user.is_admin ? 'admin' : 'user',
            status: user.is_suspended ? 'suspended' : 'active',
            isActive: !user.is_suspended,
            platforms: platforms,
            department: gwDepartment,
            organizationalUnit: user.org_unit_path,
            jobTitle: user.job_title,
            lastLogin: user.last_login_time,
            createdAt: user.creation_time,
            source: 'google_workspace'
          });
        }
      });
    }

    // Convert map to array
    users = Array.from(userEmailMap.values());

    logger.info('Users fetched', {
      organizationId,
      count: users.length,
      sources: {
        local: localUsersResult.rows.length,
        googleWorkspace: googleWorkspaceEnabled ? users.filter(u => u.platforms.includes('google_workspace')).length : 0
      }
    });

    successResponse(res, users, {
      total: users.length,
      source: googleWorkspaceEnabled ? 'google_workspace' : 'local'
    });
  } catch (error: any) {
    logger.error('Failed to fetch users', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch users');
  }
});

/**
 * GET /api/organization/users/count
 * Get count of users by user type
 */
router.get('/users/count', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Get organizationId from authenticated user or query parameter (fallback to database)
    let organizationId = req.user?.organizationId || req.query.organizationId;

    // Get user type filter from query params
    const userType = req.query.userType as string;

    // If no organizationId, get the only organization (single-organization)
    if (!organizationId) {
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        organizationId = orgResult.rows[0].id;
      } else {
        return notFoundResponse(res, 'Organization');
      }
    }

    // Map frontend values to database values
    const dbUserType = userType === 'guests' ? 'guest' : userType === 'contacts' ? 'contact' : userType;

    logger.info('Fetching user count', { organizationId, userType, dbUserType });

    // Count users by type (exclude soft-deleted)
    const result = await db.query(
      `SELECT COUNT(*) as count FROM organization_users
       WHERE organization_id = $1 AND user_type = $2 AND status != 'deleted'`,
      [organizationId, dbUserType]
    );

    const count = parseInt(result.rows[0].count) || 0;

    successResponse(res, { count });
  } catch (error: any) {
    logger.error('Failed to count users', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to count users');
  }
});

/**
 * @openapi
 * /api/v1/organization/users/export:
 *   get:
 *     summary: Export users as CSV or JSON
 *     description: Export organization users in CSV or JSON format
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userType
 *         schema:
 *           type: string
 *           enum: [staff, guest, contact]
 *         description: Filter by user type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, pending, suspended, deleted]
 *         description: Filter by status
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *           default: csv
 *         description: Export format
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: array
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/users/export', authenticateToken, async (req: Request, res: Response) => {
  try {
    let organizationId = req.user?.organizationId;
    const userType = req.query.userType as string || 'staff';
    const status = req.query.status as string;
    const format = req.query.format as string || 'csv';

    if (!organizationId) {
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        organizationId = orgResult.rows[0].id;
      } else {
        return notFoundResponse(res, 'Organization');
      }
    }

    // Build query
    let whereClause = 'WHERE organization_id = $1 AND user_type = $2';
    const params: any[] = [organizationId, userType];

    // Add status filter if provided
    if (status && status !== 'all') {
      if (status === 'pending') {
        whereClause += ' AND status = $3';
        params.push('staged');
      } else {
        whereClause += ' AND status = $3';
        params.push(status);
      }
    }

    const result = await db.query(`
      SELECT
        email,
        first_name,
        last_name,
        role,
        job_title,
        department,
        location,
        employee_id,
        employee_type,
        mobile_phone,
        work_phone,
        status,
        is_active,
        google_workspace_id,
        microsoft_365_id,
        created_at,
        last_login
      FROM organization_users
      ${whereClause}
      ORDER BY last_name, first_name
    `, params);

    const users = result.rows;

    if (format === 'json') {
      // Return JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="users-${userType}-export.json"`);
      return res.send(JSON.stringify(users, null, 2));
    } else {
      // Return CSV
      const headers = [
        'Email',
        'First Name',
        'Last Name',
        'Role',
        'Job Title',
        'Department',
        'Location',
        'Employee ID',
        'Employee Type',
        'Mobile Phone',
        'Work Phone',
        'Status',
        'Active',
        'Google Workspace ID',
        'Microsoft 365 ID',
        'Created At',
        'Last Login'
      ];

      const csvRows = [headers.join(',')];

      for (const user of users) {
        const row = [
          escapeCsvValue(user.email),
          escapeCsvValue(user.first_name),
          escapeCsvValue(user.last_name),
          escapeCsvValue(user.role),
          escapeCsvValue(user.job_title),
          escapeCsvValue(user.department),
          escapeCsvValue(user.location),
          escapeCsvValue(user.employee_id),
          escapeCsvValue(user.employee_type),
          escapeCsvValue(user.mobile_phone),
          escapeCsvValue(user.work_phone),
          escapeCsvValue(user.status),
          user.is_active ? 'Yes' : 'No',
          escapeCsvValue(user.google_workspace_id),
          escapeCsvValue(user.microsoft_365_id),
          user.created_at ? new Date(user.created_at).toISOString() : '',
          user.last_login ? new Date(user.last_login).toISOString() : ''
        ];
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="users-${userType}-export.csv"`);
      return res.send(csvRows.join('\n'));
    }
  } catch (error: any) {
    logger.error('Failed to export users', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to export users');
  }
});

// Helper function for CSV escaping
function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/organization/users/stats
 * Get user statistics by role, status, and type
 */
router.get('/users/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    let organizationId = req.user?.organizationId;

    if (!organizationId) {
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        organizationId = orgResult.rows[0].id;
      } else {
        return notFoundResponse(res, 'Organization');
      }
    }

    // Get counts by role
    const roleCountsResult = await db.query(`
      SELECT
        role,
        COUNT(*) as count
      FROM organization_users
      WHERE organization_id = $1 AND is_active = true AND status != 'deleted'
      GROUP BY role
    `, [organizationId]);

    // Get counts by employee type
    const employeeTypeResult = await db.query(`
      SELECT
        COALESCE(employee_type, 'Unknown') as employee_type,
        COUNT(*) as count
      FROM organization_users
      WHERE organization_id = $1 AND is_active = true AND status != 'deleted'
      GROUP BY employee_type
    `, [organizationId]);

    // Get managers count (users who have direct reports)
    const managersResult = await db.query(`
      SELECT COUNT(DISTINCT reporting_manager_id) as count
      FROM organization_users
      WHERE organization_id = $1
        AND reporting_manager_id IS NOT NULL
        AND is_active = true
        AND status != 'deleted'
    `, [organizationId]);

    // Get orphaned users count (no manager, not CEO)
    const orphansResult = await db.query(`
      SELECT COUNT(*) as count
      FROM organization_users
      WHERE organization_id = $1
        AND is_active = true
        AND status != 'deleted'
        AND reporting_manager_id IS NULL
        AND job_title NOT LIKE '%Chief Executive%'
        AND COALESCE(job_title, '') != 'CEO'
    `, [organizationId]);

    // Get total active users
    const totalResult = await db.query(`
      SELECT COUNT(*) as count
      FROM organization_users
      WHERE organization_id = $1 AND is_active = true AND status != 'deleted'
    `, [organizationId]);

    // Build role counts object
    const roleCounts: Record<string, number> = {};
    roleCountsResult.rows.forEach((row: any) => {
      roleCounts[row.role] = parseInt(row.count);
    });

    // Build employee type counts object
    const employeeTypeCounts: Record<string, number> = {};
    employeeTypeResult.rows.forEach((row: any) => {
      employeeTypeCounts[row.employee_type] = parseInt(row.count);
    });

    successResponse(res, {
      total: parseInt(totalResult.rows[0].count),
      byRole: {
        admin: roleCounts['admin'] || 0,
        manager: roleCounts['manager'] || 0,
        user: roleCounts['user'] || 0
      },
      byEmployeeType: employeeTypeCounts,
      managers: parseInt(managersResult.rows[0].count),
      orphans: parseInt(orphansResult.rows[0].count)
    });

  } catch (error: any) {
    logger.error('Failed to get user stats', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get user stats');
  }
});

/**
 * GET /api/organization/users/:userId
 * Get a single organization user by ID
 */
router.get('/users/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
    }

    logger.info('Fetching user by ID', { userId, organizationId });

    // Fetch user from database
    const result = await db.query(`
      SELECT
        ou.id,
        ou.email,
        ou.first_name as "firstName",
        ou.last_name as "lastName",
        ou.role,
        ou.is_active as "isActive",
        ou.created_at as "createdAt",
        ou.updated_at as "updatedAt",
        ou.status as "userStatus",
        ou.job_title as "jobTitle",
        ou.professional_designations as "professionalDesignations",
        ou.pronouns,
        ou.department,
        ou.department_id as "departmentId",
        d.name as "departmentName",
        d.org_unit_path as "orgUnitPath",
        ou.organizational_unit as "organizationalUnit",
        ou.location,
        ou.reporting_manager_id as "reportingManagerId",
        ou.employee_id as "employeeId",
        ou.employee_type as "employeeType",
        ou.cost_center as "costCenter",
        ou.start_date as "startDate",
        ou.end_date as "endDate",
        ou.bio,
        ou.mobile_phone as "mobilePhone",
        ou.work_phone as "workPhone",
        ou.work_phone_extension as "workPhoneExtension",
        ou.timezone,
        ou.preferred_language as "preferredLanguage",
        ou.google_workspace_id as "googleWorkspaceId",
        ou.microsoft_365_id as "microsoft365Id",
        ou.github_username as "githubUsername",
        ou.slack_user_id as "slackUserId",
        ou.jumpcloud_user_id as "jumpcloudUserId",
        ou.associate_id as "associateId",
        ou.avatar_url as "avatarUrl",
        ou.google_workspace_sync_status as "googleWorkspaceSyncStatus",
        ou.google_workspace_last_sync as "googleWorkspaceLastSync",
        ou.microsoft_365_sync_status as "microsoft365SyncStatus",
        ou.microsoft_365_last_sync as "microsoft365LastSync",
        ou.last_login as "lastLogin",
        ou.alternate_email as "alternateEmail"
      FROM organization_users ou
      LEFT JOIN departments d ON ou.department_id = d.id
      WHERE ou.id = $1 AND ou.organization_id = $2
    `, [userId, organizationId]);

    if (result.rows.length === 0) {
      return notFoundResponse(res, 'User');
    }

    const user = result.rows[0];
    user.displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    successResponse(res, user);
  } catch (error: any) {
    logger.error('Failed to fetch user', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to fetch user');
  }
});

/**
 * POST /api/organization/users
 * Create a new organization user (manual account creation)
 */
router.post('/users', authenticateToken, async (req: Request, res: Response) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role,
      alternateEmail,
      passwordSetupMethod, // 'admin_set' or 'email_link'
      expiryHours,
      // Extended profile fields
      jobTitle,
      professionalDesignations,
      pronouns,
      department,
      departmentId,
      organizationalUnit,
      orgUnitId,
      location,
      reportingManagerId,
      employeeId,
      employeeType,
      costCenter,
      startDate,
      endDate,
      bio,
      // Contact information
      mobilePhone,
      workPhone,
      workPhoneExtension,
      timezone,
      preferredLanguage,
      // Platform integration
      googleWorkspaceId,
      microsoft365Id,
      githubUsername,
      slackUserId,
      jumpcloudUserId,
      associateId,
      // Avatar
      avatarUrl,
      // Admin type - for creating external admins (MSPs, consultants)
      isExternalAdmin,
      // Provider creation options
      createInGoogle,
      createInMicrosoft,
      // License assignment
      licenseId
    } = req.body;

    // Validate required fields
    const method = passwordSetupMethod || 'admin_set';

    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Email, first name, and last name are required'
      });
    }

    // If admin sets password, password is required
    // If email link method, alternate email is required
    if (method === 'admin_set' && !password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required when admin sets password'
      });
    }

    if (method === 'email_link' && !alternateEmail) {
      return res.status(400).json({
        success: false,
        error: 'Alternate email is required for password setup link'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate password strength if admin is setting it
    if (method === 'admin_set' && password && password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    // Validate alternate email format if provided
    if (alternateEmail && !emailRegex.test(alternateEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid alternate email format'
      });
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'user'];
    const userRole = role || 'user';
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be admin, manager, or user'
      });
    }

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM organization_users WHERE email = $1 AND organization_id = $2',
      [email.toLowerCase(), organizationId]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Hash password if admin is setting it, otherwise use a random placeholder
    let passwordHash = null;
    if (method === 'admin_set' && password) {
      passwordHash = await bcrypt.hash(password, 12);
    } else {
      // Generate a random password that will never be used (user will set their own)
      passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    }

    // Determine user status
    const userStatus = method === 'email_link' ? 'invited' : 'active';

    // Determine if this is an external admin
    // External admins: can only be created when role is 'admin' and isExternalAdmin is true
    // They don't have access to employee-facing features like People Directory
    const externalAdmin = userRole === 'admin' && isExternalAdmin === true;

    // Create user
    // Note: professional_designations and pronouns columns may not exist in all installations
    const result = await db.query(
      `INSERT INTO organization_users (
        email, password_hash, first_name, last_name,
        role, organization_id, is_active, email_verified,
        alternate_email, password_setup_method, status,
        job_title, department, department_id, organizational_unit, location,
        reporting_manager_id, employee_id, employee_type, cost_center,
        start_date, end_date, bio,
        mobile_phone, work_phone, work_phone_extension, timezone, preferred_language,
        google_workspace_id, microsoft_365_id, github_username, slack_user_id,
        jumpcloud_user_id, associate_id,
        avatar_url,
        is_external_admin,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, NOW())
      RETURNING id, email, first_name, last_name, role, is_active, alternate_email, status as "userStatus", job_title, department, department_id, location, is_external_admin, created_at`,
      [
        email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        userRole,
        organizationId,
        method === 'admin_set', // is_active
        alternateEmail || null,
        method,
        userStatus,
        jobTitle || null,
        department || null,
        departmentId || null,
        organizationalUnit || null,
        location || null,
        reportingManagerId || null,
        employeeId || null,
        employeeType || 'Full Time',
        costCenter || null,
        startDate || null,
        endDate || null,
        bio || null,
        mobilePhone || null,
        workPhone || null,
        workPhoneExtension || null,
        timezone || 'UTC',
        preferredLanguage || 'en',
        googleWorkspaceId || null,
        microsoft365Id || null,
        githubUsername || null,
        slackUserId || null,
        jumpcloudUserId || null,
        associateId || null,
        avatarUrl || null,
        externalAdmin
      ]
    );

    const newUser = result.rows[0];

    // Log the user creation to security_events using activity tracker
    await activityTracker.trackUserChange(
      organizationId,
      newUser.id,
      req.user?.userId || '',
      req.user?.email || '',
      'created',
      {
        userEmail: email.toLowerCase(),
        role: userRole,
        passwordSetupMethod: method,
        createInGoogle: createInGoogle || false,
        createInMicrosoft: createInMicrosoft || false
      }
    );

    // Also keep audit_logs for backwards compatibility
    await db.query(
      `INSERT INTO audit_logs (user_id, organization_id, action, resource, resource_id, ip_address, user_agent)
       VALUES ($1, $2, 'create', 'organization_user', $3, $4, $5)`,
      [req.user?.userId, organizationId, newUser.id, req.ip, req.get('User-Agent') || 'Unknown']
    );

    // Send password setup email if method is email_link
    let emailSent = false;
    if (method === 'email_link' && alternateEmail) {
      const hours = expiryHours || 48;
      emailSent = await PasswordSetupService.sendPasswordSetupEmail(
        newUser.id,
        organizationId,
        alternateEmail,
        hours
      );
    }

    logger.info('User created successfully', {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      isExternalAdmin: newUser.is_external_admin,
      createdBy: req.user?.userId,
      passwordSetupMethod: method,
      emailSent: method === 'email_link' ? emailSent : null,
      providerOptions: {
        createInGoogle: createInGoogle || false,
        createInMicrosoft: createInMicrosoft || false,
        licenseId: licenseId || null
      }
    });

    // Create user in external providers if requested
    let googleWorkspaceUserId: string | null = null;
    let googleCreationError: string | null = null;

    if (createInGoogle) {
      // Generate a temporary password for Google Workspace
      // User will be required to change it on first login
      const tempPassword = crypto.randomBytes(16).toString('base64').slice(0, 16) + 'Aa1!';

      const gwResult = await googleWorkspaceService.createUser(organizationId, {
        email: email.toLowerCase(),
        firstName,
        lastName,
        password: tempPassword,
        orgUnitPath: organizationalUnit || '/',
        jobTitle: jobTitle || undefined,
        department: department || undefined,
        changePasswordAtNextLogin: true,
        phones: mobilePhone ? [{ type: 'mobile', value: mobilePhone }] : undefined
      });

      if (gwResult.success && gwResult.userId) {
        googleWorkspaceUserId = gwResult.userId;

        // Update the Helios user record with the Google Workspace ID
        await db.query(
          `UPDATE organization_users
           SET google_workspace_id = $1,
               google_workspace_sync_status = 'synced',
               google_workspace_last_sync = NOW()
           WHERE id = $2`,
          [googleWorkspaceUserId, newUser.id]
        );

        logger.info('User created in Google Workspace and linked to Helios', {
          userId: newUser.id,
          googleWorkspaceId: googleWorkspaceUserId,
          email: email.toLowerCase()
        });
      } else {
        // Log the error but don't fail the entire operation
        // The Helios user was already created
        googleCreationError = gwResult.error || 'Unknown error creating Google Workspace user';
        logger.warn('Failed to create user in Google Workspace', {
          userId: newUser.id,
          email: email.toLowerCase(),
          error: googleCreationError
        });
      }
    }

    // TODO: Microsoft 365 user creation
    // if (createInMicrosoft) { /* Create user in Microsoft 365 */ }

    // TODO: License assignment
    // if (licenseId) { /* Assign license to user */ }

    // Build response message based on what was created
    let message = 'User created successfully';
    if (createInGoogle && googleWorkspaceUserId) {
      message = 'User created in Helios and Google Workspace';
    } else if (createInGoogle && googleCreationError) {
      message = 'User created in Helios. Google Workspace creation failed: ' + googleCreationError;
    }

    res.status(201).json({
      success: true,
      message,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          role: newUser.role,
          isActive: newUser.is_active,
          isExternalAdmin: newUser.is_external_admin || false,
          createdAt: newUser.created_at,
          googleWorkspaceId: googleWorkspaceUserId
        },
        providerStatus: {
          google: createInGoogle ? {
            requested: true,
            success: !!googleWorkspaceUserId,
            userId: googleWorkspaceUserId,
            error: googleCreationError
          } : null,
          microsoft: createInMicrosoft ? {
            requested: true,
            success: false,
            error: 'Microsoft 365 user creation not yet implemented'
          } : null
        }
      }
    });
  } catch (error: any) {
    logger.error('Failed to create user', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
});

/**
 * PUT /api/organization/users/:userId
 * Update an existing organization user
 */
router.put('/users/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const {
      email,
      firstName,
      lastName,
      role,
      isActive,
      // Extended profile fields
      jobTitle,
      department,
      organizationalUnit,
      location,
      reportingManagerId,
      employeeId,
      employeeType,
      costCenter,
      startDate,
      endDate,
      bio,
      // Contact information
      mobilePhone,
      workPhone,
      workPhoneExtension,
      timezone,
      preferredLanguage,
      // Platform integration
      googleWorkspaceId,
      microsoft365Id,
      githubUsername,
      slackUserId,
      jumpcloudUserId,
      associateId,
      // Avatar
      avatarUrl,
      // Admin type
      isExternalAdmin
    } = req.body;

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    // Check if user exists
    const existingUser = await db.query(
      'SELECT id, role FROM organization_users WHERE id = $1 AND organization_id = $2',
      [userId, organizationId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Determine external admin status
    // Can only be set to true if the user is an admin
    const currentRole = existingUser.rows[0].role;
    const newRole = role || currentRole;
    // If changing to non-admin role, force isExternalAdmin to false
    // If staying admin or becoming admin, allow isExternalAdmin to be set
    let externalAdminValue = undefined;
    if (isExternalAdmin !== undefined) {
      externalAdminValue = newRole === 'admin' ? isExternalAdmin : false;
    }

    // Update user
    const result = await db.query(
      `UPDATE organization_users SET
        email = COALESCE($1, email),
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        role = COALESCE($4, role),
        is_active = COALESCE($5, is_active),
        job_title = COALESCE($6, job_title),
        department = COALESCE($7, department),
        organizational_unit = COALESCE($8, organizational_unit),
        location = COALESCE($9, location),
        reporting_manager_id = $10,
        employee_id = COALESCE($11, employee_id),
        employee_type = COALESCE($12, employee_type),
        cost_center = COALESCE($13, cost_center),
        start_date = $14,
        end_date = $15,
        bio = $16,
        mobile_phone = COALESCE($17, mobile_phone),
        work_phone = COALESCE($18, work_phone),
        work_phone_extension = COALESCE($19, work_phone_extension),
        timezone = COALESCE($20, timezone),
        preferred_language = COALESCE($21, preferred_language),
        google_workspace_id = COALESCE($22, google_workspace_id),
        microsoft_365_id = COALESCE($23, microsoft_365_id),
        github_username = COALESCE($24, github_username),
        slack_user_id = COALESCE($25, slack_user_id),
        jumpcloud_user_id = COALESCE($26, jumpcloud_user_id),
        associate_id = COALESCE($27, associate_id),
        avatar_url = COALESCE($28, avatar_url),
        is_external_admin = COALESCE($29, is_external_admin),
        updated_at = NOW()
      WHERE id = $30 AND organization_id = $31
      RETURNING id, email, first_name, last_name, role, is_active, is_external_admin, updated_at`,
      [
        email,
        firstName,
        lastName,
        role,
        isActive,
        jobTitle,
        department,
        organizationalUnit,
        location,
        reportingManagerId,
        employeeId,
        employeeType,
        costCenter,
        startDate,
        endDate,
        bio,
        mobilePhone,
        workPhone,
        workPhoneExtension,
        timezone,
        preferredLanguage,
        googleWorkspaceId,
        microsoft365Id,
        githubUsername,
        slackUserId,
        jumpcloudUserId,
        associateId,
        avatarUrl,
        externalAdminValue,
        userId,
        organizationId
      ]
    );

    const updatedUser = result.rows[0];

    // Sync to Google Workspace if the user is linked
    const userDetailsResult = await db.query(
      'SELECT google_workspace_id, email FROM organization_users WHERE id = $1',
      [userId]
    );

    if (userDetailsResult.rows[0]?.google_workspace_id) {
      const googleWorkspaceId = userDetailsResult.rows[0].google_workspace_id;

      // Get manager email if managerId is provided
      let managerEmail = undefined;
      if (req.body.managerId !== undefined) {
        if (req.body.managerId) {
          const managerResult = await db.query(
            'SELECT email FROM organization_users WHERE id = $1',
            [req.body.managerId]
          );
          managerEmail = managerResult.rows[0]?.email;
        } else {
          managerEmail = null; // Clear manager
        }
      }

      // Build phones array if provided
      const phones = [];
      if (mobilePhone) phones.push({ type: 'mobile', value: mobilePhone });
      if (workPhone) phones.push({ type: 'work', value: workPhone });

      // Push updates to Google Workspace
      const syncResult = await googleWorkspaceService.updateUser(
        organizationId,
        googleWorkspaceId,
        {
          firstName,
          lastName,
          jobTitle,
          department,
          managerEmail,
          organizationalUnit,
          phones: phones.length > 0 ? phones : undefined
        }
      );

      if (!syncResult.success) {
        logger.warn('Failed to sync user update to Google Workspace', {
          userId,
          error: syncResult.error
        });
        // Continue - don't fail the whole request if Google sync fails
      } else {
        logger.info('User synced to Google Workspace', { userId, googleWorkspaceId });
      }
    }

    // Log the user update
    await db.query(
      `INSERT INTO audit_logs (user_id, organization_id, action, resource, resource_id, ip_address, user_agent)
       VALUES ($1, $2, 'update', 'organization_user', $3, $4, $5)`,
      [req.user?.userId, organizationId, userId, req.ip, req.get('User-Agent') || 'Unknown']
    );

    logger.info('User updated successfully', {
      userId: updatedUser.id,
      email: updatedUser.email,
      updatedBy: req.user?.userId
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          role: updatedUser.role,
          isActive: updatedUser.is_active,
          isExternalAdmin: updatedUser.is_external_admin || false,
          updatedAt: updatedUser.updated_at
        }
      }
    });
  } catch (error: any) {
    logger.error('Failed to update user', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

/**
 * DELETE /api/organization/users/:userId
 * Soft delete an organization user (can be restored within 30 days)
 */
router.delete('/users/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    // Check if requesting user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can delete users'
      });
    }

    // Prevent self-deletion
    if (userId === req.user?.userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot delete yourself'
      });
    }

    // Check if user exists and get their info for the audit log
    const userResult = await db.query(
      'SELECT id, email, role, status FROM organization_users WHERE id = $1 AND organization_id = $2',
      [userId, organizationId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userToDelete = userResult.rows[0];

    // If deleting an admin, ensure there's at least one other admin
    if (userToDelete.role === 'admin') {
      const adminCount = await db.query(`
        SELECT COUNT(*) as count
        FROM organization_users
        WHERE organization_id = $1 AND role = 'admin' AND status != 'deleted'
      `, [organizationId]);

      if (parseInt(adminCount.rows[0].count) <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete the last administrator'
        });
      }
    }

    // Get user's Google Workspace ID before deletion
    const userInfo = await db.query(
      'SELECT google_workspace_id FROM organization_users WHERE id = $1',
      [userId]
    );
    const googleWorkspaceId = userInfo.rows[0]?.google_workspace_id;

    // Soft delete user by setting status to deleted
    await db.query(
      `UPDATE organization_users
       SET status = 'deleted', is_active = false, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [userId, organizationId]
    );

    // Handle Google Workspace user deletion
    let googleSyncMessage = '';
    if (googleWorkspaceId) {
      const googleAction = req.body?.googleAction || 'keep'; // 'keep' | 'suspend' | 'delete'

      if (googleAction === 'delete') {
        // Permanently delete from Google Workspace (frees license)
        const { googleWorkspaceService } = await import('../services/google-workspace.service.js');
        const deleteResult = await googleWorkspaceService.deleteUser(organizationId, googleWorkspaceId);
        if (deleteResult.success) {
          googleSyncMessage = ' and permanently deleted from Google Workspace';
          logger.info('User deleted from Google Workspace', { googleWorkspaceId });
        } else {
          googleSyncMessage = ' (Note: Could not delete from Google Workspace - ' + deleteResult.error + ')';
          logger.warn('Could not delete user from Google Workspace', { googleWorkspaceId, error: deleteResult.error });
        }
      } else if (googleAction === 'suspend') {
        // Suspend in Google Workspace (STILL BILLED!)
        const { googleWorkspaceService } = await import('../services/google-workspace.service.js');
        const suspendResult = await googleWorkspaceService.suspendUser(organizationId, googleWorkspaceId);
        if (suspendResult.success) {
          googleSyncMessage = ' and suspended in Google Workspace (note: you are still billed for this license)';
          logger.info('User suspended in Google Workspace', { googleWorkspaceId });
        } else {
          googleSyncMessage = ' (Note: Could not suspend in Google Workspace - ' + suspendResult.error + ')';
          logger.warn('Could not suspend user in Google Workspace', { googleWorkspaceId, error: suspendResult.error });
        }
      } else {
        // Keep Google account active
        googleSyncMessage = ' (Google Workspace account remains active)';
      }
    }

    // Log the user deletion using the new activity_logs table
    await db.query(
      `SELECT log_activity(
        $1::uuid,
        $2::varchar,
        $3::uuid,
        $4::uuid,
        $5::varchar,
        $6::varchar,
        $7::text
      )`,
      [
        organizationId,
        'user_deleted',
        userId,
        req.user?.userId,
        'user',
        userId,
        `User ${userToDelete.email} was soft deleted${googleSyncMessage}`
      ]
    );

    logger.info('User soft deleted successfully', {
      userId: userToDelete.id,
      email: userToDelete.email,
      deletedBy: req.user?.userId,
      googleSynced: !!googleSyncMessage
    });

    res.json({
      success: true,
      message: `User deleted successfully (can be restored within 30 days)${googleSyncMessage}`
    });
  } catch (error: any) {
    logger.error('Failed to delete user', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

/**
 * PATCH /api/organization/users/:userId/status
 * Change user status (active, staged, suspended)
 */
router.patch('/users/:userId/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['active', 'staged', 'suspended'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be active, staged, or suspended'
      });
    }

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    // Check if requesting user is admin or manager
    if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators and managers can change user status'
      });
    }

    // Get current user info
    const userResult = await db.query(
      `SELECT id, email, status FROM organization_users WHERE id = $1 AND organization_id = $2 AND status != 'deleted'`,
      [userId, organizationId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const oldStatus = userResult.rows[0].status;

    // Update user status
    const isActive = status === 'active';
    await db.query(
      `UPDATE organization_users
       SET status = $1, is_active = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4`,
      [status, isActive, userId, organizationId]
    );

    // Log the status change to security_events using activity tracker
    const actionType = status === 'suspended' ? 'suspended' : status === 'active' ? 'activated' : 'updated';
    await activityTracker.trackUserChange(
      organizationId,
      userId,
      req.user?.userId || '',
      req.user?.email || '',
      actionType,
      {
        oldStatus,
        newStatus: status,
        userEmail: userResult.rows[0].email
      }
    );

    logger.info('User status changed', {
      userId,
      oldStatus,
      newStatus: status,
      changedBy: req.user?.userId
    });

    res.json({
      success: true,
      message: 'User status updated successfully',
      data: {
        userId,
        status,
        isActive
      }
    });
  } catch (error: any) {
    logger.error('Failed to update user status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to update user status'
    });
  }
});

/**
 * PATCH /api/organization/users/:userId/restore
 * Restore a soft-deleted user
 */
router.patch('/users/:userId/restore', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    // Check if requesting user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can restore users'
      });
    }

    // Check if user exists and is deleted
    const userResult = await db.query(
      `SELECT id, email, status FROM organization_users WHERE id = $1 AND organization_id = $2`,
      [userId, organizationId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];
    const daysSinceDeleted = 0; // Could be calculated from deleted_at if stored

    if (user.status !== 'deleted') {
      return res.status(400).json({
        success: false,
        error: 'User is not deleted'
      });
    }

    // Restore user by setting status to active
    await db.query(
      `UPDATE organization_users
       SET status = 'active', is_active = true, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [userId, organizationId]
    );

    // Log the user restoration
    await db.query(
      `SELECT log_activity(
        $1::uuid,
        $2::varchar,
        $3::uuid,
        $4::uuid,
        $5::varchar,
        $6::varchar,
        $7::text
      )`,
      [
        organizationId,
        'user_restored',
        userId,
        req.user?.userId,
        'user',
        userId,
        `User ${user.email} was restored after ${daysSinceDeleted} days`
      ]
    );

    logger.info('User restored successfully', {
      userId: user.id,
      email: user.email,
      restoredBy: req.user?.userId,
      daysSinceDeleted
    });

    res.json({
      success: true,
      message: 'User restored successfully',
      data: {
        userId: user.id,
        email: user.email,
        daysSinceDeleted
      }
    });
  } catch (error: any) {
    logger.error('Failed to restore user', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to restore user'
    });
  }
});

/**
 * POST /api/organization/users/:userId/reset-password
 * Send password reset email to user
 */
router.post('/users/:userId/reset-password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    // Check if requesting user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can trigger password resets'
      });
    }

    // Get user details
    const userResult = await db.query(
      `SELECT id, email, first_name, last_name, status FROM organization_users WHERE id = $1 AND organization_id = $2`,
      [userId, organizationId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    if (user.status === 'deleted') {
      return res.status(400).json({
        success: false,
        error: 'Cannot reset password for a deleted user'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store reset token
    await db.query(
      `UPDATE organization_users
       SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW()
       WHERE id = $3`,
      [tokenHash, expiresAt, userId]
    );

    // Log the action
    await db.query(
      `SELECT log_activity(
        $1::uuid,
        $2::varchar,
        $3::uuid,
        $4::uuid,
        $5::varchar,
        $6::varchar,
        $7::text
      )`,
      [
        organizationId,
        'password_reset_requested',
        userId,
        req.user?.userId,
        'user',
        userId,
        `Password reset initiated for ${user.email} by admin`
      ]
    );

    // In production, you would send an email here
    // For now, log the token (remove in production)
    logger.info('Password reset token generated', {
      userId: user.id,
      email: user.email,
      initiatedBy: req.user?.userId,
      // In production, don't log the token
      resetUrl: `/reset-password?token=${resetToken}`
    });

    res.json({
      success: true,
      message: 'Password reset email has been sent',
      data: {
        email: user.email
      }
    });
  } catch (error: any) {
    logger.error('Failed to initiate password reset', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to send password reset email'
    });
  }
});

/**
 * GET /api/organization/users/:userId/activity
 * Get activity log for a specific user
 */
router.get('/users/:userId/activity', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    // Fetch activity logs from security_events table
    // Query where user_id matches (user was target) OR actor_id matches (user was actor)
    const result = await db.query(`
      SELECT
        se.id,
        se.event_type as action,
        se.title,
        se.description,
        se.severity,
        se.metadata,
        se.ip_address as "ipAddress",
        se.created_at as timestamp,
        se.actor_email as "actorEmail",
        se.actor_name as "actorName",
        actor.first_name as "actorFirstName",
        actor.last_name as "actorLastName"
      FROM security_events se
      LEFT JOIN organization_users actor ON se.actor_id = actor.id
      WHERE se.organization_id = $1 AND (se.user_id = $2 OR se.actor_id = $2)
      ORDER BY se.created_at DESC
      LIMIT $3 OFFSET $4
    `, [organizationId, userId, limit, offset]);

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM security_events
      WHERE organization_id = $1 AND (user_id = $2 OR actor_id = $2)
    `, [organizationId, userId]);

    const total = parseInt(countResult.rows[0].total);

    logger.info('Activity logs fetched', {
      userId,
      count: result.rows.length,
      total
    });

    res.json({
      success: true,
      data: result.rows,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + result.rows.length < total
      }
    });
  } catch (error: any) {
    logger.error('Failed to fetch activity logs', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity logs'
    });
  }
});

/**
 * GET /api/organization/users/:userId/groups
 * Get groups for a specific user (both access groups and GW groups)
 */
router.get('/users/:userId/groups', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get organizationId from authenticated user
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({
        success: false,
        error: 'Organization ID not found'
      });
    }

    // Fetch access groups for this user with member count subquery
    const accessGroupsResult = await db.query(`
      SELECT DISTINCT
        ag.id,
        ag.external_id as "externalId",
        ag.name,
        ag.email,
        ag.description,
        (SELECT COUNT(*) FROM access_group_members WHERE access_group_id = ag.id AND is_active = true) as "memberCount",
        ag.platform as source,
        agm.member_type as "memberType",
        ag.group_type as "groupType"
      FROM access_groups ag
      JOIN access_group_members agm ON ag.id = agm.access_group_id
      WHERE ag.organization_id = $1
        AND agm.user_id = $2
        AND agm.is_active = true
      ORDER BY ag.name
    `, [organizationId, userId]);

    // Note: gw_group_members table doesn't exist, so we only use access_groups
    // GW group memberships should be imported into access_groups during sync

    logger.info('User groups fetched', {
      userId,
      accessGroupsCount: accessGroupsResult.rows.length
    });

    const allGroups = accessGroupsResult.rows;

    res.json({
      success: true,
      data: allGroups,
      meta: {
        total: allGroups.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to fetch user groups', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user groups'
    });
  }
});

// Get organization statistics (Platform-specific)
router.get('/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Get organizationId from authenticated user or query parameter (fallback to database)
    let organizationId = req.user?.organizationId || req.query.organizationId;

    // If no organizationId, get the only organization (single-organization)
    if (!organizationId) {
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        organizationId = orgResult.rows[0].id;
      } else {
        return res.status(404).json({
          success: false,
          error: 'No organization found'
        });
      }
    }

    logger.info('Fetching platform-specific organization stats', { organizationId });

    // Use the sync-scheduler service to get platform-specific stats
    const stats = await syncScheduler.getOrganizationStats(organizationId as string);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Failed to fetch organization stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organization statistics'
    });
  }
});

// Get all administrators for the organization
router.get('/admins', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Get organizationId from authenticated user
    let organizationId = req.user?.organizationId;

    // If no organizationId, get the only organization (single-organization)
    if (!organizationId) {
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        organizationId = orgResult.rows[0].id;
      } else {
        return res.status(404).json({
          success: false,
          error: 'No organization found'
        });
      }
    }

    // Get all admins from organization_users table
    const adminsResult = await db.query(`
      SELECT
        id, email, first_name, last_name, role,
        is_active, created_at, last_login
      FROM organization_users
      WHERE organization_id = $1 AND role = 'admin'
      ORDER BY first_name, last_name, email
    `, [organizationId]);

    res.json({
      success: true,
      data: adminsResult.rows
    });
  } catch (error: any) {
    logger.error('Failed to fetch admins', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch administrators'
    });
  }
});

// Promote a user to admin
router.post('/admins/promote/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get organizationId from authenticated user
    let organizationId = req.user?.organizationId;

    if (!organizationId) {
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        organizationId = orgResult.rows[0].id;
      }
    }

    // Check if requesting user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can promote users'
      });
    }

    // Update user role to admin
    const result = await db.query(`
      UPDATE organization_users
      SET role = 'admin', updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, email, first_name, last_name, role
    `, [userId, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    logger.info('User promoted to admin', {
      promotedUserId: userId,
      promotedBy: req.user?.userId
    });

    res.json({
      success: true,
      data: result.rows[0],
      message: 'User promoted to administrator successfully'
    });
  } catch (error: any) {
    logger.error('Failed to promote user', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to promote user'
    });
  }
});

// Demote an admin to regular user
router.post('/admins/demote/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get organizationId from authenticated user
    let organizationId = req.user?.organizationId;

    if (!organizationId) {
      const orgResult = await db.query('SELECT id FROM organizations LIMIT 1');
      if (orgResult.rows.length > 0) {
        organizationId = orgResult.rows[0].id;
      }
    }

    // Check if requesting user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can demote users'
      });
    }

    // Prevent self-demotion
    if (userId === req.user?.userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot demote yourself'
      });
    }

    // Check if there will be at least one admin left
    const adminCount = await db.query(`
      SELECT COUNT(*) as count
      FROM organization_users
      WHERE organization_id = $1 AND role = 'admin'
    `, [organizationId]);

    if (parseInt(adminCount.rows[0].count) <= 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot demote the last administrator'
      });
    }

    // Update user role to user
    const result = await db.query(`
      UPDATE organization_users
      SET role = 'user', updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id, email, first_name, last_name, role
    `, [userId, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    logger.info('Admin demoted to user', {
      demotedUserId: userId,
      demotedBy: req.user?.userId
    });

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Administrator demoted to regular user successfully'
    });
  } catch (error: any) {
    logger.error('Failed to demote admin', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to demote administrator'
    });
  }
});

/**
 * POST /api/organization/users/:userId/block
 * Block user account (security lockout while maintaining delegation capability)
 */
router.post('/users/:userId/block', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { reason, delegateTo, emailForwarding, dataTransfer } = req.body;

    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID not found' });
    }

    // Check admin permissions
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // Get user details
    const userResult = await db.query(
      'SELECT * FROM organization_users WHERE id = $1 AND organization_id = $2',
      [userId, organizationId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.google_workspace_id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot block local-only user. Use suspend instead.'
      });
    }

    // Get fresh auth token for proxy calls
    const authToken = req.headers.authorization;

    // Execute block operations
    const blockResult = {
      passwordReset: false,
      sessionsSignedOut: false,
      aspsRevoked: 0,
      tokensRevoked: 0,
      delegationEnabled: false,
      emailForwardingEnabled: false,
      dataTransferInitiated: false,
      groupsRemoved: 0
    };

    // 1. Generate random password
    const randomPassword = crypto.randomBytes(32).toString('base64').substring(0, 64);

    const passwordResponse = await fetch(`http://localhost:3001/api/google/admin/directory/v1/users/${user.email}`, {
      method: 'PATCH',
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        password: randomPassword,
        changePasswordAtNextLogin: false
      })
    });

    blockResult.passwordReset = passwordResponse.ok;

    // 2. Sign out all sessions
    const signOutResponse = await fetch(`http://localhost:3001/api/google/admin/directory/v1/users/${user.email}/signOut`, {
      method: 'POST',
      headers: { 'Authorization': authToken }
    });

    blockResult.sessionsSignedOut = signOutResponse.ok;

    // 3. Revoke all ASPs
    try {
      const aspsResponse = await fetch(`http://localhost:3001/api/google/admin/directory/v1/users/${user.email}/asps`, {
        headers: { 'Authorization': authToken }
      });

      if (aspsResponse.ok) {
        const aspsData: any = await aspsResponse.json();
        const asps = aspsData.items || [];

        for (const asp of asps) {
          await fetch(`http://localhost:3001/api/google/admin/directory/v1/users/${user.email}/asps/${asp.codeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': authToken }
          });
          blockResult.aspsRevoked++;
        }
      }
    } catch (error) {
      logger.warn('Failed to revoke ASPs', { error });
    }

    // 4. Revoke all OAuth tokens
    try {
      const tokensResponse = await fetch(`http://localhost:3001/api/google/admin/directory/v1/users/${user.email}/tokens`, {
        headers: { 'Authorization': authToken }
      });

      if (tokensResponse.ok) {
        const tokensData: any = await tokensResponse.json();
        const tokens = tokensData.items || [];

        for (const token of tokens) {
          await fetch(`http://localhost:3001/api/google/admin/directory/v1/users/${user.email}/tokens/${token.clientId}`, {
            method: 'DELETE',
            headers: { 'Authorization': authToken }
          });
          blockResult.tokensRevoked++;
        }
      }
    } catch (error) {
      logger.warn('Failed to revoke OAuth tokens', { error });
    }

    // 5. Set up delegation if requested
    if (delegateTo) {
      const delegateResponse = await fetch(`http://localhost:3001/api/google/gmail/v1/users/${user.email}/settings/delegates`, {
        method: 'POST',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ delegateEmail: delegateTo })
      });

      blockResult.delegationEnabled = delegateResponse.ok;
    }

    // 6. Set up email forwarding if requested
    if (emailForwarding?.enabled && emailForwarding?.forwardTo) {
      // Call hidden forwarding group function
      const { createHiddenForwardingGroup } = await import('../services/email-forwarding.service.js');
      const forwardingResult = await createHiddenForwardingGroup(
        user,
        emailForwarding,
        authToken || '',
        organizationId
      );

      blockResult.emailForwardingEnabled = forwardingResult.success;
    }

    // 7. Transfer data if requested
    if (dataTransfer?.enabled && dataTransfer?.transferTo && dataTransfer?.items) {
      const { initiateDataTransfer } = await import('../services/data-transfer.service.js');
      const transferResult = await initiateDataTransfer(
        user,
        dataTransfer,
        authToken || ''
      );

      blockResult.dataTransferInitiated = transferResult.success;
    }

    // 7.5. Remove user from all groups in Google Workspace
    try {
      const { googleWorkspaceService } = await import('../services/google-workspace.service.js');

      // Get all groups the user belongs to
      const userGroupsResult = await googleWorkspaceService.getUserGroups(
        organizationId,
        user.google_workspace_id
      );

      if (userGroupsResult.success && userGroupsResult.data.length > 0) {
        logger.info('Removing user from groups during block', {
          userEmail: user.email,
          groupCount: userGroupsResult.data.length
        });

        // Remove user from each group
        for (const group of userGroupsResult.data) {
          try {
            const removeResult = await googleWorkspaceService.removeUserFromGroup(
              organizationId,
              user.email,
              group.id
            );
            if (removeResult.success) {
              blockResult.groupsRemoved++;
            }
          } catch (groupError: any) {
            // Log but continue - don't fail the entire block operation
            logger.warn('Failed to remove user from group', {
              userEmail: user.email,
              groupId: group.id,
              groupEmail: group.email,
              error: groupError.message
            });
          }
        }

        logger.info('Completed group removal during block', {
          userEmail: user.email,
          groupsRemoved: blockResult.groupsRemoved,
          totalGroups: userGroupsResult.data.length
        });
      }
    } catch (groupRemovalError: any) {
      // Log but don't fail the block operation
      logger.warn('Error during group removal', {
        userEmail: user.email,
        error: groupRemovalError.message
      });
    }

    // 8. Update Helios database
    await db.query(`
      UPDATE organization_users
      SET
        status = 'blocked',
        is_active = false,
        blocked_at = NOW(),
        blocked_by = $1,
        blocked_reason = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [req.user?.userId, reason || 'Security lockout', userId]);

    // 9. Create security event
    await db.query(`
      INSERT INTO security_events (
        organization_id,
        event_type,
        severity,
        user_id,
        user_email,
        title,
        description,
        details,
        source
      ) VALUES ($1, 'user_blocked', 'warning', $2, $3, $4, $5, $6, 'helios')
    `, [
      organizationId,
      userId,
      user.email,
      `User account blocked: ${user.first_name} ${user.last_name}`,
      `Account blocked by ${req.user?.email}. Reason: ${reason || 'Security lockout'}`,
      JSON.stringify({
        blockedBy: req.user?.email,
        reason,
        delegateTo,
        emailForwardingEnabled: blockResult.emailForwardingEnabled,
        dataTransferInitiated: blockResult.dataTransferInitiated,
        groupsRemoved: blockResult.groupsRemoved
      })
    ]);

    logger.info('User account blocked', {
      userId,
      userEmail: user.email,
      blockedBy: req.user?.email,
      delegationEnabled: blockResult.delegationEnabled,
      groupsRemoved: blockResult.groupsRemoved
    });

    res.json({
      success: true,
      message: 'User account blocked successfully',
      data: blockResult
    });

  } catch (error: any) {
    logger.error('Failed to block user', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to block user',
      message: error.message
    });
  }
});

// ==========================================
// DELEGATE VALIDATION & DATA TRANSFER
// ==========================================

/**
 * @openapi
 * /api/v1/organization/users/validate-delegate:
 *   get:
 *     summary: Validate a potential delegate user
 *     description: Checks if a user is valid for delegation (not suspended, archived, or pending deletion)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: Email of the potential delegate
 *     responses:
 *       200:
 *         description: Validation result
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
 *                     valid:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                       enum: [valid, invalid, warning]
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         suspended:
 *                           type: boolean
 *                         archived:
 *                           type: boolean
 *                         existsInHelios:
 *                           type: boolean
 *       400:
 *         description: Email parameter required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/users/validate-delegate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { email } = req.query;
    const organizationId = req.user?.organizationId;
    const authToken = req.headers.authorization;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID not found' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    const result: {
      valid: boolean;
      status: 'valid' | 'invalid' | 'warning';
      errors: string[];
      warnings: string[];
      user?: {
        email: string;
        name: string;
        suspended: boolean;
        archived: boolean;
        existsInHelios: boolean;
      };
    } = {
      valid: true,
      status: 'valid',
      errors: [],
      warnings: []
    };

    // Try to get user from Google Workspace
    try {
      const gwResponse = await fetch(`http://localhost:3001/api/google/admin/directory/v1/users/${encodeURIComponent(email)}`, {
        headers: { 'Authorization': authToken || '' }
      });

      if (!gwResponse.ok) {
        result.valid = false;
        result.status = 'invalid';
        result.errors.push('User not found in Google Workspace');
        return res.json({ success: true, data: result });
      }

      const gwUser: any = await gwResponse.json();

      // Check if suspended
      if (gwUser.suspended) {
        result.valid = false;
        result.status = 'invalid';
        result.errors.push('Cannot delegate to a suspended user');
        return res.json({ success: true, data: result });
      }

      // Check if archived
      if (gwUser.archived) {
        result.valid = false;
        result.status = 'invalid';
        result.errors.push('Cannot delegate to an archived user');
        return res.json({ success: true, data: result });
      }

      // Check if pending deletion
      if (gwUser.deletionTime) {
        result.valid = false;
        result.status = 'invalid';
        result.errors.push('Cannot delegate to a user pending deletion');
        return res.json({ success: true, data: result });
      }

      // Check if exists in Helios
      const heliosUser = await db.query(
        'SELECT id FROM organization_users WHERE LOWER(email) = LOWER($1) AND organization_id = $2',
        [email, organizationId]
      );

      const existsInHelios = heliosUser.rows.length > 0;
      if (!existsInHelios) {
        result.status = 'warning';
        result.warnings.push('User exists in Google Workspace but is not synced to Helios');
      }

      result.user = {
        email: gwUser.primaryEmail,
        name: `${gwUser.name?.givenName || ''} ${gwUser.name?.familyName || ''}`.trim(),
        suspended: gwUser.suspended || false,
        archived: gwUser.archived || false,
        existsInHelios
      };

    } catch (error: any) {
      logger.error('Error validating delegate via Google API', { error: error.message });
      result.valid = false;
      result.status = 'invalid';
      result.errors.push('Failed to validate user in Google Workspace');
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Error validating delegate', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to validate delegate' });
  }
});

/**
 * @openapi
 * /api/v1/organization/users/{userId}/transfer:
 *   post:
 *     summary: Initiate data transfer from one user to another
 *     description: Transfer Drive and/or Calendar data to another user
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the source user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - toUserId
 *               - applications
 *             properties:
 *               toUserId:
 *                 type: string
 *                 description: UUID or email of the target user
 *               applications:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [drive, calendar]
 *                 description: Applications to transfer
 *     responses:
 *       200:
 *         description: Transfer initiated
 *       400:
 *         description: Invalid request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: User not found
 */
router.post('/users/:userId/transfer', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { toUserId, applications } = req.body;
    const organizationId = req.user?.organizationId;
    const authToken = req.headers.authorization;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID not found' });
    }

    // Check admin permissions
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    if (!toUserId || !applications || !Array.isArray(applications) || applications.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'toUserId and applications array are required'
      });
    }

    // Get source user
    const sourceResult = await db.query(
      'SELECT * FROM organization_users WHERE id = $1 AND organization_id = $2',
      [userId, organizationId]
    );

    if (sourceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Source user not found' });
    }

    const sourceUser = sourceResult.rows[0];

    // Get target user (by UUID or email)
    let targetEmail: string;
    const targetResult = await db.query(
      'SELECT email FROM organization_users WHERE (id = $1 OR LOWER(email) = LOWER($1)) AND organization_id = $2',
      [toUserId, organizationId]
    );

    if (targetResult.rows.length > 0) {
      targetEmail = targetResult.rows[0].email;
    } else {
      // Assume it's an email if not found by UUID
      targetEmail = toUserId;
    }

    // Initiate transfer via Google Admin API
    const { initiateDataTransfer } = await import('../services/data-transfer.service.js');
    const transferResult = await initiateDataTransfer(
      sourceUser,
      {
        enabled: true,
        transferTo: targetEmail,
        items: applications
      },
      authToken || ''
    );

    if (!transferResult.success) {
      return res.status(400).json({
        success: false,
        error: transferResult.error || 'Data transfer failed'
      });
    }

    // Log the action
    await db.query(`
      INSERT INTO activity_logs (
        organization_id,
        actor_user_id,
        actor_email,
        action,
        resource_type,
        resource_id,
        description,
        metadata
      ) VALUES ($1, $2, $3, 'data_transfer_initiated', 'user', $4, $5, $6)
    `, [
      organizationId,
      req.user?.userId,
      req.user?.email,
      userId,
      `Data transfer initiated from ${sourceUser.email} to ${targetEmail}`,
      JSON.stringify({
        sourceEmail: sourceUser.email,
        targetEmail,
        applications,
        transferId: transferResult.transferId
      })
    ]);

    res.json({
      success: true,
      data: {
        transferId: transferResult.transferId,
        sourceEmail: sourceUser.email,
        targetEmail,
        applications,
        status: 'initiated'
      },
      message: `Data transfer initiated from ${sourceUser.email} to ${targetEmail}`
    });
  } catch (error: any) {
    logger.error('Error initiating data transfer', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to initiate data transfer' });
  }
});

/**
 * @openapi
 * /api/v1/organization/users/{userId}/reassign-reports:
 *   post:
 *     summary: Reassign direct reports to new managers
 *     description: Reassign direct reports when a manager is being offboarded
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: UUID of the departing manager
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [all_to_one, individual]
 *                 description: Reassignment mode
 *               targetManagerId:
 *                 type: string
 *                 description: UUID of new manager (for all_to_one mode)
 *               assignments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     reportId:
 *                       type: string
 *                     newManagerId:
 *                       type: string
 *                 description: Individual assignments (for individual mode)
 *     responses:
 *       200:
 *         description: Reports reassigned
 *       400:
 *         description: Invalid request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/users/:userId/reassign-reports', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { mode, targetManagerId, assignments } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID not found' });
    }

    // Check admin permissions
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    // Validate inputs
    if (!mode || (mode !== 'all_to_one' && mode !== 'individual')) {
      return res.status(400).json({
        success: false,
        error: 'mode must be either "all_to_one" or "individual"'
      });
    }

    if (mode === 'all_to_one' && !targetManagerId) {
      return res.status(400).json({
        success: false,
        error: 'targetManagerId is required for all_to_one mode'
      });
    }

    if (mode === 'individual' && (!assignments || !Array.isArray(assignments) || assignments.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'assignments array is required for individual mode'
      });
    }

    // Get current direct reports
    const reportsResult = await db.query(
      'SELECT id, email, first_name, last_name FROM organization_users WHERE reporting_manager_id = $1 AND organization_id = $2',
      [userId, organizationId]
    );

    const directReports = reportsResult.rows;
    let reassignedCount = 0;
    const results: { reportId: string; email: string; newManagerId: string; success: boolean; error?: string }[] = [];

    if (mode === 'all_to_one') {
      // Reassign all to one manager
      const updateResult = await db.query(
        'UPDATE organization_users SET reporting_manager_id = $1, updated_at = NOW() WHERE reporting_manager_id = $2 AND organization_id = $3 RETURNING id, email',
        [targetManagerId, userId, organizationId]
      );
      reassignedCount = updateResult.rowCount || 0;

      for (const report of updateResult.rows) {
        results.push({
          reportId: report.id,
          email: report.email,
          newManagerId: targetManagerId,
          success: true
        });
      }
    } else {
      // Individual assignments
      for (const assignment of assignments) {
        try {
          const updateResult = await db.query(
            'UPDATE organization_users SET reporting_manager_id = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3 RETURNING id, email',
            [assignment.newManagerId, assignment.reportId, organizationId]
          );

          if (updateResult.rowCount && updateResult.rowCount > 0) {
            reassignedCount++;
            results.push({
              reportId: assignment.reportId,
              email: updateResult.rows[0].email,
              newManagerId: assignment.newManagerId,
              success: true
            });
          } else {
            results.push({
              reportId: assignment.reportId,
              email: 'unknown',
              newManagerId: assignment.newManagerId,
              success: false,
              error: 'Report not found'
            });
          }
        } catch (error: any) {
          results.push({
            reportId: assignment.reportId,
            email: 'unknown',
            newManagerId: assignment.newManagerId,
            success: false,
            error: error.message
          });
        }
      }
    }

    // Log the action
    await db.query(`
      INSERT INTO activity_logs (
        organization_id,
        actor_user_id,
        actor_email,
        action,
        resource_type,
        resource_id,
        description,
        metadata
      ) VALUES ($1, $2, $3, 'direct_reports_reassigned', 'user', $4, $5, $6)
    `, [
      organizationId,
      req.user?.userId,
      req.user?.email,
      userId,
      `Reassigned ${reassignedCount} direct reports`,
      JSON.stringify({
        mode,
        targetManagerId: mode === 'all_to_one' ? targetManagerId : null,
        totalReports: directReports.length,
        reassignedCount,
        results
      })
    ]);

    res.json({
      success: true,
      data: {
        totalReports: directReports.length,
        reassignedCount,
        results
      },
      message: `Successfully reassigned ${reassignedCount} of ${directReports.length} direct reports`
    });
  } catch (error: any) {
    logger.error('Error reassigning direct reports', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to reassign direct reports' });
  }
});

/**
 * @openapi
 * /api/v1/organization/users/{userId}/email-settings:
 *   get:
 *     summary: Get email settings for a user
 *     description: Returns current email forwarding, vacation responder, and delegate settings
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The user ID
 *     responses:
 *       200:
 *         description: Email settings retrieved successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/users/:userId/email-settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID not found' });
    }

    // Get user
    const userResult = await db.query(
      'SELECT id, email, first_name, last_name FROM organization_users WHERE id = $1 AND organization_id = $2',
      [userId, organizationId]
    );

    if (!userResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get email settings from Google Workspace
    const googleWorkspaceService = await import('../services/google-workspace.service.js');
    const gwService = new googleWorkspaceService.GoogleWorkspaceService();

    const settingsResult = await gwService.getEmailSettings(organizationId, user.email);

    if (!settingsResult.success) {
      return res.status(500).json({
        success: false,
        error: settingsResult.error || 'Failed to retrieve email settings'
      });
    }

    // Get delegates list
    const delegatesResult = await gwService.listGmailDelegates(organizationId, user.email);

    res.json({
      success: true,
      data: {
        userId,
        email: user.email,
        forwarding: settingsResult.settings?.forwarding,
        vacation: settingsResult.settings?.vacation,
        delegates: delegatesResult.success ? delegatesResult.delegates : [],
        delegateCount: settingsResult.settings?.delegateCount || 0,
        maxDelegates: 25 // Google's limit
      }
    });
  } catch (error: any) {
    logger.error('Error getting email settings', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get email settings' });
  }
});

/**
 * @openapi
 * /api/v1/organization/users/{userId}/email-settings:
 *   post:
 *     summary: Update email settings for a user
 *     description: Configure email forwarding, vacation responder, and delegates for a user
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forwarding:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   forwardTo:
 *                     type: string
 *                     format: email
 *               vacation:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   subject:
 *                     type: string
 *                   message:
 *                     type: string
 *               addDelegates:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               removeDelegates:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *     responses:
 *       200:
 *         description: Email settings updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/users/:userId/email-settings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const organizationId = req.user?.organizationId;
    const { forwarding, vacation, addDelegates, removeDelegates } = req.body;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization ID not found' });
    }

    // Get user
    const userResult = await db.query(
      'SELECT id, email, first_name, last_name FROM organization_users WHERE id = $1 AND organization_id = $2',
      [userId, organizationId]
    );

    if (!userResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    const googleWorkspaceService = await import('../services/google-workspace.service.js');
    const gwService = new googleWorkspaceService.GoogleWorkspaceService();

    const results: {
      forwarding?: { success: boolean; error?: string };
      vacation?: { success: boolean; error?: string };
      delegatesAdded?: Array<{ email: string; success: boolean; error?: string }>;
      delegatesRemoved?: Array<{ email: string; success: boolean; error?: string }>;
    } = {};

    // Handle forwarding
    if (forwarding !== undefined) {
      if (forwarding.enabled && forwarding.forwardTo) {
        results.forwarding = await gwService.setupEmailForwarding(
          organizationId,
          user.email,
          forwarding.forwardTo
        );
      } else if (forwarding.enabled === false) {
        results.forwarding = await gwService.disableEmailForwarding(
          organizationId,
          user.email
        );
      }
    }

    // Handle vacation responder
    if (vacation !== undefined) {
      if (vacation.enabled && vacation.subject && vacation.message) {
        results.vacation = await gwService.setVacationResponder(
          organizationId,
          user.email,
          {
            subject: vacation.subject,
            body: vacation.message,
            restrictToContacts: vacation.restrictToContacts || false,
            restrictToDomain: vacation.restrictToDomain || false
          }
        );
      } else if (vacation.enabled === false) {
        results.vacation = await gwService.disableVacationResponder(
          organizationId,
          user.email
        );
      }
    }

    // Handle adding delegates (with 25 delegate limit check)
    if (addDelegates && Array.isArray(addDelegates) && addDelegates.length > 0) {
      // Check current delegate count
      const currentDelegates = await gwService.listGmailDelegates(organizationId, user.email);
      const currentCount = currentDelegates.delegates?.length || 0;

      if (currentCount + addDelegates.length > 25) {
        return res.status(400).json({
          success: false,
          error: `Cannot add ${addDelegates.length} delegates. Current count: ${currentCount}, maximum: 25`
        });
      }

      results.delegatesAdded = [];
      for (const delegateEmail of addDelegates) {
        const result = await gwService.addGmailDelegate(organizationId, user.email, delegateEmail);
        results.delegatesAdded.push({
          email: delegateEmail,
          success: result.success,
          error: result.error
        });
      }
    }

    // Handle removing delegates
    if (removeDelegates && Array.isArray(removeDelegates) && removeDelegates.length > 0) {
      results.delegatesRemoved = [];
      for (const delegateEmail of removeDelegates) {
        const result = await gwService.removeGmailDelegate(organizationId, user.email, delegateEmail);
        results.delegatesRemoved.push({
          email: delegateEmail,
          success: result.success,
          error: result.error
        });
      }
    }

    // Log the action
    await db.query(`
      INSERT INTO activity_logs (
        organization_id,
        actor_user_id,
        actor_email,
        action,
        resource_type,
        resource_id,
        description,
        metadata
      ) VALUES ($1, $2, $3, 'email_settings_updated', 'user', $4, $5, $6)
    `, [
      organizationId,
      req.user?.userId,
      req.user?.email,
      userId,
      `Updated email settings for ${user.email}`,
      JSON.stringify({
        forwarding: forwarding ? {
          enabled: forwarding.enabled,
          forwardTo: forwarding.forwardTo
        } : undefined,
        vacation: vacation ? {
          enabled: vacation.enabled,
          subject: vacation.subject
        } : undefined,
        delegatesAdded: addDelegates?.length || 0,
        delegatesRemoved: removeDelegates?.length || 0,
        results
      })
    ]);

    res.json({
      success: true,
      data: {
        userId,
        email: user.email,
        results
      },
      message: 'Email settings updated'
    });
  } catch (error: any) {
    logger.error('Error updating email settings', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update email settings' });
  }
});

export default router;