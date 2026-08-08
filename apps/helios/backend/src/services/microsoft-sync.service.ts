import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { microsoftGraphService, MicrosoftUser, MicrosoftGroup, MicrosoftLicense } from './microsoft-graph.service.js';
import crypto from 'crypto';

/**
 * Microsoft 365 Sync Service
 * Handles synchronization of users, groups, and licenses from Microsoft Entra ID
 */
class MicrosoftSyncService {
  /**
   * Sync all data from Microsoft 365
   */
  async syncAll(organizationId: string): Promise<{
    success: boolean;
    message: string;
    stats?: {
      users: { synced: number; created: number; updated: number };
      groups: { synced: number; created: number; updated: number };
      licenses: { synced: number };
    };
  }> {
    try {
      // Initialize the Graph service
      const initialized = await microsoftGraphService.initialize(organizationId);
      if (!initialized) {
        return {
          success: false,
          message: 'Microsoft 365 not configured for this organization',
        };
      }

      // Update sync status to syncing
      await db.query(
        `UPDATE ms_credentials SET sync_status = 'syncing', updated_at = NOW() WHERE organization_id = $1`,
        [organizationId]
      );

      // Sync in parallel where possible
      const [usersResult, groupsResult, licensesResult] = await Promise.all([
        this.syncUsers(organizationId),
        this.syncGroups(organizationId),
        this.syncLicenses(organizationId),
      ]);

      // Update sync status to completed
      await db.query(
        `UPDATE ms_credentials
         SET sync_status = 'completed',
             last_sync_at = NOW(),
             sync_error = NULL,
             updated_at = NOW()
         WHERE organization_id = $1`,
        [organizationId]
      );

      return {
        success: true,
        message: 'Microsoft 365 sync completed successfully',
        stats: {
          users: usersResult,
          groups: groupsResult,
          licenses: licensesResult,
        },
      };
    } catch (error: any) {
      logger.error('Microsoft sync failed', { organizationId, error: error.message });

      // Update sync status to failed
      await db.query(
        `UPDATE ms_credentials
         SET sync_status = 'failed',
             sync_error = $2,
             updated_at = NOW()
         WHERE organization_id = $1`,
        [organizationId, error.message]
      );

      return {
        success: false,
        message: 'Sync failed: ' + error.message,
      };
    }
  }

  /**
   * Sync users from Microsoft Entra ID
   */
  async syncUsers(organizationId: string): Promise<{ synced: number; created: number; updated: number }> {
    const stats = { synced: 0, created: 0, updated: 0 };

    try {
      const users = await microsoftGraphService.listUsers();
      logger.info(`Syncing ${users.length} users from Microsoft 365`, { organizationId });

      for (const user of users) {
        const result = await this.upsertUser(organizationId, user);
        stats.synced++;
        if (result === 'created') stats.created++;
        if (result === 'updated') stats.updated++;
      }

      // Clean up users that no longer exist in Microsoft
      await this.cleanupDeletedUsers(organizationId, users.map((u) => u.id));

      logger.info('Microsoft users sync completed', { organizationId, stats });
    } catch (error: any) {
      logger.error('Failed to sync Microsoft users', { organizationId, error: error.message });
      throw error;
    }

    return stats;
  }

  /**
   * Upsert a single user
   */
  private async upsertUser(
    organizationId: string,
    user: MicrosoftUser
  ): Promise<'created' | 'updated' | 'unchanged'> {
    // Create hash of user data to detect changes
    const dataHash = crypto
      .createHash('md5')
      .update(JSON.stringify(user))
      .digest('hex');

    // Check if user exists and if data has changed
    const existing = await db.query(
      `SELECT id, sync_hash FROM ms_synced_users WHERE organization_id = $1 AND ms_id = $2`,
      [organizationId, user.id]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].sync_hash === dataHash) {
        return 'unchanged';
      }

      // Update existing user
      await db.query(
        `UPDATE ms_synced_users SET
           upn = $3,
           display_name = $4,
           given_name = $5,
           surname = $6,
           email = $7,
           job_title = $8,
           department = $9,
           office_location = $10,
           company_name = $11,
           mobile_phone = $12,
           business_phones = $13,
           is_account_enabled = $14,
           assigned_licenses = $15,
           raw_data = $16,
           sync_hash = $17,
           last_sync_at = NOW(),
           updated_at = NOW()
         WHERE organization_id = $1 AND ms_id = $2`,
        [
          organizationId,
          user.id,
          user.userPrincipalName,
          user.displayName,
          user.givenName,
          user.surname,
          user.mail,
          user.jobTitle,
          user.department,
          user.officeLocation,
          user.companyName,
          user.mobilePhone,
          JSON.stringify(user.businessPhones || []),
          user.accountEnabled,
          JSON.stringify(user.assignedLicenses || []),
          JSON.stringify(user),
          dataHash,
        ]
      );
      return 'updated';
    }

    // Create new user
    await db.query(
      `INSERT INTO ms_synced_users (
         organization_id, ms_id, upn, display_name, given_name, surname,
         email, job_title, department, office_location, company_name,
         mobile_phone, business_phones, is_account_enabled, assigned_licenses,
         raw_data, sync_hash, last_sync_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())`,
      [
        organizationId,
        user.id,
        user.userPrincipalName,
        user.displayName,
        user.givenName,
        user.surname,
        user.mail,
        user.jobTitle,
        user.department,
        user.officeLocation,
        user.companyName,
        user.mobilePhone,
        JSON.stringify(user.businessPhones || []),
        user.accountEnabled,
        JSON.stringify(user.assignedLicenses || []),
        JSON.stringify(user),
        dataHash,
      ]
    );
    return 'created';
  }

  /**
   * Remove users that no longer exist in Microsoft
   */
  private async cleanupDeletedUsers(organizationId: string, currentMsIds: string[]): Promise<number> {
    if (currentMsIds.length === 0) {
      return 0;
    }

    const result = await db.query(
      `DELETE FROM ms_synced_users
       WHERE organization_id = $1 AND ms_id != ALL($2::varchar[])
       RETURNING id`,
      [organizationId, currentMsIds]
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info(`Removed ${result.rowCount} deleted Microsoft users`, { organizationId });
    }

    return result.rowCount || 0;
  }

  /**
   * Sync groups from Microsoft Entra ID
   */
  async syncGroups(organizationId: string): Promise<{ synced: number; created: number; updated: number }> {
    const stats = { synced: 0, created: 0, updated: 0 };

    try {
      const groups = await microsoftGraphService.listGroups();
      logger.info(`Syncing ${groups.length} groups from Microsoft 365`, { organizationId });

      for (const group of groups) {
        const result = await this.upsertGroup(organizationId, group);
        stats.synced++;
        if (result === 'created') stats.created++;
        if (result === 'updated') stats.updated++;

        // Sync group memberships
        await this.syncGroupMembers(organizationId, group.id);
      }

      // Clean up groups that no longer exist
      await this.cleanupDeletedGroups(organizationId, groups.map((g) => g.id));

      logger.info('Microsoft groups sync completed', { organizationId, stats });
    } catch (error: any) {
      logger.error('Failed to sync Microsoft groups', { organizationId, error: error.message });
      throw error;
    }

    return stats;
  }

  /**
   * Upsert a single group
   */
  private async upsertGroup(
    organizationId: string,
    group: MicrosoftGroup
  ): Promise<'created' | 'updated' | 'unchanged'> {
    const dataHash = crypto
      .createHash('md5')
      .update(JSON.stringify(group))
      .digest('hex');

    const existing = await db.query(
      `SELECT id, sync_hash FROM ms_synced_groups WHERE organization_id = $1 AND ms_id = $2`,
      [organizationId, group.id]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].sync_hash === dataHash) {
        return 'unchanged';
      }

      await db.query(
        `UPDATE ms_synced_groups SET
           display_name = $3,
           description = $4,
           mail = $5,
           mail_enabled = $6,
           security_enabled = $7,
           group_types = $8,
           raw_data = $9,
           sync_hash = $10,
           last_sync_at = NOW(),
           updated_at = NOW()
         WHERE organization_id = $1 AND ms_id = $2`,
        [
          organizationId,
          group.id,
          group.displayName,
          group.description,
          group.mail,
          group.mailEnabled,
          group.securityEnabled,
          JSON.stringify(group.groupTypes || []),
          JSON.stringify(group),
          dataHash,
        ]
      );
      return 'updated';
    }

    await db.query(
      `INSERT INTO ms_synced_groups (
         organization_id, ms_id, display_name, description, mail,
         mail_enabled, security_enabled, group_types, raw_data, sync_hash, last_sync_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        organizationId,
        group.id,
        group.displayName,
        group.description,
        group.mail,
        group.mailEnabled,
        group.securityEnabled,
        JSON.stringify(group.groupTypes || []),
        JSON.stringify(group),
        dataHash,
      ]
    );
    return 'created';
  }

  /**
   * Sync group memberships
   */
  private async syncGroupMembers(organizationId: string, msGroupId: string): Promise<void> {
    try {
      // Get the internal group ID
      const groupResult = await db.query(
        `SELECT id FROM ms_synced_groups WHERE organization_id = $1 AND ms_id = $2`,
        [organizationId, msGroupId]
      );

      if (groupResult.rows.length === 0) {
        return;
      }

      const internalGroupId = groupResult.rows[0].id;

      // Get current members from Microsoft
      const members = await microsoftGraphService.getGroupMembers(msGroupId);

      // Clear existing memberships
      await db.query(
        `DELETE FROM ms_group_memberships WHERE group_id = $1`,
        [internalGroupId]
      );

      // Insert new memberships
      for (const member of members) {
        // Get the internal user ID
        const userResult = await db.query(
          `SELECT id FROM ms_synced_users WHERE organization_id = $1 AND ms_id = $2`,
          [organizationId, member.id]
        );

        if (userResult.rows.length > 0) {
          await db.query(
            `INSERT INTO ms_group_memberships (organization_id, group_id, user_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (group_id, user_id) DO NOTHING`,
            [organizationId, internalGroupId, userResult.rows[0].id]
          );
        }
      }

      // Update member count
      await db.query(
        `UPDATE ms_synced_groups SET member_count = $2 WHERE id = $1`,
        [internalGroupId, members.length]
      );
    } catch (error: any) {
      logger.warn('Failed to sync group members', { msGroupId, error: error.message });
    }
  }

  /**
   * Remove groups that no longer exist in Microsoft
   */
  private async cleanupDeletedGroups(organizationId: string, currentMsIds: string[]): Promise<number> {
    if (currentMsIds.length === 0) {
      return 0;
    }

    const result = await db.query(
      `DELETE FROM ms_synced_groups
       WHERE organization_id = $1 AND ms_id != ALL($2::varchar[])
       RETURNING id`,
      [organizationId, currentMsIds]
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info(`Removed ${result.rowCount} deleted Microsoft groups`, { organizationId });
    }

    return result.rowCount || 0;
  }

  /**
   * Sync licenses from Microsoft
   */
  async syncLicenses(organizationId: string): Promise<{ synced: number }> {
    try {
      const skus = await microsoftGraphService.getSubscribedSkus();
      logger.info(`Syncing ${skus.length} licenses from Microsoft 365`, { organizationId });

      for (const sku of skus) {
        const friendlyName = microsoftGraphService.getSkuFriendlyName(sku.skuPartNumber);
        const availableUnits = sku.prepaidUnits.enabled - sku.consumedUnits;

        await db.query(
          `INSERT INTO ms_licenses (
             organization_id, sku_id, sku_part_number, display_name,
             total_units, consumed_units, available_units,
             service_plans, raw_data, last_sync_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (organization_id, sku_id)
           DO UPDATE SET
             sku_part_number = $3,
             display_name = $4,
             total_units = $5,
             consumed_units = $6,
             available_units = $7,
             service_plans = $8,
             raw_data = $9,
             last_sync_at = NOW(),
             updated_at = NOW()`,
          [
            organizationId,
            sku.skuId,
            sku.skuPartNumber,
            friendlyName,
            sku.prepaidUnits.enabled,
            sku.consumedUnits,
            availableUnits,
            JSON.stringify(sku.servicePlans || []),
            JSON.stringify(sku),
          ]
        );
      }

      logger.info('Microsoft licenses sync completed', { organizationId, count: skus.length });
      return { synced: skus.length };
    } catch (error: any) {
      logger.error('Failed to sync Microsoft licenses', { organizationId, error: error.message });
      throw error;
    }
  }

  /**
   * Get sync status for an organization
   */
  async getSyncStatus(organizationId: string): Promise<{
    isConfigured: boolean;
    isActive: boolean;
    syncStatus: string;
    lastSyncAt: string | null;
    syncError: string | null;
    stats: {
      users: number;
      groups: number;
      licenses: number;
    };
  }> {
    const credResult = await db.query(
      `SELECT is_active, sync_status, last_sync_at, sync_error
       FROM ms_credentials
       WHERE organization_id = $1`,
      [organizationId]
    );

    if (credResult.rows.length === 0) {
      return {
        isConfigured: false,
        isActive: false,
        syncStatus: 'not_configured',
        lastSyncAt: null,
        syncError: null,
        stats: { users: 0, groups: 0, licenses: 0 },
      };
    }

    const cred = credResult.rows[0];

    // Get counts
    const [usersResult, groupsResult, licensesResult] = await Promise.all([
      db.query(
        `SELECT COUNT(*) as count FROM ms_synced_users WHERE organization_id = $1`,
        [organizationId]
      ),
      db.query(
        `SELECT COUNT(*) as count FROM ms_synced_groups WHERE organization_id = $1`,
        [organizationId]
      ),
      db.query(
        `SELECT COUNT(*) as count FROM ms_licenses WHERE organization_id = $1`,
        [organizationId]
      ),
    ]);

    return {
      isConfigured: true,
      isActive: cred.is_active,
      syncStatus: cred.sync_status,
      lastSyncAt: cred.last_sync_at,
      syncError: cred.sync_error,
      stats: {
        users: parseInt(usersResult.rows[0].count),
        groups: parseInt(groupsResult.rows[0].count),
        licenses: parseInt(licensesResult.rows[0].count),
      },
    };
  }
}

// Export singleton instance
export const microsoftSyncService = new MicrosoftSyncService();
