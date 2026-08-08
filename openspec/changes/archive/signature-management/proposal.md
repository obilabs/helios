# OpenSpec Proposal: Email Signature Management

**ID:** signature-management
**Status:** Draft
**Priority:** P1 (High)
**Author:** Claude (Autonomous Agent)
**Created:** 2025-12-08

## Summary

Comprehensive email signature management system with template creation, flexible assignment (users, groups, dynamic groups, OUs, departments), campaign mode for temporary promotional signatures with tracking pixels, and role-based permissions.

## Problem Statement

Organizations need centralized control over email signatures for:
1. **Brand Consistency** - Ensure all employees use approved signatures
2. **Compliance** - Include required legal disclaimers
3. **Marketing** - Run signature campaigns with promotional banners
4. **Analytics** - Track campaign effectiveness via pixel tracking

Currently, users set their own signatures or IT manually configures them - neither scales.

## User Personas

| Persona | Needs | Permissions |
|---------|-------|-------------|
| **Signature Admin** | Full control over all signatures | Create, assign, deploy, view analytics |
| **Template Designer** | Create/edit templates | Create templates, preview, no deploy |
| **Campaign Manager** | Run promotional campaigns | Create campaigns, assign, view analytics |
| **Helpdesk** | Troubleshoot user issues | View status, re-sync individual users |
| **End User** | See their signature | View only (if org allows) |

## Feature Overview

### 1. Template Management

Create and manage reusable signature templates with:

```
┌─────────────────────────────────────────────────────────────────┐
│  Template: Corporate Standard                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  {{photo}}                                                       │
│  {{full_name}} {{pronouns}}                                      │
│  {{job_title}} | {{department}}                                  │
│  {{company}}                                                     │
│                                                                  │
│  📧 {{email}} | 📱 {{mobile}} | 📞 {{work_phone}}                │
│  📍 {{location}}                                                 │
│                                                                  │
│  [LinkedIn] [Twitter] [Website]                                  │
│                                                                  │
│  {{legal_disclaimer}}                                            │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  {{campaign_banner}}  ← Only shown during active campaign        │
│  {{tracking_pixel}}   ← Invisible 1x1 pixel for analytics        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Merge Fields Available:**
| Field | Source | Example |
|-------|--------|---------|
| `{{full_name}}` | organization_users | "John Smith" |
| `{{first_name}}` | organization_users | "John" |
| `{{last_name}}` | organization_users | "Smith" |
| `{{job_title}}` | organization_users | "Senior Engineer" |
| `{{department}}` | departments table | "Engineering" |
| `{{email}}` | organization_users | "john@company.com" |
| `{{mobile}}` | organization_users | "+1 555-0123" |
| `{{work_phone}}` | organization_users | "+1 555-0100" |
| `{{work_phone_ext}}` | organization_users | "x1234" |
| `{{location}}` | locations table | "San Francisco, CA" |
| `{{company}}` | organizations | "Acme Corp" |
| `{{pronouns}}` | organization_users | "(he/him)" |
| `{{photo}}` | user avatar URL | `<img src="...">` |
| `{{linkedin}}` | custom_fields | URL |
| `{{twitter}}` | custom_fields | URL |
| `{{legal_disclaimer}}` | org settings | Legal text |
| `{{campaign_banner}}` | campaign asset | `<img src="...">` |
| `{{tracking_pixel}}` | generated | `<img src="..." width="1" height="1">` |

### 2. Assignment System

Flexible assignment with clear priority rules:

```
Assignment Priority (highest to lowest):
1. Direct User Assignment (most specific)
2. Dynamic Group (rule-based)
3. Static Group
4. Department
5. Organizational Unit
6. Organization Default (fallback)
```

**Assignment UI:**

```
┌─ Assign Template ─────────────────────────────────────────────────┐
│                                                                    │
│  Template: Corporate Standard v2                                   │
│                                                                    │
│  ┌─ Assignment Method ──────────────────────────────────────────┐ │
│  │                                                               │ │
│  │  ○ All Users (organization default)                          │ │
│  │                                                               │ │
│  │  ○ By Department                                              │ │
│  │    └─ [ ] Engineering  [ ] Sales  [ ] Marketing  [+]         │ │
│  │                                                               │ │
│  │  ○ By Organizational Unit                                     │ │
│  │    └─ [Select OUs...                               ▼]        │ │
│  │                                                               │ │
│  │  ○ By Group                                                   │ │
│  │    └─ [ ] All Employees  [ ] US Team  [ ] Contractors  [+]   │ │
│  │                                                               │ │
│  │  ○ By Dynamic Group (advanced)                                │ │
│  │    └─ [Select dynamic group...                     ▼]        │ │
│  │                                                               │ │
│  │  ○ Specific Users                                             │ │
│  │    └─ [Search users...                             🔍]       │ │
│  │        ☑ John Smith (john@company.com)                       │ │
│  │        ☑ Jane Doe (jane@company.com)                         │ │
│  │        ☐ Bob Wilson (bob@company.com)                        │ │
│  │                                                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  Preview: 47 users will receive this template                      │
│  [Preview List]                                                    │
│                                                                    │
│                              [Cancel]  [Save Assignment]           │
└────────────────────────────────────────────────────────────────────┘
```

### 3. Campaign System

Temporary signature overrides with tracking:

```
┌─ Create Campaign ──────────────────────────────────────────────────┐
│                                                                     │
│  Campaign Name: Q4 Product Launch                                   │
│  Description:   Promote new product release                         │
│                                                                     │
│  ┌─ Schedule ─────────────────────────────────────────────────────┐│
│  │  Start: [2025-01-15]  [09:00 AM]  Timezone: [America/New_York] ││
│  │  End:   [2025-02-15]  [11:59 PM]                               ││
│  │                                                                 ││
│  │  ☑ Automatically revert to normal signature after end date     ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─ Template ─────────────────────────────────────────────────────┐│
│  │  [Select campaign template...                          ▼]      ││
│  │                                                                 ││
│  │  Campaign Banner:                                               ││
│  │  [Upload Image] or [Select from library]                       ││
│  │  ┌──────────────────────────────┐                              ││
│  │  │   🖼️ product-launch-banner.png │                              ││
│  │  │   600 x 100px                │                              ││
│  │  └──────────────────────────────┘                              ││
│  │                                                                 ││
│  │  Banner Link: [https://company.com/product-launch    ]         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─ Tracking ─────────────────────────────────────────────────────┐│
│  │  ☑ Enable tracking pixel                                       ││
│  │                                                                 ││
│  │  Track:                                                        ││
│  │    ☑ Email opens (when recipient views email)                  ││
│  │    ☑ Unique recipients (deduplicated by IP hash)               ││
│  │    ☑ Geographic data (country/region from IP)                  ││
│  │    ☐ Device type (from user-agent)                             ││
│  │                                                                 ││
│  │  ⚠️ Note: Tracking requires recipient email client to load     ││
│  │     images. Some clients block this by default.                ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─ Audience ─────────────────────────────────────────────────────┐│
│  │  [Same assignment options as regular templates]                ││
│  │                                                                 ││
│  │  Affected users: 125                                           ││
│  │  [Preview Audience]                                            ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│                        [Save Draft]  [Schedule Campaign]           │
└─────────────────────────────────────────────────────────────────────┘
```

### 4. Tracking Pixel Architecture

**How It Works:**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Employee   │────▶│  Gmail with  │────▶│  Recipient   │
│  sends email │     │  signature   │     │  opens email │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                           Email client loads     │
                           tracking pixel         ▼
                                          ┌──────────────┐
                                          │   Helios     │
                                          │   Tracking   │
                                          │   Endpoint   │
                                          └──────┬───────┘
                                                  │
                     Logs: campaign_id,           │
                     user_id, timestamp,          ▼
                     IP, user-agent       ┌──────────────┐
                                          │  PostgreSQL  │
                     Returns 1x1          │  tracking_   │
                     transparent GIF      │  events      │
                                          └──────────────┘
```

**Pixel URL Structure:**
```
https://helios.example.com/api/t/p/{encoded_token}.gif

Where encoded_token = base64url({
  "c": "campaign_uuid",      // Campaign ID
  "u": "user_uuid",          // Sender (employee) ID
  "n": "random_nonce",       // Unique per pixel instance
  "v": 1                     // Version for future compatibility
})
```

**Why NOT MinIO for pixels:**
- Tracking pixels must be dynamically served to log requests
- MinIO is for static asset storage
- Pixel endpoint returns same 1x1 GIF every time, but logs the request

**MinIO IS used for:**
- Template assets (logos, social icons)
- Campaign banners
- User profile photos in signatures

### 5. Analytics Dashboard

```
┌─ Campaign Analytics: Q4 Product Launch ────────────────────────────┐
│                                                                     │
│  Status: Active        Duration: Jan 15 - Feb 15, 2025             │
│  Users: 125            Days Remaining: 23                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  TOTAL OPENS          UNIQUE RECIPIENTS      OPEN RATE          ││
│  │                                                                  ││
│  │     2,847                  1,234              22.8 opens/user   ││
│  │     ▲ 12% vs last week    ▲ 8% vs last week                    ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─ Opens Over Time ───────────────────────────────────────────────┐│
│  │  350│      ╭─╮                                                  ││
│  │  300│     ╭╯ ╰╮    ╭╮                                           ││
│  │  250│    ╭╯   ╰╮  ╭╯╰╮                                          ││
│  │  200│   ╭╯     ╰╮╭╯  ╰╮                                         ││
│  │  150│  ╭╯       ╰╯    ╰─╮                                       ││
│  │  100│ ╭╯                 ╰╮                                      ││
│  │   50│╭╯                   ╰─                                    ││
│  │     └────────────────────────────────────────                   ││
│  │      Jan 15  Jan 18  Jan 21  Jan 24  Jan 27                     ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─ Top Performers ────────────┐  ┌─ Geographic Distribution ─────┐│
│  │  User              Opens    │  │  🇺🇸 United States    68%      ││
│  │  Sarah Chen         89      │  │  🇬🇧 United Kingdom   12%      ││
│  │  Mike Johnson       76      │  │  🇨🇦 Canada            8%      ││
│  │  Lisa Wang          71      │  │  🇩🇪 Germany           5%      ││
│  │  [View All...]              │  │  🌍 Other              7%      ││
│  └─────────────────────────────┘  └────────────────────────────────┘│
│                                                                     │
│  [Export CSV]  [Download Report]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 6. Role-Based Permissions

```
┌─ Signature Permissions ─────────────────────────────────────────────┐
│                                                                      │
│  Permission             Admin  Designer  Campaign  Helpdesk  User   │
│  ─────────────────────────────────────────────────────────────────  │
│  Create templates         ✓       ✓         ○         ○       ○    │
│  Edit templates           ✓       ✓         ○         ○       ○    │
│  Delete templates         ✓       ○         ○         ○       ○    │
│  Assign templates         ✓       ○         ○         ○       ○    │
│  Deploy to Google         ✓       ○         ○         ○       ○    │
│  Create campaigns         ✓       ○         ✓         ○       ○    │
│  Manage campaigns         ✓       ○         ✓         ○       ○    │
│  View analytics           ✓       ○         ✓         ✓       ○    │
│  Re-sync user             ✓       ○         ○         ✓       ○    │
│  View own signature       ✓       ✓         ✓         ✓       ✓    │
│                                                                      │
│  ✓ = allowed   ○ = denied                                           │
└──────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Core Tables

```sql
-- Signature templates
CREATE TABLE signature_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  html_content TEXT NOT NULL,
  plain_text_content TEXT, -- Fallback for plain text emails
  merge_fields JSONB DEFAULT '[]', -- List of fields used
  is_default BOOLEAN DEFAULT false,
  is_campaign_template BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'draft', -- draft, active, archived
  version INTEGER DEFAULT 1,
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Template assignments
CREATE TABLE signature_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  template_id UUID NOT NULL REFERENCES signature_templates(id),
  assignment_type VARCHAR(20) NOT NULL, -- 'user', 'group', 'dynamic_group', 'department', 'ou', 'organization'
  target_id UUID, -- user_id, group_id, department_id (NULL for 'organization')
  target_value VARCHAR(500), -- For OU path strings
  priority INTEGER DEFAULT 100, -- Lower = higher priority
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, template_id, assignment_type, target_id)
);

-- Campaigns
CREATE TABLE signature_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_id UUID NOT NULL REFERENCES signature_templates(id),
  banner_url VARCHAR(500), -- MinIO URL for campaign banner
  banner_link VARCHAR(500), -- Click-through URL
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(100) DEFAULT 'UTC',
  tracking_enabled BOOLEAN DEFAULT true,
  tracking_options JSONB DEFAULT '{"opens": true, "unique": true, "geo": true}',
  status VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, active, completed, cancelled
  auto_revert BOOLEAN DEFAULT true,
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign audience (uses same assignment model)
CREATE TABLE campaign_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES signature_campaigns(id) ON DELETE CASCADE,
  assignment_type VARCHAR(20) NOT NULL,
  target_id UUID,
  target_value VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tracking pixels (one per user per campaign)
CREATE TABLE signature_tracking_pixels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES signature_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id),
  pixel_token VARCHAR(255) NOT NULL UNIQUE, -- Encoded token for URL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, user_id)
);

-- Tracking events (append-only log)
CREATE TABLE signature_tracking_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pixel_id UUID NOT NULL REFERENCES signature_tracking_pixels(id),
  campaign_id UUID NOT NULL, -- Denormalized for faster queries
  user_id UUID NOT NULL, -- Denormalized for faster queries
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address_hash VARCHAR(64), -- SHA256 hash for privacy
  user_agent TEXT,
  country_code VARCHAR(2),
  region VARCHAR(100),
  is_unique BOOLEAN DEFAULT false, -- First open from this IP hash
  INDEX idx_tracking_events_campaign (campaign_id, timestamp),
  INDEX idx_tracking_events_user (user_id, timestamp)
);

-- User signature status
CREATE TABLE user_signature_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES organization_users(id) UNIQUE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  current_template_id UUID REFERENCES signature_templates(id),
  active_campaign_id UUID REFERENCES signature_campaigns(id),
  assignment_source VARCHAR(50), -- 'direct', 'group', 'department', etc.
  assignment_id UUID, -- Which assignment applied
  last_synced_at TIMESTAMPTZ,
  sync_status VARCHAR(20) DEFAULT 'pending', -- pending, synced, failed, error
  sync_error TEXT,
  google_signature_hash VARCHAR(64), -- To detect external changes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Signature permissions (extends existing role system)
CREATE TABLE signature_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES organization_users(id),
  permission_level VARCHAR(20) NOT NULL, -- 'admin', 'designer', 'campaign_manager', 'helpdesk', 'viewer'
  granted_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);
```

## Google Workspace Integration

### Gmail Signature API

```typescript
// Set user signature via Gmail API
async function setUserSignature(
  userEmail: string,
  signatureHtml: string,
  sendAsEmail?: string // For aliases
): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth: this.authClient });

  await gmail.users.settings.sendAs.update({
    userId: userEmail,
    sendAsEmail: sendAsEmail || userEmail,
    requestBody: {
      signature: signatureHtml
    }
  });
}

// Get current signature (to detect external changes)
async function getUserSignature(userEmail: string): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth: this.authClient });

  const response = await gmail.users.settings.sendAs.get({
    userId: userEmail,
    sendAsEmail: userEmail
  });

  return response.data.signature || '';
}
```

### Required OAuth Scopes

```
https://www.googleapis.com/auth/gmail.settings.basic
https://www.googleapis.com/auth/gmail.settings.sharing
```

## API Endpoints

### Templates

```
GET    /api/signatures/templates              - List all templates
POST   /api/signatures/templates              - Create template
GET    /api/signatures/templates/:id          - Get template
PUT    /api/signatures/templates/:id          - Update template
DELETE /api/signatures/templates/:id          - Delete template
POST   /api/signatures/templates/:id/preview  - Preview with user data
POST   /api/signatures/templates/:id/clone    - Clone template
```

### Assignments

```
GET    /api/signatures/assignments            - List assignments
POST   /api/signatures/assignments            - Create assignment
PUT    /api/signatures/assignments/:id        - Update assignment
DELETE /api/signatures/assignments/:id        - Delete assignment
GET    /api/signatures/assignments/preview    - Preview affected users
```

### Campaigns

```
GET    /api/signatures/campaigns              - List campaigns
POST   /api/signatures/campaigns              - Create campaign
GET    /api/signatures/campaigns/:id          - Get campaign
PUT    /api/signatures/campaigns/:id          - Update campaign
DELETE /api/signatures/campaigns/:id          - Delete campaign
POST   /api/signatures/campaigns/:id/launch   - Launch campaign
POST   /api/signatures/campaigns/:id/pause    - Pause campaign
POST   /api/signatures/campaigns/:id/cancel   - Cancel campaign
GET    /api/signatures/campaigns/:id/analytics - Get analytics
```

### Deployment

```
POST   /api/signatures/deploy                 - Deploy all pending
POST   /api/signatures/deploy/user/:id        - Deploy single user
GET    /api/signatures/status                 - Get sync status
GET    /api/signatures/status/user/:id        - Get user status
```

### Tracking

```
GET    /api/t/p/:token.gif                    - Tracking pixel endpoint (public)
```

## Success Criteria

1. Templates can be created with WYSIWYG editor and merge fields
2. Assignments work via users, groups, dynamic groups, departments, OUs
3. Priority system correctly resolves conflicts
4. Campaigns override normal signatures for duration
5. Tracking pixels accurately count opens
6. Analytics show meaningful campaign performance data
7. Google Workspace sync deploys signatures reliably
8. Role-based permissions control access appropriately
9. UI follows DESIGN-SYSTEM.md specifications

## Migration Path

1. **Phase 1**: Core template management and direct user assignment
2. **Phase 2**: Group, department, OU assignment
3. **Phase 3**: Campaign system with scheduling
4. **Phase 4**: Tracking pixels and analytics
5. **Phase 5**: Advanced features (versioning, A/B testing)
