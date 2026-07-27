/**
 * Lifecycle Notification Service
 *
 * Handles notifications for lifecycle automation:
 * - Task assignments and reminders
 * - Request approvals and rejections
 * - Due date alerts and overdue notifications
 * - Completion confirmations
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { EmailService } from './email.service.js';

export interface NotificationPreferences {
  email: {
    taskAssigned: boolean;
    taskReminder: boolean;
    taskOverdue: boolean;
    requestApproved: boolean;
    requestRejected: boolean;
    dailyDigest: boolean;
  };
  reminderDays: number; // Days before due date to send reminder
}

export interface TaskNotificationData {
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  dueDate?: string;
  requestName: string;
  requestEmail: string;
  requestType: 'onboard' | 'offboard';
  assigneeName: string;
  assigneeEmail: string;
  category?: string;
}

export interface RequestNotificationData {
  requestId: string;
  requestType: 'onboard' | 'offboard';
  userName: string;
  userEmail: string;
  startDate?: string;
  requesterName: string;
  requesterEmail: string;
  approverName?: string;
  rejectionReason?: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: {
    taskAssigned: true,
    taskReminder: true,
    taskOverdue: true,
    requestApproved: true,
    requestRejected: true,
    dailyDigest: false,
  },
  reminderDays: 1,
};

export class LifecycleNotificationService {
  private organizationId: string;
  private emailService: EmailService;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.emailService = new EmailService(organizationId);
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const result = await db.query(
        `SELECT user_preferences->'notifications' as notifications
         FROM organization_users
         WHERE id = $1`,
        [userId]
      );

      if (result.rows[0]?.notifications) {
        return {
          ...DEFAULT_PREFERENCES,
          ...result.rows[0].notifications,
        };
      }

      return DEFAULT_PREFERENCES;
    } catch (error: any) {
      logger.error('Failed to get user preferences', { error: error.message, userId });
      return DEFAULT_PREFERENCES;
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<boolean> {
    try {
      await db.query(
        `UPDATE organization_users
         SET user_preferences = jsonb_set(
           COALESCE(user_preferences, '{}'::jsonb),
           '{notifications}',
           $2::jsonb
         ),
         updated_at = NOW()
         WHERE id = $1`,
        [userId, JSON.stringify({ ...DEFAULT_PREFERENCES, ...preferences })]
      );

      return true;
    } catch (error: any) {
      logger.error('Failed to update user preferences', { error: error.message, userId });
      return false;
    }
  }

  /**
   * Send task assignment notification
   */
  async sendTaskAssignedNotification(data: TaskNotificationData): Promise<boolean> {
    try {
      // Get assignee user ID and preferences
      const userResult = await db.query(
        `SELECT id, first_name, last_name, user_preferences->'notifications' as prefs
         FROM organization_users
         WHERE email = $1 AND organization_id = $2`,
        [data.assigneeEmail, this.organizationId]
      );

      if (userResult.rows.length === 0) {
        logger.warn('Assignee not found for task notification', { email: data.assigneeEmail });
        return false;
      }

      const prefs = userResult.rows[0].prefs || DEFAULT_PREFERENCES;
      if (!prefs.email?.taskAssigned) {
        logger.debug('Task assignment notification disabled for user', { email: data.assigneeEmail });
        return false;
      }

      // Get organization name
      const orgResult = await db.query(
        'SELECT name FROM organizations WHERE id = $1',
        [this.organizationId]
      );
      const orgName = orgResult.rows[0]?.name || 'Helios';

      // Get email template or use default
      const template = await this.getEmailTemplate('task_assigned');

      const variables = {
        assigneeName: data.assigneeName,
        taskTitle: data.taskTitle,
        taskDescription: data.taskDescription || '',
        dueDate: data.dueDate ? this.formatDate(data.dueDate) : 'No due date',
        requestName: data.requestName,
        requestType: data.requestType === 'onboard' ? 'Onboarding' : 'Offboarding',
        category: data.category || 'General',
        organizationName: orgName,
        taskUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tasks`,
      };

      const subject = this.replaceVariables(template.subject, variables);
      const html = this.buildEmailHtml(this.replaceVariables(template.body, variables), variables);

      return await this.emailService.sendEmail({
        to: data.assigneeEmail,
        subject,
        html,
      });
    } catch (error: any) {
      logger.error('Failed to send task assigned notification', { error: error.message, data });
      return false;
    }
  }

  /**
   * Send task reminder notification
   */
  async sendTaskReminderNotification(data: TaskNotificationData): Promise<boolean> {
    try {
      const userResult = await db.query(
        `SELECT id, first_name, user_preferences->'notifications' as prefs
         FROM organization_users
         WHERE email = $1 AND organization_id = $2`,
        [data.assigneeEmail, this.organizationId]
      );

      if (userResult.rows.length === 0) return false;

      const prefs = userResult.rows[0].prefs || DEFAULT_PREFERENCES;
      if (!prefs.email?.taskReminder) return false;

      const orgResult = await db.query(
        'SELECT name FROM organizations WHERE id = $1',
        [this.organizationId]
      );
      const orgName = orgResult.rows[0]?.name || 'Helios';

      const template = await this.getEmailTemplate('task_reminder');

      const variables = {
        assigneeName: data.assigneeName,
        taskTitle: data.taskTitle,
        taskDescription: data.taskDescription || '',
        dueDate: data.dueDate ? this.formatDate(data.dueDate) : 'No due date',
        requestName: data.requestName,
        requestType: data.requestType === 'onboard' ? 'Onboarding' : 'Offboarding',
        organizationName: orgName,
        taskUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tasks`,
      };

      const subject = this.replaceVariables(template.subject, variables);
      const html = this.buildEmailHtml(this.replaceVariables(template.body, variables), variables);

      return await this.emailService.sendEmail({
        to: data.assigneeEmail,
        subject,
        html,
      });
    } catch (error: any) {
      logger.error('Failed to send task reminder notification', { error: error.message });
      return false;
    }
  }

  /**
   * Send task overdue notification
   */
  async sendTaskOverdueNotification(data: TaskNotificationData): Promise<boolean> {
    try {
      const userResult = await db.query(
        `SELECT id, first_name, user_preferences->'notifications' as prefs
         FROM organization_users
         WHERE email = $1 AND organization_id = $2`,
        [data.assigneeEmail, this.organizationId]
      );

      if (userResult.rows.length === 0) return false;

      const prefs = userResult.rows[0].prefs || DEFAULT_PREFERENCES;
      if (!prefs.email?.taskOverdue) return false;

      const orgResult = await db.query(
        'SELECT name FROM organizations WHERE id = $1',
        [this.organizationId]
      );
      const orgName = orgResult.rows[0]?.name || 'Helios';

      const template = await this.getEmailTemplate('task_overdue');

      const daysOverdue = data.dueDate
        ? Math.ceil((new Date().getTime() - new Date(data.dueDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const variables = {
        assigneeName: data.assigneeName,
        taskTitle: data.taskTitle,
        taskDescription: data.taskDescription || '',
        dueDate: data.dueDate ? this.formatDate(data.dueDate) : 'No due date',
        daysOverdue: daysOverdue.toString(),
        requestName: data.requestName,
        requestType: data.requestType === 'onboard' ? 'Onboarding' : 'Offboarding',
        organizationName: orgName,
        taskUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tasks`,
      };

      const subject = this.replaceVariables(template.subject, variables);
      const html = this.buildEmailHtml(this.replaceVariables(template.body, variables), variables);

      return await this.emailService.sendEmail({
        to: data.assigneeEmail,
        subject,
        html,
      });
    } catch (error: any) {
      logger.error('Failed to send task overdue notification', { error: error.message });
      return false;
    }
  }

  /**
   * Send request approved notification
   */
  async sendRequestApprovedNotification(data: RequestNotificationData): Promise<boolean> {
    try {
      const userResult = await db.query(
        `SELECT id, first_name, user_preferences->'notifications' as prefs
         FROM organization_users
         WHERE email = $1 AND organization_id = $2`,
        [data.requesterEmail, this.organizationId]
      );

      if (userResult.rows.length === 0) return false;

      const prefs = userResult.rows[0].prefs || DEFAULT_PREFERENCES;
      if (!prefs.email?.requestApproved) return false;

      const orgResult = await db.query(
        'SELECT name FROM organizations WHERE id = $1',
        [this.organizationId]
      );
      const orgName = orgResult.rows[0]?.name || 'Helios';

      const template = await this.getEmailTemplate('request_approved');

      const variables = {
        requesterName: data.requesterName,
        userName: data.userName,
        userEmail: data.userEmail,
        requestType: data.requestType === 'onboard' ? 'Onboarding' : 'Offboarding',
        startDate: data.startDate ? this.formatDate(data.startDate) : 'Not specified',
        approverName: data.approverName || 'An administrator',
        organizationName: orgName,
        requestsUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/lifecycle/requests`,
      };

      const subject = this.replaceVariables(template.subject, variables);
      const html = this.buildEmailHtml(this.replaceVariables(template.body, variables), variables);

      return await this.emailService.sendEmail({
        to: data.requesterEmail,
        subject,
        html,
      });
    } catch (error: any) {
      logger.error('Failed to send request approved notification', { error: error.message });
      return false;
    }
  }

  /**
   * Send request rejected notification
   */
  async sendRequestRejectedNotification(data: RequestNotificationData): Promise<boolean> {
    try {
      const userResult = await db.query(
        `SELECT id, first_name, user_preferences->'notifications' as prefs
         FROM organization_users
         WHERE email = $1 AND organization_id = $2`,
        [data.requesterEmail, this.organizationId]
      );

      if (userResult.rows.length === 0) return false;

      const prefs = userResult.rows[0].prefs || DEFAULT_PREFERENCES;
      if (!prefs.email?.requestRejected) return false;

      const orgResult = await db.query(
        'SELECT name FROM organizations WHERE id = $1',
        [this.organizationId]
      );
      const orgName = orgResult.rows[0]?.name || 'Helios';

      const template = await this.getEmailTemplate('request_rejected');

      const variables = {
        requesterName: data.requesterName,
        userName: data.userName,
        userEmail: data.userEmail,
        requestType: data.requestType === 'onboard' ? 'Onboarding' : 'Offboarding',
        rejectionReason: data.rejectionReason || 'No reason provided',
        approverName: data.approverName || 'An administrator',
        organizationName: orgName,
        requestsUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/lifecycle/requests`,
      };

      const subject = this.replaceVariables(template.subject, variables);
      const html = this.buildEmailHtml(this.replaceVariables(template.body, variables), variables);

      return await this.emailService.sendEmail({
        to: data.requesterEmail,
        subject,
        html,
      });
    } catch (error: any) {
      logger.error('Failed to send request rejected notification', { error: error.message });
      return false;
    }
  }

  /**
   * Process pending task reminders
   * Called by scheduler to send reminders for tasks due soon
   */
  async processTaskReminders(): Promise<number> {
    let sentCount = 0;

    try {
      // Get tasks due within reminder window that haven't had a reminder sent
      const result = await db.query(
        `SELECT
           t.id,
           t.title,
           t.description,
           t.due_date,
           t.assignee_user_id,
           t.category,
           r.request_type,
           r.user_email as request_email,
           r.user_first_name || ' ' || r.user_last_name as request_name,
           ou.email as assignee_email,
           ou.first_name || ' ' || ou.last_name as assignee_name
         FROM lifecycle_tasks t
         JOIN user_requests r ON t.request_id = r.id
         LEFT JOIN organization_users ou ON t.assignee_user_id = ou.id
         WHERE t.organization_id = $1
           AND t.status IN ('pending', 'in_progress')
           AND t.due_date IS NOT NULL
           AND t.due_date <= CURRENT_DATE + INTERVAL '1 day'
           AND t.due_date > CURRENT_DATE
           AND (t.reminder_sent_at IS NULL OR t.reminder_sent_at < CURRENT_DATE)`,
        [this.organizationId]
      );

      for (const task of result.rows) {
        if (!task.assignee_email) continue;

        const sent = await this.sendTaskReminderNotification({
          taskId: task.id,
          taskTitle: task.title,
          taskDescription: task.description,
          dueDate: task.due_date,
          requestName: task.request_name,
          requestEmail: task.request_email,
          requestType: task.request_type,
          assigneeName: task.assignee_name,
          assigneeEmail: task.assignee_email,
          category: task.category,
        });

        if (sent) {
          // Mark reminder as sent
          await db.query(
            `UPDATE lifecycle_tasks SET reminder_sent_at = NOW() WHERE id = $1`,
            [task.id]
          );
          sentCount++;
        }
      }

      logger.info('Processed task reminders', { organizationId: this.organizationId, sentCount });
      return sentCount;
    } catch (error: any) {
      logger.error('Failed to process task reminders', { error: error.message });
      return sentCount;
    }
  }

  /**
   * Process overdue task notifications
   * Called by scheduler to send overdue alerts
   */
  async processOverdueNotifications(): Promise<number> {
    let sentCount = 0;

    try {
      // Get overdue tasks that haven't had an overdue notification sent today
      const result = await db.query(
        `SELECT
           t.id,
           t.title,
           t.description,
           t.due_date,
           t.assignee_user_id,
           t.category,
           r.request_type,
           r.user_email as request_email,
           r.user_first_name || ' ' || r.user_last_name as request_name,
           ou.email as assignee_email,
           ou.first_name || ' ' || ou.last_name as assignee_name
         FROM lifecycle_tasks t
         JOIN user_requests r ON t.request_id = r.id
         LEFT JOIN organization_users ou ON t.assignee_user_id = ou.id
         WHERE t.organization_id = $1
           AND t.status IN ('pending', 'in_progress')
           AND t.due_date IS NOT NULL
           AND t.due_date < CURRENT_DATE
           AND (t.overdue_sent_at IS NULL OR t.overdue_sent_at < CURRENT_DATE)`,
        [this.organizationId]
      );

      for (const task of result.rows) {
        if (!task.assignee_email) continue;

        const sent = await this.sendTaskOverdueNotification({
          taskId: task.id,
          taskTitle: task.title,
          taskDescription: task.description,
          dueDate: task.due_date,
          requestName: task.request_name,
          requestEmail: task.request_email,
          requestType: task.request_type,
          assigneeName: task.assignee_name,
          assigneeEmail: task.assignee_email,
          category: task.category,
        });

        if (sent) {
          // Mark overdue notification as sent
          await db.query(
            `UPDATE lifecycle_tasks SET overdue_sent_at = NOW() WHERE id = $1`,
            [task.id]
          );
          sentCount++;
        }
      }

      logger.info('Processed overdue notifications', { organizationId: this.organizationId, sentCount });
      return sentCount;
    } catch (error: any) {
      logger.error('Failed to process overdue notifications', { error: error.message });
      return sentCount;
    }
  }

  /**
   * Get email template by type
   */
  private async getEmailTemplate(templateType: string): Promise<{ subject: string; body: string }> {
    try {
      const result = await db.query(
        `SELECT subject, body FROM email_templates
         WHERE (organization_id = $1 OR organization_id IS NULL)
           AND template_type = $2
           AND is_default = true
         ORDER BY organization_id NULLS LAST
         LIMIT 1`,
        [this.organizationId, templateType]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Return default templates
      return this.getDefaultTemplate(templateType);
    } catch (error: any) {
      logger.error('Failed to get email template', { error: error.message, templateType });
      return this.getDefaultTemplate(templateType);
    }
  }

  /**
   * Get default email template
   */
  private getDefaultTemplate(templateType: string): { subject: string; body: string } {
    const templates: Record<string, { subject: string; body: string }> = {
      task_assigned: {
        subject: 'New Task Assigned: {taskTitle}',
        body: `Hi {assigneeName},

You have been assigned a new {requestType} task.

Task: {taskTitle}
{taskDescription}

For: {requestName}
Category: {category}
Due: {dueDate}

Click the button below to view your tasks.

{taskUrl}

Best regards,
{organizationName} Team`,
      },
      task_reminder: {
        subject: 'Reminder: Task Due Soon - {taskTitle}',
        body: `Hi {assigneeName},

This is a friendly reminder that your task is due soon.

Task: {taskTitle}
For: {requestName}
Due: {dueDate}

Click the button below to complete your task.

{taskUrl}

Best regards,
{organizationName} Team`,
      },
      task_overdue: {
        subject: 'Overdue Task: {taskTitle}',
        body: `Hi {assigneeName},

Your task is now {daysOverdue} day(s) overdue.

Task: {taskTitle}
For: {requestName}
Was Due: {dueDate}

Please complete this task as soon as possible.

{taskUrl}

Best regards,
{organizationName} Team`,
      },
      request_approved: {
        subject: '{requestType} Request Approved: {userName}',
        body: `Hi {requesterName},

Your {requestType} request has been approved.

Employee: {userName} ({userEmail})
Start Date: {startDate}
Approved By: {approverName}

The automated tasks have been created and assigned to the appropriate team members.

{requestsUrl}

Best regards,
{organizationName} Team`,
      },
      request_rejected: {
        subject: '{requestType} Request Rejected: {userName}',
        body: `Hi {requesterName},

Unfortunately, your {requestType} request has been rejected.

Employee: {userName} ({userEmail})
Rejected By: {approverName}

Reason: {rejectionReason}

If you have questions, please contact your administrator.

{requestsUrl}

Best regards,
{organizationName} Team`,
      },
    };

    return templates[templateType] || { subject: 'Notification', body: 'You have a new notification.' };
  }

  /**
   * Replace template variables
   */
  private replaceVariables(text: string, variables: Record<string, string>): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
    }
    return result;
  }

  /**
   * Format date for display
   */
  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Build HTML email from template
   */
  private buildEmailHtml(body: string, variables: Record<string, string>): string {
    const lines = body.split('\n');
    let htmlContent = '';

    for (const line of lines) {
      if (line.includes('http://') || line.includes('https://')) {
        const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          htmlContent += `<p style="text-align: center;"><a href="${urlMatch[0]}" style="display: inline-block; padding: 12px 24px; background-color: #8b5cf6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Tasks</a></p>`;
          continue;
        }
      }
      if (line.trim()) {
        htmlContent += `<p>${line}</p>`;
      }
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .card { background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          p { margin: 0 0 16px 0; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            ${htmlContent}
            <div class="footer">
              <p>This email was sent by ${variables.organizationName || 'Helios'}</p>
              <p>If you believe you received this in error, please contact your administrator.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export default LifecycleNotificationService;
