# Design: Group Management SlideOut

## Component Architecture

```
GroupSlideOut
├── GroupHeader (avatar, name, email, type badge)
├── TabNavigation (overview, members, rules, sync, settings, danger)
├── TabContent
│   ├── OverviewTab
│   │   ├── GroupInfo (name, email, description - editable)
│   │   ├── GroupStats (member count, created, last sync)
│   │   └── PlatformStatus (Google/Microsoft connection status)
│   ├── MembersTab
│   │   ├── MemberSearch
│   │   ├── MemberList (with remove action)
│   │   └── AddMemberModal
│   ├── RulesTab (dynamic groups only)
│   │   ├── RuleLogicSelector (AND/OR)
│   │   ├── RuleList
│   │   │   └── RuleRow (field, operator, value, delete)
│   │   ├── AddRuleButton
│   │   └── RulePreview (matching user count + preview)
│   ├── SyncTab
│   │   ├── GoogleWorkspaceSync
│   │   │   ├── EnableToggle
│   │   │   ├── DirectionSelector
│   │   │   └── SyncStatus + SyncNowButton
│   │   └── Microsoft365Sync (feature flagged)
│   ├── SettingsTab
│   │   └── GroupSettings (visibility, permissions)
│   └── DangerTab
│       ├── ArchiveGroup
│       └── DeleteGroup
└── SlideOutFooter (save/cancel for edit mode)
```

## UI Component Details

### RuleBuilder Component

The rule builder is the core of dynamic groups. Each rule consists of:

```tsx
interface RuleBuilderProps {
  rules: DynamicGroupRule[];
  logic: 'AND' | 'OR';
  onRulesChange: (rules: DynamicGroupRule[]) => void;
  onLogicChange: (logic: 'AND' | 'OR') => void;
  onPreview: () => void;
  previewCount?: number;
  previewLoading?: boolean;
}
```

### Field Options

| Field | Display Name | Operators Allowed |
|-------|-------------|-------------------|
| department | Department | equals, contains, starts_with, ends_with, regex, in_list |
| location | Location | equals, contains, starts_with, ends_with, in_list |
| job_title | Job Title | equals, contains, starts_with, ends_with, regex |
| reports_to | Reports To | equals (user picker) |
| org_unit_path | Org Unit | equals, starts_with (for nested) |
| employee_type | Employee Type | equals, in_list |
| cost_center | Cost Center | equals, in_list |
| email | Email | contains, ends_with, regex |
| user_type | User Type | equals, in_list |

### Operator Display Names

| Operator | Display Name | Example |
|----------|-------------|---------|
| equals | is exactly | Department is exactly "Engineering" |
| not_equals | is not | Department is not "Sales" |
| contains | contains | Job Title contains "Engineer" |
| not_contains | does not contain | Email does not contain "contractor" |
| starts_with | starts with | Email starts with "admin" |
| ends_with | ends with | Email ends with "@company.com" |
| regex | matches pattern | Job Title matches pattern "^(Sr\|Senior)" |
| in_list | is one of | Department is one of "Engineering, Product, Design" |
| not_in_list | is not one of | Employee Type is not one of "Contractor, Intern" |
| is_empty | is empty | Cost Center is empty |
| is_not_empty | is not empty | Manager is not empty |

### Rule Row Layout

```
+------------------------------------------------------------------+
| [Field Dropdown ▼] [Operator Dropdown ▼] [Value Input     ] [x] |
| [ ] Case sensitive   [ ] Include nested (for reports_to)         |
+------------------------------------------------------------------+
```

### Special Field Types

#### Reports To Field
- Shows user picker instead of text input
- "Include nested" checkbox to include indirect reports
- Value stored as user ID

#### Org Unit Path Field
- Shows org unit tree picker
- "Include nested" checkbox for child OUs
- Value stored as OU path (e.g., "/Engineering/Frontend")

#### In List Operator
- Shows tag input for multiple values
- Values stored as comma-separated string

## Color Scheme (matching existing design system)

| Element | Color |
|---------|-------|
| Primary actions | #8b5cf6 (purple) |
| Static group badge | #6b7280 (gray) |
| Dynamic group badge | #8b5cf6 (purple) |
| Synced status | #10b981 (green) |
| Not synced status | #9ca3af (gray) |
| Error status | #ef4444 (red) |
| Rule preview count | #3b82f6 (blue) |

## Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Desktop (>1024px) | SlideOut width: 600px, full rule builder |
| Tablet (768-1024px) | SlideOut width: 500px, stacked rule fields |
| Mobile (<768px) | Full screen overlay, simplified rule builder |

## State Management

```typescript
interface GroupSlideOutState {
  // Display state
  isLoading: boolean;
  activeTab: TabType;
  isEditing: boolean;

  // Group data
  group: AccessGroup;
  editedGroup: AccessGroup;

  // Members
  members: GroupMember[];
  membersLoading: boolean;

  // Rules (dynamic groups)
  rules: DynamicGroupRule[];
  ruleLogic: 'AND' | 'OR';
  rulePreviewCount: number | null;
  rulePreviewLoading: boolean;

  // Sync
  syncStatus: {
    google: SyncStatus;
    microsoft: SyncStatus;
  };

  // Actions
  isSaving: boolean;
  isSyncing: boolean;
  isDeleting: boolean;
}

interface SyncStatus {
  enabled: boolean;
  lastSync: string | null;
  status: 'synced' | 'pending' | 'error' | 'never';
  error?: string;
}
```

## Animation & Transitions

- SlideOut enter: slide from right (300ms ease-out)
- SlideOut exit: slide to right (200ms ease-in)
- Tab switch: fade (150ms)
- Rule add: expand down (200ms)
- Rule delete: collapse up (150ms)
- Preview loading: skeleton pulse

## Accessibility

- All form controls labeled
- Tab navigation for rule builder
- Keyboard shortcuts:
  - `Esc` to close slideout
  - `Ctrl+S` to save
  - `Ctrl+Enter` to add rule
- ARIA live regions for preview count updates
- Focus trap within slideout when open

## Error States

### Rule Evaluation Errors
```
+------------------------------------------+
| ! Could not evaluate rules               |
| Error: Invalid regex pattern in rule 2   |
| [Fix Rule] [Dismiss]                     |
+------------------------------------------+
```

### Sync Errors
```
+------------------------------------------+
| ! Sync failed                            |
| Google API returned: Group not found     |
| Last successful sync: 2 days ago         |
| [Retry] [View Details]                   |
+------------------------------------------+
```

## Loading States

### Initial Load
- Skeleton for header
- Skeleton for tab content
- Disabled tab navigation

### Rule Preview
- "Evaluating rules..." with spinner
- Previous count shown grayed out
- Cancel button for long-running queries

### Sync in Progress
- "Syncing to Google Workspace..." with progress
- Disable sync button
- Show member delta if available
