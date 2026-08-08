# Template Studio - UX Architecture & Design Specification

## 🎯 Design Philosophy

**Core Principle**: Separation of Content (Templates) from Distribution (Assignments/Campaigns)

- **Templates** = What you create (the content)
- **Assignments** = Who gets it (always-on rules)
- **Campaigns** = When they get it (time-based promotions)

---

## 📊 Information Architecture

### Level 1: Template Library

**Purpose**: Central repository for all reusable content
**Analogy**: Like a design system or asset library

#### Template Types (Based on Enabled Modules)

```typescript
interface TemplateType {
  key: string;           // e.g., 'gmail_signature'
  label: string;         // e.g., 'Gmail Signature'
  module: string;        // e.g., 'google_workspace'
  category: string;      // e.g., 'email_signatures'
  icon: ReactNode;
  requiredFields: string[];
  supportedVariables: Variable[];
}
```

**Dynamic Template Types** (appear based on enabled modules):

| Type | Module Required | Category | Use Case |
|------|----------------|----------|----------|
| Gmail Signature | `google_workspace` | `email_signatures` | Google Workspace email signatures |
| Outlook Signature | `microsoft_365` | `email_signatures` | Microsoft 365 email signatures |
| Email Template | `email_forwarding` | `email_content` | Transactional emails, auto-replies |
| Landing Page | `public_assets` | `web_content` | Marketing pages, event pages |
| OOO Message | `ooo_management` | `email_content` | Out-of-office responses |

#### Template Library UI

```
┌─────────────────────────────────────────────────┐
│ Template Studio                                 │
├─────────────────────────────────────────────────┤
│ [+ New Template ▼]  [Filter by Type ▼]  [🔍]   │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ 📧 Gmail Signature                      │   │
│ │ ├─ Corporate Standard (Default)         │   │
│ │ ├─ Sales Team Promo                     │   │
│ │ └─ Holiday 2025                         │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ 📧 Outlook Signature                    │   │
│ │ └─ (No Outlook module enabled)          │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ 🌐 Landing Pages                        │   │
│ │ ├─ Product Launch 2025                  │   │
│ │ └─ Event Registration                   │   │
│ └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**"New Template" Dropdown**:
- Shows only template types for enabled modules
- Grayed out types show "Enable [Module] to use this"

---

### Level 2: Assignments (Permanent Rules)

**Purpose**: Define who gets which template, always
**Analogy**: Like distribution lists or ACL rules

#### Assignment Hierarchy (Priority System)

```
User-specific       (Priority 1 - Highest)
    ↓
Department          (Priority 2)
    ↓
Google/M365 Group   (Priority 3)
    ↓
Org Unit           (Priority 4)
    ↓
Organization        (Priority 5 - Default/Fallback)
```

**Assignment Conflict Resolution**: Higher priority wins

#### Assignments UI

```
┌─────────────────────────────────────────────────┐
│ Signature Assignments                           │
├─────────────────────────────────────────────────┤
│                                                 │
│ Active Template: Corporate Standard (Default)   │
│ Applied to: Everyone (Organization-wide)        │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ Override Rules (12)                     │   │
│ ├─────────────────────────────────────────┤   │
│ │ ┌─────────────────────────────────────┐ │   │
│ │ │ 👤 Sales Team Promo                 │ │   │
│ │ │ • Google Group: sales@company.com   │ │   │
│ │ │ • Priority: 3                       │ │   │
│ │ │ • Active • 45 members               │ │   │
│ │ └─────────────────────────────────────┘ │   │
│ │                                         │   │
│ │ ┌─────────────────────────────────────┐ │   │
│ │ │ 👤 Engineering Dept                 │ │   │
│ │ │ • Department: Engineering           │ │   │
│ │ │ • Priority: 2                       │ │   │
│ │ │ • Active • 120 members              │ │   │
│ │ └─────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ [+ Add Assignment Rule]                         │
└─────────────────────────────────────────────────┘
```

**Add Assignment Rule Flow**:
```
Step 1: Select Template
  "Which signature should they use?"
  → Dropdown showing templates of matching type

Step 2: Select Target
  "Who should use this signature?"
  → Radio buttons:
     ○ Specific Users (multi-select autocomplete)
     ○ Department (dropdown)
     ○ Google Workspace Group (dropdown, if module enabled)
     ○ Org Unit (tree picker, if module enabled)
     ○ Everyone (default fallback)

Step 3: Set Priority & Dates
  Priority: [Auto-calculated based on type] (editable)
  Active: [Toggle]

  Optional:
  ☐ Set activation date
  ☐ Set expiration date
```

---

### Level 3: Campaigns (Time-Based Deployments)

**Purpose**: Temporary signature changes for events, holidays, promotions
**Analogy**: Like scheduled social media posts

#### Campaign Workflow

```
Draft → Scheduled → Active → Completed/Reverted
```

#### Campaigns UI

```
┌─────────────────────────────────────────────────┐
│ Signature Campaigns                             │
├─────────────────────────────────────────────────┤
│ [+ New Campaign]  [📅 Calendar View] [📊 List] │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ 🎄 Holiday 2025                         │   │
│ │ Dec 15, 2025 - Jan 5, 2026              │   │
│ │ Template: Holiday 2025                  │   │
│ │ Target: Everyone                        │   │
│ │ Status: Scheduled  [Edit] [Cancel]      │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ 🚀 Product Launch Q1                    │   │
│ │ Jan 20, 2025 - Feb 28, 2025             │   │
│ │ Template: Sales Team Promo              │   │
│ │ Target: Sales Group                     │   │
│ │ Status: Active  [Revert] [Extend]       │   │
│ │                                         │   │
│ │ 📊 Click Rate: 12.3% ↑                  │   │
│ │ 👥 Applied to: 45 users                 │   │
│ └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Create Campaign Flow**:
```
Step 1: Campaign Details
  Name: "Holiday 2025"
  Description: "Company-wide holiday signature"

Step 2: Select Template
  Template Type: Gmail Signature
  Template: [Holiday 2025 ▼]

  [Preview Template →]

Step 3: Target Audience
  Who should get this campaign?
  ○ Everyone (organization-wide)
  ○ Specific Groups
  ○ Specific Departments
  ○ Specific Users

Step 4: Schedule
  Start: [Dec 15, 2025 9:00 AM ▼]
  End:   [Jan 5, 2026 11:59 PM ▼]

  Revert After Campaign:
  ○ Return to previous signature (recommended)
  ○ Keep campaign signature

Step 5: Approval (if required)
  ☐ Require manager approval
  Approver: [Select User ▼]

Step 6: Review & Deploy
  [Save as Draft] [Schedule Campaign]
```

---

## 🔄 Assignment Resolution Logic

### Signature Applied = f(Assignments, Campaigns, Time, User)

```typescript
function getActiveSignature(userId: string, timestamp: Date): Template {
  // 1. Check for active campaigns targeting this user
  const activeCampaign = campaigns.find(c =>
    c.isActive(timestamp) && c.targetsUser(userId)
  );

  if (activeCampaign) {
    return activeCampaign.template;
  }

  // 2. Check permanent assignments (highest priority first)
  const assignments = getAssignments(userId)
    .sort((a, b) => a.priority - b.priority); // Lower number = higher priority

  if (assignments.length > 0) {
    return assignments[0].template;
  }

  // 3. Fall back to organization default
  return getOrganizationDefault('gmail_signature');
}
```

**Priority Levels**:
- `1` = User-specific assignment
- `2` = Department assignment
- `3` = Google/M365 Group assignment
- `4` = Org Unit assignment
- `5` = Organization default
- `0` = Active campaign (always wins)

---

## 📱 Module Integration

### Dynamic Template Types

```typescript
interface ModuleTemplateConfig {
  module: string;
  templateTypes: TemplateType[];
  assignmentTargets: TargetType[];
}

const googleWorkspaceConfig: ModuleTemplateConfig = {
  module: 'google_workspace',
  templateTypes: [
    {
      key: 'gmail_signature',
      label: 'Gmail Signature',
      category: 'email_signatures',
      icon: <EmailIcon />,
      requiredFields: ['html_content'],
      supportedVariables: [
        'user.firstName',
        'user.lastName',
        'user.email',
        'user.title',
        'user.department',
        'user.phone',
        // ... etc
      ]
    }
  ],
  assignmentTargets: [
    { type: 'google_group', label: 'Google Group', picker: GoogleGroupPicker },
    { type: 'org_unit', label: 'Org Unit', picker: OrgUnitTreePicker }
  ]
};
```

**When Google Workspace is enabled**:
- "Gmail Signature" appears in template type dropdown
- "Google Group" and "Org Unit" appear in assignment target options
- Variables like `{{user.orgUnit}}` become available

**When Microsoft 365 is enabled**:
- "Outlook Signature" appears in template type dropdown
- "M365 Group" appears in assignment target options
- Variables like `{{user.officeLocation}}` become available

---

## 🎨 UI Component Hierarchy

### Template Studio App Structure

```typescript
<TemplateStudioApp>
  <TabNavigation>
    <Tab icon={<LibraryIcon />}>Templates</Tab>
    <Tab icon={<AssignmentIcon />}>Assignments</Tab>
    <Tab icon={<CampaignIcon />}>Campaigns</Tab>
  </TabNavigation>

  <TabPanel value="templates">
    <TemplateLibrary>
      <TemplateTypeGroups>
        {enabledModules.map(module => (
          <TemplateTypeGroup
            key={module.key}
            types={module.templateTypes}
          />
        ))}
      </TemplateTypeGroups>
    </TemplateLibrary>
  </TabPanel>

  <TabPanel value="assignments">
    <AssignmentManager>
      <DefaultAssignment />
      <OverrideRules />
    </AssignmentManager>
  </TabPanel>

  <TabPanel value="campaigns">
    <CampaignManager>
      <CampaignCalendar />
      <CampaignList />
    </CampaignManager>
  </TabPanel>
</TemplateStudioApp>
```

---

## 🗄️ Database Schema Updates

### Template Types Table (New)

```sql
CREATE TABLE template_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key VARCHAR(100) UNIQUE NOT NULL,  -- 'gmail_signature'
  type_label VARCHAR(255) NOT NULL,        -- 'Gmail Signature'
  module_key VARCHAR(100) NOT NULL,        -- 'google_workspace'
  category VARCHAR(100) NOT NULL,          -- 'email_signatures'
  icon_name VARCHAR(100),
  supported_variables JSONB DEFAULT '[]',
  required_fields JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed data
INSERT INTO template_types (type_key, type_label, module_key, category) VALUES
  ('gmail_signature', 'Gmail Signature', 'google_workspace', 'email_signatures'),
  ('outlook_signature', 'Outlook Signature', 'microsoft_365', 'email_signatures'),
  ('landing_page', 'Landing Page', 'public_assets', 'web_content'),
  ('email_template', 'Email Template', 'email_forwarding', 'email_content'),
  ('ooo_message', 'Out of Office', 'ooo_management', 'email_content');
```

### Updated signature_templates

```sql
ALTER TABLE signature_templates
  ADD COLUMN template_type VARCHAR(100) REFERENCES template_types(type_key),
  ADD COLUMN template_category VARCHAR(100) DEFAULT 'email_signatures';

-- Migrate existing data
UPDATE signature_templates
SET template_type = 'gmail_signature',
    template_category = 'email_signatures'
WHERE template_type IS NULL;
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Current Sprint)
- ✅ Fix module blank pages
- ✅ Add template type selection
- ✅ Basic template library by type
- ✅ Simple assignment rules (organization default)

### Phase 2: Assignments (Next Sprint)
- Department-based assignments
- Google Group assignments
- Org Unit assignments
- Priority system
- Conflict resolution UI

### Phase 3: Campaigns (Sprint 3)
- Campaign creation wizard
- Date/time scheduling
- Campaign calendar view
- Revert functionality
- Approval workflow

### Phase 4: Analytics (Sprint 4)
- Template usage stats
- Campaign performance
- Click tracking
- A/B testing

---

## 💡 Key UX Principles

### 1. Progressive Disclosure
- Start simple: "Everyone uses this template"
- Advanced: "But this group uses this other template"
- Expert: "And during December, everyone uses the holiday template"

### 2. Module Awareness
- Only show template types for enabled modules
- Gracefully handle disabled modules (grayed out with tooltip)
- Automatic cleanup when module disabled

### 3. Clear Mental Models
- Templates = Library (create once)
- Assignments = Always-on rules (who gets what)
- Campaigns = Temporary overrides (time-based)

### 4. Prevent Errors
- Conflict warnings when rules overlap
- Preview before deployment
- Approval workflow for sensitive changes
- Easy revert for campaigns

### 5. Contextual Help
- Inline examples for variables
- Preview templates with real user data
- Impact analysis ("This will affect 120 users")

---

## 📊 User Flows

### Flow 1: Simple Use Case
```
1. Admin creates "Corporate Signature" template
2. Sets it as organization default
3. Done! All users get it automatically
```

### Flow 2: Department Override
```
1. Admin creates "Sales Promo" template
2. Navigates to Assignments
3. Clicks "Add Assignment Rule"
4. Selects "Sales Promo" template
5. Selects "Department: Sales"
6. Saves
7. Sales team automatically gets new signature
```

### Flow 3: Holiday Campaign
```
1. Admin creates "Holiday 2025" template
2. Navigates to Campaigns
3. Clicks "New Campaign"
4. Names it, selects template
5. Sets dates: Dec 15 - Jan 5
6. Selects "Everyone"
7. Chooses "Revert after campaign"
8. Schedules
9. System automatically switches signatures on Dec 15
10. System automatically reverts on Jan 6
```

---

## 🎯 Success Metrics

- **Time to first template deployed**: < 5 minutes
- **Assignment rule creation**: < 2 minutes
- **Campaign setup**: < 3 minutes
- **Zero conflicts**: Automatic detection and resolution
- **User confusion**: Eliminate "which signature am I using?" questions

---

This architecture provides:
- ✅ Clear separation of concerns
- ✅ Module-aware UI
- ✅ Flexible assignment system
- ✅ Powerful campaign functionality
- ✅ Scalable for future template types
- ✅ Intuitive for both simple and complex use cases
