import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { telemetryService } from './telemetry.service.js';

interface GoogleUser {
  id: string;
  primaryEmail: string;
  name: {
    givenName?: string;
    familyName?: string;
    fullName?: string;
  };
  isAdmin?: boolean;
  isDelegatedAdmin?: boolean;
  suspended?: boolean;
  orgUnitPath?: string;
  creationTime?: string;
  lastLoginTime?: string;
  thumbnailPhotoUrl?: string;
  customSchemas?: any;
  organizations?: Array<{
    title?: string;
    department?: string;
  }>;
  // 2FA fields
  isEnrolledIn2Sv?: boolean;
  isEnforcedIn2Sv?: boolean;
}

interface SyncResult {
  success: boolean;
  usersCreated: number;
  usersUpdated: number;
  usersRemoved: number;
  groupsCreated: number;
  groupsUpdated: number;
  orgUnitsCreated: number;
  totalUsers: number;
  totalGroups: number;
  error?: string;
  details?: any;
}

export class GoogleWorkspaceSyncService {
  /**
   * Perform full synchronization of Google Workspace data
   */
  async performFullSync(
    organizationId: string,
    domain: string,
    adminEmail: string,
    serviceAccount: any
  ): Promise<SyncResult> {
    const startTime = Date.now();
    logger.info('Starting Google Workspace sync', { organizationId, domain });

    try {
      // Create JWT client with domain-wide delegation
      const jwtClient = new JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
          'https://www.googleapis.com/auth/admin.directory.user',
          'https://www.googleapis.com/auth/admin.directory.group',
          'https://www.googleapis.com/auth/admin.directory.orgunit'
        ],
        subject: adminEmail
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

      // Start transaction
      await db.query('BEGIN');

      try {
        // Sync users
        const userResult = await this.syncUsers(admin, organizationId, domain);

        // Sync user statuses from gw_synced_users to organization_users
        await this.syncStatusesToOrganizationUsers(organizationId);

        // Sync groups
        const groupResult = await this.syncGroups(admin, organizationId, domain);

        // Sync organizational units
        const orgUnitResult = await this.syncOrgUnits(admin, organizationId, domain);

        // Commit transaction
        await db.query('COMMIT');

        const duration = Date.now() - startTime;
        logger.info('Google Workspace sync completed', {
          organizationId,
          domain,
          duration,
          usersCreated: userResult.created,
          usersUpdated: userResult.updated,
          groupsCreated: groupResult.created,
          groupsUpdated: groupResult.updated
        });

        // Track sync command for telemetry
        telemetryService.trackCommand('sync_google_workspace');

        return {
          success: true,
          usersCreated: userResult.created,
          usersUpdated: userResult.updated,
          usersRemoved: userResult.removed,
          groupsCreated: groupResult.created,
          groupsUpdated: groupResult.updated,
          orgUnitsCreated: orgUnitResult.created,
          totalUsers: userResult.total,
          totalGroups: groupResult.total,
          details: {
            syncDuration: duration,
            domain
          }
        };

      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

    } catch (error: any) {
      logger.error('Google Workspace sync failed', {
        organizationId,
        domain,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        usersCreated: 0,
        usersUpdated: 0,
        usersRemoved: 0,
        groupsCreated: 0,
        groupsUpdated: 0,
        orgUnitsCreated: 0,
        totalUsers: 0,
        totalGroups: 0,
        error: error.message || 'Sync failed'
      };
    }
  }

  /**
   * Sync users from Google Workspace
   */
  private async syncUsers(
    admin: any,
    organizationId: string,
    domain: string
  ): Promise<{ created: number; updated: number; removed: number; total: number }> {
    let created = 0;
    let updated = 0;
    let removed = 0;
    let total = 0;

    try {
      // Get existing synced users
      const existingUsersResult = await db.query(
        'SELECT google_id, email FROM gw_synced_users WHERE organization_id = $1',
        [organizationId]
      );

      const existingUsers = new Map(
        existingUsersResult.rows.map((row: any) => [row.google_id, row.email])
      );

      // Fetch all users from Google Workspace
      let pageToken: string | undefined;
      const processedIds = new Set<string>();

      do {
        const response = await admin.users.list({
          domain: domain,
          maxResults: 500,
          orderBy: 'email',
          pageToken: pageToken,
          projection: 'full'
        });

        const users = response.data.users || [];
        total += users.length;

        for (const user of users as GoogleUser[]) {
          processedIds.add(user.id);

          // Check if user exists
          if (existingUsers.has(user.id)) {
            // Update existing user
            await db.query(`
              UPDATE gw_synced_users SET
                email = $3,
                given_name = $4,
                family_name = $5,
                full_name = $6,
                is_admin = $7,
                is_suspended = $8,
                org_unit_path = $9,
                department = $10,
                job_title = $11,
                last_login_time = $12,
                creation_time = $13,
                raw_data = $14,
                is_enrolled_2sv = $15,
                is_enforced_2sv = $16,
                last_sync_at = NOW(),
                updated_at = NOW()
              WHERE organization_id = $1 AND google_id = $2
            `, [
              organizationId,
              user.id,
              user.primaryEmail.toLowerCase(),
              user.name?.givenName || null,
              user.name?.familyName || null,
              user.name?.fullName || null,
              user.isAdmin || false,
              user.suspended || false,
              user.orgUnitPath || null,
              user.organizations?.[0]?.department || null,
              user.organizations?.[0]?.title || null,
              user.lastLoginTime ? new Date(user.lastLoginTime) : null,
              user.creationTime ? new Date(user.creationTime) : null,
              JSON.stringify(user),
              user.isEnrolledIn2Sv || false,
              user.isEnforcedIn2Sv || false
            ]);
            updated++;
          } else {
            // Create new user
            await db.query(`
              INSERT INTO gw_synced_users (
                organization_id, google_id, email, given_name, family_name,
                full_name, is_admin, is_suspended, org_unit_path, department,
                job_title, last_login_time, creation_time, raw_data,
                is_enrolled_2sv, is_enforced_2sv,
                last_sync_at, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, NOW(), NOW(), NOW()
              )
            `, [
              organizationId,
              user.id,
              user.primaryEmail.toLowerCase(),
              user.name?.givenName || null,
              user.name?.familyName || null,
              user.name?.fullName || null,
              user.isAdmin || false,
              user.suspended || false,
              user.orgUnitPath || null,
              user.organizations?.[0]?.department || null,
              user.organizations?.[0]?.title || null,
              user.lastLoginTime ? new Date(user.lastLoginTime) : null,
              user.creationTime ? new Date(user.creationTime) : null,
              JSON.stringify(user),
              user.isEnrolledIn2Sv || false,
              user.isEnforcedIn2Sv || false
            ]);
            created++;
          }
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      // Remove users that no longer exist in Google Workspace
      for (const [googleId] of existingUsers) {
        if (!processedIds.has(googleId as string)) {
          await db.query(
            'DELETE FROM gw_synced_users WHERE organization_id = $1 AND google_id = $2',
            [organizationId, googleId]
          );
          removed++;
        }
      }

      logger.info('User sync completed', {
        organizationId,
        created,
        updated,
        removed,
        total
      });

      return { created, updated, removed, total };

    } catch (error: any) {
      logger.error('Failed to sync users', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Sync groups from Google Workspace
   */
  private async syncGroups(
    admin: any,
    organizationId: string,
    domain: string
  ): Promise<{ created: number; updated: number; total: number }> {
    let created = 0;
    let updated = 0;
    let total = 0;

    try {
      // Get existing groups
      const existingGroupsResult = await db.query(
        'SELECT google_id FROM gw_groups WHERE organization_id = $1',
        [organizationId]
      );

      const existingGroups = new Set(
        existingGroupsResult.rows.map((row: any) => row.google_id)
      );

      // Fetch all groups
      let pageToken: string | undefined;

      do {
        const response = await admin.groups.list({
          domain: domain,
          maxResults: 200,
          pageToken: pageToken
        });

        const groups = response.data.groups || [];
        total += groups.length;

        for (const group of groups) {
          // Get member count
          let memberCount = 0;
          try {
            const membersResponse = await admin.members.list({
              groupKey: group.id,
              maxResults: 1
            });
            // We just need to know if there are members, actual count would require pagination
            memberCount = membersResponse.data.members ? 1 : 0;
          } catch (err) {
            // Group might not have list members permission
            memberCount = 0;
          }

          if (existingGroups.has(group.id)) {
            // Update existing group
            await db.query(`
              UPDATE gw_groups SET
                email = $3,
                name = $4,
                description = $5,
                member_count = $6,
                raw_data = $7,
                last_sync_at = NOW(),
                updated_at = NOW()
              WHERE organization_id = $1 AND google_id = $2
            `, [
              organizationId,
              group.id,
              group.email.toLowerCase(),
              group.name || null,
              group.description || null,
              memberCount,
              JSON.stringify(group)
            ]);
            updated++;
          } else {
            // Create new group
            await db.query(`
              INSERT INTO gw_groups (
                organization_id, google_id, email, name, description,
                member_count, raw_data, last_sync_at, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW()
              )
            `, [
              organizationId,
              group.id,
              group.email.toLowerCase(),
              group.name || null,
              group.description || null,
              memberCount,
              JSON.stringify(group)
            ]);
            created++;
          }
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      logger.info('Group sync completed', {
        organizationId,
        created,
        updated,
        total
      });

      return { created, updated, total };

    } catch (error: any) {
      logger.error('Failed to sync groups', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Sync organizational units from Google Workspace
   */
  private async syncOrgUnits(
    admin: any,
    organizationId: string,
    domain: string
  ): Promise<{ created: number; updated: number; total: number }> {
    let created = 0;
    let updated = 0;
    let total = 0;

    try {
      // Get existing org units
      const existingOrgUnitsResult = await db.query(
        'SELECT google_id FROM gw_org_units WHERE organization_id = $1',
        [organizationId]
      );

      const existingOrgUnits = new Set(
        existingOrgUnitsResult.rows.map((row: any) => row.google_id)
      );

      // Fetch all organizational units
      const response = await admin.orgunits.list({
        customerId: 'my_customer',
        type: 'all'
      });

      const orgUnits = response.data.organizationUnits || [];
      total = orgUnits.length;

      for (const orgUnit of orgUnits) {
        if (existingOrgUnits.has(orgUnit.orgUnitId)) {
          // Update existing org unit
          await db.query(`
            UPDATE gw_org_units SET
              name = $3,
              path = $4,
              parent_id = $5,
              description = $6,
              raw_data = $7,
              last_sync_at = NOW(),
              updated_at = NOW()
            WHERE organization_id = $1 AND google_id = $2
          `, [
            organizationId,
            orgUnit.orgUnitId,
            orgUnit.name,
            orgUnit.orgUnitPath,
            orgUnit.parentOrgUnitId || null,
            orgUnit.description || null,
            JSON.stringify(orgUnit)
          ]);
          updated++;
        } else {
          // Create new org unit
          await db.query(`
            INSERT INTO gw_org_units (
              organization_id, google_id, name, path, parent_id,
              description, raw_data, last_sync_at, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW()
            )
          `, [
            organizationId,
            orgUnit.orgUnitId,
            orgUnit.name,
            orgUnit.orgUnitPath,
            orgUnit.parentOrgUnitId || null,
            orgUnit.description || null,
            JSON.stringify(orgUnit)
          ]);
          created++;
        }
      }

      logger.info('Organizational unit sync completed', {
        organizationId,
        created,
        updated,
        total
      });

      return { created, updated, total };

    } catch (error: any) {
      logger.error('Failed to sync organizational units', {
        organizationId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Sync user statuses from gw_synced_users to organization_users
   * This ensures that suspended/active status from Google is reflected in the main users table
   */
  private async syncStatusesToOrganizationUsers(organizationId: string): Promise<{ updated: number }> {
    let updated = 0;

    try {
      // Update organization_users where Google shows user as suspended
      const suspendResult = await db.query(`
        UPDATE organization_users ou
        SET
          status = 'suspended',
          updated_at = NOW()
        FROM gw_synced_users gw
        WHERE ou.google_workspace_id = gw.google_id
          AND ou.organization_id = $1
          AND gw.organization_id = $1
          AND gw.is_suspended = true
          AND ou.status != 'suspended'
      `, [organizationId]);

      updated += suspendResult.rowCount || 0;

      // Update organization_users where Google shows user as active (unsuspended)
      const activateResult = await db.query(`
        UPDATE organization_users ou
        SET
          status = 'active',
          updated_at = NOW()
        FROM gw_synced_users gw
        WHERE ou.google_workspace_id = gw.google_id
          AND ou.organization_id = $1
          AND gw.organization_id = $1
          AND gw.is_suspended = false
          AND ou.status = 'suspended'
      `, [organizationId]);

      updated += activateResult.rowCount || 0;

      if (updated > 0) {
        logger.info('Synced user statuses from Google Workspace to organization_users', {
          organizationId,
          updated
        });
      }

      return { updated };
    } catch (error: any) {
      logger.error('Failed to sync user statuses to organization_users', {
        organizationId,
        error: error.message
      });
      // Don't throw - this is a secondary sync step
      return { updated: 0 };
    }
  }
}

// Export singleton instance
export const googleWorkspaceSyncService = new GoogleWorkspaceSyncService();