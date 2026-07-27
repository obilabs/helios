import { logger } from '../utils/logger.js';
import { db } from '../database/connection.js';
import { googleWorkspaceService } from './google-workspace.service.js';
import { decodeServiceAccountKey } from './gw-credentials.js';
import { OAuthTokenSyncService } from './oauth-token-sync.service.js';

interface SyncConfig {
  minInterval: number; // Platform minimum in seconds
  defaultInterval: number; // Default for new organizations in seconds
  maxInterval: number; // Maximum allowed in seconds
  tokenSyncInterval: number; // OAuth token sync interval in seconds (less frequent)
}

export class SyncSchedulerService {
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private tokenSyncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastTokenSync: Map<string, Date> = new Map();
  private config: SyncConfig;
  private oauthTokenSyncService: OAuthTokenSyncService;

  constructor() {
    this.config = {
      minInterval: parseInt(process.env.MIN_SYNC_INTERVAL_SECONDS || '300'),  // 5 minutes
      defaultInterval: parseInt(process.env.DEFAULT_SYNC_INTERVAL_SECONDS || '900'),  // 15 minutes
      maxInterval: parseInt(process.env.MAX_SYNC_INTERVAL_SECONDS || '86400'),  // 24 hours
      tokenSyncInterval: parseInt(process.env.TOKEN_SYNC_INTERVAL_SECONDS || '21600')  // 6 hours default
    };

    this.oauthTokenSyncService = new OAuthTokenSyncService();
    logger.info('Sync scheduler initialized', this.config);
  }

  /**
   * Start sync for an organization with their configured interval
   */
  async startOrganizationSync(organizationId: string): Promise<void> {
    try {
      // Get organization sync interval from database (use default for now)
      const interval = this.config.defaultInterval;

      // Ensure interval respects platform limits
      const validInterval = Math.max(
        this.config.minInterval,
        Math.min(interval, this.config.maxInterval)
      );

      // Clear existing interval if any
      this.stopOrganizationSync(organizationId);

      // Set up new interval
      const intervalMs = validInterval * 1000;  // Convert seconds to milliseconds
      const timeout = setInterval(() => {
        this.syncOrganizationData(organizationId).catch(error => {
          logger.error('Sync failed for organization', { organizationId, error });
        });
      }, intervalMs);

      this.syncIntervals.set(organizationId, timeout);

      // Run initial sync
      await this.syncOrganizationData(organizationId);

      logger.info('Started sync for organization', { organizationId, intervalSeconds: validInterval });
    } catch (error) {
      logger.error('Failed to start organization sync', { organizationId, error });
    }
  }

  /**
   * Stop sync for an organization
   */
  stopOrganizationSync(organizationId: string): void {
    const interval = this.syncIntervals.get(organizationId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(organizationId);
      logger.info('Stopped sync for organization', { organizationId });
    }
  }

  /**
   * Stop all syncs (for graceful shutdown)
   */
  stopAll(): void {
    for (const [organizationId, interval] of this.syncIntervals) {
      clearInterval(interval);
      logger.info('Stopped sync for organization', { organizationId });
    }
    this.syncIntervals.clear();

    // Also stop token sync intervals
    for (const [organizationId, interval] of this.tokenSyncIntervals) {
      clearInterval(interval);
      logger.info('Stopped token sync for organization', { organizationId });
    }
    this.tokenSyncIntervals.clear();

    logger.info('All sync schedulers stopped');
  }

  /**
   * Start OAuth token sync for an organization
   */
  async startTokenSync(organizationId: string): Promise<void> {
    try {
      // Stop existing token sync if any
      this.stopTokenSync(organizationId);

      const intervalMs = this.config.tokenSyncInterval * 1000;

      // Set up new interval for token sync
      const timeout = setInterval(() => {
        this.syncOAuthTokens(organizationId).catch(error => {
          logger.error('OAuth token sync failed for organization', { organizationId, error });
        });
      }, intervalMs);

      this.tokenSyncIntervals.set(organizationId, timeout);

      // Run initial token sync
      await this.syncOAuthTokens(organizationId);

      logger.info('Started OAuth token sync for organization', {
        organizationId,
        intervalSeconds: this.config.tokenSyncInterval
      });
    } catch (error) {
      logger.error('Failed to start token sync', { organizationId, error });
    }
  }

  /**
   * Stop OAuth token sync for an organization
   */
  stopTokenSync(organizationId: string): void {
    const interval = this.tokenSyncIntervals.get(organizationId);
    if (interval) {
      clearInterval(interval);
      this.tokenSyncIntervals.delete(organizationId);
      logger.info('Stopped token sync for organization', { organizationId });
    }
  }

  /**
   * Sync OAuth tokens for an organization
   */
  async syncOAuthTokens(organizationId: string): Promise<{ success: boolean; message: string; stats?: any }> {
    try {
      logger.info('Starting OAuth token sync for organization', { organizationId });

      const result = await this.oauthTokenSyncService.syncAllTokens(organizationId);

      this.lastTokenSync.set(organizationId, new Date());

      logger.info('OAuth token sync completed', {
        organizationId,
        usersProcessed: result.usersProcessed,
        tokensProcessed: result.tokensProcessed,
        appsFound: result.appsFound
      });

      return {
        success: true,
        message: 'OAuth token sync completed successfully',
        stats: result
      };
    } catch (error: any) {
      logger.error('OAuth token sync failed', { organizationId, error: error.message });
      return {
        success: false,
        message: error.message || 'OAuth token sync failed'
      };
    }
  }

  /**
   * Get last token sync time for an organization
   */
  getLastTokenSyncTime(organizationId: string): Date | null {
    return this.lastTokenSync.get(organizationId) || null;
  }

  /**
   * Sync data for a specific organization
   */
  async syncOrganizationData(organizationId: string): Promise<void> {
    try {
      // Get organization info and admin email from credentials
      const orgResult = await db.query(`
        SELECT o.domain, o.name, gc.admin_email
        FROM organizations o
        LEFT JOIN gw_credentials gc ON o.id = gc.organization_id
        WHERE o.id = $1
      `, [organizationId]);

      if (orgResult.rows.length === 0) {
        throw new Error('Organization not found');
      }

      const org = orgResult.rows[0];

      if (!org.admin_email) {
        throw new Error('Admin email not configured for organization');
      }

      logger.info('Starting sync for organization', { organizationId, domain: org.domain });

      // Get users from Google Workspace
      const usersResult = await googleWorkspaceService.getUsers(
        organizationId,
        org.domain,
        org.admin_email,
        500
      );

      if (!usersResult.success || !usersResult.users) {
        throw new Error(usersResult.error || 'Failed to fetch users from Google Workspace');
      }

      const users = usersResult.users;

      // Clear existing synced users for this organization
      await db.query('DELETE FROM gw_synced_users WHERE organization_id = $1', [organizationId]);

      // Insert all users into gw_synced_users table AND create/update organization_users
      for (const user of users) {
        // Insert into gw_synced_users (cache table)
        await db.query(`
          INSERT INTO gw_synced_users (
            organization_id, google_id, email,
            given_name, family_name, full_name,
            is_admin, is_suspended, org_unit_path,
            creation_time, last_login_time, raw_data,
            last_sync_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        `, [
          organizationId,
          user.id,
          user.primaryEmail,
          user.name?.givenName || '',
          user.name?.familyName || '',
          user.name?.fullName || '',
          user.isAdmin || user.isDelegatedAdmin || false,
          user.suspended || false,
          user.orgUnitPath || '/',
          user.creationTime || null,
          user.lastLoginTime || null,
          JSON.stringify(user)
        ]);

        // Create or update user in organization_users table
        // Check if user already exists by email
        const existingUser = await db.query(
          'SELECT id, google_workspace_id FROM organization_users WHERE organization_id = $1 AND email = $2',
          [organizationId, user.primaryEmail]
        );

        if (existingUser.rows.length > 0) {
          // Update existing user with Google Workspace ID
          await db.query(`
            UPDATE organization_users
            SET google_workspace_id = $1,
                first_name = $2,
                last_name = $3,
                is_active = $4,
                updated_at = NOW()
            WHERE id = $5
          `, [
            user.id,
            user.name?.givenName || '',
            user.name?.familyName || '',
            !user.suspended,
            existingUser.rows[0].id
          ]);
          logger.info('Updated existing user with Google Workspace ID', {
            email: user.primaryEmail,
            googleId: user.id
          });
        } else {
          // Create new user from Google Workspace
          // Google Workspace users authenticate via Google, so they don't need a password
          // We set a placeholder hash that cannot be used for login
          const placeholderHash = 'GOOGLE_WORKSPACE_AUTH';

          await db.query(`
            INSERT INTO organization_users (
              organization_id, email, first_name, last_name,
              google_workspace_id, is_active, role, password_hash, user_type, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'staff', NOW(), NOW())
          `, [
            organizationId,
            user.primaryEmail,
            user.name?.givenName || '',
            user.name?.familyName || '',
            user.id,
            !user.suspended,
            'user', // Default role for synced users
            placeholderHash
          ]);
          logger.info('Created new user from Google Workspace', {
            email: user.primaryEmail,
            googleId: user.id
          });
        }
      }

      // Update organization_modules table with last sync
      const moduleResult = await db.query(
        `SELECT id FROM modules WHERE slug = 'google_workspace' LIMIT 1`
      );

      if (moduleResult.rows.length > 0) {
        const moduleId = moduleResult.rows[0].id;
        await db.query(`
          UPDATE organization_modules
          SET last_sync_at = NOW(),
              config = config || $3::jsonb,
              updated_at = NOW()
          WHERE organization_id = $1 AND module_id = $2
        `, [organizationId, moduleId, JSON.stringify({ user_count: users.length })]);
      }

      logger.info('Sync completed successfully', {
        organizationId,
        domain: org.domain,
        userCount: users.length
      });

    } catch (error: any) {
      logger.error('Sync failed for organization', { organizationId, error: error.message });
      throw error;
    }
  }

  /**
   * Manual sync trigger for immediate sync
   */
  async manualSync(organizationId: string): Promise<{ success: boolean; message: string; stats?: any }> {
    try {
      await this.syncOrganizationData(organizationId);

      // Get updated stats from gw_synced_users
      const statsResult = await db.query(
        `SELECT COUNT(*) as total_users,
                COUNT(CASE WHEN is_suspended = false THEN 1 END) as active_users,
                COUNT(CASE WHEN is_suspended = true THEN 1 END) as suspended_users,
                COUNT(CASE WHEN is_admin = true THEN 1 END) as admin_users,
                MAX(last_sync_at) as last_sync
         FROM gw_synced_users WHERE organization_id = $1`,
        [organizationId]
      );

      return {
        success: true,
        message: 'Sync completed successfully',
        stats: statsResult.rows[0] || null
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Sync failed'
      };
    }
  }

  /**
   * Get organization dashboard stats
   */
  /**
   * Get license data from Google Workspace Reports API
   * Note: This data is 2+ days behind due to Google's reporting delay
   */
  private async getLicenseData(organizationId: string): Promise<any> {
    try {
      const { JWT } = await import('google-auth-library');
      const { google } = await import('googleapis');

      // Get organization credentials
      const credsResult = await db.query(
        `SELECT gc.service_account_key, gc.admin_email
         FROM gw_credentials gc
         WHERE gc.organization_id = $1`,
        [organizationId]
      );

      if (credsResult.rows.length === 0) {
        return null; // No Google Workspace configured
      }

      const { service_account_key, admin_email } = credsResult.rows[0];
      const serviceAccount = decodeServiceAccountKey(service_account_key);

      // Create JWT client with Reports API scope
      const jwtClient = new JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/admin.reports.usage.readonly'],
        subject: admin_email
      });

      const reports = google.admin({ version: 'reports_v1', auth: jwtClient });

      // Get date from 2 days ago (Reports API requirement)
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const dateStr = twoDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD

      // Fetch license usage data
      const response = await reports.customerUsageReports.get({
        date: dateStr,
        parameters: 'accounts:gsuite_unlimited_total_licenses,accounts:gsuite_unlimited_used_licenses,accounts:gsuite_basic_total_licenses,accounts:gsuite_basic_used_licenses,accounts:gsuite_enterprise_total_licenses,accounts:gsuite_enterprise_used_licenses'
      });

      // Parse the response to extract license data
      const usageReports = response.data.usageReports || [];
      if (usageReports.length === 0) {
        return null;
      }

      const parameters = usageReports[0].parameters || [];
      const licenseData: any = {
        reportDate: dateStr,
        total: 0,
        used: 0,
        byEdition: {}
      };

      // Extract license counts
      parameters.forEach((param: any) => {
        const name = param.name;
        const value = parseInt(param.intValue || '0');

        if (name.includes('_total_licenses')) {
          licenseData.total += value;
          const edition = name.replace('accounts:gsuite_', '').replace('_total_licenses', '');
          if (!licenseData.byEdition[edition]) {
            licenseData.byEdition[edition] = { total: 0, used: 0 };
          }
          licenseData.byEdition[edition].total = value;
        } else if (name.includes('_used_licenses')) {
          licenseData.used += value;
          const edition = name.replace('accounts:gsuite_', '').replace('_used_licenses', '');
          if (!licenseData.byEdition[edition]) {
            licenseData.byEdition[edition] = { total: 0, used: 0 };
          }
          licenseData.byEdition[edition].used = value;
        }
      });

      return licenseData;
    } catch (error: any) {
      logger.error('Failed to fetch license data from Reports API', { organizationId, error: error.message });
      return null;
    }
  }

  async getOrganizationStats(organizationId: string): Promise<any> {
    // Get platform-specific stats instead of merged stats
    const [googleStats, microsoftStats, heliosStats] = await Promise.all([
      this.getGoogleWorkspaceStats(organizationId),
      this.getMicrosoft365Stats(organizationId),
      this.getHeliosStats(organizationId)
    ]);

    return {
      google: googleStats,
      microsoft: microsoftStats,
      helios: heliosStats
    };
  }

  /**
   * Get Google Workspace specific stats
   */
  async getGoogleWorkspaceStats(organizationId: string): Promise<any> {
    // Check if Google Workspace is connected
    const gwCredsResult = await db.query(
      `SELECT id FROM gw_credentials WHERE organization_id = $1`,
      [organizationId]
    );

    if (gwCredsResult.rows.length === 0) {
      return {
        connected: false,
        totalUsers: 0,
        suspendedUsers: 0,
        adminUsers: 0,
        lastSync: null,
        licenses: null
      };
    }

    // Get stats from organization_users for Google Workspace users
    const result = await db.query(
      `SELECT COUNT(*) as total_users,
              COUNT(CASE WHEN user_status = 'suspended' AND deleted_at IS NULL THEN 1 END) as suspended_users
       FROM organization_users
       WHERE organization_id = $1
         AND google_workspace_id IS NOT NULL
         AND deleted_at IS NULL`,
      [organizationId]
    );

    // Get admin count from organization_users for Google Workspace users
    const adminResult = await db.query(
      `SELECT COUNT(*) as admin_count
       FROM organization_users
       WHERE organization_id = $1
         AND google_workspace_id IS NOT NULL
         AND role = 'admin'
         AND deleted_at IS NULL`,
      [organizationId]
    );

    // Get last sync time
    const syncResult = await db.query(
      `SELECT MAX(last_sync_at) as last_sync
       FROM gw_synced_users
       WHERE organization_id = $1`,
      [organizationId]
    );

    // Get license data from Reports API
    const licenseData = await this.getLicenseData(organizationId);

    const row = result.rows[0];
    const adminRow = adminResult.rows[0];

    return {
      connected: true,
      totalUsers: parseInt(row.total_users) || 0,
      suspendedUsers: parseInt(row.suspended_users) || 0,
      adminUsers: parseInt(adminRow.admin_count) || 0,
      lastSync: syncResult.rows.length > 0 ? syncResult.rows[0].last_sync : null,
      licenses: licenseData
    };
  }

  /**
   * Get Microsoft 365 specific stats
   */
  async getMicrosoft365Stats(organizationId: string): Promise<any> {
    try {
      // Check if Microsoft 365 is connected
      const m365CredsResult = await db.query(
        `SELECT id FROM microsoft365_credentials WHERE organization_id = $1`,
        [organizationId]
      );

      if (m365CredsResult.rows.length === 0) {
        return {
          connected: false,
          totalUsers: 0,
          disabledUsers: 0,
          adminUsers: 0,
          lastSync: null,
          licenses: null
        };
      }
    } catch (error: any) {
      // Table doesn't exist yet or other DB error - Microsoft 365 not set up
      logger.debug('Microsoft 365 credentials table not found or error querying', { error: error.message });
      return {
        connected: false,
        totalUsers: 0,
        disabledUsers: 0,
        adminUsers: 0,
        lastSync: null,
        licenses: null
      };
    }

    // Get stats from organization_users for Microsoft 365 users
    const result = await db.query(
      `SELECT COUNT(*) as total_users,
              COUNT(CASE WHEN is_active = false AND deleted_at IS NULL THEN 1 END) as disabled_users,
              COUNT(CASE WHEN role = 'admin' AND deleted_at IS NULL THEN 1 END) as admin_users
       FROM organization_users
       WHERE organization_id = $1
         AND microsoft_365_id IS NOT NULL
         AND deleted_at IS NULL`,
      [organizationId]
    );

    // Get last sync time
    const syncResult = await db.query(
      `SELECT MAX(microsoft_365_last_sync) as last_sync
       FROM organization_users
       WHERE organization_id = $1 AND microsoft_365_id IS NOT NULL`,
      [organizationId]
    );

    const row = result.rows[0];

    return {
      connected: true,
      totalUsers: parseInt(row.total_users) || 0,
      disabledUsers: parseInt(row.disabled_users) || 0,
      adminUsers: parseInt(row.admin_users) || 0,
      lastSync: syncResult.rows.length > 0 ? syncResult.rows[0].last_sync : null,
      licenses: null // TODO: Get from Microsoft Graph subscribedSkus API
    };
  }

  /**
   * Get Helios-only stats (users not in external platforms)
   */
  async getHeliosStats(organizationId: string): Promise<any> {
    const result = await db.query(
      `SELECT COUNT(*) as total_users,
              COUNT(CASE WHEN is_guest = true THEN 1 END) as guest_users,
              COUNT(CASE WHEN is_active = true THEN 1 END) as active_users
       FROM organization_users
       WHERE organization_id = $1
         AND google_workspace_id IS NULL
         AND microsoft_365_id IS NULL
         AND deleted_at IS NULL`,
      [organizationId]
    );

    const row = result.rows[0];

    return {
      totalUsers: parseInt(row.total_users) || 0,
      guestUsers: parseInt(row.guest_users) || 0,
      activeUsers: parseInt(row.active_users) || 0
    };
  }

  /**
   * Get cached users for an organization
   */
  async getCachedUsers(organizationId: string): Promise<any[]> {
    const result = await db.query(
      `SELECT
        id,
        google_id,
        email,
        full_name,
        given_name,
        family_name,
        org_unit_path,
        department,
        job_title,
        is_admin,
        is_suspended,
        last_login_time,
        creation_time,
        last_sync_at
       FROM gw_synced_users
       WHERE organization_id = $1
       ORDER BY full_name`,
      [organizationId]
    );

    return result.rows;
  }
}

export const syncScheduler = new SyncSchedulerService();