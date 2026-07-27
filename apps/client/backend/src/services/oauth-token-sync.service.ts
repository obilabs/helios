import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { db } from '../database/connection.js';
import { decodeServiceAccountKey } from './gw-credentials.js';
import { logger } from '../utils/logger.js';

interface OAuthToken {
  clientId: string;
  displayText: string;
  scopes: string[];
  nativeApp: boolean;
  userKey: string;
}

interface OAuthApp {
  id: string;
  clientId: string;
  displayName: string | null;
  scopes: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'unknown';
  userCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface UserToken {
  id: string;
  clientId: string;
  displayName: string | null;
  scopes: string[];
  nativeApp: boolean;
  lastTimeUsed: Date | null;
  syncedAt: Date;
}

interface SyncResult {
  success: boolean;
  appsFound: number;
  tokensProcessed: number;
  usersProcessed: number;
  errors: number;
  error?: string;
}

interface BulkRevokeResult {
  success: boolean;
  revokedCount: number;
  failedCount: number;
  errors: string[];
}

// Known safe apps for risk classification
const KNOWN_SAFE_APPS = [
  'slack', 'zoom', 'microsoft', 'dropbox', 'asana',
  'trello', 'notion', 'calendly', 'hubspot', 'salesforce',
  'google', 'atlassian', 'jira', 'confluence', 'github',
  'gitlab', 'figma', 'canva', 'adobe', 'docusign',
  'zapier', 'monday', 'clickup', 'linear', 'intercom'
];

// Sensitive scopes that indicate higher risk
const SENSITIVE_SCOPES = [
  'gmail', 'mail', 'drive', 'admin', 'calendar.events',
  'contacts', 'spreadsheets', 'docs', 'presentations'
];

export class OAuthTokenSyncService {
  /**
   * Classify risk level based on app name and scopes
   */
  private classifyRiskLevel(displayName: string | null, scopes: string[]): 'low' | 'medium' | 'high' | 'unknown' {
    const appName = displayName?.toLowerCase() || '';
    const isKnownApp = KNOWN_SAFE_APPS.some(safe => appName.includes(safe));

    const hasSensitiveScope = scopes.some(scope =>
      SENSITIVE_SCOPES.some(sensitive => scope.toLowerCase().includes(sensitive))
    );

    // High risk: Unknown app with sensitive scopes
    if (!isKnownApp && hasSensitiveScope) {
      return 'high';
    }

    // Medium risk: Broad scopes but known app
    if (hasSensitiveScope) {
      return 'medium';
    }

    // Low risk: Known app or minimal scopes
    if (isKnownApp || scopes.length <= 2) {
      return 'low';
    }

    return 'unknown';
  }

  /**
   * Get Google Admin SDK client for tokens operations
   */
  private async getAdminClient(organizationId: string): Promise<{ admin: any; domain: string } | null> {
    try {
      const credResult = await db.query(`
        SELECT service_account_key, admin_email, domain
        FROM gw_credentials
        WHERE organization_id = $1 AND is_active = true
        LIMIT 1
      `, [organizationId]);

      if (credResult.rows.length === 0) {
        logger.warn('No active Google Workspace credentials found', { organizationId });
        return null;
      }

      const { service_account_key, admin_email, domain } = credResult.rows[0];
      const serviceAccount = decodeServiceAccountKey(service_account_key);

      const jwtClient = new JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
          'https://www.googleapis.com/auth/admin.directory.user.security'
        ],
        subject: admin_email
      });

      const admin = google.admin({ version: 'directory_v1', auth: jwtClient });
      return { admin, domain };
    } catch (error: any) {
      logger.error('Failed to create admin client for tokens', {
        organizationId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Sync OAuth tokens for a single user
   */
  async syncUserTokens(organizationId: string, userEmail: string): Promise<{ tokensFound: number; error?: string }> {
    try {
      const clientInfo = await this.getAdminClient(organizationId);
      if (!clientInfo) {
        return { tokensFound: 0, error: 'No Google Workspace credentials configured' };
      }

      const { admin } = clientInfo;
      let tokensFound = 0;

      try {
        const response = await admin.tokens.list({
          userKey: userEmail
        });

        const tokens = response.data.items || [];
        tokensFound = tokens.length;

        for (const token of tokens) {
          const scopes = token.scopes || [];
          const riskLevel = this.classifyRiskLevel(token.displayText, scopes);

          // Upsert into oauth_apps (aggregate table)
          await db.query(`
            INSERT INTO oauth_apps (
              organization_id, client_id, display_name, scopes, risk_level,
              user_count, first_seen_at, last_seen_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW(), NOW(), NOW())
            ON CONFLICT (organization_id, client_id) DO UPDATE SET
              display_name = COALESCE(EXCLUDED.display_name, oauth_apps.display_name),
              scopes = CASE
                WHEN array_length(EXCLUDED.scopes, 1) > array_length(oauth_apps.scopes, 1)
                THEN EXCLUDED.scopes
                ELSE oauth_apps.scopes
              END,
              risk_level = EXCLUDED.risk_level,
              last_seen_at = NOW(),
              updated_at = NOW()
          `, [
            organizationId,
            token.clientId,
            token.displayText || null,
            scopes,
            riskLevel
          ]);

          // Upsert into user_oauth_tokens (per-user association)
          await db.query(`
            INSERT INTO user_oauth_tokens (
              organization_id, user_email, client_id, display_name, scopes,
              native_app, user_key, synced_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            ON CONFLICT (organization_id, user_email, client_id) DO UPDATE SET
              display_name = COALESCE(EXCLUDED.display_name, user_oauth_tokens.display_name),
              scopes = EXCLUDED.scopes,
              native_app = EXCLUDED.native_app,
              synced_at = NOW()
          `, [
            organizationId,
            userEmail.toLowerCase(),
            token.clientId,
            token.displayText || null,
            scopes,
            token.nativeApp || false,
            token.userKey || null
          ]);
        }

        // Remove tokens that no longer exist for this user
        if (tokens.length > 0) {
          const currentClientIds = tokens.map((t: any) => t.clientId);
          await db.query(`
            DELETE FROM user_oauth_tokens
            WHERE organization_id = $1 AND user_email = $2 AND client_id != ALL($3)
          `, [organizationId, userEmail.toLowerCase(), currentClientIds]);
        } else {
          // No tokens - remove all for this user
          await db.query(`
            DELETE FROM user_oauth_tokens
            WHERE organization_id = $1 AND user_email = $2
          `, [organizationId, userEmail.toLowerCase()]);
        }

        logger.debug('Synced tokens for user', { userEmail, tokensFound });
        return { tokensFound };

      } catch (error: any) {
        // Some users may not have any tokens or may have restricted access
        if (error.code === 404 || error.message?.includes('Resource not found')) {
          return { tokensFound: 0 };
        }
        throw error;
      }

    } catch (error: any) {
      logger.error('Failed to sync tokens for user', {
        organizationId,
        userEmail,
        error: error.message
      });
      return { tokensFound: 0, error: error.message };
    }
  }

  /**
   * Bulk sync OAuth tokens for all users in the organization
   */
  async syncAllTokens(
    organizationId: string,
    options?: { batchSize?: number; delayBetweenBatches?: number }
  ): Promise<SyncResult> {
    const batchSize = options?.batchSize || 50;
    const delayBetweenBatches = options?.delayBetweenBatches || 1000;

    let appsFound = 0;
    let tokensProcessed = 0;
    let usersProcessed = 0;
    let errors = 0;

    try {
      logger.info('Starting bulk OAuth token sync', { organizationId });

      // Get all synced users from Google Workspace
      const usersResult = await db.query(`
        SELECT email FROM gw_synced_users
        WHERE organization_id = $1 AND is_suspended = false
        ORDER BY email
      `, [organizationId]);

      const users = usersResult.rows;
      const totalUsers = users.length;

      logger.info('Found users to sync tokens for', { organizationId, totalUsers });

      // Process in batches
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        const results = await Promise.all(
          batch.map((user: any) => this.syncUserTokens(organizationId, user.email))
        );

        for (const result of results) {
          usersProcessed++;
          if (result.error) {
            errors++;
          } else {
            tokensProcessed += result.tokensFound;
          }
        }

        // Delay between batches to respect rate limits
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      // Get unique apps count
      const appsResult = await db.query(`
        SELECT COUNT(*) as count FROM oauth_apps WHERE organization_id = $1
      `, [organizationId]);
      appsFound = parseInt(appsResult.rows[0].count, 10);

      logger.info('Bulk OAuth token sync completed', {
        organizationId,
        appsFound,
        tokensProcessed,
        usersProcessed,
        errors
      });

      return {
        success: true,
        appsFound,
        tokensProcessed,
        usersProcessed,
        errors
      };

    } catch (error: any) {
      logger.error('Bulk OAuth token sync failed', {
        organizationId,
        error: error.message
      });

      return {
        success: false,
        appsFound,
        tokensProcessed,
        usersProcessed,
        errors,
        error: error.message
      };
    }
  }

  /**
   * Get aggregated OAuth apps for the organization
   */
  async getOAuthApps(
    organizationId: string,
    options?: {
      search?: string;
      riskLevel?: string;
      sortBy?: 'userCount' | 'lastSeen' | 'name';
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ apps: OAuthApp[]; total: number; totalGrants: number }> {
    const {
      search,
      riskLevel,
      sortBy = 'userCount',
      sortOrder = 'desc',
      limit = 50,
      offset = 0
    } = options || {};

    let whereClause = 'WHERE organization_id = $1';
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND display_name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (riskLevel) {
      whereClause += ` AND risk_level = $${paramIndex}`;
      params.push(riskLevel);
      paramIndex++;
    }

    // Map sortBy to column names
    const sortColumn = {
      userCount: 'user_count',
      lastSeen: 'last_seen_at',
      name: 'display_name'
    }[sortBy] || 'user_count';

    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Get apps with pagination
    const appsResult = await db.query(`
      SELECT
        id, client_id, display_name, scopes, risk_level,
        user_count, first_seen_at, last_seen_at
      FROM oauth_apps
      ${whereClause}
      ORDER BY ${sortColumn} ${order} NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await db.query(`
      SELECT COUNT(*) as total FROM oauth_apps ${whereClause}
    `, params);

    // Get total grants (sum of user_count across all apps)
    const grantsResult = await db.query(`
      SELECT COALESCE(SUM(user_count), 0) as total_grants
      FROM oauth_apps
      WHERE organization_id = $1
    `, [organizationId]);

    const apps: OAuthApp[] = appsResult.rows.map((row: any) => ({
      id: row.id,
      clientId: row.client_id,
      displayName: row.display_name,
      scopes: row.scopes || [],
      riskLevel: row.risk_level,
      userCount: row.user_count,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at
    }));

    return {
      apps,
      total: parseInt(countResult.rows[0].total, 10),
      totalGrants: parseInt(grantsResult.rows[0].total_grants, 10)
    };
  }

  /**
   * Get users who have granted access to a specific app
   */
  async getAppUsers(
    organizationId: string,
    clientId: string
  ): Promise<{ users: Array<{ email: string; scopes: string[]; syncedAt: Date }> }> {
    const result = await db.query(`
      SELECT user_email, scopes, synced_at
      FROM user_oauth_tokens
      WHERE organization_id = $1 AND client_id = $2
      ORDER BY user_email
    `, [organizationId, clientId]);

    return {
      users: result.rows.map((row: any) => ({
        email: row.user_email,
        scopes: row.scopes || [],
        syncedAt: row.synced_at
      }))
    };
  }

  /**
   * Get OAuth tokens for a specific user
   */
  async getUserTokens(organizationId: string, userEmail: string): Promise<UserToken[]> {
    const result = await db.query(`
      SELECT
        id, client_id, display_name, scopes, native_app,
        last_time_used, synced_at
      FROM user_oauth_tokens
      WHERE organization_id = $1 AND user_email = $2
      ORDER BY display_name
    `, [organizationId, userEmail.toLowerCase()]);

    return result.rows.map((row: any) => ({
      id: row.id,
      clientId: row.client_id,
      displayName: row.display_name,
      scopes: row.scopes || [],
      nativeApp: row.native_app,
      lastTimeUsed: row.last_time_used,
      syncedAt: row.synced_at
    }));
  }

  /**
   * Revoke a specific OAuth token for a user
   */
  async revokeToken(
    organizationId: string,
    userEmail: string,
    clientId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const clientInfo = await this.getAdminClient(organizationId);
      if (!clientInfo) {
        return { success: false, error: 'No Google Workspace credentials configured' };
      }

      const { admin } = clientInfo;

      // Revoke the token via Google Admin API
      await admin.tokens.delete({
        userKey: userEmail,
        clientId: clientId
      });

      // Remove from our database
      await db.query(`
        DELETE FROM user_oauth_tokens
        WHERE organization_id = $1 AND user_email = $2 AND client_id = $3
      `, [organizationId, userEmail.toLowerCase(), clientId]);

      // Update app user count (trigger should handle this, but just in case)
      await db.query(`
        UPDATE oauth_apps
        SET user_count = (
          SELECT COUNT(DISTINCT user_email)
          FROM user_oauth_tokens
          WHERE organization_id = $1 AND client_id = $2
        )
        WHERE organization_id = $1 AND client_id = $2
      `, [organizationId, clientId]);

      logger.info('Revoked OAuth token', { organizationId, userEmail, clientId });

      return { success: true };

    } catch (error: any) {
      logger.error('Failed to revoke OAuth token', {
        organizationId,
        userEmail,
        clientId,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke an OAuth app from all users in the organization
   */
  async revokeAppFromAll(
    organizationId: string,
    clientId: string
  ): Promise<BulkRevokeResult> {
    const errors: string[] = [];
    let revokedCount = 0;
    let failedCount = 0;

    try {
      // Get all users who have this app
      const usersResult = await db.query(`
        SELECT user_email FROM user_oauth_tokens
        WHERE organization_id = $1 AND client_id = $2
      `, [organizationId, clientId]);

      const users = usersResult.rows;

      for (const user of users) {
        const result = await this.revokeToken(organizationId, user.user_email, clientId);
        if (result.success) {
          revokedCount++;
        } else {
          failedCount++;
          errors.push(`${user.user_email}: ${result.error}`);
        }
      }

      // If all tokens were revoked, remove the app entry
      if (failedCount === 0) {
        await db.query(`
          DELETE FROM oauth_apps
          WHERE organization_id = $1 AND client_id = $2
        `, [organizationId, clientId]);
      }

      logger.info('Bulk revoked OAuth app', {
        organizationId,
        clientId,
        revokedCount,
        failedCount
      });

      return {
        success: failedCount === 0,
        revokedCount,
        failedCount,
        errors
      };

    } catch (error: any) {
      logger.error('Failed to bulk revoke OAuth app', {
        organizationId,
        clientId,
        error: error.message
      });

      return {
        success: false,
        revokedCount,
        failedCount,
        errors: [error.message]
      };
    }
  }

  /**
   * Get 2FA status summary for the organization (Google Workspace only - legacy)
   */
  async get2FAStatus(organizationId: string): Promise<{
    summary: { total: number; enrolled: number; notEnrolled: number; percentage: number };
    users: Array<{
      email: string;
      firstName: string | null;
      lastName: string | null;
      isEnrolled2Sv: boolean;
      lastLogin: Date | null;
    }>;
  }> {
    // Get summary from view
    const summaryResult = await db.query(`
      SELECT
        total_users,
        enrolled_users,
        not_enrolled_users,
        enrollment_percentage
      FROM security_2fa_summary
      WHERE organization_id = $1
    `, [organizationId]);

    // Get individual user status
    const usersResult = await db.query(`
      SELECT
        email,
        given_name as first_name,
        family_name as last_name,
        is_enrolled_2sv,
        last_login_time
      FROM gw_synced_users
      WHERE organization_id = $1 AND is_suspended = false
      ORDER BY email
    `, [organizationId]);

    const summary = summaryResult.rows[0] || {
      total_users: 0,
      enrolled_users: 0,
      not_enrolled_users: 0,
      enrollment_percentage: 0
    };

    return {
      summary: {
        total: parseInt(summary.total_users, 10) || 0,
        enrolled: parseInt(summary.enrolled_users, 10) || 0,
        notEnrolled: parseInt(summary.not_enrolled_users, 10) || 0,
        percentage: parseFloat(summary.enrollment_percentage) || 0
      },
      users: usersResult.rows.map((row: any) => ({
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        isEnrolled2Sv: row.is_enrolled_2sv,
        lastLogin: row.last_login_time
      }))
    };
  }

  /**
   * Unified 2FA status across all identity sources
   * Aggregates 2FA status from Helios, Google Workspace, and M365
   */
  async getUnified2FAStatus(
    organizationId: string,
    options?: {
      source?: 'helios' | 'google' | 'm365' | 'all';
      email?: string;
      filter?: 'all' | 'enrolled' | 'not-enrolled';
    }
  ): Promise<{
    summary: {
      total: number;
      enrolled: number;
      notEnrolled: number;
      percentage: number;
      bySource: {
        helios: { total: number; enrolled: number };
        google: { total: number; enrolled: number };
        m365: { total: number; enrolled: number };
      };
    };
    users: Array<{
      email: string;
      firstName: string | null;
      lastName: string | null;
      source: 'helios' | 'google' | 'm365';
      isEnrolled: boolean;
      isEnforced?: boolean;
      updatedAt?: Date | null;
    }>;
  }> {
    const { source = 'all', email, filter = 'all' } = options || {};
    const users: Array<{
      email: string;
      firstName: string | null;
      lastName: string | null;
      source: 'helios' | 'google' | 'm365';
      isEnrolled: boolean;
      isEnforced?: boolean;
      updatedAt?: Date | null;
    }> = [];

    let heliosTotal = 0, heliosEnrolled = 0;
    let googleTotal = 0, googleEnrolled = 0;
    let m365Total = 0, m365Enrolled = 0;

    // Helios 2FA (better-auth two_factor table)
    if (source === 'all' || source === 'helios') {
      let heliosQuery = `
        SELECT
          ou.email,
          ou.first_name,
          ou.last_name,
          COALESCE(tf.enabled, false) as is_enrolled,
          tf.updated_at
        FROM organization_users ou
        LEFT JOIN two_factor tf ON ou.id = tf.user_id
        WHERE ou.organization_id = $1 AND ou.is_active = true
      `;
      const heliosParams: any[] = [organizationId];

      if (email) {
        heliosQuery += ` AND ou.email = $2`;
        heliosParams.push(email.toLowerCase());
      }

      heliosQuery += ` ORDER BY ou.email`;

      const heliosResult = await db.query(heliosQuery, heliosParams);

      for (const row of heliosResult.rows) {
        heliosTotal++;
        const isEnrolled = row.is_enrolled === true;
        if (isEnrolled) heliosEnrolled++;

        // Apply filter
        if (filter === 'enrolled' && !isEnrolled) continue;
        if (filter === 'not-enrolled' && isEnrolled) continue;

        users.push({
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          source: 'helios',
          isEnrolled,
          updatedAt: row.updated_at
        });
      }
    }

    // Google Workspace 2FA (gw_synced_users)
    if (source === 'all' || source === 'google') {
      let googleQuery = `
        SELECT
          email,
          given_name as first_name,
          family_name as last_name,
          is_enrolled_2sv,
          is_enforced_2sv,
          last_login_time
        FROM gw_synced_users
        WHERE organization_id = $1 AND is_suspended = false
      `;
      const googleParams: any[] = [organizationId];

      if (email) {
        googleQuery += ` AND email = $2`;
        googleParams.push(email.toLowerCase());
      }

      googleQuery += ` ORDER BY email`;

      const googleResult = await db.query(googleQuery, googleParams);

      for (const row of googleResult.rows) {
        googleTotal++;
        const isEnrolled = row.is_enrolled_2sv === true;
        if (isEnrolled) googleEnrolled++;

        // Apply filter
        if (filter === 'enrolled' && !isEnrolled) continue;
        if (filter === 'not-enrolled' && isEnrolled) continue;

        users.push({
          email: row.email,
          firstName: row.first_name,
          lastName: row.last_name,
          source: 'google',
          isEnrolled,
          isEnforced: row.is_enforced_2sv,
          updatedAt: row.last_login_time
        });
      }
    }

    // M365 2FA (placeholder - not yet implemented)
    if (source === 'all' || source === 'm365') {
      // TODO: Implement M365 2FA status when Microsoft Graph integration is ready
      // For now, return empty for M365
      m365Total = 0;
      m365Enrolled = 0;
    }

    // Calculate totals (deduplicated by email when showing 'all')
    const total = heliosTotal + googleTotal + m365Total;
    const enrolled = heliosEnrolled + googleEnrolled + m365Enrolled;
    const notEnrolled = total - enrolled;
    const percentage = total > 0 ? Math.round((enrolled / total) * 100) : 0;

    return {
      summary: {
        total,
        enrolled,
        notEnrolled,
        percentage,
        bySource: {
          helios: { total: heliosTotal, enrolled: heliosEnrolled },
          google: { total: googleTotal, enrolled: googleEnrolled },
          m365: { total: m365Total, enrolled: m365Enrolled }
        }
      },
      users
    };
  }

  /**
   * Get unified 2FA status for a single user across all identity sources
   */
  async getUserUnified2FAStatus(
    organizationId: string,
    userEmail: string
  ): Promise<{
    email: string;
    sources: Array<{
      source: 'helios' | 'google' | 'm365';
      isEnrolled: boolean;
      isEnforced?: boolean;
      updatedAt?: Date | null;
    }>;
    anyEnrolled: boolean;
    allEnrolled: boolean;
  } | null> {
    const sources: Array<{
      source: 'helios' | 'google' | 'm365';
      isEnrolled: boolean;
      isEnforced?: boolean;
      updatedAt?: Date | null;
    }> = [];

    // Check Helios 2FA
    const heliosResult = await db.query(`
      SELECT
        COALESCE(tf.enabled, false) as is_enrolled,
        tf.updated_at
      FROM organization_users ou
      LEFT JOIN two_factor tf ON ou.id = tf.user_id
      WHERE ou.organization_id = $1 AND ou.email = $2 AND ou.is_active = true
    `, [organizationId, userEmail.toLowerCase()]);

    if (heliosResult.rows.length > 0) {
      sources.push({
        source: 'helios',
        isEnrolled: heliosResult.rows[0].is_enrolled === true,
        updatedAt: heliosResult.rows[0].updated_at
      });
    }

    // Check Google Workspace 2FA
    const googleResult = await db.query(`
      SELECT is_enrolled_2sv, is_enforced_2sv, last_login_time
      FROM gw_synced_users
      WHERE organization_id = $1 AND email = $2
    `, [organizationId, userEmail.toLowerCase()]);

    if (googleResult.rows.length > 0) {
      sources.push({
        source: 'google',
        isEnrolled: googleResult.rows[0].is_enrolled_2sv === true,
        isEnforced: googleResult.rows[0].is_enforced_2sv,
        updatedAt: googleResult.rows[0].last_login_time
      });
    }

    // M365 2FA - placeholder
    // TODO: Add when Microsoft Graph integration is ready

    if (sources.length === 0) {
      return null;
    }

    const enrolledSources = sources.filter(s => s.isEnrolled);

    return {
      email: userEmail,
      sources,
      anyEnrolled: enrolledSources.length > 0,
      allEnrolled: enrolledSources.length === sources.length
    };
  }

  /**
   * Get 2FA status for a single user
   */
  async getUserSecurity(organizationId: string, userEmail: string): Promise<{
    twoFactor: { isEnrolled: boolean; isEnforced: boolean };
    tokens: UserToken[];
  } | null> {
    const userResult = await db.query(`
      SELECT is_enrolled_2sv, is_enforced_2sv
      FROM gw_synced_users
      WHERE organization_id = $1 AND email = $2
    `, [organizationId, userEmail.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return null;
    }

    const tokens = await this.getUserTokens(organizationId, userEmail);

    return {
      twoFactor: {
        isEnrolled: userResult.rows[0].is_enrolled_2sv,
        isEnforced: userResult.rows[0].is_enforced_2sv
      },
      tokens
    };
  }

  /**
   * Get passkeys for a specific user
   * Returns passkey count and device list for the security overview
   */
  async getUserPasskeys(organizationId: string, userEmail: string): Promise<{
    count: number;
    devices: Array<{
      id: string;
      name: string | null;
      createdAt: Date;
    }>;
  } | null> {
    try {
      // First find the user by email
      const userResult = await db.query(`
        SELECT id FROM organization_users
        WHERE organization_id = $1 AND email = $2 AND is_active = true
      `, [organizationId, userEmail.toLowerCase()]);

      if (userResult.rows.length === 0) {
        return null;
      }

      const userId = userResult.rows[0].id;

      // Get passkeys for this user
      const passkeysResult = await db.query(`
        SELECT id, name, created_at
        FROM passkeys
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [userId]);

      return {
        count: passkeysResult.rows.length,
        devices: passkeysResult.rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          createdAt: row.created_at
        }))
      };
    } catch (error) {
      // Table might not exist yet, return empty
      logger.warn('Failed to fetch passkeys, table may not exist yet', { error });
      return {
        count: 0,
        devices: []
      };
    }
  }
}

// Export singleton instance
export const oauthTokenSyncService = new OAuthTokenSyncService();
