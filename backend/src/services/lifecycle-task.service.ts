/**
 * Lifecycle Task Service
 *
 * Manages lifecycle tasks assigned to different parties.
 * Includes task listing, completion, and dependency resolution.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { lifecycleLogService } from './lifecycle-log.service.js';

// Types
export type AssigneeType = 'user' | 'manager' | 'hr' | 'it' | 'system';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
export type TriggerType = 'on_approval' | 'days_before_start' | 'on_start' | 'days_after_start';

export interface LifecycleTask {
  id: string;
  organization_id: string;
  request_id?: string;
  user_id?: string;
  title: string;
  description?: string;
  category?: string;
  assignee_type: AssigneeType;
  assignee_id?: string;
  assignee_role?: string;
  trigger_type?: TriggerType;
  trigger_offset_days: number;
  due_date?: string;
  status: TaskStatus;
  completed_at?: string;
  completed_by?: string;
  completion_notes?: string;
  action_type?: string;
  action_config?: Record<string, unknown>;
  scheduled_action_id?: string;
  sequence_order: number;
  depends_on_task_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskDTO {
  organization_id: string;
  request_id?: string;
  user_id?: string;
  title: string;
  description?: string;
  category?: string;
  assignee_type: AssigneeType;
  assignee_id?: string;
  assignee_role?: string;
  trigger_type?: TriggerType;
  trigger_offset_days?: number;
  due_date?: string;
  action_type?: string;
  action_config?: Record<string, unknown>;
  sequence_order?: number;
  depends_on_task_id?: string;
}

export interface ListTasksOptions {
  request_id?: string;
  user_id?: string;
  assignee_type?: AssigneeType | AssigneeType[];
  assignee_id?: string;
  status?: TaskStatus | TaskStatus[];
  category?: string;
  overdue_only?: boolean;
  due_before?: string;
  due_after?: string;
  limit?: number;
  offset?: number;
}

class LifecycleTaskService {
  /**
   * Create a new task
   */
  async createTask(dto: CreateTaskDTO): Promise<LifecycleTask> {
    const result = await db.query(
      `INSERT INTO lifecycle_tasks (
        organization_id, request_id, user_id, title, description, category,
        assignee_type, assignee_id, assignee_role, trigger_type, trigger_offset_days,
        due_date, action_type, action_config, sequence_order, depends_on_task_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        dto.organization_id,
        dto.request_id || null,
        dto.user_id || null,
        dto.title,
        dto.description || null,
        dto.category || null,
        dto.assignee_type,
        dto.assignee_id || null,
        dto.assignee_role || null,
        dto.trigger_type || null,
        dto.trigger_offset_days || 0,
        dto.due_date || null,
        dto.action_type || null,
        dto.action_config ? JSON.stringify(dto.action_config) : null,
        dto.sequence_order || 0,
        dto.depends_on_task_id || null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Create multiple tasks
   */
  async createTasks(tasks: CreateTaskDTO[]): Promise<LifecycleTask[]> {
    if (tasks.length === 0) return [];

    const createdTasks: LifecycleTask[] = [];
    for (const task of tasks) {
      const created = await this.createTask(task);
      createdTasks.push(created);
    }
    return createdTasks;
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string, organizationId: string): Promise<LifecycleTask | null> {
    const result = await db.query(
      `SELECT t.*,
        assignee.first_name || ' ' || assignee.last_name as assignee_name,
        completer.first_name || ' ' || completer.last_name as completed_by_name,
        r.email as request_email,
        r.first_name || ' ' || r.last_name as request_name
      FROM lifecycle_tasks t
      LEFT JOIN organization_users assignee ON t.assignee_id = assignee.id
      LEFT JOIN organization_users completer ON t.completed_by = completer.id
      LEFT JOIN user_requests r ON t.request_id = r.id
      WHERE t.id = $1 AND t.organization_id = $2`,
      [taskId, organizationId]
    );

    return result.rows[0] || null;
  }

  /**
   * List tasks with filters
   */
  async listTasks(
    organizationId: string,
    options: ListTasksOptions = {}
  ): Promise<{ tasks: LifecycleTask[]; total: number }> {
    const {
      request_id,
      user_id,
      assignee_type,
      assignee_id,
      status,
      category,
      overdue_only,
      due_before,
      due_after,
      limit = 50,
      offset = 0,
    } = options;

    let whereClause = 't.organization_id = $1';
    const values: (string | string[] | number | boolean)[] = [organizationId];
    let paramIndex = 2;

    if (request_id) {
      whereClause += ` AND t.request_id = $${paramIndex}`;
      values.push(request_id);
      paramIndex++;
    }

    if (user_id) {
      whereClause += ` AND t.user_id = $${paramIndex}`;
      values.push(user_id);
      paramIndex++;
    }

    if (assignee_type) {
      if (Array.isArray(assignee_type)) {
        whereClause += ` AND t.assignee_type = ANY($${paramIndex})`;
        values.push(assignee_type);
      } else {
        whereClause += ` AND t.assignee_type = $${paramIndex}`;
        values.push(assignee_type);
      }
      paramIndex++;
    }

    if (assignee_id) {
      whereClause += ` AND t.assignee_id = $${paramIndex}`;
      values.push(assignee_id);
      paramIndex++;
    }

    if (status) {
      if (Array.isArray(status)) {
        whereClause += ` AND t.status = ANY($${paramIndex})`;
        values.push(status);
      } else {
        whereClause += ` AND t.status = $${paramIndex}`;
        values.push(status);
      }
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND t.category = $${paramIndex}`;
      values.push(category);
      paramIndex++;
    }

    if (overdue_only) {
      whereClause += ` AND t.due_date < CURRENT_DATE AND t.status = 'pending'`;
    }

    if (due_before) {
      whereClause += ` AND t.due_date <= $${paramIndex}`;
      values.push(due_before);
      paramIndex++;
    }

    if (due_after) {
      whereClause += ` AND t.due_date >= $${paramIndex}`;
      values.push(due_after);
      paramIndex++;
    }

    // Get count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM lifecycle_tasks t WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data with joins
    const dataQuery = `
      SELECT t.*,
        assignee.first_name || ' ' || assignee.last_name as assignee_name,
        completer.first_name || ' ' || completer.last_name as completed_by_name,
        r.email as request_email,
        r.first_name || ' ' || r.last_name as request_name,
        r.start_date as request_start_date
      FROM lifecycle_tasks t
      LEFT JOIN organization_users assignee ON t.assignee_id = assignee.id
      LEFT JOIN organization_users completer ON t.completed_by = completer.id
      LEFT JOIN user_requests r ON t.request_id = r.id
      WHERE ${whereClause}
      ORDER BY t.due_date ASC NULLS LAST, t.sequence_order ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    values.push(limit, offset);

    const result = await db.query(dataQuery, values);

    return { tasks: result.rows, total };
  }

  /**
   * Get tasks for a specific user (assigned directly or by role)
   */
  async getMyTasks(
    organizationId: string,
    userId: string,
    options: { status?: TaskStatus[]; limit?: number; offset?: number } = {}
  ): Promise<{ tasks: LifecycleTask[]; total: number }> {
    const { status = ['pending', 'in_progress'], limit = 50, offset = 0 } = options;

    // Get user's role info for role-based tasks
    const userResult = await db.query(
      `SELECT role FROM organization_users WHERE id = $1 AND organization_id = $2`,
      [userId, organizationId]
    );
    const userRole = userResult.rows[0]?.role;

    // Build assignee conditions
    let assigneeCondition = `t.assignee_id = $2`;
    const values: (string | string[] | number)[] = [organizationId, userId];
    let paramIndex = 3;

    // Add role-based assignment
    if (userRole === 'admin' || userRole === 'super_admin') {
      // Admins can see IT and HR tasks
      assigneeCondition += ` OR t.assignee_type IN ('it', 'hr')`;
    }

    // Tasks where user is the manager of the request target
    assigneeCondition += ` OR (t.assignee_type = 'manager' AND EXISTS (
      SELECT 1 FROM user_requests r WHERE r.id = t.request_id AND r.manager_id = $2
    ))`;

    // Tasks assigned to the user themselves (for onboarding users)
    assigneeCondition += ` OR (t.assignee_type = 'user' AND t.user_id = $2)`;

    const statusCondition = ` AND t.status = ANY($${paramIndex})`;
    values.push(status);
    paramIndex++;

    // Get count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM lifecycle_tasks t
       WHERE t.organization_id = $1 AND (${assigneeCondition})${statusCondition}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get data
    values.push(limit, offset);
    const result = await db.query(
      `SELECT t.*,
        r.email as request_email,
        r.first_name || ' ' || r.last_name as request_name,
        r.start_date as request_start_date
      FROM lifecycle_tasks t
      LEFT JOIN user_requests r ON t.request_id = r.id
      WHERE t.organization_id = $1 AND (${assigneeCondition})${statusCondition}
      ORDER BY t.due_date ASC NULLS LAST, t.sequence_order ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      values
    );

    return { tasks: result.rows, total };
  }

  /**
   * Complete a task
   */
  async completeTask(
    taskId: string,
    organizationId: string,
    completedBy: string,
    notes?: string
  ): Promise<LifecycleTask | null> {
    const existing = await this.getTask(taskId, organizationId);
    if (!existing) {
      throw new Error('Task not found');
    }
    if (existing.status === 'completed') {
      throw new Error('Task is already completed');
    }
    if (existing.status === 'blocked') {
      throw new Error('Task is blocked by dependencies');
    }

    const result = await db.query(
      `UPDATE lifecycle_tasks
       SET status = 'completed',
           completed_at = NOW(),
           completed_by = $3,
           completion_notes = $4,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [taskId, organizationId, completedBy, notes || null]
    );

    const task = result.rows[0];

    if (task) {
      // Log completion
      await lifecycleLogService.log({
        organizationId,
        userId: task.user_id || null,
        action: 'task_completed',
        details: {
          task_id: taskId,
          task_title: task.title,
          request_id: task.request_id,
          notes,
        },
        performedBy: completedBy,
      });

      // Unblock dependent tasks
      await this.unblockDependentTasks(taskId, organizationId);

      logger.info(`Completed task: ${task.title}`, { taskId, requestId: task.request_id });
    }

    return task;
  }

  /**
   * Skip a task
   */
  async skipTask(
    taskId: string,
    organizationId: string,
    skippedBy: string,
    reason?: string
  ): Promise<LifecycleTask | null> {
    const existing = await this.getTask(taskId, organizationId);
    if (!existing) {
      throw new Error('Task not found');
    }
    if (['completed', 'skipped'].includes(existing.status)) {
      throw new Error(`Cannot skip task with status: ${existing.status}`);
    }

    const result = await db.query(
      `UPDATE lifecycle_tasks
       SET status = 'skipped',
           completed_at = NOW(),
           completed_by = $3,
           completion_notes = $4,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [taskId, organizationId, skippedBy, reason || null]
    );

    const task = result.rows[0];

    if (task) {
      await lifecycleLogService.log({
        organizationId,
        userId: task.user_id || null,
        action: 'task_skipped',
        details: {
          task_id: taskId,
          task_title: task.title,
          request_id: task.request_id,
          reason,
        },
        performedBy: skippedBy,
      });

      // Unblock dependent tasks even when skipped
      await this.unblockDependentTasks(taskId, organizationId);
    }

    return task;
  }

  /**
   * Mark task as in progress
   */
  async startTask(
    taskId: string,
    organizationId: string
  ): Promise<LifecycleTask | null> {
    const result = await db.query(
      `UPDATE lifecycle_tasks
       SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'pending'
       RETURNING *`,
      [taskId, organizationId]
    );

    return result.rows[0] || null;
  }

  /**
   * Unblock tasks that depend on the completed task
   */
  private async unblockDependentTasks(taskId: string, organizationId: string): Promise<void> {
    await db.query(
      `UPDATE lifecycle_tasks
       SET status = 'pending', updated_at = NOW()
       WHERE depends_on_task_id = $1 AND organization_id = $2 AND status = 'blocked'`,
      [taskId, organizationId]
    );
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(organizationId: string): Promise<LifecycleTask[]> {
    const result = await db.query(
      `SELECT t.*,
        r.email as request_email,
        r.first_name || ' ' || r.last_name as request_name
      FROM lifecycle_tasks t
      LEFT JOIN user_requests r ON t.request_id = r.id
      WHERE t.organization_id = $1
        AND t.status = 'pending'
        AND t.due_date < CURRENT_DATE
      ORDER BY t.due_date ASC`,
      [organizationId]
    );
    return result.rows;
  }

  /**
   * Get task counts for dashboard
   */
  async getTaskCounts(organizationId: string, userId?: string): Promise<{
    pending: number;
    in_progress: number;
    overdue: number;
    completed_today: number;
  }> {
    let userCondition = '';
    const values: string[] = [organizationId];

    if (userId) {
      userCondition = ` AND (assignee_id = $2 OR user_id = $2)`;
      values.push(userId);
    }

    const result = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'pending' AND due_date < CURRENT_DATE) as overdue,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at::date = CURRENT_DATE) as completed_today
      FROM lifecycle_tasks
      WHERE organization_id = $1${userCondition}`,
      values
    );

    const row = result.rows[0];
    return {
      pending: parseInt(row.pending, 10),
      in_progress: parseInt(row.in_progress, 10),
      overdue: parseInt(row.overdue, 10),
      completed_today: parseInt(row.completed_today, 10),
    };
  }

  /**
   * Delete tasks for a request
   */
  async deleteTasksForRequest(requestId: string, organizationId: string): Promise<number> {
    const result = await db.query(
      `DELETE FROM lifecycle_tasks WHERE request_id = $1 AND organization_id = $2`,
      [requestId, organizationId]
    );
    return result.rowCount || 0;
  }
}

export const lifecycleTaskService = new LifecycleTaskService();
