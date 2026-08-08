-- Migration: 068_add_lifecycle_notifications.sql
-- Description: Add notification tracking columns and default email templates for lifecycle automation
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-28

-- Add notification tracking columns to lifecycle_tasks
ALTER TABLE lifecycle_tasks
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS overdue_sent_at TIMESTAMP;

-- Add index for notification processing
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_notifications
ON lifecycle_tasks(organization_id, status, due_date)
WHERE status IN ('pending', 'in_progress');

-- Add comment
COMMENT ON COLUMN lifecycle_tasks.reminder_sent_at IS 'Timestamp when due date reminder was sent';
COMMENT ON COLUMN lifecycle_tasks.overdue_sent_at IS 'Timestamp when overdue notification was sent';

-- Insert default lifecycle email templates
-- Task Assigned
INSERT INTO email_templates (name, subject, body, template_type, is_default, variables)
VALUES (
  'Task Assigned',
  'New Task Assigned: {taskTitle}',
  E'Hi {assigneeName},\n\nYou have been assigned a new {requestType} task.\n\nTask: {taskTitle}\n{taskDescription}\n\nFor: {requestName}\nCategory: {category}\nDue: {dueDate}\n\nClick the link below to view your tasks:\n\n{taskUrl}\n\nBest regards,\n{organizationName} Team',
  'task_assigned',
  true,
  '{"assigneeName": "Assignee name", "taskTitle": "Task title", "taskDescription": "Task description", "requestName": "User being onboarded/offboarded", "requestType": "Onboarding or Offboarding", "category": "Task category", "dueDate": "Due date", "taskUrl": "Link to tasks", "organizationName": "Organization name"}'::jsonb
) ON CONFLICT DO NOTHING;

-- Task Reminder
INSERT INTO email_templates (name, subject, body, template_type, is_default, variables)
VALUES (
  'Task Reminder',
  'Reminder: Task Due Soon - {taskTitle}',
  E'Hi {assigneeName},\n\nThis is a friendly reminder that your task is due soon.\n\nTask: {taskTitle}\nFor: {requestName}\nDue: {dueDate}\n\nClick the link below to complete your task:\n\n{taskUrl}\n\nBest regards,\n{organizationName} Team',
  'task_reminder',
  true,
  '{"assigneeName": "Assignee name", "taskTitle": "Task title", "requestName": "User being onboarded/offboarded", "dueDate": "Due date", "taskUrl": "Link to tasks", "organizationName": "Organization name"}'::jsonb
) ON CONFLICT DO NOTHING;

-- Task Overdue
INSERT INTO email_templates (name, subject, body, template_type, is_default, variables)
VALUES (
  'Task Overdue',
  'Overdue Task: {taskTitle}',
  E'Hi {assigneeName},\n\nYour task is now {daysOverdue} day(s) overdue.\n\nTask: {taskTitle}\nFor: {requestName}\nWas Due: {dueDate}\n\nPlease complete this task as soon as possible.\n\n{taskUrl}\n\nBest regards,\n{organizationName} Team',
  'task_overdue',
  true,
  '{"assigneeName": "Assignee name", "taskTitle": "Task title", "requestName": "User being onboarded/offboarded", "dueDate": "Due date", "daysOverdue": "Number of days overdue", "taskUrl": "Link to tasks", "organizationName": "Organization name"}'::jsonb
) ON CONFLICT DO NOTHING;

-- Request Approved
INSERT INTO email_templates (name, subject, body, template_type, is_default, variables)
VALUES (
  'Request Approved',
  '{requestType} Request Approved: {userName}',
  E'Hi {requesterName},\n\nYour {requestType} request has been approved.\n\nEmployee: {userName} ({userEmail})\nStart Date: {startDate}\nApproved By: {approverName}\n\nThe automated tasks have been created and assigned to the appropriate team members.\n\n{requestsUrl}\n\nBest regards,\n{organizationName} Team',
  'request_approved',
  true,
  '{"requesterName": "Requester name", "userName": "Employee name", "userEmail": "Employee email", "requestType": "Onboarding or Offboarding", "startDate": "Start/End date", "approverName": "Approver name", "requestsUrl": "Link to requests", "organizationName": "Organization name"}'::jsonb
) ON CONFLICT DO NOTHING;

-- Request Rejected
INSERT INTO email_templates (name, subject, body, template_type, is_default, variables)
VALUES (
  'Request Rejected',
  '{requestType} Request Rejected: {userName}',
  E'Hi {requesterName},\n\nUnfortunately, your {requestType} request has been rejected.\n\nEmployee: {userName} ({userEmail})\nRejected By: {approverName}\n\nReason: {rejectionReason}\n\nIf you have questions, please contact your administrator.\n\n{requestsUrl}\n\nBest regards,\n{organizationName} Team',
  'request_rejected',
  true,
  '{"requesterName": "Requester name", "userName": "Employee name", "userEmail": "Employee email", "requestType": "Onboarding or Offboarding", "approverName": "Approver name", "rejectionReason": "Rejection reason", "requestsUrl": "Link to requests", "organizationName": "Organization name"}'::jsonb
) ON CONFLICT DO NOTHING;
