# Implement Canonical Data Model and Custom Label System

## Summary
Implement an enterprise-grade Canonical Data Model that separates immutable system names from tenant-customizable display labels. This architectural foundation enables tenant-specific terminology (e.g., "People" instead of "Users") while maintaining code stability, supporting future multi-platform integrations (M365, Slack, Okta), and providing MSP efficiency through a "Rosetta Stone" dual-label UI pattern.

## Problem Statement
The current implementation has critical architectural flaws that will prevent scalability and cause user confusion:

### 1. **Hardcoded Labels Throughout Codebase**
- Navigation items use hardcoded strings: "Users", "Groups", "Org Units"
- No abstraction between display labels and system logic
- Changing terminology requires code changes across multiple files
- Routes, database queries, and API endpoints tightly coupled to display names

### 2. **Groups Entity Conflation (Critical)**
- Current "Groups" entity treats all groups as a single concept
- **Google Groups**: Mailing lists and permission containers (simple)
- **Microsoft Teams**: Full collaboration workspaces with chat, files, tasks (complex)
- **Impact**: Cannot support M365 integration without massive confusion
- Users expecting "Create Team" will get a mailing list, or vice versa

### 3. **Department/Org Unit Misclassification (Critical)**
- Settings > Customization treats "Department" and "Org Units" as interchangeable
- **Org Units** (GWS): Hierarchical policy containers, security-critical, top-level entity
- **Department**: Simple user profile text field (like "Job Title")
- **Impact**: Conflating these creates UI that doesn't map to either platform's reality

### 4. **Broken Customization Settings**
- Current Settings > Customization stores labels in `localStorage`
- Labels are never actually applied to the UI
- No singular/plural support
- No contextual help
- Includes non-existent features (Devices, Workflows, Templates)
- No character limits (vulnerable to UI breaking)

### 5. **No Multi-Tenant Support Architecture**
- Future "Helios MTP" (multi-tenant platform) will manage 100+ client organizations
- MSPs cannot be efficient if they must memorize 100 different terminologies
- No mechanism to show both client term and canonical term

## Proposed Solution

### Core Architecture: Canonical Data Model

Implement a Salesforce-style data model with strict separation:

```typescript
// Immutable System Names (used in code, DB, API)
entity.user
entity.workspace          // NEW: Collaboration spaces (Teams, Chat Spaces)
entity.access_group       // NEW: Permission/mailing lists
entity.policy_container   // Org Units
entity.device

// Mutable Display Labels (tenant-customizable)
{
  organizationId: "org_123",
  canonicalName: "entity.user",
  labelSingular: "Person",
  labelPlural: "People"
}
```

### Key Changes:

#### 1. Split Groups into Two Distinct Entities
```typescript
// Before (Wrong):
entity.group → "Groups", "Teams", "Pods"  // Conflated!

// After (Correct):
entity.workspace → "Teams", "Pods", "Spaces"
  - Microsoft Team (with SharePoint, Planner, etc.)
  - Google Chat Space (with Shared Drive)

entity.access_group → "Groups", "Mailing Lists", "Security Groups"
  - Google Group
  - M365 Security/Distribution Group
```

#### 2. Fix Department/Org Unit Separation
```typescript
// Top-level navigation entity (policy container)
entity.policy_container → "Org Units", "Business Units", "Locations"

// User profile attribute (NOT navigation)
attribute.user.department → "Department", "Cost Center", "Team"
```

#### 3. Database Schema
```sql
CREATE TABLE custom_labels (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  canonical_name VARCHAR(100) NOT NULL,  -- e.g., "entity.user"
  label_singular VARCHAR(30) NOT NULL,   -- e.g., "Person"
  label_plural VARCHAR(30) NOT NULL,     -- e.g., "People"
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, canonical_name)
);

-- Pre-populate with defaults on organization creation
INSERT INTO custom_labels VALUES
  (gen_random_uuid(), org_id, 'entity.user', 'User', 'Users'),
  (gen_random_uuid(), org_id, 'entity.workspace', 'Team', 'Teams'),
  (gen_random_uuid(), org_id, 'entity.access_group', 'Group', 'Groups'),
  (gen_random_uuid(), org_id, 'entity.policy_container', 'Org Unit', 'Org Units'),
  (gen_random_uuid(), org_id, 'entity.device', 'Device', 'Devices');
```

#### 4. Label Service API
```typescript
// Backend: GET /api/organization/labels
{
  "entity.user": {
    singular: "Person",
    plural: "People"
  },
  "entity.workspace": {
    singular: "Pod",
    plural: "Pods"
  }
}

// Frontend: LabelsContext
const labels = useLabels();
<h1>{labels.entity.user.plural}</h1>  // "People"
<button>Add {labels.entity.user.singular}</button>  // "Add Person"
```

#### 5. "Rosetta Stone" Pattern (Future MTP)
When MSP views a client:
```
Page Title: Manage People (Users) for Acme Corp
Nav: Acme: Pods (Workspaces) | Groups (Access Groups)
```
MSP sees client's term PLUS canonical term for context.

## Success Criteria
- ✅ All hardcoded entity labels replaced with label tokens
- ✅ Groups split into Workspaces and Access Groups (database + UI)
- ✅ Department removed from navigation-level customization
- ✅ Custom labels stored in database, applied throughout UI
- ✅ Singular/plural support for all labels
- ✅ Settings > Customization fixed with contextual help
- ✅ Character limits enforced (30 chars)
- ✅ Code references only canonical names (entity.user, never "Users")
- ✅ Routes remain stable when labels change
- ✅ Backward compatible (existing data migrates cleanly)
- ✅ All existing tests pass
- ✅ New tests for label resolution

## Scope

### In Scope
- Canonical data model implementation
- Custom labels database table and migration
- Label Service API (backend)
- LabelsContext (frontend)
- Split Groups entity into Workspaces and Access Groups
- Fix Department/Org Unit classification
- Refactor all UI to use label tokens
- Fix Settings > Customization UI
- Data migration for existing organizations
- E2E tests for label customization

### Out of Scope (Future Enhancements)
- "Rosetta Stone" dual-label UI for MTP (Phase 2)
- Microsoft 365 integration (separate change)
- Slack/Okta integrations (Phase 3)
- Multi-language i18n (can build on this foundation later)
- Advanced label validation (PII scanning, profanity filters)

## Technical Approach

### Phase 1: Foundation (Database + Backend)
1. Create `custom_labels` table
2. Seed defaults for all organizations
3. Create Label Service API endpoints
4. Update organization creation to seed labels

### Phase 2: Split Groups Entity
1. Create `workspaces` table (for Teams/Pods)
2. Migrate Google Groups data to `access_groups` table
3. Update backend routes: `/workspaces` and `/access-groups`
4. Update Google Workspace sync to distinguish types

### Phase 3: Frontend Label System
1. Create LabelsContext
2. Create useLabels hook
3. Refactor App.tsx navigation to use tokens
4. Refactor all pages (Users, Groups → Workspaces/Access Groups)

### Phase 4: Fix Customization Settings
1. Remove localStorage implementation
2. Fetch labels from API
3. Add singular/plural fields
4. Add contextual help text
5. Add character limits and validation
6. Remove non-existent entities (Devices, Workflows, Templates)

### Phase 5: Testing
1. Unit tests for Label Service
2. E2E tests for label customization flow
3. Migration tests for existing data

## User Experience

### Before:
```
Navigation: Users | Groups | Org Units
Settings > Customization:
  - Users Label: [text input]  // Stored in localStorage, not applied
  - Groups Label: [text input]
  - Department Label: [text input]  // Wrong - this is a profile field!
```

### After:
```
Navigation: People | Pods | Access Groups | Business Units
Settings > Customization:
  - People (entity.user):
    Singular: [Person] (max 30 chars)
    Plural: [People] (max 30 chars)
    Help: "What you call individuals in your organization"

  - Teams (entity.workspace):
    Singular: [Pod] (max 30 chars)
    Plural: [Pods] (max 30 chars)
    Help: "Collaboration spaces with chat, files, and tasks"

  - Groups (entity.access_group):
    Singular: [Group] (max 30 chars)
    Plural: [Groups] (max 30 chars)
    Help: "Mailing lists and permission groups"

  - Org Units (entity.policy_container):
    Singular: [Business Unit] (max 30 chars)
    Plural: [Business Units] (max 30 chars)
    Help: "Containers for applying policies and settings"
```

## Security Considerations
1. ✅ Sanitize all custom label inputs (prevent XSS)
2. ✅ Character limits prevent UI breaking
3. ✅ Validate against PII (future enhancement)
4. ✅ Audit log label changes
5. ✅ Only admins can modify labels

## Migration Strategy
1. Run migration to create `custom_labels` table
2. Seed defaults for all existing organizations
3. Deploy backend with Label Service API
4. Deploy frontend with LabelsContext (defaults used initially)
5. Organizations can customize labels via Settings
6. No downtime, fully backward compatible

## Dependencies
- Existing authentication system
- Organization management system
- Settings UI framework
- Google Workspace sync system (needs update for entity split)

## Timeline Estimate
- **Phase 1** (Database + Backend): 4-6 hours
- **Phase 2** (Split Groups Entity): 6-8 hours
- **Phase 3** (Frontend Label System): 6-8 hours
- **Phase 4** (Fix Customization Settings): 3-4 hours
- **Phase 5** (Testing): 4-6 hours
- **Total**: 23-32 hours (3-4 work days)

## Success Metrics
- All UI uses canonical names in code (0 hardcoded labels)
- Organizations can customize all entity labels
- Labels persist across sessions
- UI updates immediately when labels change
- Code stable when labels change (routes, DB queries unchanged)
- Groups → Workspaces/Access Groups split complete
- Department no longer in top-level customization

## Risks & Mitigation
| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing Google Workspace sync | High | Careful migration of groups data, maintain backward compatibility |
| UI breaking with long labels | Medium | Enforce 30-char limit, test truncation |
| Performance impact of label lookups | Low | Cache labels in LabelsContext, single API call on load |
| Data migration fails | High | Thorough testing, rollback script |

## Open Questions
1. ❓ Should we make label customization part of onboarding wizard? **Recommendation: Yes (Phase 2 enhancement)**
2. ❓ Should we restrict certain canonical names? **Recommendation: Yes, validate against reserved keywords**
3. ❓ How to handle existing "Groups" data? **Recommendation: Classify as Access Groups by default, provide migration UI**
4. ✅ Character limit for labels? **Decision: 30 characters (advisor recommendation)**
5. ✅ Enforce plural forms? **Decision: Yes, require both singular and plural**
