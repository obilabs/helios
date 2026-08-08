import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { googleWorkspaceService } from './google-workspace.service.js';

export interface UnifiedUser {
  id: string;
  organizationId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  displayName?: string;
  avatarUrl?: string | null;
  jobTitle?: string;
  department?: string;
  phone?: string;
  mobile?: string;
  isActive: boolean;
  isSuspended: boolean;
  isAdmin: boolean;
  platforms: {
    platform: string;
    platformUserId: string;
    isActive: boolean;
    isAdmin: boolean;
    isSuspended: boolean;
    lastSynced: Date;
  }[];
}

export class UserSyncService {
  /**
   * Sync users from Google Workspace to unified users table
   */
  async syncGoogleWorkspaceUsers(organizationId: string, domain: string, adminEmail?: string): Promise<{
    success: boolean;
    usersCreated: number;
    usersUpdated: number;
    usersDisabled: number;
    error?: string;
  }> {
    const syncLogId = await this.createSyncLog(organizationId, 'google_workspace', 'full');
    const startTime = Date.now();

    try {
      logger.info('Starting Google Workspace user sync', { organizationId, domain });

      // Fetch users from Google Workspace
      const result = await googleWorkspaceService.getUsers(organizationId, domain, adminEmail);

      if (!result.success || !result.users) {
        throw new Error(result.error || 'Failed to fetch users from Google Workspace');
      }

      const googleUsers = result.users;
      let usersCreated = 0;
      let usersUpdated = 0;
      let usersDisabled = 0;

      // Start transaction
      await db.query('BEGIN');

      try {
        // Process each Google user
        for (const googleUser of googleUsers) {
          // Check if user already exists
          const existingUser = await db.query(
            'SELECT id FROM organization_users WHERE organization_id = $1 AND email = $2',
            [organizationId, googleUser.primaryEmail.toLowerCase()]
          );

          let userId: string;

          // Extract extended properties
          const department = googleUser.organizations?.[0]?.department || '';
          const jobTitle = googleUser.organizations?.[0]?.title || '';
          const managerEmail = googleUser.relations?.find((r: any) => r.type === 'manager')?.value || null;
          const mobilePhone = googleUser.phones?.find((p: any) => p.type === 'mobile')?.value || '';
          const workPhone = googleUser.phones?.find((p: any) => p.type === 'work')?.value || '';

          // Look up manager ID if manager email exists
          let managerId = null;
          if (managerEmail) {
            const managerResult = await db.query(
              'SELECT id FROM organization_users WHERE organization_id = $1 AND email = $2',
              [organizationId, managerEmail.toLowerCase()]
            );
            if (managerResult.rows.length > 0) {
              managerId = managerResult.rows[0].id;
            }
          }

          if (existingUser.rows.length === 0) {
            // Create new user
            const newUser = await db.query(`
              INSERT INTO organization_users (
                organization_id, email, first_name, last_name,
                role, job_title, department, manager_id,
                organizational_unit, mobile_phone, work_phone,
                google_workspace_id, is_active, user_type, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'staff', NOW())
              RETURNING id
            `, [
              organizationId,
              googleUser.primaryEmail.toLowerCase(),
              googleUser.name?.givenName || '',
              googleUser.name?.familyName || '',
              googleUser.isAdmin ? 'admin' : 'user',
              jobTitle,
              department,
              managerId,
              googleUser.orgUnitPath || '/',
              mobilePhone,
              workPhone,
              googleUser.id,
              !googleUser.suspended
            ]);

            userId = newUser.rows[0].id;
            usersCreated++;
            logger.info('Created new user', { userId, email: googleUser.primaryEmail });
          } else {
            // Update existing user
            userId = existingUser.rows[0].id;

            await db.query(`
              UPDATE organization_users SET
                first_name = $3,
                last_name = $4,
                role = $5,
                job_title = $6,
                department = $7,
                manager_id = $8,
                organizational_unit = $9,
                mobile_phone = $10,
                work_phone = $11,
                google_workspace_id = $12,
                is_active = $13,
                updated_at = NOW()
              WHERE id = $1 AND organization_id = $2
            `, [
              userId,
              organizationId,
              googleUser.name?.givenName || '',
              googleUser.name?.familyName || '',
              googleUser.isAdmin ? 'admin' : 'user',
              jobTitle,
              department,
              managerId,
              googleUser.orgUnitPath || '/',
              mobilePhone,
              workPhone,
              googleUser.id,
              !googleUser.suspended
            ]);

            usersUpdated++;
            logger.info('Updated user', { userId, email: googleUser.primaryEmail });
          }
        }

        // Find and disable users that no longer exist in Google Workspace
        const allLocalUsers = await db.query(`
          SELECT id, email
          FROM organization_users
          WHERE organization_id = $1 AND google_workspace_id IS NOT NULL AND is_active = true
        `, [organizationId]);

        const googleEmails = new Set(googleUsers.map(u => u.primaryEmail.toLowerCase()));

        for (const localUser of allLocalUsers.rows) {
          if (!googleEmails.has(localUser.email)) {
            await db.query(
              'UPDATE organization_users SET is_active = false, updated_at = NOW() WHERE id = $1',
              [localUser.id]
            );
            usersDisabled++;
            logger.info('Disabled user not found in Google Workspace', { email: localUser.email });
          }
        }

        // Commit transaction
        await db.query('COMMIT');

        // Update sync log
        await this.completeSyncLog(syncLogId, 'completed', {
          usersFound: googleUsers.length,
          usersCreated,
          usersUpdated,
          usersDisabled,
          duration: Date.now() - startTime
        });

        // Update module user count
        await this.updateModuleUserCount(organizationId, 'google_workspace');

        logger.info('Google Workspace user sync completed', {
          organizationId,
          usersCreated,
          usersUpdated,
          usersDisabled
        });

        return {
          success: true,
          usersCreated,
          usersUpdated,
          usersDisabled
        };

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error: any) {
      logger.error('Google Workspace user sync failed', {
        organizationId,
        error: error.message
      });

      await this.completeSyncLog(syncLogId, 'failed', {
        error: error.message,
        duration: Date.now() - startTime
      });

      return {
        success: false,
        usersCreated: 0,
        usersUpdated: 0,
        usersDisabled: 0,
        error: error.message
      };
    }
  }

  /**
   * Get all users for an organization with platform indicators
   */
  async getUnifiedUsers(organizationId: string, options?: {
    platform?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<UnifiedUser[]> {
    try {
      let query = `
        SELECT
          ou.id,
          ou.organization_id,
          ou.email,
          ou.first_name,
          ou.last_name,
          CONCAT(ou.first_name, ' ', ou.last_name) as full_name,
          ou.job_title,
          ou.department,
          ou.work_phone as phone,
          ou.mobile_phone as mobile,
          ou.is_active,
          ou.role = 'admin' as is_admin,
          ou.google_workspace_id,
          CASE
            WHEN ou.google_workspace_id IS NOT NULL THEN
              json_build_array(
                json_build_object(
                  'platform', 'google_workspace',
                  'platformUserId', ou.google_workspace_id,
                  'isActive', ou.is_active,
                  'isAdmin', ou.role = 'admin',
                  'isSuspended', NOT ou.is_active,
                  'lastSynced', ou.updated_at
                )
              )
            ELSE '[]'::json
          END as platforms
        FROM organization_users ou
        WHERE ou.organization_id = $1
      `;

      const params: any[] = [organizationId];
      let paramIndex = 2;

      if (options?.platform) {
        if (options.platform === 'google_workspace') {
          query += ` AND ou.google_workspace_id IS NOT NULL`;
        }
      }

      if (options?.isActive !== undefined) {
        query += ` AND ou.is_active = $${paramIndex}`;
        params.push(options.isActive);
        paramIndex++;
      }

      query += ' ORDER BY ou.email';

      if (options?.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options?.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(options.offset);
      }

      const result = await db.query(query, params);

      return result.rows.map((row: any): UnifiedUser => ({
        id: row.id,
        organizationId: row.organization_id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        fullName: row.full_name,
        displayName: row.full_name || row.email.split('@')[0],
        avatarUrl: null as string | null,
        jobTitle: row.job_title,
        department: row.department,
        phone: row.phone,
        mobile: row.mobile,
        isActive: row.is_active,
        isSuspended: !row.is_active,
        isAdmin: row.is_admin,
        platforms: row.platforms
      }));

    } catch (error: any) {
      logger.error('Failed to get unified users', { organizationId, error: error.message });
      throw error;
    }
  }

  /**
   * Create a sync log entry
   */
  private async createSyncLog(organizationId: string, platform: string, syncType: string): Promise<string> {
    const result = await db.query(`
      INSERT INTO user_sync_logs (organization_id, platform, sync_type, status, started_at)
      VALUES ($1, $2, $3, 'started', NOW())
      RETURNING id
    `, [organizationId, platform, syncType]);

    return result.rows[0].id;
  }

  /**
   * Complete a sync log entry
   */
  private async completeSyncLog(logId: string, status: string, data: any) {
    await db.query(`
      UPDATE user_sync_logs SET
        status = $2,
        users_found = $3,
        users_created = $4,
        users_updated = $5,
        users_disabled = $6,
        error_message = $7,
        completed_at = NOW(),
        duration_ms = $8
      WHERE id = $1
    `, [
      logId,
      status,
      data.usersFound || 0,
      data.usersCreated || 0,
      data.usersUpdated || 0,
      data.usersDisabled || 0,
      data.error || null,
      data.duration || 0
    ]);
  }

  /**
   * Update user count in organization_modules
   */
  private async updateModuleUserCount(organizationId: string, platform: string) {
    const result = await db.query(`
      SELECT COUNT(DISTINCT id) as count
      FROM organization_users
      WHERE organization_id = $1 AND google_workspace_id IS NOT NULL AND is_active = true
    `, [organizationId]);

    const userCount = result.rows[0].count;

    await db.query(`
      UPDATE organization_modules
      SET user_count = $3, last_sync = NOW(), updated_at = NOW()
      WHERE organization_id = $1 AND module_name = $2
    `, [organizationId, platform, userCount]);

    logger.info('Updated module user count', { organizationId, platform, userCount });
  }
}

export const userSyncService = new UserSyncService();