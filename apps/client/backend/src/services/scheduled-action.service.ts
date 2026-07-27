/**
 * Scheduled Action Service
 *
 * Manages scheduled user lifecycle actions (onboarding, offboarding, etc.)
 * Includes queue management, execution, and retry logic.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { lifecycleLogService } from './lifecycle-log.service.js';
import { userOnboardingService } from './user-onboarding.service.js';
import { userOffboardingService } from './user-offboarding.service.js';
import {
  ScheduledUserAction,
  CreateScheduledActionDTO,
  UpdateScheduledActionDTO,
  ActionType,
  ActionStatus,
} from '../types/user-lifecycle.js';

interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

class ScheduledActionService {
  // ==========================================
  // ACTION CRUD OPERATIONS
  // ==========================================

  /**
   * Get all scheduled actions for an organization
   */
  async getActions(
    organizationId: string,
    options: {
      status?: ActionStatus;
      actionType?: ActionType;
      userId?: string;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ actions: ScheduledUserAction[]; total: number }> {
    const {
      status,
      actionType,
      userId,
      fromDate,
      toDate,
      limit = 50,
      offset = 0,
    } = options;

    let whereClause = 'organization_id = $1';
    const values: (string | Date | number)[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (actionType) {
      whereClause += ` AND action_type = $${paramIndex}`;
      values.push(actionType);
      paramIndex++;
    }

    if (userId) {
      whereClause += ` AND user_id = $${paramIndex}`;
      values.push(userId);
      paramIndex++;
    }

    if (fromDate) {
      whereClause += ` AND scheduled_for >= $${paramIndex}`;
      values.push(fromDate);
      paramIndex++;
    }

    if (toDate) {
      whereClause += ` AND scheduled_for <= $${paramIndex}`;
      values.push(toDate);
      paramIndex++;
    }

    // Get count
    const countQuery = `SELECT COUNT(*) FROM scheduled_user_actions WHERE ${whereClause}`;
    const countResult = await db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data
    const dataQuery = `
      SELECT * FROM scheduled_user_actions
      WHERE ${whereClause}
      ORDER BY scheduled_for ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    const result = await db.query(dataQuery, values);

    return {
      actions: result.rows.map((row: any) => this.mapRowToAction(row)),
      total,
    };
  }

  /**
   * Get a single scheduled action by ID
   */
  async getAction(id: string): Promise<ScheduledUserAction | null> {
    const result = await db.query(
      'SELECT * FROM scheduled_user_actions WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToAction(result.rows[0]);
  }

  /**
   * Get pending actions that are due for execution
   */
  async getPendingActions(
    organizationId?: string,
    limit: number = 10
  ): Promise<ScheduledUserAction[]> {
    let query = `
      SELECT * FROM scheduled_user_actions
      WHERE status = 'pending'
        AND scheduled_for <= NOW()
        AND (requires_approval = false OR approved_at IS NOT NULL)
    `;
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (organizationId) {
      query += ` AND organization_id = $${paramIndex}`;
      values.push(organizationId);
      paramIndex++;
    }

    // Check dependencies - only get actions whose dependencies are completed
    query += `
      AND (depends_on_action_id IS NULL OR EXISTS (
        SELECT 1 FROM scheduled_user_actions dep
        WHERE dep.id = scheduled_user_actions.depends_on_action_id
          AND dep.status = 'completed'
      ))
    `;

    query += ` ORDER BY scheduled_for ASC LIMIT $${paramIndex}`;
    values.push(limit);

    const result = await db.query(query, values);
    return result.rows.map((row: any) => this.mapRowToAction(row));
  }

  /**
   * Get actions pending approval
   */
  async getActionsPendingApproval(organizationId: string): Promise<ScheduledUserAction[]> {
    const query = `
      SELECT * FROM scheduled_user_actions
      WHERE organization_id = $1
        AND status = 'pending'
        AND requires_approval = true
        AND approved_at IS NULL
        AND rejected_at IS NULL
      ORDER BY scheduled_for ASC
    `;

    const result = await db.query(query, [organizationId]);
    return result.rows.map((row: any) => this.mapRowToAction(row));
  }

  /**
   * Schedule a new action
   */
  async scheduleAction(
    organizationId: string,
    dto: CreateScheduledActionDTO,
    createdBy?: string
  ): Promise<ScheduledUserAction> {
    // Build action config from template if provided
    let actionConfig = dto.configOverrides || {};

    if (dto.actionType === 'onboard' && dto.onboardingTemplateId) {
      const template = await userOnboardingService.getTemplate(dto.onboardingTemplateId);
      if (template) {
        actionConfig = {
          ...template,
          ...actionConfig,
        };
      }
    } else if (dto.actionType === 'offboard' && dto.offboardingTemplateId) {
      const template = await userOffboardingService.getTemplate(dto.offboardingTemplateId);
      if (template) {
        actionConfig = {
          ...template,
          ...actionConfig,
        };
      }
    }

    const query = `
      INSERT INTO scheduled_user_actions (
        organization_id,
        user_id,
        target_email,
        target_first_name,
        target_last_name,
        target_personal_email,
        action_type,
        onboarding_template_id,
        offboarding_template_id,
        action_config,
        config_overrides,
        scheduled_for,
        is_recurring,
        recurrence_interval,
        recurrence_until,
        requires_approval,
        depends_on_action_id,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

    const scheduledFor = typeof dto.scheduledFor === 'string'
      ? new Date(dto.scheduledFor)
      : dto.scheduledFor;

    const recurrenceUntil = dto.recurrenceUntil
      ? typeof dto.recurrenceUntil === 'string'
        ? new Date(dto.recurrenceUntil)
        : dto.recurrenceUntil
      : null;

    const values = [
      organizationId,
      dto.userId || null,
      dto.targetEmail || null,
      dto.targetFirstName || null,
      dto.targetLastName || null,
      dto.targetPersonalEmail || null,
      dto.actionType,
      dto.onboardingTemplateId || null,
      dto.offboardingTemplateId || null,
      JSON.stringify(actionConfig),
      JSON.stringify(dto.configOverrides || {}),
      scheduledFor,
      dto.isRecurring || false,
      dto.recurrenceInterval || null,
      recurrenceUntil,
      dto.requiresApproval || false,
      dto.dependsOnActionId || null,
      createdBy || null,
    ];

    const result = await db.query(query, values);
    return this.mapRowToAction(result.rows[0]);
  }

  /**
   * Update a scheduled action
   */
  async updateAction(
    id: string,
    dto: UpdateScheduledActionDTO
  ): Promise<ScheduledUserAction | null> {
    const action = await this.getAction(id);
    if (!action) return null;

    // Can only update pending actions
    if (action.status !== 'pending') {
      throw new Error('Can only update pending actions');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.scheduledFor !== undefined) {
      updates.push(`scheduled_for = $${paramIndex}`);
      values.push(
        typeof dto.scheduledFor === 'string'
          ? new Date(dto.scheduledFor)
          : dto.scheduledFor
      );
      paramIndex++;
    }

    if (dto.configOverrides !== undefined) {
      updates.push(`config_overrides = $${paramIndex}`);
      values.push(JSON.stringify(dto.configOverrides));
      paramIndex++;

      // Merge with action_config
      const newConfig = {
        ...action.actionConfig,
        ...dto.configOverrides,
      };
      updates.push(`action_config = $${paramIndex}`);
      values.push(JSON.stringify(newConfig));
      paramIndex++;
    }

    if (dto.requiresApproval !== undefined) {
      updates.push(`requires_approval = $${paramIndex}`);
      values.push(dto.requiresApproval);
      paramIndex++;
    }

    if (dto.approvalNotes !== undefined) {
      updates.push(`approval_notes = $${paramIndex}`);
      values.push(dto.approvalNotes);
      paramIndex++;
    }

    if (updates.length === 0) return action;

    values.push(id);
    const query = `
      UPDATE scheduled_user_actions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return this.mapRowToAction(result.rows[0]);
  }

  /**
   * Approve a scheduled action
   */
  async approveAction(
    id: string,
    approvedBy: string,
    notes?: string
  ): Promise<ScheduledUserAction | null> {
    const action = await this.getAction(id);
    if (!action) return null;

    if (action.status !== 'pending') {
      throw new Error('Can only approve pending actions');
    }

    if (!action.requiresApproval) {
      throw new Error('This action does not require approval');
    }

    if (action.approvedAt) {
      throw new Error('Action has already been approved');
    }

    const query = `
      UPDATE scheduled_user_actions
      SET approved_by = $1, approved_at = NOW(), approval_notes = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await db.query(query, [approvedBy, notes || null, id]);
    return this.mapRowToAction(result.rows[0]);
  }

  /**
   * Reject a scheduled action
   */
  async rejectAction(
    id: string,
    rejectedBy: string,
    reason: string
  ): Promise<ScheduledUserAction | null> {
    const action = await this.getAction(id);
    if (!action) return null;

    if (action.status !== 'pending') {
      throw new Error('Can only reject pending actions');
    }

    const query = `
      UPDATE scheduled_user_actions
      SET status = 'cancelled',
          rejected_by = $1,
          rejected_at = NOW(),
          rejection_reason = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await db.query(query, [rejectedBy, reason, id]);
    return this.mapRowToAction(result.rows[0]);
  }

  /**
   * Cancel a scheduled action
   */
  async cancelAction(
    id: string,
    cancelledBy: string,
    reason?: string
  ): Promise<ScheduledUserAction | null> {
    const action = await this.getAction(id);
    if (!action) return null;

    if (action.status !== 'pending') {
      throw new Error('Can only cancel pending actions');
    }

    const query = `
      UPDATE scheduled_user_actions
      SET status = 'cancelled',
          cancelled_by = $1,
          cancelled_at = NOW(),
          cancellation_reason = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await db.query(query, [cancelledBy, reason || null, id]);
    return this.mapRowToAction(result.rows[0]);
  }

  // ==========================================
  // ACTION EXECUTION
  // ==========================================

  /**
   * Process pending actions that are due
   */
  async processPendingActions(limit: number = 10): Promise<ProcessResult> {
    const result: ProcessResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    const pendingActions = await this.getPendingActions(undefined, limit);

    for (const action of pendingActions) {
      result.processed++;

      try {
        // Mark as in progress
        await this.updateStatus(action.id, 'in_progress');

        // Execute based on action type
        const execResult = await this.executeAction(action);

        if (execResult.success) {
          await this.updateStatus(action.id, 'completed');
          result.succeeded++;
        } else {
          // Check retry
          if (action.retryCount < action.maxRetries) {
            await this.scheduleRetry(action);
          } else {
            await this.updateStatus(action.id, 'failed', execResult.error);
          }
          result.failed++;
        }

        // Handle recurring actions
        if (action.isRecurring && action.recurrenceInterval) {
          await this.scheduleNextRecurrence(action);
        }

      } catch (error: any) {
        logger.error('Error processing action', {
          actionId: action.id,
          error: error.message,
        });

        if (action.retryCount < action.maxRetries) {
          await this.scheduleRetry(action);
        } else {
          await this.updateStatus(action.id, 'failed', error.message);
        }
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    action: ScheduledUserAction
  ): Promise<{ success: boolean; error?: string }> {
    switch (action.actionType) {
      case 'onboard':
        return this.executeOnboarding(action);

      case 'offboard':
        return this.executeOffboarding(action);

      case 'suspend':
        return this.executeSuspend(action);

      case 'unsuspend':
        return this.executeUnsuspend(action);

      case 'delete':
        return this.executeDelete(action);

      case 'restore':
        return this.executeRestore(action);

      default:
        return {
          success: false,
          error: `Unknown action type: ${action.actionType}`,
        };
    }
  }

  private async executeOnboarding(
    action: ScheduledUserAction
  ): Promise<{ success: boolean; error?: string }> {
    if (!action.targetEmail || !action.targetFirstName || !action.targetLastName) {
      return {
        success: false,
        error: 'Missing required user details for onboarding',
      };
    }

    const config = action.actionConfig as any;

    const result = await userOnboardingService.executeOnboarding(
      action.organizationId,
      {
        email: action.targetEmail,
        firstName: action.targetFirstName,
        lastName: action.targetLastName,
        personalEmail: action.targetPersonalEmail || undefined,
        jobTitle: config.defaultJobTitle,
        managerId: config.defaultManagerId,
        departmentId: config.departmentId,
        googleLicenseSku: config.googleLicenseSku,
        googleOrgUnitPath: config.googleOrgUnitPath,
        googleServices: config.googleServices,
        groupIds: config.groupIds || [],
        sharedDriveAccess: config.sharedDriveAccess || [],
        calendarSubscriptions: config.calendarSubscriptions || [],
        signatureTemplateId: config.signatureTemplateId,
        sendWelcomeEmail: config.sendWelcomeEmail ?? true,
        welcomeEmailSubject: config.welcomeEmailSubject,
        welcomeEmailBody: config.welcomeEmailBody,
      },
      {
        actionId: action.id,
        triggeredBy: 'system',
      }
    );

    // Update action with user ID if created
    if (result.userId) {
      await db.query(
        'UPDATE scheduled_user_actions SET user_id = $1 WHERE id = $2',
        [result.userId, action.id]
      );
    }

    return {
      success: result.success,
      error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
    };
  }

  private async executeOffboarding(
    action: ScheduledUserAction
  ): Promise<{ success: boolean; error?: string }> {
    if (!action.userId) {
      return {
        success: false,
        error: 'User ID is required for offboarding',
      };
    }

    const result = await userOffboardingService.executeFromTemplate(
      action.organizationId,
      action.offboardingTemplateId || '',
      action.userId,
      {
        actionId: action.id,
        triggeredBy: 'system',
        configOverrides: action.configOverrides as any,
      }
    );

    return {
      success: result.success,
      error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
    };
  }

  private async executeSuspend(
    action: ScheduledUserAction
  ): Promise<{ success: boolean; error?: string }> {
    // Get user email
    if (!action.userId) {
      return { success: false, error: 'User ID required' };
    }

    const userResult = await db.query(
      'SELECT email FROM organization_users WHERE id = $1',
      [action.userId]
    );

    if (userResult.rows.length === 0) {
      return { success: false, error: 'User not found' };
    }

    const userEmail = userResult.rows[0].email;

    // Use Google Workspace service to suspend
    // For now, just update local status
    await db.query(
      `UPDATE organization_users SET user_status = 'suspended', is_active = false WHERE id = $1`,
      [action.userId]
    );

    await lifecycleLogService.logSuccess(
      action.organizationId,
      'suspend',
      'suspend_account',
      {
        actionId: action.id,
        userId: action.userId,
        userEmail,
      }
    );

    return { success: true };
  }

  private async executeUnsuspend(
    action: ScheduledUserAction
  ): Promise<{ success: boolean; error?: string }> {
    if (!action.userId) {
      return { success: false, error: 'User ID required' };
    }

    await db.query(
      `UPDATE organization_users SET user_status = 'active', is_active = true WHERE id = $1`,
      [action.userId]
    );

    await lifecycleLogService.logSuccess(
      action.organizationId,
      'unsuspend',
      'unsuspend_account',
      {
        actionId: action.id,
        userId: action.userId,
      }
    );

    return { success: true };
  }

  private async executeDelete(
    action: ScheduledUserAction
  ): Promise<{ success: boolean; error?: string }> {
    if (!action.userId) {
      return { success: false, error: 'User ID required' };
    }

    // Soft delete - mark as deleted instead of removing
    await db.query(
      `UPDATE organization_users SET user_status = 'deleted', is_active = false, deleted_at = NOW() WHERE id = $1`,
      [action.userId]
    );

    await lifecycleLogService.logSuccess(
      action.organizationId,
      'delete',
      'delete_account',
      {
        actionId: action.id,
        userId: action.userId,
      }
    );

    return { success: true };
  }

  private async executeRestore(
    action: ScheduledUserAction
  ): Promise<{ success: boolean; error?: string }> {
    if (!action.userId) {
      return { success: false, error: 'User ID required' };
    }

    await db.query(
      `UPDATE organization_users SET user_status = 'active', is_active = true, deleted_at = NULL WHERE id = $1`,
      [action.userId]
    );

    await lifecycleLogService.logSuccess(
      action.organizationId,
      'restore',
      'restore_account',
      {
        actionId: action.id,
        userId: action.userId,
      }
    );

    return { success: true };
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private async updateStatus(
    id: string,
    status: ActionStatus,
    errorMessage?: string
  ): Promise<void> {
    const updates = ['status = $1'];
    const values: (string | null)[] = [status];
    let paramIndex = 2;

    if (errorMessage) {
      updates.push(`error_message = $${paramIndex}`);
      values.push(errorMessage);
      paramIndex++;
    }

    values.push(id);
    await db.query(
      `UPDATE scheduled_user_actions SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  private async scheduleRetry(action: ScheduledUserAction): Promise<void> {
    // Exponential backoff: 5 min, 15 min, 45 min, etc.
    const delayMinutes = Math.pow(3, action.retryCount) * 5;
    const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    await db.query(`
      UPDATE scheduled_user_actions
      SET status = 'pending',
          retry_count = retry_count + 1,
          next_retry_at = $1,
          started_at = NULL
      WHERE id = $2
    `, [nextRetryAt, action.id]);

    logger.info('Scheduled retry', {
      actionId: action.id,
      retryCount: action.retryCount + 1,
      nextRetryAt,
    });
  }

  private async scheduleNextRecurrence(action: ScheduledUserAction): Promise<void> {
    if (!action.recurrenceInterval) return;

    // Calculate next scheduled time
    let nextScheduled = new Date(action.scheduledFor);
    switch (action.recurrenceInterval) {
      case 'daily':
        nextScheduled.setDate(nextScheduled.getDate() + 1);
        break;
      case 'weekly':
        nextScheduled.setDate(nextScheduled.getDate() + 7);
        break;
      case 'monthly':
        nextScheduled.setMonth(nextScheduled.getMonth() + 1);
        break;
    }

    // Check if past recurrence end date
    if (action.recurrenceUntil && nextScheduled > new Date(action.recurrenceUntil)) {
      logger.info('Recurrence ended', { actionId: action.id });
      return;
    }

    // Update with next scheduled time
    await db.query(`
      UPDATE scheduled_user_actions
      SET scheduled_for = $1,
          status = 'pending',
          started_at = NULL,
          completed_at = NULL,
          last_recurrence_at = NOW()
      WHERE id = $2
    `, [nextScheduled, action.id]);

    logger.info('Scheduled next recurrence', {
      actionId: action.id,
      nextScheduled,
    });
  }

  // ==========================================
  // ROW MAPPING
  // ==========================================

  private mapRowToAction(row: any): ScheduledUserAction {
    return {
      id: row.id,
      organizationId: row.organization_id,

      // Target user
      userId: row.user_id,
      targetEmail: row.target_email,
      targetFirstName: row.target_first_name,
      targetLastName: row.target_last_name,
      targetPersonalEmail: row.target_personal_email,

      // Action
      actionType: row.action_type,
      onboardingTemplateId: row.onboarding_template_id,
      offboardingTemplateId: row.offboarding_template_id,
      actionConfig: row.action_config || {},
      configOverrides: row.config_overrides || {},

      // Schedule
      scheduledFor: new Date(row.scheduled_for),
      isRecurring: row.is_recurring,
      recurrenceInterval: row.recurrence_interval,
      recurrenceUntil: row.recurrence_until ? new Date(row.recurrence_until) : null,
      lastRecurrenceAt: row.last_recurrence_at ? new Date(row.last_recurrence_at) : null,

      // Status
      status: row.status,
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      totalSteps: row.total_steps,
      completedSteps: row.completed_steps,
      currentStep: row.current_step,

      // Error
      errorMessage: row.error_message,
      errorDetails: row.error_details,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,

      // Approval
      requiresApproval: row.requires_approval,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at ? new Date(row.approved_at) : null,
      approvalNotes: row.approval_notes,
      rejectedBy: row.rejected_by,
      rejectedAt: row.rejected_at ? new Date(row.rejected_at) : null,
      rejectionReason: row.rejection_reason,

      // Dependencies
      dependsOnActionId: row.depends_on_action_id,

      // Audit
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      cancelledBy: row.cancelled_by,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
      cancellationReason: row.cancellation_reason,
    };
  }
}

export const scheduledActionService = new ScheduledActionService();
export default scheduledActionService;
