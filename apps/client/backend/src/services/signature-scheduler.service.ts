import { CronJob } from 'cron';
import { db } from '../database/connection.js';
import { google } from 'googleapis';
import { decodeServiceAccountKey } from './gw-credentials.js';
import * as Handlebars from 'handlebars';
import { logger } from '../utils/logger.js';

interface SignatureSyncJob {
  organizationId: string;
  organizationName: string;
  serviceAccountKey: any;
  adminEmail: string;
}

export class SignatureSchedulerService {
  private syncJobs: Map<string, CronJob> = new Map();

  constructor() {
    // Initialization is done separately to allow for proper error handling
  }

  /**
   * Initialize the scheduler and load all organizations
   */
  async initializeScheduler() {
    try {
      logger.info('Initializing signature scheduler service...');

      // Load organizations with Google Workspace configured
      // organization_settings uses key-value pattern
      const orgsQuery = `
        SELECT DISTINCT
          o.id,
          o.name,
          gc.service_account_key,
          gc.admin_email,
          COALESCE(
            (SELECT value::boolean FROM organization_settings
             WHERE organization_id = o.id AND key = 'signature_sync_enabled'
             LIMIT 1),
            true
          ) as sync_enabled,
          COALESCE(
            (SELECT value::integer FROM organization_settings
             WHERE organization_id = o.id AND key = 'signature_sync_hour'
             LIMIT 1),
            2
          ) as sync_hour
        FROM organizations o
        INNER JOIN gw_credentials gc ON gc.organization_id = o.id
        WHERE gc.service_account_key IS NOT NULL
      `;

      const result = await db.query(orgsQuery);

      for (const org of result.rows) {
        if (org.sync_enabled) {
          this.scheduleOrgSync(org);
        }
      }

      logger.info(`Signature scheduler initialized for ${result.rows.length} organizations`);
    } catch (error) {
      logger.error('Failed to initialize signature scheduler:', error);
    }
  }

  /**
   * Schedule signature sync for an organization
   */
  private scheduleOrgSync(org: any) {
    try {
      // Create cron expression for daily sync at specified hour (default 2 AM)
      const hour = org.sync_hour || 2;
      const cronExpression = `0 ${hour} * * *`; // Daily at specified hour

      const job = new CronJob(
        cronExpression,
        async () => {
          await this.syncOrganizationSignatures({
            organizationId: org.id,
            organizationName: org.name,
            serviceAccountKey: decodeServiceAccountKey(org.service_account_key),
            adminEmail: org.admin_email
          });
        },
        null,
        true, // Start immediately
        'America/Los_Angeles' // Default timezone, should be configurable
      );

      this.syncJobs.set(org.id, job);
      logger.info(`Scheduled signature sync for ${org.name} at ${hour}:00 daily`);
    } catch (error) {
      logger.error(`Failed to schedule sync for org ${org.id}:`, error);
    }
  }

  /**
   * Sync signatures for all users in an organization
   */
  async syncOrganizationSignatures(job: SignatureSyncJob) {
    const startTime = Date.now();
    let syncLogId: string | null = null;

    try {
      logger.info(`Starting signature sync for ${job.organizationName}`);

      // Create sync log
      const logResult = await db.query(
        `INSERT INTO signature_sync_logs (
          organization_id,
          sync_type,
          started_at
        ) VALUES ($1, $2, CURRENT_TIMESTAMP)
        RETURNING id`,
        [job.organizationId, 'scheduled']
      );
      syncLogId = logResult.rows[0].id;

      // Get all active users with their current campaigns
      const usersQuery = `
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.title,
          u.department,
          u.phone_number,
          o.name as company,
          u.photo_url,
          -- Get the highest priority active campaign for this user
          (
            SELECT c.id
            FROM signature_campaigns c
            WHERE c.organization_id = $1
              AND c.status = 'active'
              AND (c.start_date IS NULL OR c.start_date <= CURRENT_TIMESTAMP)
              AND (c.end_date IS NULL OR c.end_date >= CURRENT_TIMESTAMP)
              AND (
                c.target_type = 'all'
                OR (c.target_type = 'users' AND u.id = ANY(c.target_ids))
                OR (c.target_type = 'departments' AND u.department = ANY(
                  SELECT jsonb_array_elements_text(c.target_rules->'departments')
                ))
              )
            ORDER BY c.priority DESC, c.created_at DESC
            LIMIT 1
          ) as campaign_id
        FROM organization_users u
        CROSS JOIN organizations o
        WHERE u.organization_id = $1
          AND u.is_active = true
          AND o.id = $1
      `;

      const usersResult = await db.query(usersQuery, [job.organizationId]);
      const users = usersResult.rows;

      let succeeded = 0;
      let failed = 0;
      const errors: any[] = [];

      // Process users in batches to avoid rate limits
      const batchSize = 5;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (user: any) => {
            try {
              const signature = await this.buildSignatureForUser(user, job.organizationId);
              if (signature) {
                await this.applySignatureToGmail(
                  user.email,
                  signature,
                  job.serviceAccountKey
                );
                succeeded++;

                // Log successful application
                if (user.campaign_id) {
                  await db.query(
                    `UPDATE user_signature_assignments
                     SET last_applied_at = CURRENT_TIMESTAMP, apply_status = 'applied'
                     WHERE user_id = $1 AND campaign_id = $2`,
                    [user.id, user.campaign_id]
                  );
                }
              } else {
                // No signature to apply
                succeeded++;
              }
            } catch (error) {
              failed++;
              errors.push({
                userId: user.id,
                email: user.email,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
              logger.error(`Failed to sync signature for ${user.email}:`, error);
            }
          })
        );

        // Respect rate limits
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between batches
        }
      }

      // Update sync log
      if (syncLogId) {
        await db.query(
          `UPDATE signature_sync_logs
           SET
             completed_at = CURRENT_TIMESTAMP,
             users_processed = $1,
             users_succeeded = $2,
             users_failed = $3,
             detailed_errors = $4
           WHERE id = $5`,
          [users.length, succeeded, failed, JSON.stringify(errors), syncLogId]
        );
      }

      const duration = Date.now() - startTime;
      logger.info(
        `Signature sync completed for ${job.organizationName}: ` +
        `${succeeded}/${users.length} succeeded in ${duration}ms`
      );
    } catch (error) {
      logger.error(`Signature sync failed for ${job.organizationName}:`, error);

      if (syncLogId) {
        await db.query(
          `UPDATE signature_sync_logs
           SET
             completed_at = CURRENT_TIMESTAMP,
             error_summary = $1
           WHERE id = $2`,
          [error instanceof Error ? error.message : 'Sync failed', syncLogId]
        );
      }
    }
  }

  /**
   * Build signature HTML for a user based on active campaigns
   */
  private async buildSignatureForUser(user: any, organizationId: string): Promise<string | null> {
    try {
      // Get the template for the user's campaign (or default)
      let templateQuery: string;
      let templateParams: any[];

      if (user.campaign_id) {
        // User has an active campaign
        templateQuery = `
          SELECT
            st.html_template,
            sc.campaign_banner_html,
            sc.campaign_banner_position
          FROM signature_campaigns sc
          JOIN signature_templates st ON sc.template_id = st.id
          WHERE sc.id = $1
        `;
        templateParams = [user.campaign_id];
      } else {
        // Use default template
        templateQuery = `
          SELECT html_template
          FROM signature_templates
          WHERE organization_id = $1
            AND is_default = true
            AND is_active = true
          LIMIT 1
        `;
        templateParams = [organizationId];
      }

      const templateResult = await db.query(templateQuery, templateParams);

      if (!templateResult.rows[0]) {
        // No template found, use a basic signature
        return this.buildBasicSignature(user);
      }

      const { html_template, campaign_banner_html, campaign_banner_position } = templateResult.rows[0];

      // Compile template with Handlebars
      const template = Handlebars.compile(html_template);

      // Prepare user data for template
      const templateData = {
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        email: user.email,
        title: user.title,
        department: user.department,
        phone: user.phone_number,
        company: user.company,
        photoUrl: user.photo_url,
        calendar_link: `https://calendar.google.com/calendar/u/0/appointments/schedules/${user.email}`
      };

      let signature = template(templateData);

      // Add campaign banner if exists
      if (campaign_banner_html) {
        if (campaign_banner_position === 'top') {
          signature = campaign_banner_html + signature;
        } else {
          signature = signature + campaign_banner_html;
        }
      }

      return signature;
    } catch (error) {
      logger.error(`Failed to build signature for user ${user.email}:`, error);
      return this.buildBasicSignature(user);
    }
  }

  /**
   * Build a basic fallback signature
   */
  private buildBasicSignature(user: any): string {
    return `
      <div style="font-family: Arial, sans-serif; color: #333; font-size: 14px;">
        <strong>${user.first_name || ''} ${user.last_name || ''}</strong><br>
        ${user.title ? `${user.title}<br>` : ''}
        ${user.department ? `${user.department}<br>` : ''}
        ${user.company}<br>
        ${user.email}
        ${user.phone_number ? ` | ${user.phone_number}` : ''}
      </div>
    `;
  }

  /**
   * Apply signature to user's Gmail account
   */
  private async applySignatureToGmail(
    userEmail: string,
    signatureHtml: string,
    serviceAccountKey: any
  ): Promise<void> {
    try {
      // Initialize Gmail API with domain-wide delegation
      const auth = new google.auth.JWT({
        email: serviceAccountKey.client_email,
        key: serviceAccountKey.private_key,
        scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
        subject: userEmail // Impersonate this user
      });

      const gmail = google.gmail({ version: 'v1', auth });

      // Get the user's send-as addresses
      const sendAsResponse = await gmail.users.settings.sendAs.list({
        userId: 'me'
      });

      const primaryAddress = sendAsResponse.data.sendAs?.find(
        sendAs => sendAs.isPrimary
      );

      if (primaryAddress && primaryAddress.sendAsEmail) {
        // Update the signature
        await gmail.users.settings.sendAs.update({
          userId: 'me',
          sendAsEmail: primaryAddress.sendAsEmail,
          requestBody: {
            signature: signatureHtml
          }
        });

        logger.debug(`Successfully applied signature for ${userEmail}`);
      } else {
        throw new Error('No primary send-as address found');
      }
    } catch (error) {
      // Check if error is due to user not having Gmail enabled
      if (error instanceof Error && error.message.includes('Gmail is not enabled')) {
        logger.debug(`Skipping ${userEmail} - Gmail not enabled`);
        return;
      }
      throw error;
    }
  }

  /**
   * Manually trigger sync for an organization
   */
  async triggerManualSync(organizationId: string, triggeredBy: string): Promise<void> {
    const orgQuery = `
      SELECT
        o.id,
        o.name,
        gc.service_account_key,
        gc.admin_email
      FROM organizations o
      INNER JOIN gw_credentials gc ON gc.organization_id = o.id
      WHERE o.id = $1
    `;

    const result = await db.query(orgQuery, [organizationId]);

    if (!result.rows[0]) {
      throw new Error('Organization not found or Google Workspace not configured');
    }

    const org = result.rows[0];

    // Create manual sync log
    await db.query(
      `INSERT INTO signature_sync_logs (
        organization_id,
        sync_type,
        triggered_by,
        started_at
      ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [organizationId, 'manual', triggeredBy]
    );

    // Run sync
    await this.syncOrganizationSignatures({
      organizationId: org.id,
      organizationName: org.name,
      serviceAccountKey: org.service_account_key,
      adminEmail: org.admin_email
    });
  }

  /**
   * Update sync schedule for an organization
   */
  async updateSyncSchedule(organizationId: string, enabled: boolean, syncHour?: number) {
    // Update settings in database using key-value pattern (upsert)
    await db.query(
      `INSERT INTO organization_settings (organization_id, key, value, updated_at)
       VALUES ($1, 'signature_sync_enabled', $2, CURRENT_TIMESTAMP)
       ON CONFLICT (organization_id, key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [organizationId, String(enabled)]
    );
    await db.query(
      `INSERT INTO organization_settings (organization_id, key, value, updated_at)
       VALUES ($1, 'signature_sync_hour', $2, CURRENT_TIMESTAMP)
       ON CONFLICT (organization_id, key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [organizationId, String(syncHour || 2)]
    );

    // Cancel existing job if any
    const existingJob = this.syncJobs.get(organizationId);
    if (existingJob) {
      existingJob.stop();
      this.syncJobs.delete(organizationId);
    }

    // Schedule new job if enabled
    if (enabled) {
      const orgQuery = `
        SELECT
          o.id,
          o.name,
          gc.service_account_key,
          gc.admin_email
        FROM organizations o
        INNER JOIN gw_credentials gc ON gc.organization_id = o.id
        WHERE o.id = $1
      `;

      const result = await db.query(orgQuery, [organizationId]);

      if (result.rows[0]) {
        this.scheduleOrgSync({
          ...result.rows[0],
          sync_enabled: enabled,
          sync_hour: syncHour || 2
        });
      }
    }

    logger.info(`Updated signature sync schedule for org ${organizationId}: enabled=${enabled}, hour=${syncHour}`);
  }

  /**
   * Get sync status for an organization
   */
  async getSyncStatus(organizationId: string): Promise<any> {
    // Use key-value pattern for organization_settings
    const query = `
      SELECT
        COALESCE(
          (SELECT value::boolean FROM organization_settings
           WHERE organization_id = $1 AND key = 'signature_sync_enabled'),
          false
        ) as enabled,
        COALESCE(
          (SELECT value::integer FROM organization_settings
           WHERE organization_id = $1 AND key = 'signature_sync_hour'),
          2
        ) as sync_hour,
        (
          SELECT json_build_object(
            'id', id,
            'type', sync_type,
            'started_at', started_at,
            'completed_at', completed_at,
            'users_processed', users_processed,
            'users_succeeded', users_succeeded,
            'users_failed', users_failed,
            'error_summary', error_summary
          )
          FROM signature_sync_logs
          WHERE organization_id = $1
          ORDER BY started_at DESC
          LIMIT 1
        ) as last_sync,
        (
          SELECT COUNT(*)
          FROM signature_campaigns
          WHERE organization_id = $1
            AND status = 'active'
        ) as active_campaigns
    `;

    const result = await db.query(query, [organizationId]);

    return result.rows[0] || {
      enabled: false,
      sync_hour: 2,
      last_sync: null,
      active_campaigns: 0
    };
  }
}

// Export singleton instance
export const signatureScheduler = new SignatureSchedulerService();