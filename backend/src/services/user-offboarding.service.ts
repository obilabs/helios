/**
 * User Offboarding Service
 *
 * Handles automated user offboarding with Google Workspace integration.
 * Transfers data, revokes access, suspends/deletes accounts, etc.
 */

import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { db } from '../database/connection.js';
import { decodeServiceAccountKey } from './gw-credentials.js';
import { logger } from '../utils/logger.js';
import { lifecycleLogService } from './lifecycle-log.service.js';
import {
  OffboardingTemplate,
  OffboardingConfig,
  CreateOffboardingTemplateDTO,
  UpdateOffboardingTemplateDTO,
  OFFBOARDING_STEPS,
} from '../types/user-lifecycle.js';

interface OffboardingResult {
  success: boolean;
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

class UserOffboardingService {
  // ==========================================
  // TEMPLATE CRUD OPERATIONS
  // ==========================================

  /**
   * Get all offboarding templates for an organization
   */
  async getTemplates(
    organizationId: string,
    options: { isActive?: boolean } = {}
  ): Promise<OffboardingTemplate[]> {
    let query = `
      SELECT * FROM offboarding_templates
      WHERE organization_id = $1
    `;
    const values: (string | boolean)[] = [organizationId];
    let paramIndex = 2;

    if (options.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      values.push(options.isActive);
      paramIndex++;
    }

    query += ` ORDER BY is_default DESC, name ASC`;

    const result = await db.query(query, values);
    return result.rows.map((row: any) => this.mapRowToTemplate(row));
  }

  /**
   * Get a single offboarding template by ID
   */
  async getTemplate(id: string): Promise<OffboardingTemplate | null> {
    const result = await db.query(
      'SELECT * FROM offboarding_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Get the default offboarding template for an organization
   */
  async getDefaultTemplate(organizationId: string): Promise<OffboardingTemplate | null> {
    const result = await db.query(
      'SELECT * FROM offboarding_templates WHERE organization_id = $1 AND is_default = true AND is_active = true',
      [organizationId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Create a new offboarding template
   */
  async createTemplate(
    organizationId: string,
    dto: CreateOffboardingTemplateDTO,
    createdBy?: string
  ): Promise<OffboardingTemplate> {
    const query = `
      INSERT INTO offboarding_templates (
        organization_id,
        name,
        description,
        drive_action,
        drive_transfer_to_user_id,
        drive_archive_shared_drive_id,
        drive_delete_after_days,
        email_action,
        email_forward_to_user_id,
        email_forward_duration_days,
        email_auto_reply_message,
        email_auto_reply_subject,
        calendar_decline_future_meetings,
        calendar_transfer_meeting_ownership,
        calendar_transfer_to_manager,
        calendar_transfer_to_user_id,
        remove_from_all_groups,
        remove_from_shared_drives,
        revoke_oauth_tokens,
        revoke_app_passwords,
        sign_out_all_devices,
        reset_password,
        remove_signature,
        set_offboarding_signature,
        offboarding_signature_text,
        wipe_mobile_devices,
        wipe_requires_confirmation,
        account_action,
        delete_account,
        delete_after_days,
        license_action,
        notify_manager,
        notify_it_admin,
        notify_hr,
        notification_email_addresses,
        notification_message,
        is_active,
        is_default,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39)
      RETURNING *
    `;

    const values = [
      organizationId,
      dto.name,
      dto.description || null,
      dto.driveAction || 'transfer_manager',
      dto.driveTransferToUserId || null,
      dto.driveArchiveSharedDriveId || null,
      dto.driveDeleteAfterDays ?? 90,
      dto.emailAction || 'forward_manager',
      dto.emailForwardToUserId || null,
      dto.emailForwardDurationDays ?? 30,
      dto.emailAutoReplyMessage || null,
      dto.emailAutoReplySubject || null,
      dto.calendarDeclineFutureMeetings ?? true,
      dto.calendarTransferMeetingOwnership ?? true,
      dto.calendarTransferToManager ?? true,
      dto.calendarTransferToUserId || null,
      dto.removeFromAllGroups ?? true,
      dto.removeFromSharedDrives ?? true,
      dto.revokeOauthTokens ?? true,
      dto.revokeAppPasswords ?? true,
      dto.signOutAllDevices ?? true,
      dto.resetPassword ?? true,
      dto.removeSignature ?? true,
      dto.setOffboardingSignature ?? false,
      dto.offboardingSignatureText || null,
      dto.wipeMobileDevices ?? false,
      dto.wipeRequiresConfirmation ?? true,
      dto.accountAction || 'suspend_on_last_day',
      dto.deleteAccount ?? false,
      dto.deleteAfterDays ?? 90,
      dto.licenseAction || 'remove_on_suspension',
      dto.notifyManager ?? true,
      dto.notifyItAdmin ?? true,
      dto.notifyHr ?? false,
      dto.notificationEmailAddresses || [],
      dto.notificationMessage || null,
      dto.isActive ?? true,
      dto.isDefault ?? false,
      createdBy || null,
    ];

    const result = await db.query(query, values);
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Update an offboarding template
   */
  async updateTemplate(
    id: string,
    dto: UpdateOffboardingTemplateDTO
  ): Promise<OffboardingTemplate | null> {
    const template = await this.getTemplate(id);
    if (!template) return null;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMappings: Record<string, string> = {
      name: 'name',
      description: 'description',
      driveAction: 'drive_action',
      driveTransferToUserId: 'drive_transfer_to_user_id',
      driveArchiveSharedDriveId: 'drive_archive_shared_drive_id',
      driveDeleteAfterDays: 'drive_delete_after_days',
      emailAction: 'email_action',
      emailForwardToUserId: 'email_forward_to_user_id',
      emailForwardDurationDays: 'email_forward_duration_days',
      emailAutoReplyMessage: 'email_auto_reply_message',
      emailAutoReplySubject: 'email_auto_reply_subject',
      calendarDeclineFutureMeetings: 'calendar_decline_future_meetings',
      calendarTransferMeetingOwnership: 'calendar_transfer_meeting_ownership',
      calendarTransferToManager: 'calendar_transfer_to_manager',
      calendarTransferToUserId: 'calendar_transfer_to_user_id',
      removeFromAllGroups: 'remove_from_all_groups',
      removeFromSharedDrives: 'remove_from_shared_drives',
      revokeOauthTokens: 'revoke_oauth_tokens',
      revokeAppPasswords: 'revoke_app_passwords',
      signOutAllDevices: 'sign_out_all_devices',
      resetPassword: 'reset_password',
      removeSignature: 'remove_signature',
      setOffboardingSignature: 'set_offboarding_signature',
      offboardingSignatureText: 'offboarding_signature_text',
      wipeMobileDevices: 'wipe_mobile_devices',
      wipeRequiresConfirmation: 'wipe_requires_confirmation',
      accountAction: 'account_action',
      deleteAccount: 'delete_account',
      deleteAfterDays: 'delete_after_days',
      licenseAction: 'license_action',
      notifyManager: 'notify_manager',
      notifyItAdmin: 'notify_it_admin',
      notifyHr: 'notify_hr',
      notificationMessage: 'notification_message',
      isActive: 'is_active',
      isDefault: 'is_default',
    };

    for (const [dtoKey, dbColumn] of Object.entries(fieldMappings)) {
      if (dto[dtoKey as keyof UpdateOffboardingTemplateDTO] !== undefined) {
        updates.push(`${dbColumn} = $${paramIndex}`);
        values.push(dto[dtoKey as keyof UpdateOffboardingTemplateDTO]);
        paramIndex++;
      }
    }

    // Handle array field separately
    if (dto.notificationEmailAddresses !== undefined) {
      updates.push(`notification_email_addresses = $${paramIndex}`);
      values.push(dto.notificationEmailAddresses);
      paramIndex++;
    }

    if (updates.length === 0) return template;

    values.push(id);
    const query = `
      UPDATE offboarding_templates
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Delete an offboarding template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM offboarding_templates WHERE id = $1',
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ==========================================
  // OFFBOARDING EXECUTION
  // ==========================================

  /**
   * Execute offboarding for a user
   */
  async executeOffboarding(
    organizationId: string,
    config: OffboardingConfig,
    options: {
      actionId?: string;
      triggeredBy?: string;
      triggeredByUserId?: string;
    } = {}
  ): Promise<OffboardingResult> {
    const result: OffboardingResult = {
      success: true,
      errors: [],
      stepsCompleted: [],
      stepsFailed: [],
      stepsSkipped: [],
    };

    const logOptions = {
      actionId: options.actionId,
      userId: config.userId,
      userEmail: config.userEmail,
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
          'offboard',
          'validate_config',
          validationErrors.join('; '),
          { ...logOptions, stepOrder, durationMs: Date.now() - validateStart }
        );
        return result;
      }
      await lifecycleLogService.logSuccess(
        organizationId,
        'offboard',
        'validate_config',
        { ...logOptions, stepOrder, durationMs: Date.now() - validateStart }
      );
      result.stepsCompleted.push('validate_config');

      // Step 2: Transfer Drive files
      if (config.driveAction !== 'keep') {
        stepOrder++;
        const driveStart = Date.now();
        try {
          await this.handleDriveTransfer(organizationId, config);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'transfer_drive_files',
            {
              ...logOptions,
              stepOrder,
              durationMs: Date.now() - driveStart,
              details: { action: config.driveAction },
            }
          );
          result.stepsCompleted.push('transfer_drive_files');
        } catch (error: any) {
          result.errors.push(`Failed to transfer Drive files: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'transfer_drive_files',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - driveStart }
          );
          result.stepsFailed.push('transfer_drive_files');
        }
      } else {
        result.stepsSkipped.push('transfer_drive_files');
      }

      // Step 3: Setup email forwarding
      if (config.emailAction === 'forward_manager' || config.emailAction === 'forward_user') {
        stepOrder++;
        const emailStart = Date.now();
        try {
          await this.setupEmailForwarding(organizationId, config);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'setup_email_forwarding',
            {
              ...logOptions,
              stepOrder,
              durationMs: Date.now() - emailStart,
            }
          );
          result.stepsCompleted.push('setup_email_forwarding');
        } catch (error: any) {
          result.errors.push(`Failed to setup email forwarding: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'setup_email_forwarding',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - emailStart }
          );
          result.stepsFailed.push('setup_email_forwarding');
        }
      } else {
        result.stepsSkipped.push('setup_email_forwarding');
      }

      // Step 4: Set auto-reply
      if (config.emailAction === 'auto_reply' && config.emailAutoReplyMessage) {
        stepOrder++;
        const autoReplyStart = Date.now();
        try {
          await this.setAutoReply(organizationId, config);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'set_auto_reply',
            { ...logOptions, stepOrder, durationMs: Date.now() - autoReplyStart }
          );
          result.stepsCompleted.push('set_auto_reply');
        } catch (error: any) {
          result.errors.push(`Failed to set auto-reply: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'set_auto_reply',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - autoReplyStart }
          );
          result.stepsFailed.push('set_auto_reply');
        }
      } else {
        result.stepsSkipped.push('set_auto_reply');
      }

      // Step 5: Remove from groups
      if (config.removeFromAllGroups) {
        stepOrder++;
        const groupsStart = Date.now();
        try {
          await this.removeFromAllGroups(organizationId, config.userEmail);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'remove_from_groups',
            { ...logOptions, stepOrder, durationMs: Date.now() - groupsStart }
          );
          result.stepsCompleted.push('remove_from_groups');
        } catch (error: any) {
          result.errors.push(`Failed to remove from groups: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'remove_from_groups',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - groupsStart }
          );
          result.stepsFailed.push('remove_from_groups');
        }
      } else {
        result.stepsSkipped.push('remove_from_groups');
      }

      // Step 6: Revoke OAuth tokens
      if (config.revokeOauthTokens) {
        stepOrder++;
        const revokeStart = Date.now();
        try {
          await this.revokeOAuthTokens(organizationId, config.userEmail);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'revoke_oauth_tokens',
            { ...logOptions, stepOrder, durationMs: Date.now() - revokeStart }
          );
          result.stepsCompleted.push('revoke_oauth_tokens');
        } catch (error: any) {
          result.errors.push(`Failed to revoke OAuth tokens: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'revoke_oauth_tokens',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - revokeStart }
          );
          result.stepsFailed.push('revoke_oauth_tokens');
        }
      } else {
        result.stepsSkipped.push('revoke_oauth_tokens');
      }

      // Step 7: Sign out all devices
      if (config.signOutAllDevices) {
        stepOrder++;
        const signOutStart = Date.now();
        try {
          await this.signOutAllDevices(organizationId, config.userEmail);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'sign_out_devices',
            { ...logOptions, stepOrder, durationMs: Date.now() - signOutStart }
          );
          result.stepsCompleted.push('sign_out_devices');
        } catch (error: any) {
          result.errors.push(`Failed to sign out devices: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'sign_out_devices',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - signOutStart }
          );
          result.stepsFailed.push('sign_out_devices');
        }
      } else {
        result.stepsSkipped.push('sign_out_devices');
      }

      // Step 8: Reset password
      if (config.resetPassword) {
        stepOrder++;
        const resetStart = Date.now();
        try {
          await this.resetPassword(organizationId, config.userEmail);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'reset_password',
            { ...logOptions, stepOrder, durationMs: Date.now() - resetStart }
          );
          result.stepsCompleted.push('reset_password');
        } catch (error: any) {
          result.errors.push(`Failed to reset password: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'reset_password',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - resetStart }
          );
          result.stepsFailed.push('reset_password');
        }
      } else {
        result.stepsSkipped.push('reset_password');
      }

      // Step 9: Suspend account (if immediate)
      if (config.accountAction === 'suspend_immediately') {
        stepOrder++;
        const suspendStart = Date.now();
        try {
          await this.suspendUser(organizationId, config.userEmail);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'suspend_account',
            { ...logOptions, stepOrder, durationMs: Date.now() - suspendStart }
          );
          result.stepsCompleted.push('suspend_account');

          // Update Helios user status
          await this.updateHeliosUserStatus(config.userId, 'suspended');
        } catch (error: any) {
          result.errors.push(`Failed to suspend account: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'suspend_account',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - suspendStart }
          );
          result.stepsFailed.push('suspend_account');
        }
      } else if (config.accountAction === 'suspend_on_last_day') {
        result.stepsSkipped.push('suspend_account'); // Will be handled by scheduler
      } else {
        result.stepsSkipped.push('suspend_account');
      }

      // Step 10: Send notifications
      if (config.notifyManager || config.notifyItAdmin || config.notifyHr) {
        stepOrder++;
        const notifyStart = Date.now();
        try {
          await this.sendNotifications(config);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'send_notifications',
            { ...logOptions, stepOrder, durationMs: Date.now() - notifyStart }
          );
          result.stepsCompleted.push('send_notifications');
        } catch (error: any) {
          result.errors.push(`Failed to send notifications: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'send_notifications',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - notifyStart }
          );
          result.stepsFailed.push('send_notifications');
        }
      }

      // Step 11: Finalize
      stepOrder++;
      await lifecycleLogService.logSuccess(
        organizationId,
        'offboard',
        'finalize',
        {
          ...logOptions,
          stepOrder,
          details: {
            stepsCompleted: result.stepsCompleted.length,
            stepsFailed: result.stepsFailed.length,
            stepsSkipped: result.stepsSkipped.length,
          },
        }
      );
      result.stepsCompleted.push('finalize');

      result.success = result.stepsFailed.length === 0;

    } catch (error: any) {
      logger.error('Offboarding failed', {
        organizationId,
        email: config.userEmail,
        error: error.message,
      });
      result.success = false;
      result.errors.push(`Offboarding failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Execute offboarding from a template
   */
  async executeFromTemplate(
    organizationId: string,
    templateId: string,
    userId: string,
    options: {
      actionId?: string;
      triggeredBy?: string;
      triggeredByUserId?: string;
      lastDay?: Date;
      configOverrides?: Partial<OffboardingConfig>;
    } = {}
  ): Promise<OffboardingResult> {
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

    // Get user details
    const userResult = await db.query(
      `SELECT email, reporting_manager_id FROM organization_users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        success: false,
        errors: ['User not found'],
        stepsCompleted: [],
        stepsFailed: ['validate_config'],
        stepsSkipped: [],
      };
    }

    const user = userResult.rows[0];

    // Get manager email if needed
    let managerEmail: string | undefined;
    if (user.reporting_manager_id) {
      const managerResult = await db.query(
        'SELECT email FROM organization_users WHERE id = $1',
        [user.reporting_manager_id]
      );
      managerEmail = managerResult.rows[0]?.email;
    }

    // Build config from template + user details
    const config: OffboardingConfig = {
      userId,
      userEmail: user.email,
      managerId: user.reporting_manager_id,
      managerEmail,
      lastDay: options.lastDay,

      // Drive
      driveAction: template.driveAction,
      driveTransferToUserId: template.driveTransferToUserId || undefined,
      driveArchiveSharedDriveId: template.driveArchiveSharedDriveId || undefined,

      // Email
      emailAction: template.emailAction,
      emailForwardToUserId: template.emailForwardToUserId || undefined,
      emailForwardDurationDays: template.emailForwardDurationDays,
      emailAutoReplyMessage: template.emailAutoReplyMessage,
      emailAutoReplySubject: template.emailAutoReplySubject,

      // Calendar
      calendarDeclineFutureMeetings: template.calendarDeclineFutureMeetings,
      calendarTransferMeetingOwnership: template.calendarTransferMeetingOwnership,
      calendarTransferToUserId: template.calendarTransferToUserId || undefined,

      // Revocation
      removeFromAllGroups: template.removeFromAllGroups,
      removeFromSharedDrives: template.removeFromSharedDrives,
      revokeOauthTokens: template.revokeOauthTokens,
      revokeAppPasswords: template.revokeAppPasswords,
      signOutAllDevices: template.signOutAllDevices,
      resetPassword: template.resetPassword,

      // Signature
      removeSignature: template.removeSignature,
      setOffboardingSignature: template.setOffboardingSignature,
      offboardingSignatureText: template.offboardingSignatureText,

      // Mobile
      wipeMobileDevices: template.wipeMobileDevices,

      // Account
      accountAction: template.accountAction,
      deleteAccount: template.deleteAccount,
      deleteAfterDays: template.deleteAfterDays,

      // License
      licenseAction: template.licenseAction,

      // Notifications
      notifyManager: template.notifyManager,
      notifyItAdmin: template.notifyItAdmin,
      notifyHr: template.notifyHr,
      notificationEmailAddresses: template.notificationEmailAddresses,
      notificationMessage: template.notificationMessage || undefined,

      ...options.configOverrides,
    };

    return this.executeOffboarding(organizationId, config, options);
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private validateConfig(config: OffboardingConfig): string[] {
    const errors: string[] = [];

    if (!config.userId) errors.push('User ID is required');
    if (!config.userEmail) errors.push('User email is required');

    return errors;
  }

  private async handleDriveTransfer(
    organizationId: string,
    config: OffboardingConfig
  ): Promise<void> {
    // Note: Full Drive transfer requires the Data Transfer API
    // For now, we'll log the intended action
    logger.info('Drive transfer would be executed', {
      action: config.driveAction,
      userEmail: config.userEmail,
      transferTo: config.driveTransferToUserId || 'manager',
    });

    // TODO: Implement actual Drive transfer using Data Transfer API
    // This requires additional Google API scopes and is complex
  }

  private async setupEmailForwarding(
    organizationId: string,
    config: OffboardingConfig
  ): Promise<void> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
      subject: adminEmail,
    });

    const gmail = google.gmail({ version: 'v1', auth: jwtClient });

    const forwardTo = config.emailForwardToUserId
      ? await this.getUserEmail(config.emailForwardToUserId)
      : config.managerEmail;

    if (!forwardTo) {
      throw new Error('No forwarding address available');
    }

    // Note: This requires the user's consent or using the Gmail API with proper delegation
    // For now, log the intended action
    logger.info('Email forwarding would be setup', {
      from: config.userEmail,
      to: forwardTo,
      duration: config.emailForwardDurationDays,
    });

    // TODO: Implement actual email forwarding
    // Requires user delegation or admin API
  }

  private async setAutoReply(
    organizationId: string,
    config: OffboardingConfig
  ): Promise<void> {
    logger.info('Auto-reply would be set', {
      userEmail: config.userEmail,
      subject: config.emailAutoReplySubject,
    });

    // TODO: Implement actual vacation responder setup
  }

  private async removeFromAllGroups(
    organizationId: string,
    userEmail: string
  ): Promise<void> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const adminClient = this.createAdminClient(credentials, adminEmail);

    // Get all groups the user belongs to
    const groupsResponse = await adminClient.groups.list({
      userKey: userEmail,
    });

    const groups = groupsResponse.data.groups || [];

    for (const group of groups) {
      try {
        await adminClient.members.delete({
          groupKey: group.id!,
          memberKey: userEmail,
        });
        logger.info('Removed user from group', {
          userEmail,
          groupId: group.id,
          groupEmail: group.email,
        });
      } catch (error: any) {
        logger.error('Failed to remove user from group', {
          userEmail,
          groupId: group.id,
          error: error.message,
        });
      }
    }
  }

  private async revokeOAuthTokens(
    organizationId: string,
    userEmail: string
  ): Promise<void> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const adminClient = this.createAdminClient(credentials, adminEmail);

    // Get all tokens
    const tokensResponse = await adminClient.tokens.list({
      userKey: userEmail,
    });

    const tokens = tokensResponse.data.items || [];

    for (const token of tokens) {
      try {
        await adminClient.tokens.delete({
          userKey: userEmail,
          clientId: token.clientId!,
        });
        logger.info('Revoked OAuth token', {
          userEmail,
          clientId: token.clientId,
        });
      } catch (error: any) {
        logger.error('Failed to revoke token', {
          userEmail,
          clientId: token.clientId,
          error: error.message,
        });
      }
    }
  }

  private async signOutAllDevices(
    organizationId: string,
    userEmail: string
  ): Promise<void> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const adminClient = this.createAdminClient(credentials, adminEmail);

    await adminClient.users.signOut({
      userKey: userEmail,
    });

    logger.info('Signed out user from all devices', { userEmail });
  }

  private async resetPassword(
    organizationId: string,
    userEmail: string
  ): Promise<void> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const adminClient = this.createAdminClient(credentials, adminEmail);

    // Generate a random password
    const newPassword = this.generateRandomPassword();

    await adminClient.users.update({
      userKey: userEmail,
      requestBody: {
        password: newPassword,
        changePasswordAtNextLogin: true,
      },
    });

    logger.info('Reset password for user', { userEmail });
  }

  private async suspendUser(
    organizationId: string,
    userEmail: string
  ): Promise<void> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const adminClient = this.createAdminClient(credentials, adminEmail);

    await adminClient.users.update({
      userKey: userEmail,
      requestBody: {
        suspended: true,
      },
    });

    logger.info('Suspended user', { userEmail });
  }

  private async updateHeliosUserStatus(
    userId: string,
    status: string
  ): Promise<void> {
    await db.query(
      `UPDATE organization_users SET user_status = $1, is_active = false WHERE id = $2`,
      [status, userId]
    );
  }

  private async sendNotifications(config: OffboardingConfig): Promise<void> {
    // TODO: Implement actual email notifications
    logger.info('Notifications would be sent', {
      userEmail: config.userEmail,
      notifyManager: config.notifyManager,
      notifyItAdmin: config.notifyItAdmin,
      notifyHr: config.notifyHr,
    });
  }

  private async getUserEmail(userId: string): Promise<string | null> {
    const result = await db.query(
      'SELECT email FROM organization_users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.email || null;
  }

  private generateRandomPassword(): string {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const specialChars = '!@#$%^&*';
    let password = '';

    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    password += specialChars.charAt(Math.floor(Math.random() * specialChars.length));

    return password;
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
        'https://www.googleapis.com/auth/admin.directory.device.mobile',
      ],
      subject: adminEmail,
    });

    return google.admin({ version: 'directory_v1', auth: jwtClient });
  }

  // ==========================================
  // ROW MAPPING
  // ==========================================

  private mapRowToTemplate(row: any): OffboardingTemplate {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,

      // Drive
      driveAction: row.drive_action,
      driveTransferToUserId: row.drive_transfer_to_user_id,
      driveArchiveSharedDriveId: row.drive_archive_shared_drive_id,
      driveDeleteAfterDays: row.drive_delete_after_days,

      // Email
      emailAction: row.email_action,
      emailForwardToUserId: row.email_forward_to_user_id,
      emailForwardDurationDays: row.email_forward_duration_days,
      emailAutoReplyMessage: row.email_auto_reply_message,
      emailAutoReplySubject: row.email_auto_reply_subject,

      // Calendar
      calendarDeclineFutureMeetings: row.calendar_decline_future_meetings,
      calendarTransferMeetingOwnership: row.calendar_transfer_meeting_ownership,
      calendarTransferToManager: row.calendar_transfer_to_manager,
      calendarTransferToUserId: row.calendar_transfer_to_user_id,

      // Revocation
      removeFromAllGroups: row.remove_from_all_groups,
      removeFromSharedDrives: row.remove_from_shared_drives,
      revokeOauthTokens: row.revoke_oauth_tokens,
      revokeAppPasswords: row.revoke_app_passwords,
      signOutAllDevices: row.sign_out_all_devices,
      resetPassword: row.reset_password,

      // Signature
      removeSignature: row.remove_signature,
      setOffboardingSignature: row.set_offboarding_signature,
      offboardingSignatureText: row.offboarding_signature_text,

      // Mobile
      wipeMobileDevices: row.wipe_mobile_devices,
      wipeRequiresConfirmation: row.wipe_requires_confirmation,

      // Account
      accountAction: row.account_action,
      deleteAccount: row.delete_account,
      deleteAfterDays: row.delete_after_days,

      // License
      licenseAction: row.license_action,

      // Notifications
      notifyManager: row.notify_manager,
      notifyItAdmin: row.notify_it_admin,
      notifyHr: row.notify_hr,
      notificationEmailAddresses: row.notification_email_addresses || [],
      notificationMessage: row.notification_message,

      // Status
      isActive: row.is_active,
      isDefault: row.is_default,

      // Audit
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const userOffboardingService = new UserOffboardingService();
export default userOffboardingService;
