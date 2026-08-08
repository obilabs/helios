/**
 * User Onboarding Service
 *
 * Handles automated user onboarding with Google Workspace integration.
 * Creates users, adds to groups, sets signatures, etc.
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import bcrypt from 'bcryptjs';
import { decodeServiceAccountKey } from './gw-credentials.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { lifecycleLogService } from './lifecycle-log.service.js';
import {
  OnboardingTemplate,
  OnboardingConfig,
  CreateOnboardingTemplateDTO,
  UpdateOnboardingTemplateDTO,
  ONBOARDING_STEPS,
  OnboardingStep,
} from '../types/user-lifecycle.js';

interface OnboardingResult {
  success: boolean;
  userId?: string;
  googleUserId?: string;
  errors: string[];
  stepsCompleted: string[];
  stepsFailed: string[];
  stepsSkipped: string[];
}

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
}

class UserOnboardingService {
  // ==========================================
  // TEMPLATE CRUD OPERATIONS
  // ==========================================

  /**
   * Get all onboarding templates for an organization
   */
  async getTemplates(
    organizationId: string,
    options: { isActive?: boolean; departmentId?: string } = {}
  ): Promise<OnboardingTemplate[]> {
    let query = `
      SELECT * FROM onboarding_templates
      WHERE organization_id = $1
    `;
    const values: (string | boolean)[] = [organizationId];
    let paramIndex = 2;

    if (options.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      values.push(options.isActive);
      paramIndex++;
    }

    if (options.departmentId) {
      query += ` AND department_id = $${paramIndex}`;
      values.push(options.departmentId);
      paramIndex++;
    }

    query += ` ORDER BY is_default DESC, name ASC`;

    const result = await db.query(query, values);
    return result.rows.map((row: any) => this.mapRowToTemplate(row));
  }

  /**
   * Get a single onboarding template by ID
   */
  async getTemplate(id: string): Promise<OnboardingTemplate | null> {
    const result = await db.query(
      'SELECT * FROM onboarding_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Get the default onboarding template for an organization
   */
  async getDefaultTemplate(organizationId: string): Promise<OnboardingTemplate | null> {
    const result = await db.query(
      'SELECT * FROM onboarding_templates WHERE organization_id = $1 AND is_default = true AND is_active = true',
      [organizationId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Create a new onboarding template
   */
  async createTemplate(
    organizationId: string,
    dto: CreateOnboardingTemplateDTO,
    createdBy?: string
  ): Promise<OnboardingTemplate> {
    const query = `
      INSERT INTO onboarding_templates (
        organization_id,
        name,
        description,
        department_id,
        google_license_sku,
        google_org_unit_path,
        google_services,
        group_ids,
        shared_drive_access,
        calendar_subscriptions,
        signature_template_id,
        default_job_title,
        default_manager_id,
        send_welcome_email,
        welcome_email_subject,
        welcome_email_body,
        is_active,
        is_default,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const values = [
      organizationId,
      dto.name,
      dto.description || null,
      dto.departmentId || null,
      dto.googleLicenseSku || null,
      dto.googleOrgUnitPath || null,
      JSON.stringify(dto.googleServices || {
        gmail: true,
        drive: true,
        calendar: true,
        meet: true,
        chat: true,
        docs: true,
        sheets: true,
        slides: true,
      }),
      dto.groupIds || [],
      JSON.stringify(dto.sharedDriveAccess || []),
      dto.calendarSubscriptions || [],
      dto.signatureTemplateId || null,
      dto.defaultJobTitle || null,
      dto.defaultManagerId || null,
      dto.sendWelcomeEmail ?? true,
      dto.welcomeEmailSubject || 'Welcome to {{company_name}}',
      dto.welcomeEmailBody || this.getDefaultWelcomeEmailBody(),
      dto.isActive ?? true,
      dto.isDefault ?? false,
      createdBy || null,
    ];

    const result = await db.query(query, values);
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Update an onboarding template
   */
  async updateTemplate(
    id: string,
    dto: UpdateOnboardingTemplateDTO
  ): Promise<OnboardingTemplate | null> {
    const template = await this.getTemplate(id);
    if (!template) return null;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      name: 'name',
      description: 'description',
      departmentId: 'department_id',
      googleLicenseSku: 'google_license_sku',
      googleOrgUnitPath: 'google_org_unit_path',
      defaultJobTitle: 'default_job_title',
      defaultManagerId: 'default_manager_id',
      signatureTemplateId: 'signature_template_id',
      sendWelcomeEmail: 'send_welcome_email',
      welcomeEmailSubject: 'welcome_email_subject',
      welcomeEmailBody: 'welcome_email_body',
      isActive: 'is_active',
      isDefault: 'is_default',
    };

    for (const [dtoKey, dbColumn] of Object.entries(fieldMappings)) {
      if (dto[dtoKey as keyof UpdateOnboardingTemplateDTO] !== undefined) {
        updates.push(`${dbColumn} = $${paramIndex}`);
        values.push(dto[dtoKey as keyof UpdateOnboardingTemplateDTO]);
        paramIndex++;
      }
    }

    // Handle JSON fields separately
    if (dto.googleServices !== undefined) {
      updates.push(`google_services = $${paramIndex}`);
      values.push(JSON.stringify(dto.googleServices));
      paramIndex++;
    }

    if (dto.groupIds !== undefined) {
      updates.push(`group_ids = $${paramIndex}`);
      values.push(dto.groupIds);
      paramIndex++;
    }

    if (dto.sharedDriveAccess !== undefined) {
      updates.push(`shared_drive_access = $${paramIndex}`);
      values.push(JSON.stringify(dto.sharedDriveAccess));
      paramIndex++;
    }

    if (dto.calendarSubscriptions !== undefined) {
      updates.push(`calendar_subscriptions = $${paramIndex}`);
      values.push(dto.calendarSubscriptions);
      paramIndex++;
    }

    if (updates.length === 0) return template;

    values.push(id);
    const query = `
      UPDATE onboarding_templates
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Delete an onboarding template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM onboarding_templates WHERE id = $1',
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ==========================================
  // ONBOARDING EXECUTION
  // ==========================================

  /**
   * Execute onboarding for a new user
   */
  async executeOnboarding(
    organizationId: string,
    config: OnboardingConfig,
    options: {
      actionId?: string;
      triggeredBy?: string;
      triggeredByUserId?: string;
    } = {}
  ): Promise<OnboardingResult> {
    const result: OnboardingResult = {
      success: true,
      errors: [],
      stepsCompleted: [],
      stepsFailed: [],
      stepsSkipped: [],
    };

    const logOptions = {
      actionId: options.actionId,
      userEmail: config.email,
      triggeredBy: options.triggeredBy as any || 'system',
      triggeredByUserId: options.triggeredByUserId,
    };

    let stepOrder = 0;

    try {
      // Step 1: Validate configuration
      stepOrder++;
      const validateStart = Date.now();
      const validationErrors = this.validateConfig(config);
      if (validationErrors.length > 0) {
        result.errors.push(...validationErrors);
        result.success = false;
        await lifecycleLogService.logFailure(
          organizationId,
          'onboard',
          'validate_config',
          validationErrors.join('; '),
          { ...logOptions, stepOrder, durationMs: Date.now() - validateStart }
        );
        return result;
      }
      await lifecycleLogService.logSuccess(
        organizationId,
        'onboard',
        'validate_config',
        { ...logOptions, stepOrder, durationMs: Date.now() - validateStart }
      );
      result.stepsCompleted.push('validate_config');

      // Step 2: Create Helios user record
      stepOrder++;
      const heliosStart = Date.now();
      try {
        const heliosUser = await this.createHeliosUser(organizationId, config);
        result.userId = heliosUser.id;
        await lifecycleLogService.logSuccess(
          organizationId,
          'onboard',
          'create_helios_user',
          {
            ...logOptions,
            userId: heliosUser.id,
            stepOrder,
            durationMs: Date.now() - heliosStart,
            details: { email: config.email },
          }
        );
        result.stepsCompleted.push('create_helios_user');
      } catch (error: any) {
        result.errors.push(`Failed to create Helios user: ${error.message}`);
        result.success = false;
        await lifecycleLogService.logFailure(
          organizationId,
          'onboard',
          'create_helios_user',
          error,
          { ...logOptions, stepOrder, durationMs: Date.now() - heliosStart }
        );
        result.stepsFailed.push('create_helios_user');
        // Can't continue without Helios user
        return result;
      }

      // Step 3: Create Google Workspace account
      stepOrder++;
      const gwStart = Date.now();
      try {
        const gwUser = await this.createGoogleUser(organizationId, config);
        result.googleUserId = gwUser.id;
        await lifecycleLogService.logSuccess(
          organizationId,
          'onboard',
          'create_google_account',
          {
            ...logOptions,
            userId: result.userId,
            stepOrder,
            durationMs: Date.now() - gwStart,
            targetResourceType: 'google_user',
            targetResourceId: gwUser.id,
            targetResourceName: config.email,
          }
        );
        result.stepsCompleted.push('create_google_account');

        // Update Helios user with Google ID
        await this.linkGoogleUser(result.userId!, gwUser.id, config.email);
      } catch (error: any) {
        result.errors.push(`Failed to create Google account: ${error.message}`);
        await lifecycleLogService.logFailure(
          organizationId,
          'onboard',
          'create_google_account',
          error,
          { ...logOptions, userId: result.userId, stepOrder, durationMs: Date.now() - gwStart }
        );
        result.stepsFailed.push('create_google_account');
        // Continue with other steps even if Google creation fails
      }

      // Step 4: Set Org Unit (if Google account was created)
      if (result.googleUserId && config.googleOrgUnitPath) {
        stepOrder++;
        const ouStart = Date.now();
        try {
          await this.setOrgUnit(organizationId, config.email, config.googleOrgUnitPath);
          await lifecycleLogService.logSuccess(
            organizationId,
            'onboard',
            'set_org_unit',
            {
              ...logOptions,
              userId: result.userId,
              stepOrder,
              durationMs: Date.now() - ouStart,
              details: { orgUnitPath: config.googleOrgUnitPath },
            }
          );
          result.stepsCompleted.push('set_org_unit');
        } catch (error: any) {
          result.errors.push(`Failed to set org unit: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'onboard',
            'set_org_unit',
            error,
            { ...logOptions, userId: result.userId, stepOrder, durationMs: Date.now() - ouStart }
          );
          result.stepsFailed.push('set_org_unit');
        }
      } else if (config.googleOrgUnitPath) {
        result.stepsSkipped.push('set_org_unit');
      }

      // Step 5: Add to groups
      if (config.groupIds && config.groupIds.length > 0) {
        stepOrder++;
        const groupStart = Date.now();
        const groupResults = await this.addToGroups(organizationId, config.email, config.groupIds);

        if (groupResults.failed.length === 0) {
          await lifecycleLogService.logSuccess(
            organizationId,
            'onboard',
            'add_to_groups',
            {
              ...logOptions,
              userId: result.userId,
              stepOrder,
              durationMs: Date.now() - groupStart,
              details: { groups: groupResults.succeeded },
            }
          );
          result.stepsCompleted.push('add_to_groups');
        } else {
          result.errors.push(`Failed to add to some groups: ${groupResults.failed.join(', ')}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'onboard',
            'add_to_groups',
            `Partial failure: ${groupResults.failed.join(', ')}`,
            {
              ...logOptions,
              userId: result.userId,
              stepOrder,
              durationMs: Date.now() - groupStart,
              details: { succeeded: groupResults.succeeded, failed: groupResults.failed },
            }
          );
          result.stepsFailed.push('add_to_groups');
        }
      }

      // Step 6: Add to Shared Drives
      if (config.sharedDriveAccess && config.sharedDriveAccess.length > 0) {
        stepOrder++;
        const driveStart = Date.now();
        try {
          await this.addToSharedDrives(organizationId, config.email, config.sharedDriveAccess);
          await lifecycleLogService.logSuccess(
            organizationId,
            'onboard',
            'add_to_shared_drives',
            {
              ...logOptions,
              userId: result.userId,
              stepOrder,
              durationMs: Date.now() - driveStart,
              details: { drives: config.sharedDriveAccess.map(d => d.driveId) },
            }
          );
          result.stepsCompleted.push('add_to_shared_drives');
        } catch (error: any) {
          result.errors.push(`Failed to add to Shared Drives: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'onboard',
            'add_to_shared_drives',
            error,
            { ...logOptions, userId: result.userId, stepOrder, durationMs: Date.now() - driveStart }
          );
          result.stepsFailed.push('add_to_shared_drives');
        }
      }

      // Step 7: Subscribe to calendars
      if (config.calendarSubscriptions && config.calendarSubscriptions.length > 0) {
        stepOrder++;
        // Calendar subscriptions require end-user consent, skip for now
        await lifecycleLogService.logSkipped(
          organizationId,
          'onboard',
          'subscribe_to_calendars',
          'Calendar subscriptions require end-user action',
          { ...logOptions, userId: result.userId, stepOrder }
        );
        result.stepsSkipped.push('subscribe_to_calendars');
      }

      // Step 8: Set signature (placeholder - requires signature-management feature)
      if (config.signatureTemplateId) {
        stepOrder++;
        await lifecycleLogService.logSkipped(
          organizationId,
          'onboard',
          'set_signature',
          'Signature management not yet implemented',
          { ...logOptions, userId: result.userId, stepOrder }
        );
        result.stepsSkipped.push('set_signature');
      }

      // Step 9: Send welcome email
      if (config.sendWelcomeEmail && config.personalEmail) {
        stepOrder++;
        const emailStart = Date.now();
        try {
          await this.sendWelcomeEmail(config);
          await lifecycleLogService.logSuccess(
            organizationId,
            'onboard',
            'send_welcome_email',
            {
              ...logOptions,
              userId: result.userId,
              stepOrder,
              durationMs: Date.now() - emailStart,
              details: { sentTo: config.personalEmail },
            }
          );
          result.stepsCompleted.push('send_welcome_email');
        } catch (error: any) {
          result.errors.push(`Failed to send welcome email: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'onboard',
            'send_welcome_email',
            error,
            { ...logOptions, userId: result.userId, stepOrder, durationMs: Date.now() - emailStart }
          );
          result.stepsFailed.push('send_welcome_email');
        }
      }

      // Step 10: Finalize
      stepOrder++;
      await lifecycleLogService.logSuccess(
        organizationId,
        'onboard',
        'finalize',
        {
          ...logOptions,
          userId: result.userId,
          stepOrder,
          details: {
            stepsCompleted: result.stepsCompleted.length,
            stepsFailed: result.stepsFailed.length,
            stepsSkipped: result.stepsSkipped.length,
          },
        }
      );
      result.stepsCompleted.push('finalize');

      // Set overall success based on critical steps
      result.success = result.stepsFailed.length === 0 ||
        !result.stepsFailed.includes('create_helios_user');

    } catch (error: any) {
      logger.error('Onboarding failed', { organizationId, email: config.email, error: error.message });
      result.success = false;
      result.errors.push(`Onboarding failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Execute onboarding from a template
   */
  async executeFromTemplate(
    organizationId: string,
    templateId: string,
    userDetails: {
      email: string;
      firstName: string;
      lastName: string;
      personalEmail?: string;
      jobTitle?: string;
      managerId?: string;
      departmentId?: string;
    },
    options: {
      actionId?: string;
      triggeredBy?: string;
      triggeredByUserId?: string;
      configOverrides?: Partial<OnboardingConfig>;
    } = {}
  ): Promise<OnboardingResult> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      return {
        success: false,
        errors: ['Template not found'],
        stepsCompleted: [],
        stepsFailed: ['validate_config'],
        stepsSkipped: [],
      };
    }

    // Build config from template + user details
    const config: OnboardingConfig = {
      email: userDetails.email,
      firstName: userDetails.firstName,
      lastName: userDetails.lastName,
      personalEmail: userDetails.personalEmail,
      jobTitle: userDetails.jobTitle || template.defaultJobTitle || undefined,
      managerId: userDetails.managerId || template.defaultManagerId || undefined,
      departmentId: userDetails.departmentId || template.departmentId || undefined,
      googleLicenseSku: template.googleLicenseSku || undefined,
      googleOrgUnitPath: template.googleOrgUnitPath || undefined,
      googleServices: template.googleServices,
      groupIds: template.groupIds,
      sharedDriveAccess: template.sharedDriveAccess,
      calendarSubscriptions: template.calendarSubscriptions,
      signatureTemplateId: template.signatureTemplateId || undefined,
      sendWelcomeEmail: template.sendWelcomeEmail,
      welcomeEmailSubject: template.welcomeEmailSubject,
      welcomeEmailBody: template.welcomeEmailBody,
      ...options.configOverrides,
    };

    return this.executeOnboarding(organizationId, config, options);
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private validateConfig(config: OnboardingConfig): string[] {
    const errors: string[] = [];

    if (!config.email) errors.push('Email is required');
    else if (!config.email.includes('@')) errors.push('Invalid email format');

    if (!config.firstName) errors.push('First name is required');
    if (!config.lastName) errors.push('Last name is required');

    return errors;
  }

  private async createHeliosUser(organizationId: string, config: OnboardingConfig): Promise<{ id: string }> {
    // Generate a temporary password hash (user will set their own on first login)
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Store temp password in config for welcome email
    config.tempPassword = tempPassword;

    const query = `
      INSERT INTO organization_users (
        organization_id,
        email,
        password_hash,
        first_name,
        last_name,
        job_title,
        department_id,
        reporting_manager_id,
        role,
        is_active,
        email_verified,
        user_status,
        user_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'user', true, false, 'active', 'staff')
      RETURNING id
    `;

    const values = [
      organizationId,
      config.email,
      passwordHash,
      config.firstName,
      config.lastName,
      config.jobTitle || null,
      config.departmentId || null,
      config.managerId || null,
    ];

    const result = await db.query(query, values);
    return { id: result.rows[0].id };
  }

  private async createGoogleUser(organizationId: string, config: OnboardingConfig): Promise<{ id: string }> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error('Google Workspace not configured');
    }

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) {
      throw new Error('Admin email not configured');
    }

    const adminClient = this.createAdminClient(credentials, adminEmail);

    const tempPassword = config.tempPassword || this.generateTempPassword();

    const response = await adminClient.users.insert({
      requestBody: {
        primaryEmail: config.email,
        name: {
          givenName: config.firstName,
          familyName: config.lastName,
        },
        password: tempPassword,
        changePasswordAtNextLogin: true,
        orgUnitPath: config.googleOrgUnitPath || '/',
        organizations: config.jobTitle ? [{
          title: config.jobTitle,
          primary: true,
        }] : undefined,
      },
    });

    return { id: response.data.id! };
  }

  private async linkGoogleUser(userId: string, googleId: string, email: string): Promise<void> {
    // Update organization_users with Google Workspace ID
    await db.query(
      `UPDATE organization_users SET google_workspace_id = $1 WHERE id = $2`,
      [googleId, userId]
    );

    // Also create entry in gw_synced_users if it doesn't exist
    await db.query(`
      INSERT INTO gw_synced_users (
        organization_id,
        google_id,
        email,
        given_name,
        family_name,
        is_admin,
        is_suspended,
        last_sync_at
      )
      SELECT organization_id, $1, $2, first_name, last_name, false, false, NOW()
      FROM organization_users WHERE id = $3
      ON CONFLICT (google_id) DO UPDATE SET last_sync_at = NOW()
    `, [googleId, email, userId]);
  }

  private async setOrgUnit(organizationId: string, email: string, orgUnitPath: string): Promise<void> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const adminClient = this.createAdminClient(credentials, adminEmail);

    await adminClient.users.update({
      userKey: email,
      requestBody: {
        orgUnitPath,
      },
    });
  }

  private async addToGroups(
    organizationId: string,
    email: string,
    groupIds: string[]
  ): Promise<{ succeeded: string[]; failed: string[] }> {
    const succeeded: string[] = [];
    const failed: string[] = [];

    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      return { succeeded: [], failed: groupIds };
    }

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) {
      return { succeeded: [], failed: groupIds };
    }

    const adminClient = this.createAdminClient(credentials, adminEmail);

    for (const groupId of groupIds) {
      try {
        // Get the group email from access_groups table
        const groupResult = await db.query(
          'SELECT email, external_id FROM access_groups WHERE id = $1',
          [groupId]
        );

        if (groupResult.rows.length === 0) {
          failed.push(groupId);
          continue;
        }

        const groupKey = groupResult.rows[0].external_id || groupResult.rows[0].email;

        await adminClient.members.insert({
          groupKey,
          requestBody: {
            email,
            role: 'MEMBER',
          },
        });

        succeeded.push(groupId);
      } catch (error: any) {
        logger.error('Failed to add user to group', { email, groupId, error: error.message });
        failed.push(groupId);
      }
    }

    return { succeeded, failed };
  }

  private async addToSharedDrives(
    organizationId: string,
    email: string,
    drives: Array<{ driveId: string; role: string }>
  ): Promise<void> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/drive'],
      subject: adminEmail,
    });

    const driveService = google.drive({ version: 'v3', auth: jwtClient });

    for (const drive of drives) {
      await driveService.permissions.create({
        fileId: drive.driveId,
        supportsAllDrives: true,
        requestBody: {
          type: 'user',
          role: drive.role,
          emailAddress: email,
        },
      });
    }
  }

  private async sendWelcomeEmail(config: OnboardingConfig): Promise<void> {
    // TODO: Implement actual email sending
    // For now, just log the welcome email would be sent
    logger.info('Welcome email would be sent', {
      to: config.personalEmail,
      workEmail: config.email,
      tempPassword: config.tempPassword ? '***' : 'none',
    });
  }

  private generateTempPassword(): string {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const specialChars = '!@#$%^&*';
    let password = '';

    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    password += specialChars.charAt(Math.floor(Math.random() * specialChars.length));

    return password;
  }

  private getDefaultWelcomeEmailBody(): string {
    return `Hi {{first_name}},

Your account has been created:
- Email: {{work_email}}
- Temporary Password: {{temp_password}}

Please sign in at {{login_url}} and change your password immediately.

Welcome to the team!`;
  }

  // ==========================================
  // GOOGLE WORKSPACE HELPERS
  // ==========================================

  private async getCredentials(organizationId: string): Promise<ServiceAccountCredentials | null> {
    try {
      const result = await db.query(
        'SELECT service_account_key FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (result.rows.length === 0) return null;
      return decodeServiceAccountKey(result.rows[0].service_account_key);
    } catch (error) {
      return null;
    }
  }

  private async getAdminEmail(organizationId: string): Promise<string | null> {
    try {
      const result = await db.query(
        'SELECT admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );
      return result.rows[0]?.admin_email || null;
    } catch (error) {
      return null;
    }
  }

  private createAdminClient(credentials: ServiceAccountCredentials, adminEmail: string) {
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.user',
        'https://www.googleapis.com/auth/admin.directory.group',
        'https://www.googleapis.com/auth/admin.directory.orgunit',
      ],
      subject: adminEmail,
    });

    return google.admin({ version: 'directory_v1', auth: jwtClient });
  }

  // ==========================================
  // ROW MAPPING
  // ==========================================

  private mapRowToTemplate(row: any): OnboardingTemplate {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      departmentId: row.department_id,
      googleLicenseSku: row.google_license_sku,
      googleOrgUnitPath: row.google_org_unit_path,
      googleServices: row.google_services || {},
      groupIds: row.group_ids || [],
      sharedDriveAccess: row.shared_drive_access || [],
      calendarSubscriptions: row.calendar_subscriptions || [],
      signatureTemplateId: row.signature_template_id,
      defaultJobTitle: row.default_job_title,
      defaultManagerId: row.default_manager_id,
      sendWelcomeEmail: row.send_welcome_email,
      welcomeEmailSubject: row.welcome_email_subject,
      welcomeEmailBody: row.welcome_email_body,
      isActive: row.is_active,
      isDefault: row.is_default,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const userOnboardingService = new UserOnboardingService();
export default userOnboardingService;
