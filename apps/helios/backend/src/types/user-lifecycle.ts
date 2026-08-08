/**
 * User Lifecycle Management Types
 *
 * Types for onboarding templates, offboarding templates, scheduled actions,
 * and lifecycle logs.
 */

// ==========================================
// COMMON TYPES
// ==========================================

export type ActionType = 'onboard' | 'offboard' | 'suspend' | 'unsuspend' | 'delete' | 'restore' | 'manual';
export type ActionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type LogStatus = 'success' | 'failed' | 'skipped' | 'warning' | 'pending';
export type TriggeredBy = 'system' | 'user' | 'api';

// Drive handling options
export type DriveAction = 'transfer_manager' | 'transfer_user' | 'archive' | 'keep' | 'delete';

// Email handling options
export type EmailAction = 'forward_manager' | 'forward_user' | 'auto_reply' | 'archive' | 'keep';

// Account handling options
export type AccountAction = 'suspend_immediately' | 'suspend_on_last_day' | 'keep_active';

// License handling options
export type LicenseAction = 'remove_immediately' | 'remove_on_suspension' | 'keep';

// Recurrence intervals
export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly';

// ==========================================
// GOOGLE WORKSPACE TYPES
// ==========================================

export interface GoogleServices {
  gmail?: boolean;
  drive?: boolean;
  calendar?: boolean;
  meet?: boolean;
  chat?: boolean;
  docs?: boolean;
  sheets?: boolean;
  slides?: boolean;
  [key: string]: boolean | undefined;
}

export interface SharedDriveAccess {
  driveId: string;
  driveName?: string;
  role: 'reader' | 'commenter' | 'writer' | 'fileOrganizer' | 'organizer';
}

// ==========================================
// ONBOARDING TEMPLATES
// ==========================================

export interface OnboardingTemplate {
  id: string;
  organizationId: string;

  // Template identification
  name: string;
  description?: string | null;

  // Department association
  departmentId?: string | null;

  // Google Workspace settings
  googleLicenseSku?: string | null;
  googleOrgUnitPath?: string | null;
  googleServices: GoogleServices;

  // Memberships
  groupIds: string[];
  sharedDriveAccess: SharedDriveAccess[];
  calendarSubscriptions: string[];

  // Signature
  signatureTemplateId?: string | null;

  // Defaults
  defaultJobTitle?: string | null;
  defaultManagerId?: string | null;

  // Welcome email
  sendWelcomeEmail: boolean;
  welcomeEmailSubject: string;
  welcomeEmailBody: string;

  // Status
  isActive: boolean;
  isDefault: boolean;

  // Audit
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOnboardingTemplateDTO {
  name: string;
  description?: string;
  departmentId?: string;
  googleLicenseSku?: string;
  googleOrgUnitPath?: string;
  googleServices?: GoogleServices;
  groupIds?: string[];
  sharedDriveAccess?: SharedDriveAccess[];
  calendarSubscriptions?: string[];
  signatureTemplateId?: string;
  defaultJobTitle?: string;
  defaultManagerId?: string;
  sendWelcomeEmail?: boolean;
  welcomeEmailSubject?: string;
  welcomeEmailBody?: string;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface UpdateOnboardingTemplateDTO extends Partial<CreateOnboardingTemplateDTO> {}

// ==========================================
// OFFBOARDING TEMPLATES
// ==========================================

export interface OffboardingTemplate {
  id: string;
  organizationId: string;

  // Template identification
  name: string;
  description?: string | null;

  // Drive handling
  driveAction: DriveAction;
  driveTransferToUserId?: string | null;
  driveArchiveSharedDriveId?: string | null;
  driveDeleteAfterDays: number;

  // Email handling
  emailAction: EmailAction;
  emailForwardToUserId?: string | null;
  emailForwardDurationDays: number;
  emailAutoReplyMessage: string;
  emailAutoReplySubject: string;

  // Calendar handling
  calendarDeclineFutureMeetings: boolean;
  calendarTransferMeetingOwnership: boolean;
  calendarTransferToManager: boolean;
  calendarTransferToUserId?: string | null;

  // Access revocation
  removeFromAllGroups: boolean;
  removeFromSharedDrives: boolean;
  revokeOauthTokens: boolean;
  revokeAppPasswords: boolean;
  signOutAllDevices: boolean;
  resetPassword: boolean;

  // Signature
  removeSignature: boolean;
  setOffboardingSignature: boolean;
  offboardingSignatureText: string;

  // Mobile devices
  wipeMobileDevices: boolean;
  wipeRequiresConfirmation: boolean;

  // Account handling
  accountAction: AccountAction;
  deleteAccount: boolean;
  deleteAfterDays: number;

  // License handling
  licenseAction: LicenseAction;

  // Notifications
  notifyManager: boolean;
  notifyItAdmin: boolean;
  notifyHr: boolean;
  notificationEmailAddresses: string[];
  notificationMessage?: string | null;

  // Status
  isActive: boolean;
  isDefault: boolean;

  // Audit
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOffboardingTemplateDTO {
  name: string;
  description?: string;

  // Drive handling
  driveAction?: DriveAction;
  driveTransferToUserId?: string;
  driveArchiveSharedDriveId?: string;
  driveDeleteAfterDays?: number;

  // Email handling
  emailAction?: EmailAction;
  emailForwardToUserId?: string;
  emailForwardDurationDays?: number;
  emailAutoReplyMessage?: string;
  emailAutoReplySubject?: string;

  // Calendar handling
  calendarDeclineFutureMeetings?: boolean;
  calendarTransferMeetingOwnership?: boolean;
  calendarTransferToManager?: boolean;
  calendarTransferToUserId?: string;

  // Access revocation
  removeFromAllGroups?: boolean;
  removeFromSharedDrives?: boolean;
  revokeOauthTokens?: boolean;
  revokeAppPasswords?: boolean;
  signOutAllDevices?: boolean;
  resetPassword?: boolean;

  // Signature
  removeSignature?: boolean;
  setOffboardingSignature?: boolean;
  offboardingSignatureText?: string;

  // Mobile devices
  wipeMobileDevices?: boolean;
  wipeRequiresConfirmation?: boolean;

  // Account handling
  accountAction?: AccountAction;
  deleteAccount?: boolean;
  deleteAfterDays?: number;

  // License handling
  licenseAction?: LicenseAction;

  // Notifications
  notifyManager?: boolean;
  notifyItAdmin?: boolean;
  notifyHr?: boolean;
  notificationEmailAddresses?: string[];
  notificationMessage?: string;

  // Status
  isActive?: boolean;
  isDefault?: boolean;
}

export interface UpdateOffboardingTemplateDTO extends Partial<CreateOffboardingTemplateDTO> {}

// ==========================================
// SCHEDULED USER ACTIONS
// ==========================================

export interface ScheduledUserAction {
  id: string;
  organizationId: string;

  // Target user
  userId?: string | null;
  targetEmail?: string | null;
  targetFirstName?: string | null;
  targetLastName?: string | null;
  targetPersonalEmail?: string | null;

  // Action definition
  actionType: ActionType;
  onboardingTemplateId?: string | null;
  offboardingTemplateId?: string | null;
  actionConfig: Record<string, unknown>;
  configOverrides: Record<string, unknown>;

  // Scheduling
  scheduledFor: Date;
  isRecurring: boolean;
  recurrenceInterval?: RecurrenceInterval | null;
  recurrenceUntil?: Date | null;
  lastRecurrenceAt?: Date | null;

  // Status
  status: ActionStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  totalSteps: number;
  completedSteps: number;
  currentStep?: string | null;

  // Error handling
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown> | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date | null;

  // Approval
  requiresApproval: boolean;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  approvalNotes?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;

  // Dependencies
  dependsOnActionId?: string | null;

  // Audit
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  cancelledBy?: string | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
}

export interface CreateScheduledActionDTO {
  // Target - either userId (for existing user) or new user details
  userId?: string;
  targetEmail?: string;
  targetFirstName?: string;
  targetLastName?: string;
  targetPersonalEmail?: string;

  // Action definition
  actionType: ActionType;
  onboardingTemplateId?: string;
  offboardingTemplateId?: string;
  configOverrides?: Record<string, unknown>;

  // Scheduling
  scheduledFor: string | Date; // ISO string or Date
  isRecurring?: boolean;
  recurrenceInterval?: RecurrenceInterval;
  recurrenceUntil?: string | Date;

  // Approval
  requiresApproval?: boolean;

  // Dependencies
  dependsOnActionId?: string;
}

export interface UpdateScheduledActionDTO {
  scheduledFor?: string | Date;
  configOverrides?: Record<string, unknown>;
  requiresApproval?: boolean;
  approvalNotes?: string;
}

// ==========================================
// USER LIFECYCLE LOGS
// ==========================================

export interface UserLifecycleLog {
  id: string;
  organizationId: string;

  // References
  actionId?: string | null;
  userId?: string | null;
  userEmail?: string | null;

  // Action details
  actionType: ActionType;
  actionStep: string;
  stepDescription?: string | null;
  stepOrder: number;

  // Status
  status: LogStatus;
  durationMs?: number | null;

  // Details
  details: Record<string, unknown>;
  apiRequest?: {
    method?: string;
    endpoint?: string;
    body?: Record<string, unknown>;
  } | null;
  apiResponse?: {
    status?: number;
    body?: Record<string, unknown>;
  } | null;

  // Target resource
  targetResourceType?: string | null;
  targetResourceId?: string | null;
  targetResourceName?: string | null;

  // Error handling
  errorMessage?: string | null;
  errorCode?: string | null;
  errorDetails?: Record<string, unknown> | null;
  isRetry: boolean;
  retryAttempt: number;

  // Audit
  triggeredBy: TriggeredBy;
  triggeredByUserId?: string | null;
  executedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreateLifecycleLogDTO {
  actionId?: string;
  userId?: string;
  userEmail?: string;
  actionType: ActionType;
  actionStep: string;
  stepDescription?: string;
  stepOrder?: number;
  status: LogStatus;
  durationMs?: number;
  details?: Record<string, unknown>;
  apiRequest?: {
    method?: string;
    endpoint?: string;
    body?: Record<string, unknown>;
  };
  apiResponse?: {
    status?: number;
    body?: Record<string, unknown>;
  };
  targetResourceType?: string;
  targetResourceId?: string;
  targetResourceName?: string;
  errorMessage?: string;
  errorCode?: string;
  errorDetails?: Record<string, unknown>;
  isRetry?: boolean;
  retryAttempt?: number;
  triggeredBy?: TriggeredBy;
  triggeredByUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ==========================================
// ONBOARDING CONFIG (for action execution)
// ==========================================

export interface OnboardingConfig {
  // User info
  email: string;
  firstName: string;
  lastName: string;
  personalEmail?: string;
  jobTitle?: string;
  managerId?: string;
  departmentId?: string;

  // Google Workspace settings
  googleLicenseSku?: string;
  googleOrgUnitPath?: string;
  googleServices?: GoogleServices;

  // Memberships
  groupIds: string[];
  sharedDriveAccess: SharedDriveAccess[];
  calendarSubscriptions: string[];

  // Signature
  signatureTemplateId?: string;

  // Welcome email
  sendWelcomeEmail: boolean;
  welcomeEmailSubject?: string;
  welcomeEmailBody?: string;

  // Generated
  tempPassword?: string;
}

// ==========================================
// OFFBOARDING CONFIG (for action execution)
// ==========================================

export interface OffboardingConfig {
  // User info
  userId: string;
  userEmail: string;
  managerId?: string;
  managerEmail?: string;
  lastDay?: Date;

  // Drive handling
  driveAction: DriveAction;
  driveTransferToUserId?: string;
  driveArchiveSharedDriveId?: string;

  // Email handling
  emailAction: EmailAction;
  emailForwardToUserId?: string;
  emailForwardDurationDays: number;
  emailAutoReplyMessage?: string;
  emailAutoReplySubject?: string;

  // Calendar handling
  calendarDeclineFutureMeetings: boolean;
  calendarTransferMeetingOwnership: boolean;
  calendarTransferToUserId?: string;

  // Access revocation
  removeFromAllGroups: boolean;
  removeFromSharedDrives: boolean;
  revokeOauthTokens: boolean;
  revokeAppPasswords: boolean;
  signOutAllDevices: boolean;
  resetPassword: boolean;

  // Signature
  removeSignature: boolean;
  setOffboardingSignature: boolean;
  offboardingSignatureText?: string;

  // Mobile devices
  wipeMobileDevices: boolean;

  // Account handling
  accountAction: AccountAction;
  deleteAccount: boolean;
  deleteAfterDays: number;

  // License
  licenseAction: LicenseAction;

  // Notifications
  notifyManager: boolean;
  notifyItAdmin: boolean;
  notifyHr: boolean;
  notificationEmailAddresses: string[];
  notificationMessage?: string;
}

// ==========================================
// API RESPONSE TYPES
// ==========================================

export interface LifecycleActivityFeedItem {
  id: string;
  organizationId: string;
  actionId?: string;
  userId?: string;
  userEmail?: string;
  userDisplayName: string;
  actionType: ActionType;
  actionStep: string;
  stepDescription?: string;
  status: LogStatus;
  executedAt: Date;
  triggeredBy: TriggeredBy;
  triggeredByName?: string;
}

export interface ActionSummary {
  actionId: string;
  organizationId: string;
  userId?: string;
  targetEmail?: string;
  actionType: ActionType;
  actionStatus: ActionStatus;
  scheduledFor: Date;
  startedAt?: Date;
  completedAt?: Date;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalDurationMs?: number;
  lastError?: string;
}

// ==========================================
// STEP DEFINITIONS
// ==========================================

// Onboarding steps (in order)
export const ONBOARDING_STEPS = [
  'validate_config',
  'create_helios_user',
  'create_google_account',
  'set_org_unit',
  'assign_license',
  'add_to_groups',
  'add_to_shared_drives',
  'subscribe_to_calendars',
  'set_signature',
  'send_welcome_email',
  'finalize',
] as const;

export type OnboardingStep = typeof ONBOARDING_STEPS[number];

// Offboarding steps (in order)
export const OFFBOARDING_STEPS = [
  'validate_config',
  'transfer_drive_files',
  'setup_email_forwarding',
  'set_auto_reply',
  'decline_future_meetings',
  'transfer_calendar_events',
  'remove_from_groups',
  'remove_from_shared_drives',
  'revoke_oauth_tokens',
  'revoke_app_passwords',
  'sign_out_devices',
  'reset_password',
  'remove_signature',
  'set_offboarding_signature',
  'wipe_mobile_devices',
  'suspend_account',
  'schedule_deletion',
  'send_notifications',
  'finalize',
] as const;

export type OffboardingStep = typeof OFFBOARDING_STEPS[number];
