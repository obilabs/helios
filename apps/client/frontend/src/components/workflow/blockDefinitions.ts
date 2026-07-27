// Block Definitions for Workflow Builder
// Maps available actions to visual blocks

import type { BlockDefinition, BlockCategory } from './types';

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  // ============================================
  // USER MANAGEMENT
  // ============================================
  {
    type: 'create_user',
    name: 'Create User',
    description: 'Create a new user in Google Workspace',
    category: 'user_management',
    icon: 'UserPlus',
    color: '#8b5cf6',
    inputs: [
      { key: 'email', label: 'Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'firstName', label: 'First Name', type: 'variable', required: true, placeholder: '{{user.firstName}}' },
      { key: 'lastName', label: 'Last Name', type: 'variable', required: true, placeholder: '{{user.lastName}}' },
      { key: 'password', label: 'Password', type: 'variable', placeholder: '{{system.tempPassword}}' },
      { key: 'department', label: 'Department', type: 'variable', placeholder: '{{user.department}}' },
      { key: 'jobTitle', label: 'Job Title', type: 'variable', placeholder: '{{user.jobTitle}}' },
      { key: 'manager', label: 'Manager Email', type: 'variable', placeholder: '{{manager.email}}' },
      { key: 'orgUnit', label: 'Org Unit Path', type: 'text', placeholder: '/Employees' },
    ],
    outputs: ['user.id', 'user.email'],
  },
  {
    type: 'update_user',
    name: 'Update User',
    description: 'Update user profile in Google Workspace',
    category: 'user_management',
    icon: 'UserCog',
    color: '#8b5cf6',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'firstName', label: 'First Name', type: 'variable' },
      { key: 'lastName', label: 'Last Name', type: 'variable' },
      { key: 'department', label: 'Department', type: 'variable' },
      { key: 'jobTitle', label: 'Job Title', type: 'variable' },
      { key: 'manager', label: 'Manager Email', type: 'variable' },
      { key: 'phone', label: 'Phone', type: 'variable' },
    ],
  },
  {
    type: 'suspend_user',
    name: 'Suspend User',
    description: 'Suspend user account (block sign-in)',
    category: 'user_management',
    icon: 'UserX',
    color: '#8b5cf6',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
    ],
  },
  {
    type: 'delete_user',
    name: 'Delete User',
    description: 'Permanently delete user account',
    category: 'user_management',
    icon: 'Trash2',
    color: '#8b5cf6',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
    ],
  },
  {
    type: 'reset_password',
    name: 'Reset Password',
    description: 'Reset user password',
    category: 'user_management',
    icon: 'KeyRound',
    color: '#8b5cf6',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'newPassword', label: 'New Password', type: 'variable', placeholder: '{{system.tempPassword}}' },
      { key: 'requireChange', label: 'Require Change on Login', type: 'boolean', defaultValue: true },
    ],
  },

  // ============================================
  // GROUPS
  // ============================================
  {
    type: 'add_to_group',
    name: 'Add to Group',
    description: 'Add user to a Google Group',
    category: 'groups',
    icon: 'UserPlus',
    color: '#3b82f6',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'groupId', label: 'Group', type: 'group', required: true },
      { key: 'role', label: 'Role', type: 'select', defaultValue: 'MEMBER', options: [
        { value: 'MEMBER', label: 'Member' },
        { value: 'MANAGER', label: 'Manager' },
        { value: 'OWNER', label: 'Owner' },
      ]},
    ],
  },
  {
    type: 'remove_from_group',
    name: 'Remove from Group',
    description: 'Remove user from a Google Group',
    category: 'groups',
    icon: 'UserMinus',
    color: '#3b82f6',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'groupId', label: 'Group', type: 'group', required: true },
    ],
  },
  {
    type: 'create_group',
    name: 'Create Group',
    description: 'Create a new Google Group',
    category: 'groups',
    icon: 'UsersRound',
    color: '#3b82f6',
    inputs: [
      { key: 'name', label: 'Group Name', type: 'text', required: true, placeholder: 'Project Team' },
      { key: 'email', label: 'Group Email', type: 'text', required: true, placeholder: 'project-team@example.com' },
      { key: 'description', label: 'Description', type: 'text' },
    ],
    outputs: ['group.email'],
  },

  // ============================================
  // COMMUNICATION
  // ============================================
  {
    type: 'send_email',
    name: 'Send Email',
    description: 'Send an email using a template from Template Studio',
    category: 'communication',
    icon: 'Mail',
    color: '#10b981',
    inputs: [
      { key: 'templateId', label: 'Email Template', type: 'template', required: true, templateType: 'email' },
      { key: 'to', label: 'To', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'cc', label: 'CC', type: 'variable', placeholder: '{{manager.email}}' },
      { key: 'bcc', label: 'BCC', type: 'variable' },
    ],
  },
  {
    type: 'set_signature',
    name: 'Set Email Signature',
    description: 'Apply a signature template to user',
    category: 'communication',
    icon: 'PenTool',
    color: '#10b981',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'templateId', label: 'Signature Template', type: 'template', required: true, templateType: 'signature' },
    ],
  },
  {
    type: 'set_vacation_responder',
    name: 'Set Vacation Responder',
    description: 'Enable out-of-office auto-reply',
    category: 'communication',
    icon: 'Plane',
    color: '#10b981',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Out of Office' },
      { key: 'message', label: 'Message', type: 'text', required: true },
      { key: 'startDate', label: 'Start Date', type: 'variable', placeholder: '{{request.startDate}}' },
      { key: 'endDate', label: 'End Date', type: 'variable', placeholder: '{{request.endDate}}' },
    ],
  },
  {
    type: 'remove_vacation_responder',
    name: 'Remove Vacation Responder',
    description: 'Disable out-of-office auto-reply',
    category: 'communication',
    icon: 'PlaneOff',
    color: '#10b981',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
    ],
  },

  // ============================================
  // CALENDAR
  // ============================================
  {
    type: 'create_calendar_event',
    name: 'Create Calendar Event',
    description: 'Create a calendar event for user',
    category: 'calendar',
    icon: 'CalendarPlus',
    color: '#f59e0b',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'title', label: 'Event Title', type: 'text', required: true, placeholder: 'Welcome Meeting' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'date', label: 'Date', type: 'variable', placeholder: '{{request.startDate}}' },
      { key: 'duration', label: 'Duration (minutes)', type: 'number', defaultValue: 60 },
      { key: 'attendees', label: 'Attendees', type: 'variable', placeholder: '{{manager.email}}' },
    ],
  },
  {
    type: 'decline_future_meetings',
    name: 'Decline Future Meetings',
    description: 'Decline all future meetings for user',
    category: 'calendar',
    icon: 'CalendarX',
    color: '#f59e0b',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'message', label: 'Decline Message', type: 'text', placeholder: 'User is no longer with the company' },
    ],
  },
  {
    type: 'transfer_calendar',
    name: 'Transfer Calendar',
    description: 'Transfer calendar ownership to another user',
    category: 'calendar',
    icon: 'CalendarArrowDown',
    color: '#f59e0b',
    inputs: [
      { key: 'fromEmail', label: 'From User', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'toEmail', label: 'To User', type: 'variable', required: true, placeholder: '{{manager.email}}' },
    ],
  },

  // ============================================
  // DRIVE & FILES
  // ============================================
  {
    type: 'grant_drive_access',
    name: 'Grant Drive Access',
    description: 'Grant access to a shared drive or folder',
    category: 'drive',
    icon: 'FolderPlus',
    color: '#6366f1',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'driveId', label: 'Drive/Folder ID', type: 'text', required: true },
      { key: 'role', label: 'Access Level', type: 'select', defaultValue: 'reader', options: [
        { value: 'reader', label: 'Viewer' },
        { value: 'commenter', label: 'Commenter' },
        { value: 'writer', label: 'Editor' },
        { value: 'organizer', label: 'Manager' },
      ]},
    ],
  },
  {
    type: 'revoke_drive_access',
    name: 'Revoke Drive Access',
    description: 'Remove access to a shared drive or folder',
    category: 'drive',
    icon: 'FolderMinus',
    color: '#6366f1',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'driveId', label: 'Drive/Folder ID', type: 'text', required: true },
    ],
  },
  {
    type: 'transfer_drive_ownership',
    name: 'Transfer Drive Ownership',
    description: 'Transfer file ownership to another user',
    category: 'drive',
    icon: 'FolderSync',
    color: '#6366f1',
    inputs: [
      { key: 'fromEmail', label: 'From User', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'toEmail', label: 'To User', type: 'variable', required: true, placeholder: '{{manager.email}}' },
    ],
  },

  // ============================================
  // SECURITY
  // ============================================
  {
    type: 'revoke_oauth_tokens',
    name: 'Revoke OAuth Tokens',
    description: 'Revoke all third-party app access',
    category: 'security',
    icon: 'ShieldOff',
    color: '#ef4444',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
    ],
  },
  {
    type: 'sign_out_sessions',
    name: 'Sign Out All Sessions',
    description: 'Force sign out from all devices',
    category: 'security',
    icon: 'LogOut',
    color: '#ef4444',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
    ],
  },
  {
    type: 'wipe_mobile_device',
    name: 'Wipe Mobile Device',
    description: 'Remote wipe mobile device',
    category: 'security',
    icon: 'Smartphone',
    color: '#ef4444',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'deviceId', label: 'Device ID', type: 'text', placeholder: 'Leave blank for all devices' },
    ],
  },

  // ============================================
  // NOTIFICATIONS
  // ============================================
  {
    type: 'notify_manager',
    name: 'Notify Manager',
    description: 'Send notification to user\'s manager',
    category: 'notifications',
    icon: 'BellRing',
    color: '#ec4899',
    inputs: [
      { key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'New team member joining' },
      { key: 'message', label: 'Message', type: 'text', required: true },
      { key: 'includeUserDetails', label: 'Include User Details', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'notify_hr',
    name: 'Notify HR',
    description: 'Send notification to HR team',
    category: 'notifications',
    icon: 'Bell',
    color: '#ec4899',
    inputs: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'message', label: 'Message', type: 'text', required: true },
    ],
  },
  {
    type: 'notify_it',
    name: 'Notify IT',
    description: 'Send notification to IT team',
    category: 'notifications',
    icon: 'Bell',
    color: '#ec4899',
    inputs: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'message', label: 'Message', type: 'text', required: true },
    ],
  },
  {
    type: 'send_notification',
    name: 'Send Custom Notification',
    description: 'Send notification to a user or group',
    category: 'notifications',
    icon: 'Send',
    color: '#ec4899',
    inputs: [
      { key: 'recipientType', label: 'Send To', type: 'select', required: true, options: [
        { value: 'user', label: 'Specific User' },
        { value: 'group', label: 'Group' },
        { value: 'context', label: 'Context Variable' },
      ]},
      { key: 'recipientId', label: 'Recipient', type: 'select', required: true }, // Populated dynamically
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'message', label: 'Message', type: 'text', required: true },
    ],
  },

  // ============================================
  // TRAINING
  // ============================================
  {
    type: 'assign_training',
    name: 'Assign Training',
    description: 'Assign training course or path to user',
    category: 'training',
    icon: 'GraduationCap',
    color: '#14b8a6',
    inputs: [
      { key: 'userEmail', label: 'User Email', type: 'variable', required: true, placeholder: '{{user.email}}' },
      { key: 'trainingId', label: 'Training Course/Path', type: 'select', required: true },
      { key: 'dueInDays', label: 'Due In (Days)', type: 'number', defaultValue: 30 },
    ],
  },
  {
    type: 'create_task',
    name: 'Create Task',
    description: 'Create a manual task for someone',
    category: 'training',
    icon: 'CheckSquare',
    color: '#14b8a6',
    inputs: [
      { key: 'title', label: 'Task Title', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'assignee', label: 'Assign To', type: 'select', required: true, options: [
        { value: 'user', label: 'New User' },
        { value: 'manager', label: 'Manager' },
        { value: 'hr', label: 'HR Team' },
        { value: 'it', label: 'IT Team' },
      ]},
      { key: 'dueInDays', label: 'Due In (Days)', type: 'number', defaultValue: 7 },
    ],
  },

  // ============================================
  // CONDITIONS
  // ============================================
  {
    type: 'if_condition',
    name: 'If / Then',
    description: 'Execute blocks only if condition is met',
    category: 'conditions',
    icon: 'GitBranch',
    color: '#f97316',
    inputs: [
      { key: 'condition', label: 'Condition', type: 'select', required: true, options: [
        { value: 'has_manager', label: 'User has manager' },
        { value: 'has_department', label: 'User has department' },
        { value: 'department_is', label: 'Department equals...' },
        { value: 'has_phone', label: 'User has phone' },
        { value: 'request_has_notes', label: 'Request has notes' },
      ]},
      { key: 'value', label: 'Value', type: 'text', placeholder: 'For "equals" conditions' },
    ],
    allowsChildren: true,
  },

  // ============================================
  // UTILITY
  // ============================================
  {
    type: 'wait',
    name: 'Wait',
    description: 'Pause workflow for specified time',
    category: 'utility',
    icon: 'Clock',
    color: '#6b7280',
    inputs: [
      { key: 'days', label: 'Days', type: 'number', defaultValue: 0 },
      { key: 'hours', label: 'Hours', type: 'number', defaultValue: 0 },
    ],
  },
  {
    type: 'comment',
    name: 'Comment',
    description: 'Add a note (does not execute)',
    category: 'utility',
    icon: 'MessageSquare',
    color: '#6b7280',
    inputs: [
      { key: 'note', label: 'Note', type: 'text', required: true, placeholder: 'Describe this section...' },
    ],
  },
];

// Get blocks by category
export function getBlocksByCategory(category: BlockCategory): BlockDefinition[] {
  return BLOCK_DEFINITIONS.filter(block => block.category === category);
}

// Get block definition by type
export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_DEFINITIONS.find(block => block.type === type);
}

// Get all categories with their blocks
export function getBlockCategories(): { category: BlockCategory; blocks: BlockDefinition[] }[] {
  const categories: BlockCategory[] = [
    'user_management',
    'groups',
    'communication',
    'calendar',
    'drive',
    'security',
    'notifications',
    'training',
    'conditions',
    'utility',
  ];

  return categories.map(category => ({
    category,
    blocks: getBlocksByCategory(category),
  }));
}
