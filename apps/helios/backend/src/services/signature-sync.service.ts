/**
 * Signature Sync Service
 *
 * Handles the deployment of signatures to Google Workspace Gmail.
 * Features:
 * - Queue-based deployment with status tracking
 * - Retry logic for failures
 * - Template rendering with user data
 * - Hash comparison to detect external changes
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { googleWorkspaceService } from './google-workspace.service.js';
import { signatureTemplateService } from './signature-template.service.js';
import { signatureAssignmentService } from './signature-assignment.service.js';
import crypto from 'crypto';

type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'error' | 'skipped';

interface UserSyncStatus {
  id: string;
  userId: string;
  organizationId: string;
  currentTemplateId: string | null;
  assignmentSource: string | null;
  assignmentId: string | null;
  renderedHtml: string | null;
  lastSyncedAt: Date | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  syncAttempts: number;
  lastSyncAttemptAt: Date | null;
  googleSignatureHash: string | null;
}

interface SyncResult {
  success: boolean;
  userId: string;
  userEmail: string;
  status: SyncStatus;
  error?: string;
}

interface BatchSyncResult {
  organizationId: string;
  totalUsers: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  results: SyncResult[];
}

class SignatureSyncService {
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 10;

  /**
   * Sync a single user's signature to Gmail
   */
  async syncUserSignature(userId: string): Promise<SyncResult> {
    let userEmail = '';

    try {
      // Get user info
      const userResult = await db.query(
        `SELECT ou.id, ou.email, ou.organization_id, ou.first_name, ou.last_name
         FROM organization_users ou
         WHERE ou.id = $1 AND ou.is_active = true`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        return {
          success: false,
          userId,
          userEmail: '',
          status: 'skipped',
          error: 'User not found or inactive',
        };
      }

      const user = userResult.rows[0];
      userEmail = user.email;
      const organizationId = user.organization_id;

      // Update status to syncing
      await this.updateUserSyncStatus(userId, organizationId, {
        syncStatus: 'syncing',
        lastSyncAttemptAt: new Date(),
      });

      // Get effective signature assignment
      const effectiveSignature = await signatureAssignmentService.getEffectiveSignature(userId);

      if (!effectiveSignature) {
        // No signature assigned - skip
        await this.updateUserSyncStatus(userId, organizationId, {
          syncStatus: 'skipped',
          syncError: 'No signature template assigned',
          currentTemplateId: null,
          assignmentId: null,
          assignmentSource: null,
          renderedHtml: null,
        });

        return {
          success: true,
          userId,
          userEmail,
          status: 'skipped',
        };
      }

      // Get template
      const template = await signatureTemplateService.getTemplate(effectiveSignature.templateId);
      if (!template) {
        await this.updateUserSyncStatus(userId, organizationId, {
          syncStatus: 'error',
          syncError: 'Template not found',
        });

        return {
          success: false,
          userId,
          userEmail,
          status: 'error',
          error: 'Template not found',
        };
      }

      // Render template with user data, campaign banner, and user tracking pixel
      let renderedHtml: string;
      let hasUserTracking = false;
      try {
        // Check if this is from a campaign with a banner
        const hasCampaignBanner = effectiveSignature.source === 'campaign' && effectiveSignature.bannerUrl;

        // Use the new renderTemplateWithTracking method which:
        // 1. Renders the template with user data
        // 2. Adds campaign banner if applicable
        // 3. Adds user tracking pixel if enabled for the organization
        const renderResult = await signatureTemplateService.renderTemplateWithTracking(
          effectiveSignature.templateId,
          userId,
          {
            includeCampaignBanner: hasCampaignBanner ? {
              url: effectiveSignature.bannerUrl,
              link: effectiveSignature.bannerLink,
              altText: effectiveSignature.bannerAltText,
            } : undefined,
            // Don't skip user tracking - let the service determine based on org settings
            skipUserTracking: false,
          }
        );
        renderedHtml = renderResult.html;
        hasUserTracking = renderResult.hasUserTracking;
      } catch (renderError: any) {
        await this.updateUserSyncStatus(userId, organizationId, {
          syncStatus: 'error',
          syncError: renderError.message || 'Failed to render template',
        });
        return {
          success: false,
          userId,
          userEmail,
          status: 'error',
          error: renderError.message || 'Failed to render template',
        };
      }

      // Calculate hash for change detection
      const signatureHash = this.hashSignature(renderedHtml);

      // Check if signature has changed
      const currentStatus = await this.getUserSyncStatus(userId);
      if (currentStatus?.googleSignatureHash === signatureHash && currentStatus?.syncStatus === 'synced') {
        // Signature unchanged, skip sync
        return {
          success: true,
          userId,
          userEmail,
          status: 'synced',
        };
      }

      // Deploy to Gmail
      const deployResult = await googleWorkspaceService.setUserSignature(
        organizationId,
        userEmail,
        renderedHtml
      );

      if (!deployResult.success) {
        const attempts = (currentStatus?.syncAttempts || 0) + 1;
        const newStatus: SyncStatus = attempts >= this.MAX_RETRIES ? 'failed' : 'pending';

        await this.updateUserSyncStatus(userId, organizationId, {
          syncStatus: newStatus,
          syncError: deployResult.error || 'Deployment failed',
          syncAttempts: attempts,
        });

        return {
          success: false,
          userId,
          userEmail,
          status: newStatus,
          error: deployResult.error,
        };
      }

      // Success - update status
      await this.updateUserSyncStatus(userId, organizationId, {
        currentTemplateId: effectiveSignature.templateId,
        assignmentId: effectiveSignature.assignmentId,
        assignmentSource: effectiveSignature.source,
        renderedHtml,
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
        syncError: null,
        syncAttempts: 0,
        googleSignatureHash: signatureHash,
      });

      logger.info('User signature synced successfully', {
        userId,
        userEmail,
        templateId: effectiveSignature.templateId,
        hasUserTracking,
      });

      return {
        success: true,
        userId,
        userEmail,
        status: 'synced',
      };
    } catch (error: any) {
      logger.error('Error syncing user signature', {
        userId,
        userEmail,
        error: error.message,
      });

      // Try to update status
      try {
        const userResult = await db.query(
          'SELECT organization_id FROM organization_users WHERE id = $1',
          [userId]
        );
        if (userResult.rows.length > 0) {
          await this.updateUserSyncStatus(userId, userResult.rows[0].organization_id, {
            syncStatus: 'error',
            syncError: error.message,
          });
        }
      } catch (_e) {
        // Ignore
      }

      return {
        success: false,
        userId,
        userEmail,
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Sync all pending signatures for an organization
   */
  async syncOrganizationSignatures(organizationId: string): Promise<BatchSyncResult> {
    const results: SyncResult[] = [];

    try {
      // Get all users with pending or failed status (with retry allowed)
      const usersResult = await db.query(
        `SELECT ou.id, ou.email
         FROM organization_users ou
         LEFT JOIN user_signature_status uss ON uss.user_id = ou.id
         WHERE ou.organization_id = $1
           AND ou.is_active = true
           AND (
             uss.id IS NULL
             OR uss.sync_status IN ('pending', 'failed')
             OR (uss.sync_status = 'error' AND uss.sync_attempts < $2)
           )
         ORDER BY ou.email`,
        [organizationId, this.MAX_RETRIES]
      );

      const users = usersResult.rows as { id: string; email: string }[];

      logger.info('Starting organization signature sync', {
        organizationId,
        userCount: users.length,
      });

      // Process in batches
      for (let i = 0; i < users.length; i += this.BATCH_SIZE) {
        const batch = users.slice(i, i + this.BATCH_SIZE);

        const batchResults = await Promise.allSettled(
          batch.map((user: { id: string; email: string }) => this.syncUserSignature(user.id))
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            const idx = batchResults.indexOf(result);
            results.push({
              success: false,
              userId: batch[idx].id,
              userEmail: batch[idx].email,
              status: 'error',
              error: result.reason?.message || 'Unknown error',
            });
          }
        }

        // Rate limiting delay between batches
        if (i + this.BATCH_SIZE < users.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const successCount = results.filter(r => r.status === 'synced').length;
      const failureCount = results.filter(r => ['failed', 'error'].includes(r.status)).length;
      const skippedCount = results.filter(r => r.status === 'skipped').length;

      logger.info('Organization signature sync completed', {
        organizationId,
        totalUsers: users.length,
        successCount,
        failureCount,
        skippedCount,
      });

      return {
        organizationId,
        totalUsers: users.length,
        successCount,
        failureCount,
        skippedCount,
        results,
      };
    } catch (error: any) {
      logger.error('Error syncing organization signatures', {
        organizationId,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Force sync all users in an organization (regardless of status)
   */
  async forceSyncAllUsers(organizationId: string): Promise<BatchSyncResult> {
    const results: SyncResult[] = [];

    try {
      // Get all active users
      const usersResult = await db.query(
        `SELECT ou.id, ou.email
         FROM organization_users ou
         WHERE ou.organization_id = $1 AND ou.is_active = true
         ORDER BY ou.email`,
        [organizationId]
      );

      const users = usersResult.rows as { id: string; email: string }[];

      logger.info('Starting force sync for all users', {
        organizationId,
        userCount: users.length,
      });

      // Reset all users to pending first
      await db.query(
        `UPDATE user_signature_status
         SET sync_status = 'pending', sync_attempts = 0
         WHERE organization_id = $1`,
        [organizationId]
      );

      // Process in batches
      for (let i = 0; i < users.length; i += this.BATCH_SIZE) {
        const batch = users.slice(i, i + this.BATCH_SIZE);

        const batchResults = await Promise.allSettled(
          batch.map((user: { id: string; email: string }) => this.syncUserSignature(user.id))
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            const idx = batchResults.indexOf(result);
            results.push({
              success: false,
              userId: batch[idx].id,
              userEmail: batch[idx].email,
              status: 'error',
              error: result.reason?.message || 'Unknown error',
            });
          }
        }

        // Rate limiting delay between batches
        if (i + this.BATCH_SIZE < users.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const successCount = results.filter(r => r.status === 'synced').length;
      const failureCount = results.filter(r => ['failed', 'error'].includes(r.status)).length;
      const skippedCount = results.filter(r => r.status === 'skipped').length;

      return {
        organizationId,
        totalUsers: users.length,
        successCount,
        failureCount,
        skippedCount,
        results,
      };
    } catch (error: any) {
      logger.error('Error force syncing users', {
        organizationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get sync status summary for an organization
   */
  async getOrganizationSyncSummary(organizationId: string): Promise<{
    totalUsers: number;
    synced: number;
    pending: number;
    failed: number;
    error: number;
    skipped: number;
    noAssignment: number;
    lastSyncAt: Date | null;
  }> {
    const result = await db.query(
      `SELECT
        COUNT(*)::integer AS total_users,
        COUNT(CASE WHEN uss.sync_status = 'synced' THEN 1 END)::integer AS synced,
        COUNT(CASE WHEN uss.sync_status = 'pending' THEN 1 END)::integer AS pending,
        COUNT(CASE WHEN uss.sync_status = 'failed' THEN 1 END)::integer AS failed,
        COUNT(CASE WHEN uss.sync_status = 'error' THEN 1 END)::integer AS error,
        COUNT(CASE WHEN uss.sync_status = 'skipped' THEN 1 END)::integer AS skipped,
        COUNT(CASE WHEN uss.id IS NULL THEN 1 END)::integer AS no_assignment,
        MAX(uss.last_synced_at) AS last_sync_at
       FROM organization_users ou
       LEFT JOIN user_signature_status uss ON uss.user_id = ou.id
       WHERE ou.organization_id = $1 AND ou.is_active = true`,
      [organizationId]
    );

    const row = result.rows[0];
    return {
      totalUsers: row.total_users || 0,
      synced: row.synced || 0,
      pending: row.pending || 0,
      failed: row.failed || 0,
      error: row.error || 0,
      skipped: row.skipped || 0,
      noAssignment: row.no_assignment || 0,
      lastSyncAt: row.last_sync_at,
    };
  }

  /**
   * Get detailed sync status for all users in an organization
   */
  async getUserSyncStatuses(
    organizationId: string,
    options: {
      status?: SyncStatus;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    users: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { status, search, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;
    const values: any[] = [organizationId];
    let paramIndex = 2;

    let query = `
      SELECT
        ou.id,
        ou.email,
        ou.first_name,
        ou.last_name,
        uss.current_template_id,
        st.name AS template_name,
        uss.assignment_source,
        uss.sync_status,
        uss.sync_error,
        uss.sync_attempts,
        uss.last_synced_at,
        uss.last_sync_attempt_at
      FROM organization_users ou
      LEFT JOIN user_signature_status uss ON uss.user_id = ou.id
      LEFT JOIN signature_templates st ON st.id = uss.current_template_id
      WHERE ou.organization_id = $1 AND ou.is_active = true
    `;

    if (status) {
      query += ` AND uss.sync_status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (ou.email ILIKE $${paramIndex} OR ou.first_name ILIKE $${paramIndex} OR ou.last_name ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    // Count total
    const countQuery = query.replace(
      /SELECT[\s\S]*?FROM/,
      'SELECT COUNT(*)::integer AS count FROM'
    );
    const countResult = await db.query(countQuery, values);
    const total = countResult.rows[0]?.count || 0;

    // Add pagination
    query += ` ORDER BY ou.last_name, ou.first_name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const result = await db.query(query, values);

    interface UserRow {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      current_template_id: string | null;
      template_name: string | null;
      assignment_source: string | null;
      sync_status: SyncStatus | null;
      sync_error: string | null;
      sync_attempts: number | null;
      last_synced_at: Date | null;
      last_sync_attempt_at: Date | null;
    }

    return {
      users: result.rows.map((row: UserRow) => ({
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        templateId: row.current_template_id,
        templateName: row.template_name,
        assignmentSource: row.assignment_source,
        syncStatus: row.sync_status || 'pending',
        syncError: row.sync_error,
        syncAttempts: row.sync_attempts || 0,
        lastSyncedAt: row.last_synced_at,
        lastSyncAttemptAt: row.last_sync_attempt_at,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Get sync status for a specific user
   */
  async getUserSyncStatus(userId: string): Promise<UserSyncStatus | null> {
    const result = await db.query(
      `SELECT * FROM user_signature_status WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id,
      currentTemplateId: row.current_template_id,
      assignmentSource: row.assignment_source,
      assignmentId: row.assignment_id,
      renderedHtml: row.rendered_html,
      lastSyncedAt: row.last_synced_at,
      syncStatus: row.sync_status,
      syncError: row.sync_error,
      syncAttempts: row.sync_attempts,
      lastSyncAttemptAt: row.last_sync_attempt_at,
      googleSignatureHash: row.google_signature_hash,
    };
  }

  /**
   * Mark users as pending sync (called when assignments change)
   */
  async markUsersPending(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    await db.query(
      `UPDATE user_signature_status
       SET sync_status = 'pending', updated_at = NOW()
       WHERE user_id = ANY($1)`,
      [userIds]
    );
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================

  private async updateUserSyncStatus(
    userId: string,
    organizationId: string,
    updates: Partial<{
      currentTemplateId: string | null;
      assignmentId: string | null;
      assignmentSource: string | null;
      renderedHtml: string | null;
      lastSyncedAt: Date | null;
      syncStatus: SyncStatus;
      syncError: string | null;
      syncAttempts: number;
      lastSyncAttemptAt: Date | null;
      googleSignatureHash: string | null;
    }>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      currentTemplateId: 'current_template_id',
      assignmentId: 'assignment_id',
      assignmentSource: 'assignment_source',
      renderedHtml: 'rendered_html',
      lastSyncedAt: 'last_synced_at',
      syncStatus: 'sync_status',
      syncError: 'sync_error',
      syncAttempts: 'sync_attempts',
      lastSyncAttemptAt: 'last_sync_attempt_at',
      googleSignatureHash: 'google_signature_hash',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in updates) {
        fields.push(`${dbField} = $${paramIndex}`);
        values.push((updates as any)[key]);
        paramIndex++;
      }
    }

    if (fields.length === 0) return;

    // Upsert
    await db.query(
      `INSERT INTO user_signature_status (user_id, organization_id, ${Object.values(fieldMap).filter((_, i) => Object.keys(fieldMap)[i] in updates).join(', ')})
       VALUES ($${paramIndex}, $${paramIndex + 1}, ${values.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (user_id) DO UPDATE SET
         ${fields.join(', ')},
         updated_at = NOW()`,
      [...values, userId, organizationId]
    );
  }

  private hashSignature(html: string): string {
    return crypto.createHash('sha256').update(html).digest('hex');
  }
}

export const signatureSyncService = new SignatureSyncService();
export default signatureSyncService;
