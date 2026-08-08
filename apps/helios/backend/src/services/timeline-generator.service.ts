/**
 * Timeline Generator Service
 *
 * Converts template timelines into lifecycle tasks and scheduled actions.
 * Handles date calculations based on triggers and offsets.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { lifecycleTaskService, type AssigneeType, type TriggerType, type CreateTaskDTO } from './lifecycle-task.service.js';
import { type UserRequest } from './lifecycle-request.service.js';
import { LifecycleNotificationService } from './lifecycle-notification.service.js';

// Timeline entry types from template
interface TimelineAction {
  type: 'task' | 'email' | 'system' | 'training';
  title?: string;
  description?: string;
  assignee?: AssigneeType;
  category?: string;
  template?: string;
  to?: string;
  action?: string;
  platforms?: string[];
  content_ids?: string[];
  config?: Record<string, unknown>;
}

interface TimelineEntry {
  trigger: 'on_approval' | 'days_before_start' | 'on_start_date' | 'days_after_start';
  offset?: number; // Days offset (negative for before, positive for after)
  actions: TimelineAction[];
}

interface Template {
  id: string;
  organization_id: string;
  name: string;
  timeline: TimelineEntry[];
}

class TimelineGeneratorService {
  /**
   * Generate tasks from a request's template timeline
   */
  async generateFromRequest(request: UserRequest): Promise<void> {
    if (!request.template_id) {
      logger.info(`No template assigned to request ${request.id}, skipping task generation`);
      return;
    }

    const template = await this.getTemplate(request.template_id, request.organization_id);
    if (!template) {
      logger.warn(`Template ${request.template_id} not found for request ${request.id}`);
      return;
    }

    const timeline = template.timeline || [];
    if (timeline.length === 0) {
      logger.info(`Template ${template.name} has no timeline entries`);
      return;
    }

    const referenceDate = request.request_type === 'offboard'
      ? request.end_date
      : request.start_date;

    if (!referenceDate) {
      logger.warn(`No reference date for request ${request.id}`);
      return;
    }

    const tasksToCreate: CreateTaskDTO[] = [];
    let sequenceOrder = 0;

    for (const entry of timeline) {
      const dueDate = this.calculateDate(referenceDate, entry.trigger, entry.offset);

      for (const action of entry.actions) {
        sequenceOrder++;

        if (action.type === 'task') {
          tasksToCreate.push(this.createTaskDTO(request, entry, action, dueDate, sequenceOrder));
        } else if (action.type === 'system') {
          // System actions become tasks with action_type
          tasksToCreate.push(this.createSystemTaskDTO(request, entry, action, dueDate, sequenceOrder));
        } else if (action.type === 'email') {
          // Email actions become system tasks
          tasksToCreate.push(this.createEmailTaskDTO(request, entry, action, dueDate, sequenceOrder));
        } else if (action.type === 'training') {
          // Training assignments become user tasks
          for (const contentId of action.content_ids || []) {
            tasksToCreate.push(this.createTrainingTaskDTO(request, entry, contentId, dueDate, sequenceOrder));
            sequenceOrder++;
          }
        }
      }
    }

    // Create all tasks
    if (tasksToCreate.length > 0) {
      const createdTasks = await lifecycleTaskService.createTasks(tasksToCreate);
      logger.info(`Generated ${tasksToCreate.length} tasks for request ${request.id}`);

      // Send notifications for assigned tasks (non-system, non-training)
      this.sendTaskAssignmentNotifications(request, createdTasks).catch((err: Error) => {
        logger.error('Failed to send task assignment notifications', { error: err.message });
      });
    }
  }

  /**
   * Send notifications to assignees for their new tasks
   */
  private async sendTaskAssignmentNotifications(
    request: UserRequest,
    tasks: Array<{ id: string; title: string; description?: string; due_date?: string; assignee_type: string; assignee_id?: string; category?: string }>
  ): Promise<void> {
    const notificationService = new LifecycleNotificationService(request.organization_id);

    // Group tasks by assignee to avoid spamming with multiple emails
    const tasksByAssignee = new Map<string, typeof tasks>();

    for (const task of tasks) {
      // Only notify for tasks with specific assignees (not system tasks)
      if (task.assignee_type === 'system') continue;

      let assigneeEmail: string | undefined;
      let assigneeName: string | undefined;

      if (task.assignee_id) {
        const userResult = await db.query(
          `SELECT email, first_name, last_name FROM organization_users WHERE id = $1`,
          [task.assignee_id]
        );
        if (userResult.rows.length > 0) {
          assigneeEmail = userResult.rows[0].email;
          assigneeName = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name}`;
        }
      }

      if (assigneeEmail && assigneeName) {
        if (!tasksByAssignee.has(assigneeEmail)) {
          tasksByAssignee.set(assigneeEmail, []);
        }
        tasksByAssignee.get(assigneeEmail)!.push(task);
      }
    }

    // Send one notification per assignee for their first task (keep it simple for now)
    for (const [email, assigneeTasks] of tasksByAssignee.entries()) {
      const firstTask = assigneeTasks[0];
      const userResult = await db.query(
        `SELECT first_name, last_name FROM organization_users WHERE email = $1 AND organization_id = $2`,
        [email, request.organization_id]
      );

      if (userResult.rows.length > 0) {
        const assignee = userResult.rows[0];
        await notificationService.sendTaskAssignedNotification({
          taskId: firstTask.id,
          taskTitle: assigneeTasks.length === 1
            ? firstTask.title
            : `${firstTask.title} (+${assigneeTasks.length - 1} more)`,
          taskDescription: assigneeTasks.length === 1
            ? firstTask.description
            : `You have been assigned ${assigneeTasks.length} tasks for this ${request.request_type}.`,
          dueDate: firstTask.due_date,
          requestName: `${request.first_name} ${request.last_name}`,
          requestEmail: request.email,
          requestType: request.request_type as 'onboard' | 'offboard',
          assigneeName: `${assignee.first_name} ${assignee.last_name}`,
          assigneeEmail: email,
          category: firstTask.category,
        });
      }
    }
  }

  /**
   * Get template with timeline
   */
  private async getTemplate(templateId: string, organizationId: string): Promise<Template | null> {
    const result = await db.query(
      `SELECT id, organization_id, name, timeline
       FROM onboarding_templates
       WHERE id = $1 AND organization_id = $2`,
      [templateId, organizationId]
    );

    if (result.rows.length === 0) {
      // Try offboarding templates
      const offboardResult = await db.query(
        `SELECT id, organization_id, name, timeline
         FROM offboarding_templates
         WHERE id = $1 AND organization_id = $2`,
        [templateId, organizationId]
      );
      return offboardResult.rows[0] || null;
    }

    return result.rows[0];
  }

  /**
   * Calculate due date based on trigger and offset
   */
  private calculateDate(referenceDate: string, trigger: string, offset?: number): string {
    const date = new Date(referenceDate);
    const offsetDays = offset || 0;

    switch (trigger) {
      case 'on_approval':
        // Task is due immediately
        return new Date().toISOString().split('T')[0];

      case 'days_before_start':
        // offset is negative (e.g., -3 for 3 days before)
        date.setDate(date.getDate() + offsetDays);
        return date.toISOString().split('T')[0];

      case 'on_start_date':
        // Due on start date
        return referenceDate;

      case 'days_after_start':
        // offset is positive (e.g., 7 for 7 days after)
        date.setDate(date.getDate() + offsetDays);
        return date.toISOString().split('T')[0];

      default:
        return referenceDate;
    }
  }

  /**
   * Map trigger names to database trigger_type
   */
  private mapTriggerType(trigger: string): TriggerType {
    switch (trigger) {
      case 'on_approval': return 'on_approval';
      case 'days_before_start': return 'days_before_start';
      case 'on_start_date': return 'on_start';
      case 'days_after_start': return 'days_after_start';
      default: return 'on_approval';
    }
  }

  /**
   * Create a manual task DTO
   */
  private createTaskDTO(
    request: UserRequest,
    entry: TimelineEntry,
    action: TimelineAction,
    dueDate: string,
    sequenceOrder: number
  ): CreateTaskDTO {
    return {
      organization_id: request.organization_id,
      request_id: request.id,
      user_id: request.user_id || undefined,
      title: action.title || 'Unnamed task',
      description: action.description,
      category: action.category || request.request_type,
      assignee_type: action.assignee || 'hr',
      assignee_id: this.resolveAssigneeId(request, action.assignee),
      trigger_type: this.mapTriggerType(entry.trigger),
      trigger_offset_days: entry.offset || 0,
      due_date: dueDate,
      sequence_order: sequenceOrder,
    };
  }

  /**
   * Create a system task DTO (for automated actions)
   */
  private createSystemTaskDTO(
    request: UserRequest,
    entry: TimelineEntry,
    action: TimelineAction,
    dueDate: string,
    sequenceOrder: number
  ): CreateTaskDTO {
    const actionTitles: Record<string, string> = {
      create_account: 'Create user account',
      add_to_groups: 'Add user to groups',
      activate_user: 'Activate user account',
      deactivate_user: 'Deactivate user account',
      remove_from_groups: 'Remove user from groups',
      transfer_data: 'Transfer user data',
      archive_account: 'Archive user account',
    };

    return {
      organization_id: request.organization_id,
      request_id: request.id,
      user_id: request.user_id || undefined,
      title: actionTitles[action.action || ''] || `System: ${action.action}`,
      description: action.description,
      category: 'system',
      assignee_type: 'system',
      trigger_type: this.mapTriggerType(entry.trigger),
      trigger_offset_days: entry.offset || 0,
      due_date: dueDate,
      action_type: action.action,
      action_config: {
        platforms: action.platforms,
        ...action.config,
      },
      sequence_order: sequenceOrder,
    };
  }

  /**
   * Create an email task DTO
   */
  private createEmailTaskDTO(
    request: UserRequest,
    entry: TimelineEntry,
    action: TimelineAction,
    dueDate: string,
    sequenceOrder: number
  ): CreateTaskDTO {
    return {
      organization_id: request.organization_id,
      request_id: request.id,
      user_id: request.user_id || undefined,
      title: `Send email: ${action.template || 'notification'}`,
      category: 'notification',
      assignee_type: 'system',
      trigger_type: this.mapTriggerType(entry.trigger),
      trigger_offset_days: entry.offset || 0,
      due_date: dueDate,
      action_type: 'send_email',
      action_config: {
        template: action.template,
        to: action.to,
      },
      sequence_order: sequenceOrder,
    };
  }

  /**
   * Create a training task DTO
   */
  private createTrainingTaskDTO(
    request: UserRequest,
    entry: TimelineEntry,
    contentId: string,
    dueDate: string,
    sequenceOrder: number
  ): CreateTaskDTO {
    return {
      organization_id: request.organization_id,
      request_id: request.id,
      user_id: request.user_id || undefined,
      title: `Complete training: ${contentId}`,
      category: 'training',
      assignee_type: 'user',
      trigger_type: this.mapTriggerType(entry.trigger),
      trigger_offset_days: entry.offset || 0,
      due_date: dueDate,
      action_type: 'complete_training',
      action_config: {
        content_id: contentId,
      },
      sequence_order: sequenceOrder,
    };
  }

  /**
   * Resolve assignee ID based on type and request
   */
  private resolveAssigneeId(request: UserRequest, assigneeType?: string): string | undefined {
    switch (assigneeType) {
      case 'manager':
        return request.manager_id || undefined;
      case 'user':
        return request.user_id || undefined;
      // HR and IT don't have specific IDs - they're role-based
      default:
        return undefined;
    }
  }

  /**
   * Regenerate tasks for a request (delete existing and create new)
   */
  async regenerateTasksForRequest(request: UserRequest): Promise<void> {
    // Delete existing tasks
    await lifecycleTaskService.deleteTasksForRequest(request.id, request.organization_id);

    // Generate new tasks
    await this.generateFromRequest(request);
  }

  /**
   * Preview tasks that would be generated from a template
   */
  async previewTasks(
    templateId: string,
    organizationId: string,
    startDate: string
  ): Promise<Array<{
    title: string;
    assignee_type: string;
    due_date: string;
    trigger_type: string;
    category?: string;
  }>> {
    const template = await this.getTemplate(templateId, organizationId);
    if (!template) {
      return [];
    }

    const timeline = template.timeline || [];
    const preview: Array<{
      title: string;
      assignee_type: string;
      due_date: string;
      trigger_type: string;
      category?: string;
    }> = [];

    for (const entry of timeline) {
      const dueDate = this.calculateDate(startDate, entry.trigger, entry.offset);

      for (const action of entry.actions) {
        if (action.type === 'task') {
          preview.push({
            title: action.title || 'Unnamed task',
            assignee_type: action.assignee || 'hr',
            due_date: dueDate,
            trigger_type: entry.trigger,
            category: action.category,
          });
        } else if (action.type === 'system') {
          preview.push({
            title: `System: ${action.action}`,
            assignee_type: 'system',
            due_date: dueDate,
            trigger_type: entry.trigger,
            category: 'system',
          });
        } else if (action.type === 'email') {
          preview.push({
            title: `Email: ${action.template}`,
            assignee_type: 'system',
            due_date: dueDate,
            trigger_type: entry.trigger,
            category: 'notification',
          });
        }
      }
    }

    return preview.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }
}

export const timelineGeneratorService = new TimelineGeneratorService();
