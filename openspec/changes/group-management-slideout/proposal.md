# OpenSpec Proposal: Group Management SlideOut with Dynamic Groups

**ID:** group-management-slideout
**Status:** Draft
**Priority:** High
**Author:** Claude (Autonomous Agent)
**Created:** 2025-12-08

## Summary

Implement a slide-out panel for managing groups, similar to the existing UserSlideOut component. This includes support for:
- Static groups (manually managed membership)
- Dynamic groups (rule-based automatic membership)
- Platform sync settings (Google Workspace, Microsoft 365 - feature flagged)

## Problem Statement

Currently, the Groups page shows a basic list view with limited interaction. Users cannot:
- View detailed group information in context
- Configure sync settings per group
- Create dynamic groups with automatic membership rules
- Manage group settings without navigating away

## Proposed Solution

### 1. GroupSlideOut Component

A tabbed slide-out panel with the following structure:

| Tab | Description |
|-----|-------------|
| Overview | Group name, email, description, type, member count |
| Members | View/manage static membership, see resolved members for dynamic groups |
| Rules | Configure dynamic membership rules (dynamic groups only) |
| Sync | Platform sync settings (Google/Microsoft) |
| Settings | Group settings (visibility, permissions) |
| Danger | Delete group, archive options |

### 2. Group Types

```typescript
type GroupType = 'static' | 'dynamic';

interface AccessGroup {
  id: string;
  name: string;
  email?: string;
  description?: string;
  groupType: GroupType;
  platform: 'manual' | 'google_workspace' | 'microsoft_365';
  syncEnabled: boolean;
  syncDirection: 'push' | 'pull' | 'bidirectional';
  memberCount: number;
  rules?: DynamicGroupRule[];
  createdAt: string;
  updatedAt: string;
}
```

### 3. Dynamic Group Rules

Dynamic groups automatically include users based on configurable rules:

```typescript
interface DynamicGroupRule {
  id: string;
  field: DynamicGroupField;
  operator: DynamicGroupOperator;
  value: string;
  caseSensitive?: boolean;
}

type DynamicGroupField =
  | 'department'
  | 'location'
  | 'job_title'
  | 'reports_to'        // Manager's user ID or email
  | 'org_unit_path'     // Google Workspace OU
  | 'employee_type'     // Full Time, Part Time, Contractor
  | 'cost_center'
  | 'email'
  | 'user_type'         // staff, guest, contact
  | 'custom_field';     // For future custom fields

type DynamicGroupOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'in_list'           // Value is comma-separated list
  | 'not_in_list'
  | 'is_empty'
  | 'is_not_empty';

// Rule combination logic
type RuleLogic = 'AND' | 'OR';

interface DynamicGroupConfig {
  rules: DynamicGroupRule[];
  logic: RuleLogic;           // How rules combine
  includeNested?: boolean;    // Include users in nested OUs
  refreshInterval?: number;   // Minutes between auto-refresh (0 = manual only)
}
```

### 4. Platform Sync Settings

```typescript
interface GroupSyncSettings {
  googleWorkspace: {
    enabled: boolean;
    syncDirection: 'push' | 'pull' | 'bidirectional';
    externalId?: string;      // Google Group ID
    createIfNotExists: boolean;
    deleteOnRemove: boolean;
  };
  microsoft365: {
    enabled: boolean;         // Feature flagged - always false for now
    syncDirection: 'push' | 'pull' | 'bidirectional';
    externalId?: string;      // M365 Group ID
    groupType: 'security' | 'distribution' | 'microsoft365';
  };
}
```

## UI Design

### Overview Tab
```
+------------------------------------------+
| [Avatar]  Engineering Team               |
|           engineering@company.com        |
|           Dynamic Group | 45 members     |
+------------------------------------------+
| Description                              |
| All engineers across all departments     |
+------------------------------------------+
| Created: Jan 15, 2025                    |
| Last synced: 5 minutes ago               |
+------------------------------------------+
| [Google Workspace]  Synced               |
| [Microsoft 365]     Not connected        |
+------------------------------------------+
```

### Rules Tab (Dynamic Groups)
```
+------------------------------------------+
| Membership Rules                    [Add]|
+------------------------------------------+
| Match: ( ) All rules  (x) Any rule       |
+------------------------------------------+
| 1. [Department] [contains] [Engineering] |
|    [x] Case insensitive          [Delete]|
+------------------------------------------+
| 2. [Job Title] [starts with] [Engineer]  |
|    [x] Case insensitive          [Delete]|
+------------------------------------------+
| 3. [Reports To] [equals] [john@...]      |
|    [ ] Include nested reports    [Delete]|
+------------------------------------------+
| Preview: 45 users match these rules      |
| [Refresh Preview]                        |
+------------------------------------------+
```

### Sync Tab
```
+------------------------------------------+
| Google Workspace                         |
+------------------------------------------+
| [x] Sync this group to Google Workspace  |
|                                          |
| Sync Direction:                          |
| ( ) Push only (Helios -> Google)         |
| (x) Bidirectional                        |
| ( ) Pull only (Google -> Helios)         |
|                                          |
| Google Group: engineering@company.com    |
| Status: Synced | Last: 5 min ago         |
| [Sync Now]                               |
+------------------------------------------+
| Microsoft 365              [Coming Soon] |
+------------------------------------------+
| [ ] Sync this group to Microsoft 365     |
| This feature is not yet available.       |
+------------------------------------------+
```

## Database Changes

### New Table: `dynamic_group_rules`

```sql
CREATE TABLE dynamic_group_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  access_group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  field VARCHAR(50) NOT NULL,
  operator VARCHAR(20) NOT NULL,
  value TEXT NOT NULL,
  case_sensitive BOOLEAN DEFAULT false,
  include_nested BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dynamic_rules_group ON dynamic_group_rules(access_group_id);
```

### Alter Table: `access_groups`

```sql
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS group_type VARCHAR(20) DEFAULT 'static';
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS rule_logic VARCHAR(10) DEFAULT 'AND';
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS refresh_interval INTEGER DEFAULT 0;
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS last_rule_evaluation TIMESTAMPTZ;
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS sync_to_google BOOLEAN DEFAULT false;
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS sync_to_microsoft BOOLEAN DEFAULT false;
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS google_sync_direction VARCHAR(20) DEFAULT 'bidirectional';
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS microsoft_sync_direction VARCHAR(20) DEFAULT 'bidirectional';
```

## API Endpoints

### Group Management
- `GET /api/organization/access-groups/:id` - Get group details with rules
- `PUT /api/organization/access-groups/:id` - Update group settings
- `DELETE /api/organization/access-groups/:id` - Delete group

### Dynamic Rules
- `GET /api/organization/access-groups/:id/rules` - Get dynamic rules
- `POST /api/organization/access-groups/:id/rules` - Add rule
- `PUT /api/organization/access-groups/:id/rules/:ruleId` - Update rule
- `DELETE /api/organization/access-groups/:id/rules/:ruleId` - Delete rule
- `POST /api/organization/access-groups/:id/evaluate` - Preview rule results

### Sync
- `POST /api/organization/access-groups/:id/sync/google` - Sync to Google
- `POST /api/organization/access-groups/:id/sync/microsoft` - Sync to Microsoft (feature flagged)

## Implementation Phases

### Phase 1: GroupSlideOut Basic (MVP)
- Create GroupSlideOut component with Overview tab
- Add Members tab with view/add/remove functionality
- Basic group editing (name, description, email)

### Phase 2: Sync Settings
- Add Sync tab with Google Workspace settings
- Implement push sync to Google Workspace
- Microsoft 365 placeholder with "Coming Soon"

### Phase 3: Dynamic Groups
- Add group_type selection (static/dynamic)
- Implement Rules tab UI
- Create rule evaluation engine
- Preview functionality
- Scheduled rule evaluation

### Phase 4: Advanced Features
- Nested reports_to support
- Custom field rules
- Audit logging for rule changes
- Rule templates

## Success Criteria

1. Users can manage groups via slide-out panel without page navigation
2. Dynamic groups automatically update membership based on rules
3. Groups sync bidirectionally with Google Workspace
4. Rule evaluation is performant (< 2 seconds for 10,000 users)
5. UI is consistent with UserSlideOut design patterns

## Files to Create/Modify

### New Files
- `frontend/src/components/GroupSlideOut.tsx`
- `frontend/src/components/GroupSlideOut.css`
- `frontend/src/components/DynamicRuleBuilder.tsx`
- `backend/src/services/dynamic-group.service.ts`
- `database/migrations/030_dynamic_group_rules.sql`

### Modified Files
- `frontend/src/pages/Groups.tsx` - Integrate GroupSlideOut
- `backend/src/routes/access-groups.routes.ts` - New endpoints
- `backend/src/services/google-workspace-sync.service.ts` - Group sync

## Feature Flags

```typescript
const FEATURE_FLAGS = {
  MICROSOFT_365_GROUPS: false,  // Disabled until M365 module implemented
  DYNAMIC_GROUPS: true,         // Enable dynamic group rules
  GROUP_SYNC_BIDIRECTIONAL: true,
};
```

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rule evaluation performance | High | Batch processing, caching, indexes |
| Sync conflicts | Medium | Clear conflict resolution, audit logs |
| Complex rule combinations | Medium | Limit rule count, validate combinations |

## Prerequisite: Master Data Management

**See: [master-data.md](./master-data.md)**

For dynamic groups to be reliable, we need clean, managed data. Free-text fields lead to:
- Typos ("Engneering" vs "Engineering")
- Inconsistencies ("Eng" vs "Engineering" vs "Software Engineering")
- Unreliable rule matching

### Master Data Entities

| Entity | Purpose | UI |
|--------|---------|-----|
| Departments | Hierarchical org structure | Tree view + manager |
| Locations | Offices, regions, remote | Tree view |
| Cost Centers | Financial grouping | List view |
| Job Titles | Optional standardization | List view |

### Dropdown-Based Rule Builder

When master data exists, rules use dropdowns instead of free text:

**Managed Field (Department):**
```
[Department ▼] [is under ▼] [▼ Engineering        ]
                            ├── Frontend
                            ├── Backend
                            └── DevOps
```

**User Reference (Reports To):**
```
[Reports To ▼] [is ▼] [▼ Search users...     ]
                      │ John Smith (CTO)
               [x] Include nested reports
```

### New Operators for Hierarchical Data

| Operator | Use Case |
|----------|----------|
| is | Exact match to selected value |
| is not | Exclude selected value |
| is under | Include selected + all children |
| is not under | Exclude selected + all children |

### Org Chart Integration

The Org Chart view visualizes master data and highlights issues:
- **Department View**: Group users by department hierarchy
- **Reporting View**: Traditional manager relationships
- **Data Quality Mode**: Highlight orphans, missing managers

## Open Questions

1. Should we support custom fields in dynamic rules now or defer?
2. Maximum number of rules per group?
3. Should dynamic group membership changes trigger webhooks?
4. Should departments be required before enabling dynamic groups?
5. How aggressive should orphan detection be? (exact match vs fuzzy)
