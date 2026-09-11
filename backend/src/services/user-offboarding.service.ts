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
import { orgPolicyService } from './org-policy.service.js';
import { userSnapshotService } from './user-snapshot.service.js';
import { lifecycleLogService } from './lifecycle-log.service.js';
import { assertNotProtectedAdmin } from './admin-protection.js';
import { googleWorkspaceService } from './google-workspace.service.js';
import { microsoftGraphService } from './microsoft-graph.service.js';
import { DATA_TRANSFER_APPLICATION_IDS } from '../config/google-application-ids.js';
import { ADMIN_SDK_CLIENT_SCOPES } from '../config/google-scopes.js';

/** Google's "already there" answers: HTTP 409, or the message says so. */
function isAlreadyExists(error: any): boolean {
  const code = error?.code ?? error?.response?.status;
  const msg = String(error?.message || error?.response?.data?.error?.message || '');
  return code === 409 || /already exists/i.test(msg);
}
import {
  OffboardingTemplate,
  OffboardingConfig,
  OffboardingConfigInput,
  OffboardingPolicy,
  DEFAULT_OFFBOARDING_POLICY,
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
        email_auto_reply_enabled,
        email_delegate_enabled,
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
        created_by,
        email_release_address,
        email_release_prefix,
        email_release_group_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44)
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
      dto.emailAutoReplyEnabled ?? false,
      dto.emailDelegateEnabled ?? true,
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
      dto.emailReleaseAddress ?? false,
      (dto.emailReleasePrefix || 'deprovisioned').trim().replace(/\.+$/, ''),
      dto.emailReleaseGroupEnabled ?? true,
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
      emailAutoReplyEnabled: 'email_auto_reply_enabled',
      emailDelegateEnabled: 'email_delegate_enabled',
      emailReleaseAddress: 'email_release_address',
      emailReleasePrefix: 'email_release_prefix',
      emailReleaseGroupEnabled: 'email_release_group_enabled',
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
      /**
       * Org OFFBOARDING POLICY defaults. When provided, they fill any config
       * field the caller left unset (two-tier: per-offboard override wins over
       * policy default). The merge is a pure, DB-free operation, so it never
       * disturbs the step-by-step audit sequence.
       */
      policy?: OffboardingPolicy;
    } = {}
  ): Promise<OffboardingResult> {
    // Apply org-policy defaults before anything else touches the config, so every
    // downstream step (and the audit log) sees the effective, policy-merged value.
    if (options.policy) {
      config = this.mergePolicyDefaults(config, options.policy);
    }

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
      // Self-lockout guard: never offboard the Google Workspace admin Helios
      // impersonates — it would sever Helios's own auth and can lock the operator
      // out of Workspace. Runs before any offboarding step touches the account.
      const protectedAdminEmail = await this.getAdminEmail(organizationId);
      try {
        await assertNotProtectedAdmin(
          null,
          config.userEmail || config.userId,
          protectedAdminEmail,
          'offboard'
        );
      } catch (guardErr: any) {
        result.success = false;
        result.errors.push(guardErr.message);
        await lifecycleLogService.logFailure(
          organizationId,
          'offboard',
          'admin_protection_guard',
          guardErr.message,
          { ...logOptions, stepOrder: 0, durationMs: 0 }
        );
        return result;
      }

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

      // No-orphans policy (enforced here as well as in the wizard): the
      // departing user's direct reports must have been reassigned before any
      // step runs, otherwise the org chart is left pointing at a suspended account.
      const localUser = await orgPolicyService.resolveLocalUser(organizationId, config.userId, config.userEmail);
      {
        const localId = localUser?.id;
        if (localId) {
          const orphans = await orgPolicyService.checkNoOrphans(organizationId, localId);
          if (!orphans.ok) {
            const msg = orgPolicyService.describeOrphans('offboard', orphans.reports);
            result.errors.push(msg);
            result.success = false;
            await lifecycleLogService.logFailure(organizationId, 'offboard', 'validate_config', msg, {
              ...logOptions, stepOrder, durationMs: 0,
            });
            result.stepsCompleted = result.stepsCompleted.filter((s) => s !== 'validate_config');
            result.stepsFailed.push('validate_config');
            return result;
          }
        }
      }

      // Step 1b: Snapshot the Google account BEFORE anything changes, so a
      // Restore after Google's 20-day undelete window can re-create it.
      // A failed snapshot is recorded but does not block the offboarding.
      if (config.platformHint?.google !== false) {
        stepOrder++;
        const snapStart = Date.now();
        try {
          const googleId = localUser?.google_workspace_id;
          if (googleId) {
            const snap = await userSnapshotService.capture(organizationId, {
              userId: localUser?.id || null,
              googleWorkspaceId: googleId,
              primaryEmail: config.userEmail,
              reason: 'offboard',
              takenBy: options.triggeredByUserId || null,
            });
            if (snap.success) {
              await lifecycleLogService.logSuccess(organizationId, 'offboard', 'snapshot_account', {
                ...logOptions, stepOrder, durationMs: Date.now() - snapStart,
                details: { snapshotId: snap.snapshot?.id, partial: snap.snapshot?.snapshot?.partial || [] },
              });
              result.stepsCompleted.push('snapshot_account');
            } else {
              result.errors.push(`Snapshot not taken: ${snap.error}`);
              await lifecycleLogService.logFailure(organizationId, 'offboard', 'snapshot_account', snap.error || 'unknown', {
                ...logOptions, stepOrder, durationMs: Date.now() - snapStart,
              });
              result.stepsFailed.push('snapshot_account');
            }
          } else {
            result.stepsSkipped.push('snapshot_account');
          }
        } catch (error: any) {
          result.errors.push(`Snapshot not taken: ${error.message}`);
          await lifecycleLogService.logFailure(organizationId, 'offboard', 'snapshot_account', error, {
            ...logOptions, stepOrder, durationMs: Date.now() - snapStart,
          });
          result.stepsFailed.push('snapshot_account');
        }
      } else {
        result.stepsSkipped.push('snapshot_account');
      }

      // Step 2: Transfer Drive files
      //
      // 'archive' and 'delete' used to reach handleDriveTransfer, get back
      // { transferred: false, reason: 'unsupported_action' }, and be logged as a
      // SUCCESS and listed under stepsCompleted. The template editor promised "copied
      // to a Shared Drive" and "held for N days before permanent deletion"; neither
      // happened, and the offboarding record said it had. They are now recorded as
      // skipped with the reason, so the timeline tells the truth.
      if (config.driveAction === 'archive' || config.driveAction === 'delete') {
        stepOrder++;
        const reason =
          config.driveAction === 'archive'
            ? 'Archive to a Shared Drive is not implemented yet. No files were copied; they remain in the account.'
            : 'Timed deletion of Drive files is not implemented yet. Nothing was scheduled; files are removed only if and when the account itself is deleted.';
        await lifecycleLogService.logSkipped(organizationId, 'offboard', 'transfer_drive_files', reason, {
          ...logOptions,
          stepOrder,
        });
        result.stepsSkipped.push('transfer_drive_files');
        result.errors.push(`Drive: ${reason}`);
      } else if (config.driveAction !== 'keep') {
        stepOrder++;
        const driveStart = Date.now();
        try {
          const driveDetails = await this.handleDriveTransfer(organizationId, config);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'transfer_drive_files',
            {
              ...logOptions,
              stepOrder,
              durationMs: Date.now() - driveStart,
              details: driveDetails,
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
          const forwardingDetails = await this.setupEmailForwarding(organizationId, config);
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'setup_email_forwarding',
            {
              ...logOptions,
              stepOrder,
              durationMs: Date.now() - emailStart,
              details: forwardingDetails,
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

      // Step 3b: Delegate the departing user's mailbox to the forward target
      //
      // When mail is being forwarded to a manager/successor, that same person
      // is also granted Gmail *delegate* access so they can read and reply to
      // the departing user's historical mail (forwarding only covers NEW mail).
      // Independent of forwarding: its own try/catch so a delegation failure
      // never rolls back the forwarding that already succeeded, and vice-versa.
      if ((config.emailAction === 'forward_manager' || config.emailAction === 'forward_user') && (config.emailDelegateEnabled ?? true)) {
        stepOrder++;
        const delegateStart = Date.now();
        try {
          const delegateEmail = await this.resolveDelegateTarget(config);
          if (!delegateEmail) {
            throw new Error('No delegate address available (delegate, forward, manager, or forward user email missing)');
          }
          const delegationDetails = await this.setupMailboxDelegation(
            organizationId,
            config,
            delegateEmail
          );
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'setup_mailbox_delegation',
            {
              ...logOptions,
              stepOrder,
              durationMs: Date.now() - delegateStart,
              details: delegationDetails,
            }
          );
          result.stepsCompleted.push('setup_mailbox_delegation');
        } catch (error: any) {
          result.errors.push(`Failed to delegate mailbox: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'setup_mailbox_delegation',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - delegateStart }
          );
          result.stepsFailed.push('setup_mailbox_delegation');
        }
      } else {
        result.stepsSkipped.push('setup_mailbox_delegation');
      }

      // Step 3b: Clear the Gmail signature. The template flag existed and was
      // mapped to 'remove_signature' but no step ever ran (2026-09-08: the
      // departed mailbox kept its signature).
      if (config.removeSignature) {
        stepOrder++;
        const sigStart = Date.now();
        try {
          const sig = await googleWorkspaceService.setUserSignature(organizationId, config.userEmail, '');
          if (!sig.success) throw new Error(sig.error || 'setUserSignature failed');
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'remove_signature',
            { ...logOptions, stepOrder, durationMs: Date.now() - sigStart, stepDescription: 'Cleared the Gmail signature' }
          );
          result.stepsCompleted.push('remove_signature');
        } catch (error: any) {
          result.errors.push(`Failed to remove signature: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'remove_signature',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - sigStart }
          );
          result.stepsFailed.push('remove_signature');
        }
      } else {
        result.stepsSkipped.push('remove_signature');
      }

      // Step 4: Set auto-reply
      if ((config.emailAction === 'auto_reply' || config.emailAutoReplyEnabled) && config.emailAutoReplyMessage) {
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

      // Step 4b: Cancel/decline the departing user's future calendar events.
      // Organizer events are deleted; attendee events are declined. This is the
      // one genuinely-missing offboarding primitive. Activated by the explicit
      // `cancelFutureEvents` flag OR the pre-existing (previously inert)
      // `calendarDeclineFutureMeetings` template flag.
      if (config.cancelFutureEvents || config.calendarDeclineFutureMeetings) {
        stepOrder++;
        const calStart = Date.now();
        try {
          const cancelResult = await googleWorkspaceService.cancelFutureEvents(
            organizationId,
            config.userEmail,
            {
              // With a transfer target, organized meetings belong to the new
              // owner: only the user's own invitations are declined.
              skipOrganized: !!(config.calendarTransferMeetingOwnership || config.calendarTransferToUserId),
            }
          );
          if (!cancelResult.success) {
            throw new Error(cancelResult.error || 'Failed to cancel future calendar events');
          }
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'cancel_future_events',
            {
              ...logOptions,
              stepOrder,
              durationMs: Date.now() - calStart,
              details: {
                cancelledCount: cancelResult.cancelledCount ?? 0,
                declinedCount: cancelResult.declinedCount ?? 0,
              },
            }
          );
          result.stepsCompleted.push('cancel_future_events');
        } catch (error: any) {
          result.errors.push(`Failed to cancel future calendar events: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'cancel_future_events',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - calStart }
          );
          result.stepsFailed.push('cancel_future_events');
        }
      } else {
        result.stepsSkipped.push('cancel_future_events');
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

      // Step 5a: Remove from Shared Drives.
      //
      // This flag defaulted to TRUE and was stored, read back and shown as ticked,
      // but no code ever acted on it: a departing person silently kept every
      // shared-drive membership while the template said they had been removed.
      // Until removal is built, a ticked box is recorded as a skipped step with the
      // reason, so nobody reads the timeline as having revoked access.
      if (config.removeFromSharedDrives) {
        stepOrder++;
        const reason =
          'Removing shared-drive membership is not implemented yet. The person was NOT removed from any shared drive; remove them in the Google Admin console.';
        await lifecycleLogService.logSkipped(organizationId, 'offboard', 'remove_from_shared_drives', reason, {
          ...logOptions,
          stepOrder,
        });
        result.stepsSkipped.push('remove_from_shared_drives');
        result.errors.push(`Shared drives: ${reason}`);
      }

      // Step 5b: Add the departing user to a designated "offboarded" group (in
      // ADDITION to removeFromAllGroups). Common pattern for applying a
      // restricted group policy / retaining the mailbox under group control.
      if (config.offboardedGroupEmail) {
        stepOrder++;
        const addGroupStart = Date.now();
        try {
          const addResult = await googleWorkspaceService.addUserToGroup(
            organizationId,
            config.userEmail,
            config.offboardedGroupEmail
          );
          if (!addResult.success) {
            throw new Error(addResult.error || 'Failed to add user to offboarded group');
          }
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'add_to_offboarded_group',
            {
              ...logOptions,
              stepOrder,
              durationMs: Date.now() - addGroupStart,
              details: { group: config.offboardedGroupEmail },
            }
          );
          result.stepsCompleted.push('add_to_offboarded_group');
        } catch (error: any) {
          result.errors.push(`Failed to add user to offboarded group: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'add_to_offboarded_group',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - addGroupStart }
          );
          result.stepsFailed.push('add_to_offboarded_group');
        }
      } else {
        result.stepsSkipped.push('add_to_offboarded_group');
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
          // Delegation needs a mailbox that is not waiting for a password change.
          await this.resetPassword(organizationId, config.userEmail, !config.emailDelegateEnabled);
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

      // Step 8b: Move the departing user into an offboarding org unit (e.g.
      // "/Offboarded") so OU-scoped policies apply. Runs BEFORE suspension so the
      // OU move still succeeds on an active account.
      if (config.orgUnitPath) {
        stepOrder++;
        const ouStart = Date.now();
        try {
          const ouResult = await googleWorkspaceService.setOrgUnit(
            organizationId,
            config.userEmail,
            config.orgUnitPath
          );
          if (!ouResult.success) {
            throw new Error(ouResult.error || 'Failed to move user to org unit');
          }
          await lifecycleLogService.logSuccess(
            organizationId,
            'offboard',
            'move_to_org_unit',
            {
              ...logOptions,
              stepOrder,
              durationMs: Date.now() - ouStart,
              details: { orgUnitPath: config.orgUnitPath },
            }
          );
          result.stepsCompleted.push('move_to_org_unit');
        } catch (error: any) {
          result.errors.push(`Failed to move user to org unit: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'move_to_org_unit',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - ouStart }
          );
          result.stepsFailed.push('move_to_org_unit');
        }
      } else {
        result.stepsSkipped.push('move_to_org_unit');
      }

      // Google steps below apply only to users who exist in Google Workspace. A
      // user known to be Microsoft-only (M365 id, no Google id — resolved by the
      // entrypoints into config.platformHint) is SKIPPED with an audit entry
      // instead of failing on a "Not Authorized" Google call (recorded live
      // 2026-09-07). No hint = unknown = fail OPEN so a real Google error stays
      // visible in the log.
      const microsoftOnly = !!config.platformHint && config.platformHint.microsoft && !config.platformHint.google;

      // Step 8b: Release the address (rename, drop alias, group on the old
      // address). Runs after every mailbox setting and before the suspend, so
      // the old address keeps delivering even once the account is gone.
      if (config.emailReleaseAddress && !microsoftOnly) {
        stepOrder++;
        const relStart = Date.now();
        try {
          const rel = await this.releaseAddress(organizationId, config, localUser);
          if (rel.success) {
            await lifecycleLogService.logSuccess(organizationId, 'offboard', 'release_address', {
              ...logOptions, stepOrder, durationMs: Date.now() - relStart, details: rel,
            });
            result.stepsCompleted.push('release_address');
          } else {
            result.errors.push(`Release address failed: ${rel.error}`);
            await lifecycleLogService.logFailure(organizationId, 'offboard', 'release_address', rel.error || 'unknown', {
              ...logOptions, stepOrder, durationMs: Date.now() - relStart,
            });
            result.stepsFailed.push('release_address');
          }
        } catch (error: any) {
          result.errors.push(`Release address failed: ${error.message}`);
          await lifecycleLogService.logFailure(organizationId, 'offboard', 'release_address', error, {
            ...logOptions, stepOrder, durationMs: Date.now() - relStart,
          });
          result.stepsFailed.push('release_address');
        }
      } else {
        result.stepsSkipped.push('release_address');
      }

      // Step 9: Suspend account (if immediate)
      if (config.accountAction === 'suspend_immediately' && microsoftOnly) {
        stepOrder++;
        await lifecycleLogService.logSkipped(
          organizationId,
          'offboard',
          'suspend_account',
          'User has no Google Workspace account (Microsoft 365 only); handled by m365_offboard',
          { ...logOptions, stepOrder }
        );
        result.stepsSkipped.push('suspend_account');
      } else if (config.accountAction === 'suspend_immediately') {
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

      // Step 9a1: Microsoft 365 offboard — disable / remove-license / delete,
      // parallel to the Google suspend/delete above. This is the FIRST consumer
      // of config.licenseAction. Skips cleanly when the user has no M365 link or
      // M365 isn't configured; its own try/catch so an M365 failure never rolls
      // back completed Google steps.
      {
        stepOrder++;
        const msStart = Date.now();
        try {
          const msRow = await db.query(
            'SELECT microsoft_365_id FROM organization_users WHERE (id = $1 OR email = $2) AND organization_id = $3 LIMIT 1',
            [config.userId, config.userEmail, organizationId]
          );
          const msId = msRow.rows[0]?.microsoft_365_id;
          const initialized = msId ? await microsoftGraphService.initialize(organizationId) : false;
          if (!msId || !initialized) {
            result.stepsSkipped.push('m365_offboard');
          } else {
            const willDelete = config.deleteAccount && !!config.deleteImmediately;
            // Each sub-op is independent: a redundant license-removal failure
            // (e.g. a group-inherited SKU Graph refuses to strip) must NOT block
            // the requested account delete, which is the operation of record.
            const subErrors: string[] = [];
            if (config.accountAction === 'suspend_immediately') {
              try { await microsoftGraphService.disableUser(msId); }
              catch (e: any) { subErrors.push(`disable: ${e.message}`); }
            }
            // Skip license removal entirely when deleting — Graph strips direct
            // assignments on user deletion, so removing first is pointless and can
            // fail on group-inherited licenses.
            if (!willDelete && (config.licenseAction === 'remove_immediately' ||
                (config.licenseAction === 'remove_on_suspension' && config.accountAction === 'suspend_immediately'))) {
              try {
                const lics = await microsoftGraphService.getUserLicenses(msId);
                const skuIds = lics.map((l: any) => l.skuId).filter(Boolean);
                if (skuIds.length) await microsoftGraphService.removeLicense(msId, skuIds);
              } catch (e: any) { subErrors.push(`removeLicense: ${e.message}`); }
            }
            if (willDelete) {
              try { await microsoftGraphService.deleteUser(msId); }
              catch (e: any) { subErrors.push(`delete: ${e.message}`); }
            }
            if (subErrors.length) {
              throw new Error(subErrors.join('; '));
            }
            await lifecycleLogService.logSuccess(
              organizationId, 'offboard', 'm365_offboard',
              { ...logOptions, stepOrder, durationMs: Date.now() - msStart }
            );
            result.stepsCompleted.push('m365_offboard');
          }
        } catch (error: any) {
          result.errors.push(`Failed M365 offboard: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId, 'offboard', 'm365_offboard', error,
            { ...logOptions, stepOrder, durationMs: Date.now() - msStart }
          );
          result.stepsFailed.push('m365_offboard');
        }
      }

      // Step 9a2: Vault preservation — OPT-IN (config.preserveWithVault). Runs
      // BEFORE any deletion so the departing user's Mail + Drive survive account
      // removal (a Vault hold is retained even after the account is deleted).
      // GATED to Vault-eligible editions (Business Plus+); on lower tiers it is
      // SKIPPED with a reason rather than failing the offboard.
      if (config.preserveWithVault) {
        stepOrder++;
        const preserveStart = Date.now();
        try {
          const vaultRes = await googleWorkspaceService.preserveUserWithVault(
            organizationId,
            config.userEmail,
            { matterName: config.vaultMatterName }
          );
          if (vaultRes.success) {
            await lifecycleLogService.logSuccess(
              organizationId,
              'offboard',
              'preserve_vault',
              {
                ...logOptions,
                stepOrder,
                durationMs: Date.now() - preserveStart,
                details: { matterId: vaultRes.matterId, holdIds: vaultRes.holdIds },
              }
            );
            result.stepsCompleted.push('preserve_vault');
          } else if (vaultRes.skipped) {
            // Not an error — the org isn't on a Vault-eligible edition.
            await lifecycleLogService.logSuccess(
              organizationId,
              'offboard',
              'preserve_vault',
              {
                ...logOptions,
                stepOrder,
                durationMs: Date.now() - preserveStart,
                details: { skipped: true, reason: vaultRes.reason },
              }
            );
            result.stepsSkipped.push('preserve_vault');
          } else {
            throw new Error(vaultRes.error || 'Vault preservation failed');
          }
        } catch (error: any) {
          result.errors.push(`Failed to preserve with Vault: ${error.message}`);
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            'preserve_vault',
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - preserveStart }
          );
          result.stepsFailed.push('preserve_vault');
        }
      } else {
        result.stepsSkipped.push('preserve_vault');
      }

      // Step 9b: Account deletion — OPT-IN (config.deleteAccount) and GUARDED.
      // Suspension (above) is the safe default; deletion is irreversible and frees
      // the license.
      //   - deleteImmediately === true → HARD-DELETE inline now via
      //     googleWorkspaceService.deleteUser, which itself re-runs the admin
      //     self-lockout guard (assertNotProtectedAdmin) before deleting.
      //   - otherwise → DEFERRED: record the intent + scheduled date
      //     (now + deleteAfterDays) in the audit log; a scheduler performs the
      //     actual deletion later. Nothing is deleted inline.
      if (config.deleteAccount && config.deleteImmediately && microsoftOnly) {
        stepOrder++;
        await lifecycleLogService.logSkipped(
          organizationId,
          'offboard',
          'delete_account',
          'User has no Google Workspace account (Microsoft 365 only); handled by m365_offboard',
          { ...logOptions, stepOrder }
        );
        result.stepsSkipped.push('delete_account');
      } else if (config.deleteAccount) {
        stepOrder++;
        const deleteStart = Date.now();
        const deleteStep = config.deleteImmediately ? 'delete_account' : 'schedule_account_deletion';
        try {
          if (config.deleteImmediately) {
            const deleteResult = await googleWorkspaceService.deleteUser(
              organizationId,
              config.userEmail
            );
            if (!deleteResult.success) {
              throw new Error(deleteResult.error || 'Failed to delete account');
            }
            await this.updateHeliosUserStatus(config.userId, 'deleted');
            await lifecycleLogService.logSuccess(
              organizationId,
              'offboard',
              'delete_account',
              {
                ...logOptions,
                stepOrder,
                durationMs: Date.now() - deleteStart,
                details: { deleted: true, deferred: false },
              }
            );
            result.stepsCompleted.push('delete_account');
          } else {
            // Deferral: record intent only. The audit log IS the durable record of
            // the scheduled deletion; nothing is deleted inline.
            const days = config.deleteAfterDays ?? 90;
            const scheduledFor = new Date(
              Date.now() + days * 24 * 60 * 60 * 1000
            ).toISOString();
            await lifecycleLogService.logSuccess(
              organizationId,
              'offboard',
              'schedule_account_deletion',
              {
                ...logOptions,
                stepOrder,
                durationMs: Date.now() - deleteStart,
                details: { deleted: false, deferred: true, deleteAfterDays: days, scheduledFor },
              }
            );
            result.stepsCompleted.push('schedule_account_deletion');
          }
        } catch (error: any) {
          result.errors.push(
            `Failed to ${config.deleteImmediately ? 'delete account' : 'schedule account deletion'}: ${error.message}`
          );
          await lifecycleLogService.logFailure(
            organizationId,
            'offboard',
            deleteStep,
            error,
            { ...logOptions, stepOrder, durationMs: Date.now() - deleteStart }
          );
          result.stepsFailed.push(deleteStep);
        }
      } else {
        result.stepsSkipped.push('delete_account');
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
      /** Pre-resolved org policy; resolved from the DB when omitted. */
      policy?: OffboardingPolicy;
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
      `SELECT email, reporting_manager_id, google_workspace_id, microsoft_365_id FROM organization_users WHERE id = $1`,
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
      platformHint: { google: !!user.google_workspace_id, microsoft: !!user.microsoft_365_id },
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
      emailAutoReplyEnabled: template.emailAutoReplyEnabled,
      emailDelegateEnabled: template.emailDelegateEnabled,
      emailReleaseAddress: template.emailReleaseAddress,
      emailReleasePrefix: template.emailReleasePrefix,
      emailReleaseGroupEnabled: template.emailReleaseGroupEnabled,

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

    // Two-tier knobs: resolve the org policy (unless the caller pre-resolved it)
    // and hand it to the orchestrator, which fills any field the template/config
    // left unset. Template/config values always win over policy defaults.
    const policy = options.policy ?? (await this.resolveOffboardingPolicy(organizationId));

    return this.executeOffboarding(organizationId, config, {
      actionId: options.actionId,
      triggeredBy: options.triggeredBy,
      triggeredByUserId: options.triggeredByUserId,
      policy,
    });
  }

  /**
   * Execute offboarding from a RAW config assembled by a caller (the developer
   * console's `gw offboard` command, or a direct API client) rather than from a
   * stored template. This is the single audited + guarded entrypoint the console
   * uses instead of running its own ad-hoc Google sequence.
   *
   * Only `userEmail` is required on the input:
   *   - `userId` is resolved from the email against organization_users when the
   *     caller omits it (the console works with Google emails). A missing Helios
   *     row is non-fatal — the Google-side steps only need the email, and the
   *     Helios status update simply matches nothing.
   *   - every other field is defaulted by `normalizeConfig`, then org-policy
   *     defaults are applied (per-offboard override wins).
   */
  async executeOffboardingFromConfig(
    organizationId: string,
    input: OffboardingConfigInput,
    options: {
      actionId?: string;
      triggeredBy?: string;
      triggeredByUserId?: string;
      /** Pre-resolved org policy; resolved from the DB when omitted. */
      policy?: OffboardingPolicy;
    } = {}
  ): Promise<OffboardingResult> {
    if (!input || !input.userEmail) {
      return {
        success: false,
        errors: ['User email is required'],
        stepsCompleted: [],
        stepsFailed: ['validate_config'],
        stepsSkipped: [],
      };
    }

    // Resolve the Helios user id from the email when the caller didn't supply one.
    let userId = input.userId;
    let platformHint = input.platformHint;
    if (!userId || !platformHint) {
      try {
        const r = await db.query(
          'SELECT id, google_workspace_id, microsoft_365_id FROM organization_users WHERE email = $1 AND organization_id = $2',
          [input.userEmail, organizationId]
        );
        const row = r.rows[0];
        if (row) {
          userId = userId || row.id;
          platformHint = platformHint || { google: !!row.google_workspace_id, microsoft: !!row.microsoft_365_id };
        }
      } catch {
        // Fall through to the email placeholder below.
      }
    }

    const config = this.normalizeConfig({
      ...input,
      userId: userId || input.userEmail,
      platformHint,
    });

    const policy = options.policy ?? (await this.resolveOffboardingPolicy(organizationId));

    return this.executeOffboarding(organizationId, config, {
      actionId: options.actionId,
      triggeredBy: options.triggeredBy,
      triggeredByUserId: options.triggeredByUserId,
      policy,
    });
  }

  /**
   * Resolve an organization's OFFBOARDING POLICY from
   * `organization_settings.settings.offboardingPolicy`, merged over the built-in
   * defaults. Never throws — an unreadable/absent policy yields the defaults so
   * offboarding is never blocked by a missing policy row.
   */
  async resolveOffboardingPolicy(organizationId: string): Promise<OffboardingPolicy> {
    try {
      // organization_settings is a key/value store (key, value text) — not a
      // JSON blob. The policy lives in the row key='offboarding.policy'.
      const result = await db.query(
        "SELECT value FROM organization_settings WHERE organization_id = $1 AND key = 'offboarding.policy'",
        [organizationId]
      );
      const raw = result?.rows?.[0]?.value;
      const stored = raw ? JSON.parse(raw) : null;
      if (stored && typeof stored === 'object') {
        return { ...DEFAULT_OFFBOARDING_POLICY, ...stored };
      }
    } catch (error: any) {
      logger.warn('Failed to load offboarding policy; using defaults', {
        organizationId,
        error: error?.message,
      });
    }
    return { ...DEFAULT_OFFBOARDING_POLICY };
  }

  /**
   * Fill any policy-governed config field the caller left unset with the org
   * policy default. Per-offboard values always win (nullish-coalescing, so an
   * explicit `false`/`0` overrides the policy). Pure — no DB, no mutation of the
   * input.
   */
  private mergePolicyDefaults(
    config: OffboardingConfig,
    policy: OffboardingPolicy
  ): OffboardingConfig {
    return {
      ...config,
      orgUnitPath: config.orgUnitPath ?? policy.targetOrgUnitPath,
      offboardedGroupEmail: config.offboardedGroupEmail ?? policy.offboardedGroupEmail,
      emailAutoReplyMessage: config.emailAutoReplyMessage ?? policy.autoReplyTemplate,
      emailAutoReplySubject: config.emailAutoReplySubject ?? policy.autoReplySubject,
      deleteAfterDays: config.deleteAfterDays ?? policy.deleteAfterDays,
      cancelFutureEvents: config.cancelFutureEvents ?? policy.cancelFutureEvents,
    };
  }

  /**
   * Turn a loose `OffboardingConfigInput` into a fully-populated
   * `OffboardingConfig` with conservative, suspend-by-default values. Deletion
   * stays opt-in (`deleteAccount` defaults false); the account action defaults to
   * immediate suspension.
   */
  private normalizeConfig(
    input: OffboardingConfigInput & { userId: string }
  ): OffboardingConfig {
    return {
      userId: input.userId,
      userEmail: input.userEmail,
      platformHint: input.platformHint,
      managerId: input.managerId,
      managerEmail: input.managerEmail,
      lastDay: input.lastDay,

      // Drive
      driveAction: input.driveAction ?? 'keep',
      driveTransferToUserId: input.driveTransferToUserId,
      driveArchiveSharedDriveId: input.driveArchiveSharedDriveId,

      // Email
      emailAction: input.emailAction ?? 'keep',
      emailForwardToUserId: input.emailForwardToUserId,
      emailForwardDurationDays: input.emailForwardDurationDays ?? 30,
      emailAutoReplyMessage: input.emailAutoReplyMessage,
      emailAutoReplySubject: input.emailAutoReplySubject,
      emailForwardAddress: input.emailForwardAddress,
      delegateEmail: input.delegateEmail,

      // Calendar
      calendarDeclineFutureMeetings: input.calendarDeclineFutureMeetings ?? false,
      calendarTransferMeetingOwnership: input.calendarTransferMeetingOwnership ?? false,
      calendarTransferToUserId: input.calendarTransferToUserId,
      cancelFutureEvents: input.cancelFutureEvents,

      // Access revocation
      removeFromAllGroups: input.removeFromAllGroups ?? false,
      removeFromSharedDrives: input.removeFromSharedDrives ?? false,
      revokeOauthTokens: input.revokeOauthTokens ?? false,
      revokeAppPasswords: input.revokeAppPasswords ?? false,
      signOutAllDevices: input.signOutAllDevices ?? false,
      resetPassword: input.resetPassword ?? false,
      offboardedGroupEmail: input.offboardedGroupEmail,

      // Signature
      removeSignature: input.removeSignature ?? false,
      setOffboardingSignature: input.setOffboardingSignature ?? false,
      offboardingSignatureText: input.offboardingSignatureText,

      // Mobile
      wipeMobileDevices: input.wipeMobileDevices ?? false,

      // Org unit
      orgUnitPath: input.orgUnitPath,

      // Data preservation (Vault) — opt-in, Business Plus+ gated at runtime
      preserveWithVault: input.preserveWithVault ?? false,
      vaultMatterName: input.vaultMatterName,

      // Account — suspend by default, delete opt-in
      accountAction: input.accountAction ?? 'suspend_immediately',
      deleteAccount: input.deleteAccount ?? false,
      deleteAfterDays: input.deleteAfterDays,
      deleteImmediately: input.deleteImmediately,

      // License
      licenseAction: input.licenseAction ?? 'remove_on_suspension',

      // Notifications
      notifyManager: input.notifyManager ?? false,
      notifyItAdmin: input.notifyItAdmin ?? false,
      notifyHr: input.notifyHr ?? false,
      notificationEmailAddresses: input.notificationEmailAddresses ?? [],
      notificationMessage: input.notificationMessage,
    };
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private validateConfig(config: OffboardingConfig): string[] {
    const errors: string[] = [];

    if (!config.userId) errors.push('User ID is required');
    if (!config.userEmail) errors.push('User email is required');

    // Fail BEFORE any step runs when the template relies on a manager the
    // user does not have (2026-09-08: the run got 13 steps in, then the Drive
    // transfer failed for want of a target).
    const needsManager: string[] = [];
    if (config.driveAction === 'transfer_manager') needsManager.push('Drive transfer');
    if (config.emailAction === 'forward_manager' && !config.emailForwardAddress) needsManager.push('mail forwarding');
    if (config.calendarTransferMeetingOwnership && !config.calendarTransferToUserId) needsManager.push('calendar transfer');
    if (needsManager.length > 0 && !config.managerEmail) {
      errors.push(`${config.userEmail} has no reporting manager, but the template sends ${needsManager.join(', ')} to the manager. Set a manager first or pick a template with a named target.`);
    }

    return errors;
  }

  /**
   * Transfer a departing user's Drive (and, when calendar-ownership transfer is
   * requested, Calendar) data to a new owner via the Admin SDK Data Transfer
   * API (`POST admin/datatransfer/v1/transfers`).
   *
   * Only the `transfer_manager` / `transfer_user` actions map to a Data
   * Transfer. `archive` / `delete` are not (yet) implemented via this API, so
   * they are logged and skipped rather than throwing (a throw would mark the
   * whole drive step failed).
   *
   * Correctness notes:
   *  - The Data Transfer API keys owners by the user's IMMUTABLE numeric ID, not
   *    their email, so both emails are first resolved via directory `users.get`.
   *  - Application IDs come from the shared single source of truth
   *    (config/google-application-ids.ts): Drive = 55656082996,
   *    Calendar = 435070579839. These were historically swapped in
   *    data-transfer.service.ts.
   */
  private async handleDriveTransfer(
    organizationId: string,
    config: OffboardingConfig
  ): Promise<Record<string, unknown>> {
    if (config.driveAction !== 'transfer_manager' && config.driveAction !== 'transfer_user') {
      // 'archive' / 'delete' reach here (the step only runs for driveAction !==
      // 'keep') but have no Data Transfer mapping. Don't fail the step for them.
      logger.info('Drive action has no Data Transfer mapping; skipping transfer', {
        action: config.driveAction,
        userEmail: config.userEmail,
      });
      return { action: config.driveAction, transferred: false, reason: 'unsupported_action' };
    }

    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const adminEmail = await this.getAdminEmail(organizationId);
    if (!adminEmail) throw new Error('Admin email not configured');

    const newOwnerEmail =
      config.driveAction === 'transfer_user' && config.driveTransferToUserId
        ? await this.getUserEmail(config.driveTransferToUserId)
        : config.managerEmail;

    if (!newOwnerEmail) {
      throw new Error('No Drive transfer target available (manager or transfer user email missing)');
    }

    const { directory, datatransfer } = this.createDataTransferClients(credentials, adminEmail);

    // Data Transfer needs the immutable numeric user IDs, not emails.
    const [fromUser, toUser] = await Promise.all([
      directory.users.get({ userKey: config.userEmail }),
      directory.users.get({ userKey: newOwnerEmail }),
    ]);

    const oldOwnerUserId = fromUser.data.id;
    const newOwnerUserId = toUser.data.id;
    if (!oldOwnerUserId || !newOwnerUserId) {
      throw new Error('Could not resolve Google user IDs for Drive transfer');
    }

    const applicationDataTransfers: Array<{
      applicationId: string;
      applicationTransferParams: Array<{ key: string; value: string[] }>;
    }> = [
      {
        applicationId: DATA_TRANSFER_APPLICATION_IDS.drive,
        applicationTransferParams: [{ key: 'PRIVACY_LEVEL', value: ['PRIVATE', 'SHARED'] }],
      },
    ];

    // Fold Calendar into the same transfer when calendar-ownership transfer is
    // requested, so both Drive and Calendar data move to the same successor.
    if (config.calendarTransferMeetingOwnership) {
      applicationDataTransfers.push({
        applicationId: DATA_TRANSFER_APPLICATION_IDS.calendar,
        applicationTransferParams: [],
      });
    }

    const transferResponse = await datatransfer.transfers.insert({
      requestBody: {
        oldOwnerUserId,
        newOwnerUserId,
        applicationDataTransfers,
      },
    });

    const applicationIds = applicationDataTransfers.map((a) => a.applicationId);
    logger.info('Data transfer initiated', {
      from: config.userEmail,
      to: newOwnerEmail,
      transferId: transferResponse.data.id,
      applicationIds,
    });

    // `transfers.insert` accepting the request is NOT the transfer completing.
    // Google runs it asynchronously; a transfer can still fail afterwards
    // (e.g. new owner suspended, quota). Poll `transfers.get` for a bounded
    // window so the audit log records what actually happened, never an assumed
    // success. Still-running after the window is recorded as UNCONFIRMED
    // (confirmed:false) with the transfer id so it can be re-checked — the one
    // honest state; it is not reported as completed.
    const transferId = transferResponse.data.id ?? null;
    const confirmation = transferId
      ? await this.awaitTransferCompletion(datatransfer, transferId)
      : { status: 'unknown', confirmed: false, applications: [] as Array<{ applicationId: string; status: string }> };
    if (confirmation.status === 'failed') {
      throw new Error(
        `Data transfer ${transferId} FAILED (${confirmation.applications.map((a) => `${a.applicationId}:${a.status}`).join(', ') || 'no application status'})`
      );
    }
    if (!confirmation.confirmed) {
      logger.warn('Data transfer not yet confirmed complete within the polling window', {
        transferId,
        status: confirmation.status,
        applications: confirmation.applications,
      });
    }
    return {
      action: config.driveAction,
      transferred: true,
      newOwnerEmail,
      transferId,
      applicationIds,
      transferStatus: confirmation.status,
      transferConfirmed: confirmation.confirmed,
      applicationStatuses: confirmation.applications,
    };
  }

  /**
   * Poll the Data Transfer API until the transfer reports `completed` or
   * `failed`, or the bounded window elapses. Interval / window are env-tunable
   * (HELIOS_TRANSFER_POLL_INTERVAL_MS, HELIOS_TRANSFER_POLL_WINDOW_MS) so tests
   * and small tenants can shorten them; defaults 5 s / 120 s.
   */
  private async awaitTransferCompletion(
    datatransfer: { transfers: { get: (p: { dataTransferId: string }) => Promise<{ data: any }> } },
    transferId: string
  ): Promise<{ status: string; confirmed: boolean; applications: Array<{ applicationId: string; status: string }> }> {
    const intervalMs = Math.max(0, parseInt(process.env.HELIOS_TRANSFER_POLL_INTERVAL_MS || '5000', 10));
    const windowMs = Math.max(0, parseInt(process.env.HELIOS_TRANSFER_POLL_WINDOW_MS || '120000', 10));
    const deadline = Date.now() + windowMs;
    let status = 'unknown';
    let applications: Array<{ applicationId: string; status: string }> = [];
    for (;;) {
      const res = await datatransfer.transfers.get({ dataTransferId: transferId });
      status = String(res?.data?.overallTransferStatusCode || 'unknown');
      applications = (res?.data?.applicationDataTransfers || []).map((a: any) => ({
        applicationId: String(a.applicationId),
        status: String(a.applicationTransferStatus || 'unknown'),
      }));
      if (status === 'completed') return { status, confirmed: true, applications };
      if (status === 'failed' || applications.some((a) => a.status === 'failed')) {
        return { status: 'failed', confirmed: false, applications };
      }
      if (Date.now() >= deadline) return { status, confirmed: false, applications };
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  /**
   * Configure Gmail auto-forwarding for the departing user's mailbox.
   *
   * Gmail settings are PER-MAILBOX, so domain-wide delegation must impersonate
   * the departing user (`subject = config.userEmail`) — impersonating the admin
   * (as the old stub did) cannot change another user's forwarding. Two calls:
   *   1. forwardingAddresses.create — register the target (auto-verified for a
   *      domain user via DWD).
   *   2. updateAutoForwarding — enable forwarding to it, keeping a copy in the
   *      inbox (disposition `leaveInInbox`).
   */
  private async setupEmailForwarding(
    organizationId: string,
    config: OffboardingConfig
  ): Promise<Record<string, unknown>> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const forwardTo = await this.resolveForwardTarget(config);
    if (!forwardTo) {
      throw new Error('No forwarding address available');
    }

    const gmail = this.createGmailClient(credentials, config.userEmail);

    // 1. Register the forwarding address on the departing user's mailbox.
    //    Google answers 409 "already exists" when it is already registered;
    //    that IS the desired state (a re-run on 2026-09-08 reported the whole
    //    step failed because of it), so treat it as done.
    try {
      await gmail.users.settings.forwardingAddresses.create({
        userId: config.userEmail,
        requestBody: { forwardingEmail: forwardTo },
      });
    } catch (error: any) {
      if (!isAlreadyExists(error)) throw error;
      logger.info('Forwarding address already registered', { from: config.userEmail, to: forwardTo });
    }

    // 2. Enable auto-forwarding to it (leave a copy in the inbox).
    await gmail.users.settings.updateAutoForwarding({
      userId: config.userEmail,
      requestBody: {
        enabled: true,
        emailAddress: forwardTo,
        disposition: 'leaveInInbox',
      },
    });

    logger.info('Email forwarding configured', {
      from: config.userEmail,
      to: forwardTo,
      durationDays: config.emailForwardDurationDays,
    });

    return {
      from: config.userEmail,
      forwardTo,
      durationDays: config.emailForwardDurationDays,
    };
  }

  /**
   * Grant `delegateEmail` Gmail delegate access to the departing user's mailbox
   * (`users.settings.delegates.create`). Like forwarding, this operates on the
   * mailbox owner, so DWD impersonates the departing user; unlike forwarding it
   * needs the `gmail.settings.sharing` scope (both are minted by
   * `createGmailClient`).
   */
  private async setupMailboxDelegation(
    organizationId: string,
    config: OffboardingConfig,
    delegateEmail: string
  ): Promise<Record<string, unknown>> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) throw new Error('Google Workspace not configured');

    const gmail = this.createGmailClient(credentials, config.userEmail);

    try {
      await gmail.users.settings.delegates.create({
        userId: config.userEmail,
        requestBody: { delegateEmail },
      });
    } catch (error: any) {
      // "Delegate already exists (with any verification status)" — desired state.
      if (!isAlreadyExists(error)) throw error;
      logger.info('Mailbox delegate already present', { mailbox: config.userEmail, delegate: delegateEmail });
    }

    logger.info('Mailbox delegation configured', {
      mailbox: config.userEmail,
      delegate: delegateEmail,
    });

    return { mailbox: config.userEmail, delegate: delegateEmail };
  }

  /**
   * Resolve the email the departing user's mail is forwarded to, in precedence
   * order: the explicit `emailForwardAddress` (the `--forward=` console flag),
   * then the looked-up `emailForwardToUserId` (`forward_user`), then the
   * manager's email.
   */
  /**
   * Release the departing user's address:
   *   1. rename the Google account to <prefix>.<local>@domain (Google keeps the
   *      old address as an alias),
   *   2. delete that alias so the old address is free,
   *   3. create a group on the old address with the forwarding target as its
   *      member (when enabled), so mail keeps arriving after the account is
   *      deleted,
   *   4. move the Helios row and the sync cache to the new address.
   * Idempotent enough to re-run: an account already renamed is left alone; an
   * existing group is reused.
   */
  async releaseAddress(
    organizationId: string,
    config: OffboardingConfig,
    localUser: { id: string; email: string; google_workspace_id: string | null } | null
  ): Promise<{ success: boolean; oldEmail?: string; newEmail?: string; groupEmail?: string | null; groupMember?: string | null; error?: string }> {
    const oldEmail = config.userEmail.toLowerCase();
    const googleId = localUser?.google_workspace_id;
    if (!googleId) return { success: false, error: 'User has no Google Workspace account' };
    const prefix = (config.emailReleasePrefix || 'deprovisioned').trim().replace(/\.+$/, '') || 'deprovisioned';
    const [local, domain] = oldEmail.split('@');
    if (!local || !domain) return { success: false, error: `Not a mailbox address: ${oldEmail}` };
    if (local.startsWith(`${prefix}.`)) {
      return { success: true, oldEmail, newEmail: oldEmail, groupEmail: null, groupMember: null };
    }
    const newEmail = `${prefix}.${local}@${domain}`;

    const renamed = await googleWorkspaceService.renameUserPrimaryEmail(organizationId, googleId, newEmail);
    if (!renamed.success) return { success: false, error: `Rename refused: ${renamed.error}` };

    // Google turns the old address into an alias on rename. Observed live
    // 2026-09-10: the delete is refused for a while right after the rename,
    // then succeeds, and reads keep showing the alias for up to ~2 minutes
    // after that. So: retry the delete with its real error logged, then wait
    // until a read no longer lists the alias, since the group on that
    // address cannot be created while it is still taken.
    const aliasListed = async (): Promise<boolean | null> => {
      const read = await googleWorkspaceService.getUserRaw(organizationId, googleId);
      if (!read.success) return null;
      return (read.user?.aliases || []).map((x: string) => x.toLowerCase()).includes(oldEmail);
    };
    let deleted = false;
    let lastDeleteError = '';
    for (let attempt = 0; attempt < 12 && !deleted; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      // Read first: once the alias no longer shows, Google refuses the delete
      // with an error that is not "not found", so the read is the truth.
      if ((await aliasListed()) === false) { deleted = true; break; }
      const del = await googleWorkspaceService.deleteUserAlias(organizationId, googleId, oldEmail);
      deleted = del.success || /not found/i.test(String(del.error || ''));
      if (!deleted) {
        lastDeleteError = String(del.error || '');
        logger.warn('Alias delete refused, retrying', { organizationId, oldEmail, attempt: attempt + 1, error: lastDeleteError });
      }
    }
    if (!deleted) return { success: false, error: `Old address is still an alias of the renamed account (${lastDeleteError})` };
    let aliasGone = false;
    for (let attempt = 0; attempt < 24 && !aliasGone; attempt++) {
      aliasGone = (await aliasListed()) === false;
      if (!aliasGone) await new Promise((r) => setTimeout(r, 5000));
    }
    if (!aliasGone) {
      logger.warn('Alias delete accepted but reads still list it; trying the group anyway', { organizationId, oldEmail });
    }

    let groupEmail: string | null = null;
    let groupMember: string | null = null;
    if (config.emailReleaseGroupEnabled !== false) {
      groupMember = await this.resolveForwardTarget(config);
      groupEmail = oldEmail;
      let created = false;
      let lastError = '';
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 5000));
        const g = await googleWorkspaceService.createGroup(organizationId, oldEmail, `Former: ${local}`, `Mail for the former account ${oldEmail} (offboarded)`);
        created = !!g?.success || /already exists|entity already/i.test(String(g?.error || g?.message || ''));
        lastError = String(g?.error || g?.message || '');
      }
      if (!created) return { success: false, error: `Group on the old address could not be created: ${lastError}` };
      if (groupMember) {
        // A group created seconds ago answers "Resource Not Found: groupKey"
        // to member writes until Google's reads catch up (observed live).
        let added = false;
        let lastError = '';
        for (let attempt = 0; attempt < 10 && !added; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 6000));
          const m = await googleWorkspaceService.addGroupMember(organizationId, oldEmail, groupMember);
          added = !!m?.success || /already exists|member already/i.test(String(m?.error || m?.message || ''));
          lastError = String(m?.error || m?.message || '');
          if (!added && !/not found/i.test(lastError)) break;
        }
        if (!added) {
          return { success: false, error: `Group created but the member could not be added: ${lastError}` };
        }
      }
    }

    await db.query('UPDATE organization_users SET email = $3, updated_at = NOW() WHERE id = $1 AND organization_id = $2', [localUser!.id, organizationId, newEmail]);
    await db.query('UPDATE gw_synced_users SET email = $3, updated_at = NOW() WHERE organization_id = $1 AND google_id = $2', [organizationId, googleId, newEmail]);
    logger.info('Address released during offboarding', { organizationId, oldEmail, newEmail, groupEmail, groupMember });
    return { success: true, oldEmail, newEmail, groupEmail, groupMember };
  }

  private async resolveForwardTarget(config: OffboardingConfig): Promise<string | null> {
    if (config.emailForwardAddress) {
      return config.emailForwardAddress;
    }
    // A stale emailForwardToUserId left on the template must not win over
    // "forward to manager" (2026-09-08: it silently forwarded to a previous
    // named user). The named target counts only when the action asks for it.
    if (config.emailAction === 'forward_user' && config.emailForwardToUserId) {
      return this.getUserEmail(config.emailForwardToUserId);
    }
    if (config.emailAction === 'forward_manager') {
      return config.managerEmail ?? null;
    }
    return config.emailForwardToUserId
      ? this.getUserEmail(config.emailForwardToUserId)
      : (config.managerEmail ?? null);
  }

  /**
   * Resolve the Gmail delegate target, in precedence order: the explicit
   * `delegateEmail` (the `--delegate=` console flag), then whatever the mail is
   * forwarded to (so the successor who receives forwarded mail can also read the
   * historical mailbox).
   */
  private async resolveDelegateTarget(config: OffboardingConfig): Promise<string | null> {
    if (config.delegateEmail) {
      return config.delegateEmail;
    }
    return this.resolveForwardTarget(config);
  }

  /**
   * Set the departing user's Gmail vacation responder (auto-reply) to the stored
   * offboarding message. Delegates to the working, user-impersonating
   * googleWorkspaceService.setVacationResponder — Gmail
   * users.settings.updateVacation IS supported, so the previous stub was a wiring
   * gap, not an API gap. The vacation responder impersonates the departing user
   * (their mailbox owns the setting). Throws on failure so the orchestrator
   * records the step as failed.
   */
  private async setAutoReply(
    organizationId: string,
    config: OffboardingConfig
  ): Promise<void> {
    const res = await googleWorkspaceService.setVacationResponder(
      organizationId,
      config.userEmail,
      {
        subject: config.emailAutoReplySubject || 'Out of office',
        body: config.emailAutoReplyMessage || '',
      }
    );

    if (!res.success) {
      throw new Error(res.error || 'Failed to set vacation responder');
    }

    logger.info('Auto-reply (vacation responder) set', {
      userEmail: config.userEmail,
      subject: config.emailAutoReplySubject,
    });
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

  /**
   * `forceChange` = ask for a new password at next sign-in. Confirmed live
   * 2026-09-10: a mailbox in that state answers delegates with Gmail's
   * "temporary error" (401), while an admin-set password WITHOUT the forced
   * change locks the person out and keeps the mailbox open to delegates. So
   * when the template grants delegation, the reset must not force a change.
   */
  private async resetPassword(
    organizationId: string,
    userEmail: string,
    forceChange: boolean = true
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
        changePasswordAtNextLogin: forceChange,
      },
    });

    logger.info('Reset password for user', { userEmail, forceChange });
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
    // The column is `status` (the seed never had user_status). Until
    // 2026-09-08 this threw, the suspend step was reported failed, and Helios
    // kept showing the user Active after Google had suspended them.
    await db.query(
      `UPDATE organization_users SET status = $1, is_active = false, updated_at = NOW() WHERE id = $2`,
      [status, userId]
    );
  }

  /**
   * NO-OP (deliberately out of scope): sending offboarding notification emails
   * requires mail-delivery infrastructure (SMTP / transactional provider) that
   * this offboarding path does not own. This method intentionally sends NOTHING —
   * it only logs that a notification WOULD be sent, so the step reports success
   * without silently implying mail was delivered. Building real notification mail
   * delivery is tracked as a follow-up.
   */
  private async sendNotifications(config: OffboardingConfig): Promise<void> {
    logger.info('send_notifications is a no-op (mail infrastructure out of scope); no email sent', {
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
      // Includes admin.directory.user.security: tokens.list / tokens.delete and
      // users.signOut are gated on it; without it "revoke OAuth tokens" and
      // "sign out devices" failed with "insufficient authentication scopes"
      // (2026-09-08). The contract test pins this set.
      scopes: ADMIN_SDK_CLIENT_SCOPES.offboarding,
      subject: adminEmail,
    });

    return google.admin({ version: 'directory_v1', auth: jwtClient });
  }

  /**
   * Gmail client bound to a specific mailbox owner (impersonated via DWD).
   * Mints BOTH gmail settings scopes: `.basic` (forwarding / vacation) and
   * `.sharing` (delegation), so one client serves forwarding + delegation.
   */
  private createGmailClient(credentials: ServiceAccountCredentials, subjectEmail: string) {
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/gmail.settings.basic',
        'https://www.googleapis.com/auth/gmail.settings.sharing',
      ],
      subject: subjectEmail,
    });

    return google.gmail({ version: 'v1', auth: jwtClient });
  }

  /**
   * Directory + Data Transfer clients for the offboarding data transfer, sharing
   * one admin-impersonated JWT. The token carries both the directory scope (to
   * resolve owner emails → immutable user IDs) and the datatransfer scope (to
   * create the transfer).
   */
  private createDataTransferClients(credentials: ServiceAccountCredentials, adminEmail: string) {
    const jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.datatransfer',
        'https://www.googleapis.com/auth/admin.directory.user',
      ],
      subject: adminEmail,
    });

    return {
      directory: google.admin({ version: 'directory_v1', auth: jwtClient }),
      datatransfer: google.admin({ version: 'datatransfer_v1', auth: jwtClient }),
    };
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
      emailAutoReplyEnabled: row.email_auto_reply_enabled ?? false,
      emailDelegateEnabled: row.email_delegate_enabled ?? true,
      emailReleaseAddress: row.email_release_address ?? false,
      emailReleasePrefix: row.email_release_prefix || 'deprovisioned',
      emailReleaseGroupEnabled: row.email_release_group_enabled ?? true,

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
