# User Profile Field Permissions Architecture

## 🎯 Design Philosophy

**Core Principle**: User autonomy with admin oversight and security guardrails

- **Default**: Users can edit minimal, safe fields
- **Exceptions**: Admins can grant additional edit permissions globally or per-group
- **Security**: Prevent users from escalating privileges or causing sync conflicts
- **Audit**: Track all permission changes and profile edits

---

## 📊 User Profile Field Categories

### Category 1: Always User-Editable (Default)
```typescript
const ALWAYS_EDITABLE_FIELDS = [
  'professional_designation',  // e.g., "Senior Engineer", "PhD"
  'pronouns',                  // e.g., "she/her", "they/them"
  'preferred_name',            // Display name preference
  'bio',                       // Short bio/description
  'profile_photo',             // Avatar upload
  'timezone',                  // User's timezone
  'locale',                    // Language preference
];
```

**Rationale**: These fields are personal, don't affect system security, and don't sync to external platforms.

---

### Category 2: Conditionally Editable (Requires Permission)
```typescript
const CONDITIONALLY_EDITABLE_FIELDS = [
  // Contact Information
  'work_phone',
  'mobile_phone',
  'office_location',
  'building',
  'floor',
  'desk_number',

  // Professional Details
  'job_title',              // ⚠️ May sync to Google/M365
  'department',             // ⚠️ May sync
  'manager',                // ⚠️ May sync
  'employee_id',
  'start_date',

  // Additional Info
  'linkedin_url',
  'twitter_handle',
  'personal_website',
  'emergency_contact_name',
  'emergency_contact_phone',
];
```

**Rationale**: These can be safely edited by users but admins may want control. Some sync to external platforms.

---

### Category 3: Admin-Only (Never User-Editable)
```typescript
const ADMIN_ONLY_FIELDS = [
  // Identity & Access
  'email',                  // ⚠️ Security: Primary identifier
  'role',                   // ⚠️ Security: Privilege escalation risk
  'is_active',              // ⚠️ Security: Account status
  'is_suspended',

  // Google/M365 Sync
  'google_user_id',         // ⚠️ Sync: External platform ID
  'microsoft_user_id',
  'last_sync_at',
  'sync_status',

  // System Fields
  'created_at',
  'updated_at',
  'created_by',
  'password_hash',
];
```

**Rationale**: Security-critical or system-managed fields that must remain admin-controlled.

---

## 🔒 Security Boundaries

### Sync-Aware Field Protection

When a field syncs to Google Workspace or Microsoft 365, editing rules change:

```typescript
interface FieldSyncConfig {
  field: string;
  syncedTo: ('google_workspace' | 'microsoft_365')[];
  conflictResolution: 'platform_wins' | 'helios_wins' | 'manual_review';
  userCanEdit: boolean;
  warningMessage?: string;
}

const SYNCED_FIELDS: FieldSyncConfig[] = [
  {
    field: 'job_title',
    syncedTo: ['google_workspace', 'microsoft_365'],
    conflictResolution: 'helios_wins',  // Helios is source of truth
    userCanEdit: true,                  // But can be restricted
    warningMessage: 'This will update your job title in Google Workspace'
  },
  {
    field: 'department',
    syncedTo: ['google_workspace', 'microsoft_365'],
    conflictResolution: 'helios_wins',
    userCanEdit: false,                 // Usually org structure change
    warningMessage: 'Department changes require manager approval'
  },
  {
    field: 'manager',
    syncedTo: ['google_workspace'],
    conflictResolution: 'helios_wins',
    userCanEdit: false,                 // Definitely needs approval
  }
];
```

**Security Rules**:
1. ⛔ Users cannot edit fields that would change their Google Workspace org unit
2. ⛔ Users cannot edit fields that would change their access level
3. ⚠️ Users see warnings when editing synced fields
4. ✅ All synced field edits are logged for audit

---

## 👥 Helios-Only Groups vs Synced Groups

### Architecture

```typescript
interface Group {
  id: string;
  name: string;
  description: string;
  type: 'helios_only' | 'google_synced' | 'microsoft_synced';

  // Only for synced groups
  external_id?: string;           // Google/Microsoft group ID
  external_email?: string;        // group@company.com
  sync_direction: 'helios_to_platform' | 'platform_to_helios' | 'bidirectional';
  last_sync_at?: Date;

  // Membership
  members: GroupMember[];

  // Permissions
  field_permissions: FieldPermission[];

  created_at: Date;
  updated_at: Date;
}

interface GroupMember {
  user_id: string;
  role: 'member' | 'manager' | 'owner';
  added_at: Date;
  added_by: string;
}

interface FieldPermission {
  field_name: string;
  can_edit: boolean;
  requires_approval: boolean;
  approval_workflow_id?: string;
}
```

---

### Group Type Comparison

| Feature | Helios-Only | Google Synced | Microsoft Synced |
|---------|-------------|---------------|------------------|
| **Purpose** | Internal organization, permissions | Sync with Google Workspace | Sync with Microsoft 365 |
| **Email** | Optional (for internal notifications) | Required (group@domain.com) | Required |
| **Membership** | Managed in Helios | Synced from/to Google | Synced from/to Microsoft |
| **Can Convert** | Yes → Synced (one-way) | No (would lose Google data) | No |
| **Field Permissions** | Yes | Yes | Yes |
| **Nested Groups** | Yes | Yes (if platform supports) | Yes |

---

### Conversion Flow: Helios-Only → Synced Group

```
┌─────────────────────────────────────────────┐
│ Convert to Synced Group                     │
├─────────────────────────────────────────────┤
│                                             │
│ ⚠️ WARNING: This is a one-way conversion   │
│                                             │
│ Step 1: Select Platform                    │
│ ○ Google Workspace                         │
│ ○ Microsoft 365                            │
│                                             │
│ Step 2: Configure Email                    │
│ Group Email: [marketing]@company.com       │
│                                             │
│ Step 3: Sync Direction                     │
│ ○ Helios → Platform (Helios is master)    │
│ ○ Platform → Helios (Platform is master)  │
│ ○ Bidirectional (Conflict resolution req.) │
│                                             │
│ Step 4: Initial Sync                       │
│ ☑ Create group in Google Workspace        │
│ ☑ Add all current members (24 users)      │
│ ☑ Set group description                   │
│                                             │
│ ⚠️ After conversion:                        │
│ • Group name cannot be changed in Helios   │
│ • Membership managed per sync direction    │
│ • Cannot convert back to Helios-Only       │
│                                             │
│ [Cancel]  [Convert Group →]                │
└─────────────────────────────────────────────┘
```

---

## 🛡️ Security Safeguards

### 1. Sync Conflict Prevention

```typescript
interface SyncSafeguard {
  check: () => Promise<boolean>;
  errorMessage: string;
  severity: 'warning' | 'error' | 'critical';
}

const SYNC_SAFEGUARDS: SyncSafeguard[] = [
  {
    check: async () => {
      // Prevent creating synced group with existing email
      const existingGroup = await checkGoogleWorkspace(email);
      return !existingGroup;
    },
    errorMessage: 'A group with this email already exists in Google Workspace',
    severity: 'critical'
  },
  {
    check: async () => {
      // Prevent privilege escalation via group membership
      const groupHasAdmins = await checkGroupHasAdmins(groupId);
      const userIsAdmin = await checkUserRole(userId);
      return userIsAdmin || !groupHasAdmins;
    },
    errorMessage: 'Only admins can manage groups containing admin users',
    severity: 'critical'
  },
  {
    check: async () => {
      // Prevent orphaning users by deleting synced group
      const syncedUserCount = await getUsersWhoOnlyHaveThisGroup(groupId);
      return syncedUserCount === 0;
    },
    errorMessage: '5 users would lose their only group membership',
    severity: 'error'
  }
];
```

---

### 2. Audit Trail

```sql
CREATE TABLE user_field_edits (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  edited_by UUID,  -- User who made the edit (may be different from user_id)
  edit_source VARCHAR(50),  -- 'self_service' | 'admin' | 'sync' | 'api'
  requires_approval BOOLEAN DEFAULT false,
  approval_status VARCHAR(50),  -- 'pending' | 'approved' | 'rejected'
  approved_by UUID,
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  synced_to_platforms JSONB,  -- ['google_workspace', 'microsoft_365']
  sync_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_field_edits_user ON user_field_edits(user_id);
CREATE INDEX idx_field_edits_approval ON user_field_edits(approval_status)
  WHERE approval_status = 'pending';
```

---

## 🎨 UI Design

### Profile Field Permissions Manager

```
┌──────────────────────────────────────────────────┐
│ User Profile Field Permissions                   │
├──────────────────────────────────────────────────┤
│                                                  │
│ Default Permissions (Applied to All Users)       │
│ ┌──────────────────────────────────────────────┐│
│ │ ✓ Professional Designation                   ││
│ │ ✓ Pronouns                                   ││
│ │ ✓ Preferred Name                             ││
│ │ ✓ Bio                                        ││
│ │ ✓ Profile Photo                              ││
│ │ ✓ Timezone                                   ││
│ │                                              ││
│ │ [+ Add Field Permission]                     ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ Global Exceptions (12)                           │
│ ┌──────────────────────────────────────────────┐│
│ │ ┌──────────────────────────────────────────┐││
│ │ │ 📞 Work Phone                            │││
│ │ │ Can Edit: ✓ Enabled                      │││
│ │ │ Requires Approval: ☐                     │││
│ │ │ Syncs to: None                           │││
│ │ │ [Edit] [Remove]                          │││
│ │ └──────────────────────────────────────────┘││
│ │                                              ││
│ │ ┌──────────────────────────────────────────┐││
│ │ │ 💼 Job Title                             │││
│ │ │ Can Edit: ✓ Enabled                      │││
│ │ │ Requires Approval: ☑ Yes                 │││
│ │ │ Syncs to: Google Workspace, Microsoft    │││
│ │ │ ⚠️ Changes will update external platforms│││
│ │ │ [Edit] [Remove]                          │││
│ │ └──────────────────────────────────────────┘││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ Group-Specific Exceptions (3 Groups)             │
│ ┌──────────────────────────────────────────────┐│
│ │ 👥 Sales Team (Helios-Only)                 ││
│ │    Additional Permissions:                   ││
│ │    • Mobile Phone (no approval)              ││
│ │    • LinkedIn URL (no approval)              ││
│ │    [View Details]                            ││
│ │                                              ││
│ │ 👥 Engineering (Google Synced)              ││
│ │    Additional Permissions:                   ││
│ │    • GitHub Username (no approval)           ││
│ │    ⚠️ Synced from: google-workspace          ││
│ │    [View Details]                            ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ [+ Add Group Exception]                          │
└──────────────────────────────────────────────────┘
```

---

### Add Field Permission Dialog

```
┌─────────────────────────────────────────────┐
│ Add Field Permission                        │
├─────────────────────────────────────────────┤
│                                             │
│ Field: [Select Field ▼]                    │
│        - Work Phone                         │
│        - Mobile Phone                       │
│        - Job Title ⚠️ (syncs to platforms) │
│        - Department ⚠️ (syncs to platforms)│
│        - Office Location                    │
│                                             │
│ Apply To:                                   │
│ ○ All Users (Global Exception)             │
│ ○ Specific Groups                          │
│   └─ [Select Groups... ▼]                  │
│                                             │
│ Permission Settings:                        │
│ ☑ Users can edit this field                │
│ ☐ Require manager approval                 │
│ ☐ Require admin approval                   │
│                                             │
│ ⚠️ This field syncs to:                     │
│ • Google Workspace                          │
│ • Microsoft 365                             │
│                                             │
│ Changes will be reflected in external       │
│ platforms within 15 minutes.                │
│                                             │
│ [Cancel]  [Add Permission]                  │
└─────────────────────────────────────────────┘
```

---

### User's Self-Service Profile Edit

```
┌─────────────────────────────────────────────┐
│ My Profile                                  │
├─────────────────────────────────────────────┤
│                                             │
│ Basic Information                           │
│ ┌─────────────────────────────────────────┐│
│ │ Name: John Doe                          ││
│ │ Email: john@company.com                 ││
│ │ (Managed by admin)                      ││
│ └─────────────────────────────────────────┘│
│                                             │
│ Editable Fields                             │
│ ┌─────────────────────────────────────────┐│
│ │ Professional Designation:               ││
│ │ [Senior Software Engineer     ] 💾     ││
│ │                                         ││
│ │ Pronouns:                               ││
│ │ [he/him                       ] 💾     ││
│ │                                         ││
│ │ Work Phone:                             ││
│ │ [(555) 123-4567               ] 💾     ││
│ │                                         ││
│ │ Job Title:                              ││
│ │ [Software Engineer            ] 💾🔒   ││
│ │ ⚠️ Requires approval                    ││
│ │ ⚠️ Will sync to Google Workspace        ││
│ └─────────────────────────────────────────┘│
│                                             │
│ Pending Approvals (1)                       │
│ ┌─────────────────────────────────────────┐│
│ │ Job Title: "Senior Software Engineer"  ││
│ │ Status: Pending Manager Approval        ││
│ │ Submitted: 2 hours ago                  ││
│ └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### Field Permissions Configuration

```sql
CREATE TABLE field_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  field_name VARCHAR(100) NOT NULL,

  -- Permission scope
  scope_type VARCHAR(50) NOT NULL,  -- 'global' | 'group' | 'user'
  scope_id UUID,  -- group_id or user_id if applicable

  -- Permission settings
  can_edit BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT false,
  approval_type VARCHAR(50),  -- 'manager' | 'admin' | 'workflow'
  approval_workflow_id UUID,

  -- Sync awareness
  syncs_to_platforms JSONB DEFAULT '[]',
  show_sync_warning BOOLEAN DEFAULT true,

  -- Metadata
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(organization_id, field_name, scope_type, scope_id)
);

CREATE INDEX idx_field_perms_scope ON field_permissions(scope_type, scope_id);
CREATE INDEX idx_field_perms_field ON field_permissions(field_name);
```

---

### Groups with Sync Support

```sql
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Group type
  group_type VARCHAR(50) NOT NULL DEFAULT 'helios_only',
    -- 'helios_only' | 'google_synced' | 'microsoft_synced'

  -- Email (required for synced groups)
  email VARCHAR(255) UNIQUE,

  -- External platform sync
  google_group_id VARCHAR(255),
  microsoft_group_id VARCHAR(255),
  sync_direction VARCHAR(50),
    -- 'helios_to_platform' | 'platform_to_helios' | 'bidirectional'
  last_sync_at TIMESTAMP,
  sync_status VARCHAR(50),
  sync_error TEXT,

  -- Metadata
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_group_type CHECK (
    group_type IN ('helios_only', 'google_synced', 'microsoft_synced')
  ),
  CONSTRAINT synced_group_has_email CHECK (
    (group_type = 'helios_only') OR
    (group_type != 'helios_only' AND email IS NOT NULL)
  )
);

CREATE INDEX idx_groups_type ON groups(group_type);
CREATE INDEX idx_groups_sync_status ON groups(sync_status)
  WHERE group_type != 'helios_only';
```

---

### Group Membership

```sql
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Role in group
  role VARCHAR(50) DEFAULT 'member',
    -- 'member' | 'manager' | 'owner'

  -- Source tracking
  added_by UUID REFERENCES organization_users(id),
  added_source VARCHAR(50) DEFAULT 'manual',
    -- 'manual' | 'google_sync' | 'microsoft_sync' | 'import' | 'api'

  -- Sync status
  synced_to_google BOOLEAN DEFAULT false,
  synced_to_microsoft BOOLEAN DEFAULT false,

  added_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_group ON group_members(group_id);
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation
- ✅ Field permission configuration UI
- ✅ Basic self-service profile editing
- ✅ Audit logging for all edits
- ✅ Admin override capabilities

### Phase 2: Approval Workflows
- Manager approval for sensitive fields
- Admin approval queue
- Approval delegation
- Email notifications

### Phase 3: Helios-Only Groups
- Create/manage internal groups
- Assign field permissions per group
- Group membership management
- Nested groups support

### Phase 4: Group Sync
- Convert Helios-Only → Synced
- Bidirectional sync with Google/M365
- Conflict resolution UI
- Sync status monitoring

### Phase 5: Advanced Features
- Custom approval workflows
- Conditional permissions (e.g., "Sales can edit mobile phone if manager = X")
- Bulk permission updates
- Permission templates

---

## ⚠️ Security Considerations

### 1. Privilege Escalation Prevention
```typescript
// NEVER allow users to edit:
const ESCALATION_RISK_FIELDS = [
  'role',
  'is_active',
  'google_user_id',
  'microsoft_user_id',
  'email',  // Email = identity
];

// Validate before saving
function canUserEditField(user: User, field: string): boolean {
  if (ESCALATION_RISK_FIELDS.includes(field)) {
    return user.role === 'admin';
  }

  const permission = getFieldPermission(user, field);
  return permission.can_edit;
}
```

---

### 2. Sync Loop Prevention
```typescript
interface SyncOperation {
  source: 'helios' | 'google' | 'microsoft';
  timestamp: Date;
  field: string;
  value: any;
}

// Track recent syncs to prevent loops
const recentSyncs = new Map<string, SyncOperation>();

function shouldSync(field: string, value: any, source: string): boolean {
  const key = `${field}:${value}`;
  const recent = recentSyncs.get(key);

  if (recent && recent.source !== source) {
    const timeSince = Date.now() - recent.timestamp.getTime();
    if (timeSince < 60000) {  // 1 minute
      logger.warn('Potential sync loop detected', { field, source });
      return false;
    }
  }

  recentSyncs.set(key, { source, timestamp: new Date(), field, value });
  return true;
}
```

---

### 3. Data Validation
```typescript
interface FieldValidator {
  field: string;
  validate: (value: any) => { valid: boolean; error?: string };
}

const FIELD_VALIDATORS: FieldValidator[] = [
  {
    field: 'work_phone',
    validate: (value) => {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      return {
        valid: phoneRegex.test(value),
        error: 'Invalid phone number format'
      };
    }
  },
  {
    field: 'email',
    validate: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isCompanyDomain = value.endsWith('@company.com');
      return {
        valid: emailRegex.test(value) && isCompanyDomain,
        error: 'Must be a valid company email'
      };
    }
  }
];
```

---

## 📊 Success Metrics

- **Self-Service Adoption**: 80% of profile updates done by users (vs admin)
- **Approval Turnaround**: < 24 hours for field change approvals
- **Sync Accuracy**: 99.9% sync success rate between Helios and platforms
- **Security Incidents**: Zero privilege escalations via profile edits
- **User Satisfaction**: Users can update their info without tickets

---

This architecture provides:
- ✅ Flexible user self-service
- ✅ Granular admin control
- ✅ Security by default
- ✅ Sync conflict prevention
- ✅ Full audit trail
- ✅ Scalable group permissions
- ✅ Safe conversion from internal to synced groups
