/**
 * Email Signature Management Types
 *
 * Types for signature templates, assignments, campaigns, tracking, and permissions.
 */

// ==========================================
// TEMPLATE TYPES
// ==========================================

export type SignatureTemplateStatus = 'draft' | 'active' | 'archived';

export interface SignatureTemplate {
  id: string;
  organizationId: string;

  // Template identification
  name: string;
  description?: string | null;

  // Content
  htmlContent: string;
  plainTextContent?: string | null;

  // Merge fields used in this template
  mergeFields: string[];

  // Flags
  isDefault: boolean;
  isCampaignTemplate: boolean;

  // Status
  status: SignatureTemplateStatus;
  version: number;

  // Audit
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSignatureTemplateDTO {
  name: string;
  description?: string;
  htmlContent: string;
  plainTextContent?: string;
  mergeFields?: string[];
  isDefault?: boolean;
  isCampaignTemplate?: boolean;
  status?: SignatureTemplateStatus;
}

export interface UpdateSignatureTemplateDTO {
  name?: string;
  description?: string;
  htmlContent?: string;
  plainTextContent?: string;
  mergeFields?: string[];
  isDefault?: boolean;
  isCampaignTemplate?: boolean;
  status?: SignatureTemplateStatus;
}

// ==========================================
// ASSIGNMENT TYPES
// ==========================================

export type AssignmentType = 'user' | 'group' | 'dynamic_group' | 'department' | 'ou' | 'organization';

export interface SignatureAssignment {
  id: string;
  organizationId: string;
  templateId: string;

  // Assignment details
  assignmentType: AssignmentType;
  targetId?: string | null;  // user_id, group_id, department_id (null for 'organization')
  targetValue?: string | null;  // For OU path strings

  // Priority (lower = higher priority)
  priority: number;

  // Status
  isActive: boolean;

  // Audit
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSignatureAssignmentDTO {
  templateId: string;
  assignmentType: AssignmentType;
  targetId?: string;
  targetValue?: string;
  priority?: number;
  isActive?: boolean;
}

export interface UpdateSignatureAssignmentDTO {
  priority?: number;
  isActive?: boolean;
}

// ==========================================
// USER SIGNATURE STATUS
// ==========================================

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'error' | 'skipped';

export interface UserSignatureStatus {
  id: string;
  userId: string;
  organizationId: string;

  // Current template
  currentTemplateId?: string | null;
  activeCampaignId?: string | null;

  // Assignment source
  assignmentSource?: string | null;  // 'direct', 'group', 'dynamic_group', 'department', 'ou', 'organization'
  assignmentId?: string | null;

  // Cached rendered signature
  renderedHtml?: string | null;

  // Sync status
  lastSyncedAt?: Date | null;
  syncStatus: SyncStatus;
  syncError?: string | null;
  googleSignatureHash?: string | null;  // SHA256 to detect external changes

  // Retry info
  syncAttempts: number;
  lastSyncAttemptAt?: Date | null;

  // Audit
  createdAt: Date;
  updatedAt: Date;
}

// ==========================================
// MERGE FIELDS
// ==========================================

export interface MergeField {
  key: string;            // e.g., 'full_name', 'job_title'
  displayName: string;    // e.g., 'Full Name', 'Job Title'
  description: string;    // e.g., 'The user\'s full name'
  category: string;       // e.g., 'Personal', 'Contact', 'Organization'
  example: string;        // e.g., 'John Smith'
  databaseColumn?: string; // Column in organization_users table
  transform?: string;     // Optional transformation (e.g., 'uppercase', 'lowercase')
}

// Available merge fields
export const MERGE_FIELDS: MergeField[] = [
  // Personal Information
  {
    key: 'full_name',
    displayName: 'Full Name',
    description: 'The user\'s full name (first + last)',
    category: 'Personal',
    example: 'John Smith',
  },
  {
    key: 'first_name',
    displayName: 'First Name',
    description: 'The user\'s first name',
    category: 'Personal',
    example: 'John',
    databaseColumn: 'first_name',
  },
  {
    key: 'last_name',
    displayName: 'Last Name',
    description: 'The user\'s last name',
    category: 'Personal',
    example: 'Smith',
    databaseColumn: 'last_name',
  },
  {
    key: 'preferred_name',
    displayName: 'Preferred Name',
    description: 'The user\'s preferred or display name',
    category: 'Personal',
    example: 'Johnny',
    databaseColumn: 'preferred_name',
  },
  {
    key: 'pronouns',
    displayName: 'Pronouns',
    description: 'The user\'s pronouns',
    category: 'Personal',
    example: 'he/him',
    databaseColumn: 'pronouns',
  },

  // Professional Information
  {
    key: 'job_title',
    displayName: 'Job Title',
    description: 'The user\'s job title',
    category: 'Professional',
    example: 'Software Engineer',
    databaseColumn: 'job_title',
  },
  {
    key: 'department',
    displayName: 'Department',
    description: 'The user\'s department name',
    category: 'Professional',
    example: 'Engineering',
  },
  {
    key: 'manager_name',
    displayName: 'Manager Name',
    description: 'The name of the user\'s manager',
    category: 'Professional',
    example: 'Jane Doe',
  },

  // Contact Information
  {
    key: 'email',
    displayName: 'Email',
    description: 'The user\'s work email address',
    category: 'Contact',
    example: 'john.smith@company.com',
    databaseColumn: 'email',
  },
  {
    key: 'work_phone',
    displayName: 'Work Phone',
    description: 'The user\'s work phone number',
    category: 'Contact',
    example: '+1 (555) 123-4567',
    databaseColumn: 'work_phone',
  },
  {
    key: 'mobile_phone',
    displayName: 'Mobile Phone',
    description: 'The user\'s mobile phone number',
    category: 'Contact',
    example: '+1 (555) 987-6543',
    databaseColumn: 'mobile_phone',
  },
  {
    key: 'location',
    displayName: 'Location',
    description: 'The user\'s office location',
    category: 'Contact',
    example: 'San Francisco, CA',
    databaseColumn: 'location',
  },

  // Organization Information
  {
    key: 'company_name',
    displayName: 'Company Name',
    description: 'The organization name',
    category: 'Organization',
    example: 'Acme Inc.',
  },
  {
    key: 'company_website',
    displayName: 'Company Website',
    description: 'The organization website URL',
    category: 'Organization',
    example: 'https://www.acme.com',
  },
  {
    key: 'company_address',
    displayName: 'Company Address',
    description: 'The organization physical address',
    category: 'Organization',
    example: '123 Main St, San Francisco, CA 94102',
  },
  {
    key: 'company_phone',
    displayName: 'Company Phone',
    description: 'The organization main phone number',
    category: 'Organization',
    example: '+1 (555) 000-0000',
  },

  // Social Media
  {
    key: 'linkedin_url',
    displayName: 'LinkedIn URL',
    description: 'The user\'s LinkedIn profile URL',
    category: 'Social',
    example: 'https://linkedin.com/in/johnsmith',
    databaseColumn: 'linkedin_url',
  },
  {
    key: 'twitter_url',
    displayName: 'Twitter/X URL',
    description: 'The user\'s Twitter/X profile URL',
    category: 'Social',
    example: 'https://twitter.com/johnsmith',
    databaseColumn: 'twitter_url',
  },
];

// Get merge field by key
export function getMergeField(key: string): MergeField | undefined {
  return MERGE_FIELDS.find(f => f.key === key);
}

// Get merge fields by category
export function getMergeFieldsByCategory(category: string): MergeField[] {
  return MERGE_FIELDS.filter(f => f.category === category);
}

// Get all merge field categories
export function getMergeFieldCategories(): string[] {
  return [...new Set(MERGE_FIELDS.map(f => f.category))];
}

// ==========================================
// CAMPAIGN TYPES
// ==========================================

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface SignatureCampaign {
  id: string;
  organizationId: string;

  // Campaign details
  name: string;
  description?: string | null;

  // Template
  templateId: string;
  bannerUrl?: string | null;
  bannerLinkUrl?: string | null;
  bannerAltText?: string | null;

  // Schedule
  startDate?: Date | null;
  endDate?: Date | null;
  timezone: string;

  // Status
  status: CampaignStatus;

  // Tracking
  enableTracking: boolean;
  trackingPixelUrl?: string | null;

  // Stats (cached for performance)
  totalRecipients: number;
  totalOpens: number;
  uniqueOpens: number;

  // Audit
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  launchedAt?: Date | null;
  launchedBy?: string | null;
  completedAt?: Date | null;
}

export interface CreateCampaignDTO {
  name: string;
  description?: string;
  templateId: string;
  bannerUrl?: string;
  bannerLinkUrl?: string;
  bannerAltText?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  timezone?: string;
  enableTracking?: boolean;
}

export interface UpdateCampaignDTO {
  name?: string;
  description?: string;
  templateId?: string;
  bannerUrl?: string;
  bannerLinkUrl?: string;
  bannerAltText?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  timezone?: string;
  enableTracking?: boolean;
  status?: CampaignStatus;
}

// ==========================================
// TRACKING TYPES
// ==========================================

export interface TrackingPixel {
  id: string;
  organizationId: string;
  campaignId: string;
  userId: string;
  token: string;  // URL-safe unique token
  createdAt: Date;
}

export interface TrackingEvent {
  id: string;
  pixelId: string;
  organizationId: string;
  campaignId: string;
  userId: string;

  // Event details
  ipHash: string;  // Hashed IP for privacy
  userAgent?: string | null;
  referer?: string | null;

  // Geo data (optional, from GeoIP lookup)
  country?: string | null;
  region?: string | null;
  city?: string | null;

  // Uniqueness detection
  isFirstOpen: boolean;

  // Timestamp
  createdAt: Date;
}

// ==========================================
// CAMPAIGN ANALYTICS
// ==========================================

export interface CampaignAnalytics {
  campaignId: string;

  // Summary stats
  totalRecipients: number;
  totalOpens: number;
  uniqueOpens: number;
  openRate: number;  // uniqueOpens / totalRecipients * 100

  // Time series
  opensByDay: { date: string; opens: number; uniqueOpens: number }[];

  // Top performers
  topPerformers: { userId: string; userName: string; userEmail: string; opens: number }[];

  // Geographic distribution
  geoDistribution: { country: string; opens: number }[];
}

// ==========================================
// PERMISSION TYPES
// ==========================================

export type PermissionLevel = 'admin' | 'designer' | 'campaign_manager' | 'helpdesk' | 'viewer';

export interface SignaturePermission {
  id: string;
  organizationId: string;
  userId: string;
  permissionLevel: PermissionLevel;
  grantedBy?: string | null;
  grantedAt: Date;
  updatedAt: Date;
}

export interface CreatePermissionDTO {
  userId: string;
  permissionLevel: PermissionLevel;
}

// Permission capabilities by level
export const PERMISSION_CAPABILITIES: Record<PermissionLevel, string[]> = {
  admin: [
    'templates.view', 'templates.create', 'templates.edit', 'templates.delete',
    'assignments.view', 'assignments.create', 'assignments.edit', 'assignments.delete',
    'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete', 'campaigns.launch',
    'analytics.view', 'analytics.export',
    'permissions.view', 'permissions.manage',
    'sync.view', 'sync.execute',
  ],
  designer: [
    'templates.view', 'templates.create', 'templates.edit',
    'assignments.view',
    'campaigns.view',
    'analytics.view',
  ],
  campaign_manager: [
    'templates.view',
    'assignments.view', 'assignments.create', 'assignments.edit',
    'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.launch',
    'analytics.view', 'analytics.export',
  ],
  helpdesk: [
    'templates.view',
    'assignments.view',
    'campaigns.view',
    'sync.view', 'sync.execute',  // Can re-sync individual users
  ],
  viewer: [
    'templates.view',
    'assignments.view',
    'campaigns.view',
    'analytics.view',
  ],
};

// Check if a permission level has a specific capability
export function hasCapability(level: PermissionLevel, capability: string): boolean {
  return PERMISSION_CAPABILITIES[level].includes(capability);
}

// ==========================================
// EFFECTIVE SIGNATURE (view result)
// ==========================================

export type EffectiveSignatureSource = AssignmentType | 'campaign';

export interface UserEffectiveSignature {
  userId: string;
  organizationId: string;
  assignmentId: string;
  templateId: string;
  source: EffectiveSignatureSource;
  // Campaign banner overlay (only present when source is 'campaign')
  bannerUrl?: string | null;
  bannerLink?: string | null;
  bannerAltText?: string | null;
}

// ==========================================
// API RESPONSE TYPES
// ==========================================

export interface TemplateWithAssignmentCount extends SignatureTemplate {
  assignmentCount: number;
  affectedUsers: number;
}

export interface DeploymentStatus {
  totalUsers: number;
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  error: number;
  skipped: number;
  lastDeploymentAt?: Date;
}

export interface RenderedSignature {
  html: string;
  plainText: string;
  mergeFieldsUsed: string[];
  missingFields: string[];
}
