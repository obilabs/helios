# OpenSpec Proposal: User Lifecycle Management

**ID:** user-lifecycle
**Status:** Draft
**Priority:** P2 (Medium)
**Author:** Claude (Autonomous Agent)
**Created:** 2025-12-08

## Summary

Automated user onboarding and offboarding workflows with templates, reducing manual IT work and ensuring consistent provisioning across Google Workspace.

## Problem Statement

From MSP/IT admin research:
- "IT admins spend countless hours on user provisioning and offboarding"
- "Manual onboarding processes can be time-consuming and error-prone"
- "IT teams find it difficult to manage employee access across many SaaS apps"
- "Onboarding delays, unorganized access system, and security risks"

### Current State
- Create user in Google Workspace Admin
- Manually add to groups
- Manually set signature
- Manually configure settings
- Repeat for every new hire (10-30 minutes each)

### Desired State
- Select template based on role/department
- One-click provisioning
- Automatic group membership
- Automatic signature assignment
- Consistent configuration every time

## Feature Overview

### 1. Onboarding Templates

Pre-configured templates for common roles:

```
┌─ Onboarding Template: Sales Representative ─────────────────────────┐
│                                                                      │
│  Name: Sales Representative                                         │
│  Department: Sales                                                  │
│                                                                      │
│  ┌─ Google Workspace Settings ────────────────────────────────────┐ │
│  │  ☑ Create Google Workspace account                             │ │
│  │  ☑ License: Business Standard                                  │ │
│  │  ☑ Organizational Unit: /Sales                                 │ │
│  │  ☑ Enable Gmail                                                │ │
│  │  ☑ Enable Drive                                                │ │
│  │  ☑ Enable Calendar                                             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Group Memberships ────────────────────────────────────────────┐ │
│  │  ☑ All Employees                                               │ │
│  │  ☑ Sales Team                                                  │ │
│  │  ☑ CRM Users                                                   │ │
│  │  ☐ Engineering (not applicable)                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Signature Template ───────────────────────────────────────────┐ │
│  │  Template: Sales Standard                                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Shared Drives ────────────────────────────────────────────────┐ │
│  │  ☑ Sales Resources (Viewer)                                    │ │
│  │  ☑ Sales Collateral (Contributor)                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Calendar Resources ───────────────────────────────────────────┐ │
│  │  ☑ Subscribe to: Sales Team Calendar                           │ │
│  │  ☑ Subscribe to: Company Events                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 2. One-Click Onboarding

```
┌─ New User Onboarding ───────────────────────────────────────────────┐
│                                                                      │
│  Step 1: Basic Information                                          │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  First Name: [John                    ]                        │ │
│  │  Last Name:  [Smith                   ]                        │ │
│  │  Personal Email: [john.smith@gmail.com] (for invite)           │ │
│  │  Start Date: [2025-01-15]                                      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Step 2: Select Template                                            │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  ○ Sales Representative                                        │ │
│  │  ○ Software Engineer                                           │ │
│  │  ○ Marketing Specialist                                        │ │
│  │  ○ Customer Support                                            │ │
│  │  ○ Custom (configure manually)                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Step 3: Review & Customize                                         │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Email: john.smith@company.com                                 │ │
│  │  Department: Sales                                             │ │
│  │  Manager: [Select...                  ▼]                       │ │
│  │  Job Title: [Sales Representative     ]                        │ │
│  │                                                                │ │
│  │  ☑ Create Google Workspace account                             │ │
│  │  ☑ Add to groups: All Employees, Sales Team, CRM Users        │ │
│  │  ☑ Assign signature: Sales Standard                           │ │
│  │  ☑ Add to Shared Drives: Sales Resources, Sales Collateral    │ │
│  │  ☑ Send welcome email to personal address                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Cancel]                              [Create User & Provision]    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3. Offboarding Workflow

```
┌─ Offboard User: Jane Doe ───────────────────────────────────────────┐
│                                                                      │
│  Employee: Jane Doe (jane.doe@company.com)                          │
│  Department: Marketing                                              │
│  Manager: Bob Wilson                                                │
│  Last Day: 2025-01-31                                               │
│                                                                      │
│  ┌─ Data Handling ────────────────────────────────────────────────┐ │
│  │  Drive Files:                                                  │ │
│  │    ○ Transfer to manager (Bob Wilson)                          │ │
│  │    ○ Transfer to specific user: [Select...          ▼]        │ │
│  │    ○ Archive to Shared Drive: [Offboarded Users     ▼]        │ │
│  │    ○ Delete after 30 days                                      │ │
│  │                                                                │ │
│  │  Email:                                                        │ │
│  │    ○ Forward to manager for 30 days                            │ │
│  │    ○ Forward to: [Select...                         ▼]        │ │
│  │    ○ Auto-reply with departure message                         │ │
│  │    ○ Archive and disable                                       │ │
│  │                                                                │ │
│  │  Calendar:                                                     │ │
│  │    ☑ Decline future meetings                                   │ │
│  │    ☑ Transfer meeting ownership to manager                     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Access Revocation ────────────────────────────────────────────┐ │
│  │  ☑ Remove from all groups                                      │ │
│  │  ☑ Remove from Shared Drives                                   │ │
│  │  ☑ Revoke all OAuth tokens                                     │ │
│  │  ☑ Sign out of all devices                                     │ │
│  │  ☑ Reset password                                              │ │
│  │  ☑ Remove signature                                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Account Status ───────────────────────────────────────────────┐ │
│  │  ○ Suspend immediately                                         │ │
│  │  ○ Suspend on last day (2025-01-31)                           │ │
│  │  ○ Delete after 90 days                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Notifications ────────────────────────────────────────────────┐ │
│  │  ☑ Notify manager                                              │ │
│  │  ☑ Notify IT admin                                             │ │
│  │  ☐ Notify HR                                                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Cancel]                                    [Begin Offboarding]    │
└──────────────────────────────────────────────────────────────────────┘
```

### 4. Scheduled Actions

```
┌─ Scheduled User Actions ────────────────────────────────────────────┐
│                                                                      │
│  Upcoming Actions:                                                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Jan 15, 2025  │ Onboard │ John Smith    │ Sales Rep    │ [Edit]│ │
│  │  Jan 31, 2025  │ Suspend │ Jane Doe      │ Last day     │ [Edit]│ │
│  │  Feb 15, 2025  │ Onboard │ Alice Brown   │ Engineer     │ [Edit]│ │
│  │  Apr 30, 2025  │ Delete  │ Jane Doe      │ 90 day policy│ [Edit]│ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [Schedule New Action]                                              │
└──────────────────────────────────────────────────────────────────────┘
```

## Database Schema

```sql
-- Onboarding templates
CREATE TABLE onboarding_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  department_id UUID REFERENCES departments(id),

  -- Google Workspace settings
  google_license_sku VARCHAR(100), -- Business Standard, Enterprise, etc.
  google_org_unit_path VARCHAR(500),
  google_services JSONB DEFAULT '{}', -- {gmail: true, drive: true, etc.}

  -- Memberships
  group_ids UUID[] DEFAULT '{}', -- Groups to add user to
  shared_drive_access JSONB DEFAULT '[]', -- [{driveId, role}]
  calendar_subscriptions TEXT[] DEFAULT '{}', -- Calendar IDs

  -- Signature
  signature_template_id UUID REFERENCES signature_templates(id),

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Offboarding templates
CREATE TABLE offboarding_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,

  -- Data handling
  drive_action VARCHAR(50) DEFAULT 'transfer_manager', -- transfer_manager, transfer_user, archive, delete
  drive_transfer_to UUID REFERENCES organization_users(id),
  drive_archive_drive_id VARCHAR(100),

  email_action VARCHAR(50) DEFAULT 'forward_manager', -- forward_manager, forward_user, auto_reply, archive
  email_forward_to UUID REFERENCES organization_users(id),
  email_forward_days INTEGER DEFAULT 30,
  email_auto_reply TEXT,

  calendar_decline_meetings BOOLEAN DEFAULT true,
  calendar_transfer_ownership BOOLEAN DEFAULT true,

  -- Revocation
  remove_from_groups BOOLEAN DEFAULT true,
  remove_from_drives BOOLEAN DEFAULT true,
  revoke_tokens BOOLEAN DEFAULT true,
  sign_out_devices BOOLEAN DEFAULT true,
  reset_password BOOLEAN DEFAULT true,
  remove_signature BOOLEAN DEFAULT true,

  -- Account handling
  account_action VARCHAR(50) DEFAULT 'suspend', -- suspend, delete
  delete_after_days INTEGER DEFAULT 90,

  -- Metadata
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled actions
CREATE TABLE scheduled_user_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Target
  user_id UUID REFERENCES organization_users(id), -- NULL for new user onboarding
  user_email VARCHAR(255), -- For onboarding before user exists

  -- Action
  action_type VARCHAR(50) NOT NULL, -- 'onboard', 'offboard', 'suspend', 'delete', 'restore'
  action_config JSONB NOT NULL, -- Template + overrides

  -- Schedule
  scheduled_for TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, failed, cancelled
  error_message TEXT,

  -- Audit
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_scheduled_actions_pending (organization_id, scheduled_for)
    WHERE status = 'pending'
);

-- Action logs
CREATE TABLE user_lifecycle_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES organization_users(id),
  action_id UUID REFERENCES scheduled_user_actions(id),

  action_type VARCHAR(50) NOT NULL,
  action_step VARCHAR(100) NOT NULL, -- 'create_account', 'add_to_group', etc.
  status VARCHAR(20) NOT NULL, -- success, failed, skipped
  details JSONB,
  error_message TEXT,

  executed_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_lifecycle_logs (organization_id, user_id, executed_at DESC)
);
```

## Google Workspace API Integration

### Required APIs
- Admin SDK (Directory API) - User/Group management
- Gmail API - Email forwarding, vacation responder
- Drive API - File transfers, Shared Drive access
- Calendar API - Calendar subscriptions, meeting transfers

### Onboarding API Calls

```typescript
async function onboardUser(config: OnboardingConfig): Promise<void> {
  // 1. Create Google Workspace user
  const user = await adminService.users.insert({
    requestBody: {
      primaryEmail: config.email,
      name: { givenName: config.firstName, familyName: config.lastName },
      password: generateTempPassword(),
      changePasswordAtNextLogin: true,
      orgUnitPath: config.orgUnitPath
    }
  });

  // 2. Add to groups
  for (const groupId of config.groupIds) {
    await adminService.members.insert({
      groupKey: groupId,
      requestBody: { email: config.email, role: 'MEMBER' }
    });
  }

  // 3. Add to Shared Drives
  for (const drive of config.sharedDrives) {
    await driveService.permissions.create({
      fileId: drive.driveId,
      requestBody: { type: 'user', role: drive.role, emailAddress: config.email }
    });
  }

  // 4. Set signature
  if (config.signatureTemplateId) {
    await signatureService.deployToUser(config.email, config.signatureTemplateId);
  }

  // 5. Send welcome email
  await emailService.sendWelcomeEmail(config.personalEmail, config);
}
```

### Offboarding API Calls

```typescript
async function offboardUser(config: OffboardingConfig): Promise<void> {
  // 1. Transfer Drive files
  if (config.driveAction === 'transfer_manager') {
    await driveService.files.update({
      fileId: 'root', // Transfer all
      transferOwnership: true,
      requestBody: { owners: [config.managerId] }
    });
  }

  // 2. Set email forwarding
  if (config.emailAction === 'forward_manager') {
    await gmailService.users.settings.updateAutoForwarding({
      userId: config.email,
      requestBody: {
        enabled: true,
        emailAddress: config.managerEmail,
        disposition: 'archive'
      }
    });
  }

  // 3. Revoke OAuth tokens
  await adminService.tokens.list({ userKey: config.email })
    .then(tokens => Promise.all(
      tokens.items.map(t => adminService.tokens.delete({
        userKey: config.email,
        clientId: t.clientId
      }))
    ));

  // 4. Sign out all devices
  await adminService.users.signOut({ userKey: config.email });

  // 5. Remove from groups
  const groups = await adminService.groups.list({ userKey: config.email });
  for (const group of groups.groups) {
    await adminService.members.delete({
      groupKey: group.id,
      memberKey: config.email
    });
  }

  // 6. Suspend account
  await adminService.users.update({
    userKey: config.email,
    requestBody: { suspended: true }
  });
}
```

## Success Criteria

1. Create onboarding template with all settings
2. One-click user provisioning with template
3. User gets correct groups, signature, Shared Drives
4. Offboarding transfers data correctly
5. Scheduled actions execute on time
6. Full audit log of all actions
7. < 2 minutes for complete onboarding (vs 10-30 manual)

## Migration Path

### Phase 1: Templates & Manual Trigger
- Create/edit onboarding templates
- Manually trigger onboarding
- Basic offboarding

### Phase 2: Scheduling
- Schedule future onboarding
- Automatic offboarding on last day
- Calendar integration

### Phase 3: Advanced
- HR system integration
- Bulk onboarding (CSV import)
- Approval workflows
