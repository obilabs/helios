/**
 * Lifecycle Log Service
 *
 * Provides detailed logging for all user lifecycle operations.
 * Used by UserOnboardingService and UserOffboardingService.
 */

import { db } from '../database/connection.js';
import {
  UserLifecycleLog,
  CreateLifecycleLogDTO,
  ActionType,
  LogStatus,
  TriggeredBy,
  LifecycleActivityFeedItem,
  ActionSummary,
} from '../types/user-lifecycle.js';

class LifecycleLogService {
  /**
   * Create a lifecycle log entry
   */
  async createLog(organizationId: string, dto: CreateLifecycleLogDTO): Promise<UserLifecycleLog> {
    const query = `
      INSERT INTO user_lifecycle_logs (
        organization_id,
        action_id,
        user_id,
        user_email,
        action_type,
        action_step,
        step_description,
        step_order,
        status,
        duration_ms,
        details,
        api_request,
        api_response,
        target_resource_type,
        target_resource_id,
        target_resource_name,
        error_message,
        error_code,
        error_details,
        is_retry,
        retry_attempt,
        triggered_by,
        triggered_by_user_id,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *
    `;

    const values = [
      organizationId,
      dto.actionId || null,
      dto.userId || null,
      dto.userEmail || null,
      dto.actionType,
      dto.actionStep,
      dto.stepDescription || null,
      dto.stepOrder || 0,
      dto.status,
      dto.durationMs || null,
      JSON.stringify(dto.details || {}),
      dto.apiRequest ? JSON.stringify(dto.apiRequest) : null,
      dto.apiResponse ? JSON.stringify(dto.apiResponse) : null,
      dto.targetResourceType || null,
      dto.targetResourceId || null,
      dto.targetResourceName || null,
      dto.errorMessage || null,
      dto.errorCode || null,
      dto.errorDetails ? JSON.stringify(dto.errorDetails) : null,
      dto.isRetry || false,
      dto.retryAttempt || 0,
      dto.triggeredBy || 'system',
      dto.triggeredByUserId || null,
      dto.ipAddress || null,
      dto.userAgent || null,
    ];

    const result = await db.query(query, values);
    return this.mapRowToLog(result.rows[0]);
  }

  /**
   * Log a successful step
   */
  async logSuccess(
    organizationId: string,
    actionType: ActionType,
    actionStep: string,
    options: {
      actionId?: string;
      userId?: string;
      userEmail?: string;
      stepDescription?: string;
      stepOrder?: number;
      durationMs?: number;
      details?: Record<string, unknown>;
      targetResourceType?: string;
      targetResourceId?: string;
      targetResourceName?: string;
      triggeredBy?: TriggeredBy;
      triggeredByUserId?: string;
    } = {}
  ): Promise<UserLifecycleLog> {
    return this.createLog(organizationId, {
      actionType,
      actionStep,
      status: 'success',
      ...options,
    });
  }

  /**
   * Log a failed step
   */
  async logFailure(
    organizationId: string,
    actionType: ActionType,
    actionStep: string,
    error: Error | string,
    options: {
      actionId?: string;
      userId?: string;
      userEmail?: string;
      stepDescription?: string;
      stepOrder?: number;
      durationMs?: number;
      details?: Record<string, unknown>;
      errorCode?: string;
      errorDetails?: Record<string, unknown>;
      targetResourceType?: string;
      targetResourceId?: string;
      targetResourceName?: string;
      triggeredBy?: TriggeredBy;
      triggeredByUserId?: string;
      isRetry?: boolean;
      retryAttempt?: number;
    } = {}
  ): Promise<UserLifecycleLog> {
    const errorMessage = error instanceof Error ? error.message : error;
    return this.createLog(organizationId, {
      actionType,
      actionStep,
      status: 'failed',
      errorMessage,
      ...options,
    });
  }

  /**
   * Log a skipped step
   */
  async logSkipped(
    organizationId: string,
    actionType: ActionType,
    actionStep: string,
    reason: string,
    options: {
      actionId?: string;
      userId?: string;
      userEmail?: string;
      stepOrder?: number;
      triggeredBy?: TriggeredBy;
      triggeredByUserId?: string;
    } = {}
  ): Promise<UserLifecycleLog> {
    return this.createLog(organizationId, {
      actionType,
      actionStep,
      status: 'skipped',
      stepDescription: reason,
      ...options,
    });
  }

  /**
   * Simple log method for lifecycle events
   * Used for request/task status changes
   */
  async log(options: {
    organizationId: string;
    userId?: string | null;
    action: string;
    details?: Record<string, unknown>;
    performedBy?: string | null;
  }): Promise<void> {
    try {
      await this.createLog(options.organizationId, {
        actionType: 'manual' as ActionType,
        actionStep: options.action,
        status: 'success',
        userId: options.userId || undefined,
        details: options.details,
        triggeredByUserId: options.performedBy || undefined,
      });
    } catch (error) {
      // Don't throw - logging failures shouldn't break the main operation
      console.error('Failed to create lifecycle log:', error);
    }
  }

  /**
   * Get logs for a specific action
   */
  async getLogsForAction(actionId: string): Promise<UserLifecycleLog[]> {
    const query = `
      SELECT * FROM user_lifecycle_logs
      WHERE action_id = $1
      ORDER BY step_order ASC, executed_at ASC
    `;

    const result = await db.query(query, [actionId]);
    return result.rows.map((row: any) => this.mapRowToLog(row));
  }

  /**
   * Get logs for a specific user
   */
  async getLogsForUser(
    organizationId: string,
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      actionType?: ActionType;
    } = {}
  ): Promise<{ logs: UserLifecycleLog[]; total: number }> {
    const { limit = 50, offset = 0, actionType } = options;

    let whereClause = 'organization_id = $1 AND user_id = $2';
    const values: (string | number)[] = [organizationId, userId];
    let paramIndex = 3;

    if (actionType) {
      whereClause += ` AND action_type = $${paramIndex}`;
      values.push(actionType);
      paramIndex++;
    }

    const countQuery = `
      SELECT COUNT(*) FROM user_lifecycle_logs WHERE ${whereClause}
    `;
    const countResult = await db.query(countQuery, values.slice(0, paramIndex - 1));
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM user_lifecycle_logs
      WHERE ${whereClause}
      ORDER BY executed_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    const result = await db.query(dataQuery, values);

    return {
      logs: result.rows.map((row: any) => this.mapRowToLog(row)),
      total,
    };
  }

  /**
   * Get activity feed for organization
   */
  async getActivityFeed(
    organizationId: string,
    options: {
      limit?: number;
      offset?: number;
      actionType?: ActionType;
      status?: LogStatus;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ items: LifecycleActivityFeedItem[]; total: number }> {
    const { limit = 50, offset = 0, actionType, status, startDate, endDate } = options;

    let whereClause = 'organization_id = $1';
    const values: (string | number | Date)[] = [organizationId];
    let paramIndex = 2;

    if (actionType) {
      whereClause += ` AND action_type = $${paramIndex}`;
      values.push(actionType);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND executed_at >= $${paramIndex}`;
      values.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND executed_at <= $${paramIndex}`;
      values.push(endDate);
      paramIndex++;
    }

    // Use the view for activity feed
    const countQuery = `
      SELECT COUNT(*) FROM lifecycle_activity_feed WHERE ${whereClause}
    `;
    const countResult = await db.query(countQuery, values.slice(0, paramIndex - 1));
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT * FROM lifecycle_activity_feed
      WHERE ${whereClause}
      ORDER BY executed_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    const result = await db.query(dataQuery, values);

    return {
      items: result.rows.map((row: any) => ({
        id: row.id,
        organizationId: row.organization_id,
        actionId: row.action_id,
        userId: row.user_id,
        userEmail: row.user_email,
        userDisplayName: row.user_display_name,
        actionType: row.action_type,
        actionStep: row.action_step,
        stepDescription: row.step_description,
        status: row.status,
        executedAt: new Date(row.executed_at),
        triggeredBy: row.triggered_by,
        triggeredByName: row.triggered_by_name,
      })),
      total,
    };
  }

  /**
   * Get action summary
   */
  async getActionSummary(actionId: string): Promise<ActionSummary | null> {
    const query = `
      SELECT * FROM lifecycle_action_summary WHERE action_id = $1
    `;

    const result = await db.query(query, [actionId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      actionId: row.action_id,
      organizationId: row.organization_id,
      userId: row.user_id,
      targetEmail: row.target_email,
      actionType: row.action_type,
      actionStatus: row.action_status,
      scheduledFor: new Date(row.scheduled_for),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      totalSteps: parseInt(row.total_steps, 10),
      successfulSteps: parseInt(row.successful_steps, 10),
      failedSteps: parseInt(row.failed_steps, 10),
      skippedSteps: parseInt(row.skipped_steps, 10),
      totalDurationMs: row.total_duration_ms ? parseInt(row.total_duration_ms, 10) : undefined,
      lastError: row.last_error,
    };
  }

  /**
   * Get recent errors for organization
   */
  async getRecentErrors(
    organizationId: string,
    limit: number = 10
  ): Promise<UserLifecycleLog[]> {
    const query = `
      SELECT * FROM user_lifecycle_logs
      WHERE organization_id = $1 AND status = 'failed'
      ORDER BY executed_at DESC
      LIMIT $2
    `;

    const result = await db.query(query, [organizationId, limit]);
    return result.rows.map((row: any) => this.mapRowToLog(row));
  }

  /**
   * Map database row to UserLifecycleLog
   */
  private mapRowToLog(row: any): UserLifecycleLog {
    return {
      id: row.id,
      organizationId: row.organization_id,
      actionId: row.action_id,
      userId: row.user_id,
      userEmail: row.user_email,
      actionType: row.action_type,
      actionStep: row.action_step,
      stepDescription: row.step_description,
      stepOrder: row.step_order,
      status: row.status,
      durationMs: row.duration_ms,
      details: row.details || {},
      apiRequest: row.api_request,
      apiResponse: row.api_response,
      targetResourceType: row.target_resource_type,
      targetResourceId: row.target_resource_id,
      targetResourceName: row.target_resource_name,
      errorMessage: row.error_message,
      errorCode: row.error_code,
      errorDetails: row.error_details,
      isRetry: row.is_retry,
      retryAttempt: row.retry_attempt,
      triggeredBy: row.triggered_by,
      triggeredByUserId: row.triggered_by_user_id,
      executedAt: new Date(row.executed_at),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }
}

export const lifecycleLogService = new LifecycleLogService();
export default lifecycleLogService;
