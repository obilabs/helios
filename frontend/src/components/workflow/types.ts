// Workflow Builder Type Definitions

export type TriggerType =
  | 'on_request_submitted'
  | 'on_request_approved'
  | 'on_request_rejected'
  | 'days_before_start'
  | 'on_start_date'
  | 'days_after_start'
  | 'on_last_day'
  | 'days_after_end';

export interface WorkflowTrigger {
  type: TriggerType;
  offsetDays?: number; // For days_before/after triggers
}

export type BlockType =
  // User Management
  | 'create_user'
  | 'update_user'
  | 'suspend_user'
  | 'delete_user'
  | 'reset_password'
  // Groups
  | 'add_to_group'
  | 'remove_from_group'
  | 'create_group'
  // Email & Communication
  | 'send_email'
  | 'set_signature'
  | 'set_vacation_responder'
  | 'remove_vacation_responder'
  // Calendar
  | 'create_calendar_event'
  | 'decline_future_meetings'
  | 'transfer_calendar'
  // Drive
  | 'grant_drive_access'
  | 'revoke_drive_access'
  | 'transfer_drive_ownership'
  // Security
  | 'revoke_oauth_tokens'
  | 'sign_out_sessions'
  | 'wipe_mobile_device'
  // Notifications
  | 'notify_manager'
  | 'notify_hr'
  | 'notify_it'
  | 'send_notification'
  // Training
  | 'assign_training'
  | 'create_task'
  // Conditions
  | 'if_condition'
  // Utility
  | 'wait'
  | 'comment';

export interface BlockInput {
  key: string;
  label: string;
  type: 'text' | 'email' | 'variable' | 'template' | 'number' | 'select' | 'boolean' | 'date' | 'user' | 'group';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[]; // For select type
  templateType?: 'signature' | 'email' | 'page'; // For template type
  variableContext?: string[]; // Which variable categories to show
  defaultValue?: string | number | boolean;
}

export interface BlockDefinition {
  type: BlockType;
  name: string;
  description: string;
  category: BlockCategory;
  icon: string; // Lucide icon name
  color: string; // Category color
  inputs: BlockInput[];
  outputs?: string[]; // Variables this block produces
  allowsChildren?: boolean; // For condition blocks
}

export type BlockCategory =
  | 'user_management'
  | 'groups'
  | 'communication'
  | 'calendar'
  | 'drive'
  | 'security'
  | 'notifications'
  | 'training'
  | 'conditions'
  | 'utility';

export interface WorkflowBlock {
  id: string;
  type: BlockType;
  inputs: Record<string, string | number | boolean>;
  trigger?: WorkflowTrigger; // When this block should execute
  children?: WorkflowBlock[]; // For condition blocks
  enabled: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  blocks: WorkflowBlock[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Variable system
export interface VariableCategory {
  name: string;
  label: string;
  variables: Variable[];
}

export interface Variable {
  key: string; // e.g., 'user.email'
  label: string; // e.g., 'User Email'
  example?: string; // e.g., 'john.doe@example.com'
}

// Execution tracking
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  requestId?: string;
  userId?: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  steps: WorkflowExecutionStep[];
}

export interface WorkflowExecutionStep {
  id: string;
  blockId: string;
  blockType: BlockType;
  status: ExecutionStatus;
  inputs: Record<string, string>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// Block category configuration
export const BLOCK_CATEGORIES: Record<BlockCategory, { label: string; color: string; icon: string }> = {
  user_management: { label: 'User Management', color: '#8b5cf6', icon: 'Users' },
  groups: { label: 'Groups', color: '#3b82f6', icon: 'UsersRound' },
  communication: { label: 'Communication', color: '#10b981', icon: 'Mail' },
  calendar: { label: 'Calendar', color: '#f59e0b', icon: 'Calendar' },
  drive: { label: 'Drive & Files', color: '#6366f1', icon: 'HardDrive' },
  security: { label: 'Security', color: '#ef4444', icon: 'Shield' },
  notifications: { label: 'Notifications', color: '#ec4899', icon: 'Bell' },
  training: { label: 'Training', color: '#14b8a6', icon: 'GraduationCap' },
  conditions: { label: 'Conditions', color: '#f97316', icon: 'GitBranch' },
  utility: { label: 'Utility', color: '#6b7280', icon: 'Wrench' },
};

// Available variables for workflows
export const WORKFLOW_VARIABLES: VariableCategory[] = [
  {
    name: 'user',
    label: 'User',
    variables: [
      { key: 'user.email', label: 'Email', example: 'john.doe@example.com' },
      { key: 'user.firstName', label: 'First Name', example: 'John' },
      { key: 'user.lastName', label: 'Last Name', example: 'Doe' },
      { key: 'user.fullName', label: 'Full Name', example: 'John Doe' },
      { key: 'user.jobTitle', label: 'Job Title', example: 'Software Engineer' },
      { key: 'user.department', label: 'Department', example: 'Engineering' },
      { key: 'user.location', label: 'Location', example: 'San Francisco' },
      { key: 'user.phone', label: 'Phone', example: '+1 555-123-4567' },
    ],
  },
  {
    name: 'manager',
    label: 'Manager',
    variables: [
      { key: 'manager.email', label: 'Manager Email', example: 'jane.smith@example.com' },
      { key: 'manager.firstName', label: 'Manager First Name', example: 'Jane' },
      { key: 'manager.lastName', label: 'Manager Last Name', example: 'Smith' },
      { key: 'manager.fullName', label: 'Manager Full Name', example: 'Jane Smith' },
    ],
  },
  {
    name: 'request',
    label: 'Request',
    variables: [
      { key: 'request.startDate', label: 'Start Date', example: '2025-02-01' },
      { key: 'request.endDate', label: 'End Date', example: '2025-02-15' },
      { key: 'request.notes', label: 'Notes', example: 'New hire for Q1' },
      { key: 'request.requestedBy', label: 'Requested By', example: 'HR Team' },
    ],
  },
  {
    name: 'organization',
    label: 'Organization',
    variables: [
      { key: 'organization.name', label: 'Organization Name', example: 'Acme Corp' },
      { key: 'organization.domain', label: 'Domain', example: 'acme.com' },
    ],
  },
  {
    name: 'system',
    label: 'System',
    variables: [
      { key: 'system.today', label: 'Today', example: '2025-01-15' },
      { key: 'system.tempPassword', label: 'Temp Password', example: 'Auto-generated' },
      { key: 'system.timestamp', label: 'Timestamp', example: '2025-01-15T10:30:00Z' },
    ],
  },
];
