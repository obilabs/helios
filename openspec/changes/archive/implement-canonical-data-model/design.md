# Canonical Data Model - Design Document

## Architecture Overview

### System Context
```
┌─────────────────────────────────────────────────────────────┐
│  Client Portal (Tenant-Specific)                            │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ UI Components (React)                                    ││
│  │ - Uses LabelsContext                                     ││
│  │ - Renders: {labels.entity.user.plural} → "People"      ││
│  │ - No hardcoded strings                                   ││
│  └──────────────────────────────────────────────────────────┘│
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Label Service (Frontend)                                 ││
│  │ - LabelsContext provides labels to all components       ││
│  │ - Fetches from API on app load                          ││
│  │ - Cached for session                                     ││
│  └──────────────────────────────────────────────────────────┘│
└───────────────────────────────────┬─────────────────────────┘
                                     │ GET /api/organization/labels
                                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend API                                                 │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Label Service API                                        ││
│  │ - GET /api/organization/labels                           ││
│  │ - PATCH /api/organization/labels                         ││
│  │ - Returns tenant-specific label mappings                ││
│  └──────────────────────────────────────────────────────────┘│
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Business Logic (Always uses canonical names)            ││
│  │ - Routes: /api/organization/users (NOT /people)         ││
│  │ - DB queries: SELECT * FROM entity_user                  ││
│  │ - Code references: entity.user, entity.workspace        ││
│  └──────────────────────────────────────────────────────────┘│
│                          ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Database                                                 ││
│  │ - custom_labels (tenant-specific mappings)              ││
│  │ - organization_users (canonical table name)             ││
│  │ - workspaces (NEW - collaboration spaces)               ││
│  │ - access_groups (NEW - permission/mailing lists)        ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Design Decisions

### Decision 1: Canonical Names vs Display Labels

**Options Considered:**
1. Single unified name (change code when terminology changes)
2. Aliases with multiple names (database contains "users" AND "people")
3. **Canonical Data Model** (immutable system name + mutable display label)

**Decision:** Option 3 - Canonical Data Model

**Rationale:**
- **Code Stability**: Changing from "Users" to "People" doesn't require code changes
- **API Stability**: Routes remain `/api/organization/users` regardless of label
- **Database Stability**: Tables don't need renaming when labels change
- **Multi-Platform Ready**: When adding M365, canonical names provide abstraction
- **Industry Standard**: Salesforce, Microsoft Dynamics, ServiceNow all use this pattern

**Trade-offs:**
- ✅ Maximum flexibility and stability
- ✅ Scales to multi-platform integrations
- ✅ Enables future i18n without code changes
- ❌ Requires additional abstraction layer (Label Service)
- ❌ Slightly more complex initial implementation

**Implementation:**
```typescript
// Canonical Name (System ID)
const CANONICAL = {
  USER: 'entity.user',
  WORKSPACE: 'entity.workspace',
  ACCESS_GROUP: 'entity.access_group',
  POLICY_CONTAINER: 'entity.policy_container',
  DEVICE: 'entity.device'
};

// Display Label (Tenant-Customizable)
interface CustomLabel {
  canonicalName: string;
  labelSingular: string;  // "Person"
  labelPlural: string;     // "People"
}
```

### Decision 2: Split Groups into Workspaces and Access Groups

**Options Considered:**
1. Keep single "Groups" entity with type field
2. Split into two distinct entities
3. Create polymorphic entity with subclasses

**Decision:** Option 2 - Split into distinct entities

**Rationale:**
- **User Intent**: Creating a "Team" vs creating a "Mailing List" are fundamentally different actions
- **Platform Mapping**:
  - Microsoft Team = Full collaboration workspace (chat, files, calendar, tasks)
  - Google Group = Simple mailing list / permission group
  - These are NOT the same thing!
- **Future M365 Integration**: Cannot map M365 Teams to current "Groups" entity
- **UI Clarity**: "Create Team" button should create a workspace, not a permission group

**Trade-offs:**
- ✅ Clear separation of concerns
- ✅ Enables proper M365 Teams integration
- ✅ Better user experience (clear intent)
- ✅ Easier to understand for users
- ❌ More database tables
- ❌ Migration required for existing groups data

**Implementation:**
```sql
-- Collaboration Spaces (NEW)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50), -- 'microsoft_team', 'google_chat_space'
  external_id VARCHAR(255), -- ID in source system
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Permission/Mailing Lists (REFACTORED from existing groups)
CREATE TABLE access_groups (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  type VARCHAR(50), -- 'google_group', 'm365_security_group', 'm365_distribution_group'
  external_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migration path for existing groups
INSERT INTO access_groups (id, organization_id, name, email, type, external_id, metadata, created_at)
SELECT id, organization_id, name, email, 'google_group', google_group_id, metadata, created_at
FROM user_groups;  -- Old table
```

### Decision 3: Department as Profile Attribute, Not Navigation Entity

**Options Considered:**
1. Keep Department as top-level customizable entity
2. Move to user profile attributes section
3. Remove completely

**Decision:** Option 2 - Move to user profile attributes

**Rationale:**
- **Google Workspace Reality**: Department is just a text field on user profiles
- **Not a Policy Container**: Unlike Org Units, Department doesn't enforce settings
- **Not Hierarchical**: No parent/child relationships
- **Informational Only**: Used for directory listings, not access control
- **Advisor Recommendation**: Explicitly called out as critical error

**Trade-offs:**
- ✅ Matches actual platform capabilities
- ✅ Prevents user confusion
- ✅ Cleaner top-level navigation
- ❌ Requires migration of existing customization

**Implementation:**
```typescript
// WRONG (Current):
NavigationCustomization: {
  users: "People",
  groups: "Pods",
  orgUnits: "Business Units",
  department: "Cost Centers"  // ❌ This doesn't belong here!
}

// CORRECT (After):
EntityLabels: {
  'entity.user': { singular: "Person", plural: "People" },
  'entity.workspace': { singular: "Pod", plural: "Pods" },
  'entity.policy_container': { singular: "Business Unit", plural: "Business Units" }
}

UserProfileAttributes: {
  'attribute.user.department': "Cost Center",
  'attribute.user.jobTitle': "Role",
  'attribute.user.manager': "Supervisor"
}
```

### Decision 4: Label Storage in Database vs Config Files

**Options Considered:**
1. Store in `localStorage` (current)
2. Store in config files (JSON)
3. Store in database table
4. Store in Redis cache

**Decision:** Option 3 - Database table

**Rationale:**
- **Persistence**: Survives browser cache clears
- **Multi-Device**: Works across all devices for all users
- **Centralized**: Single source of truth
- **Auditable**: Can track who changed what
- **Admin Control**: Only admins can modify
- **API-Driven**: Easy to fetch and update

**Trade-offs:**
- ✅ Persistent and reliable
- ✅ Multi-device support
- ✅ Centralized control
- ✅ Audit trail
- ❌ Requires database migration
- ❌ Slightly more complex than localStorage

**Implementation:**
```sql
CREATE TABLE custom_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  canonical_name VARCHAR(100) NOT NULL,
  label_singular VARCHAR(30) NOT NULL,
  label_plural VARCHAR(30) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id),
  updated_by UUID REFERENCES organization_users(id),

  UNIQUE(organization_id, canonical_name),

  -- Enforce character limits
  CHECK (char_length(label_singular) <= 30),
  CHECK (char_length(label_plural) <= 30)
);

-- Index for fast lookups
CREATE INDEX idx_custom_labels_org ON custom_labels(organization_id);
```

### Decision 5: Singular + Plural Labels

**Options Considered:**
1. Single label (use pluralization library)
2. Separate singular and plural labels
3. Grammatical rules + exceptions

**Decision:** Option 2 - Explicit singular and plural

**Rationale:**
- **Accuracy**: "Person" → "People" (not "Persons")
- **Flexibility**: Supports irregular plurals
- **Simplicity**: No complex pluralization logic
- **User Control**: User specifies exactly what they want
- **Advisor Recommendation**: Explicitly required in analysis

**Trade-offs:**
- ✅ Accurate for all cases
- ✅ User has full control
- ✅ Simple implementation
- ❌ Slightly more user input required
- ❌ User could enter inconsistent values (mitigated by help text)

**Implementation:**
```typescript
interface LabelSet {
  singular: string;  // "Person", "Pod", "Business Unit"
  plural: string;    // "People", "Pods", "Business Units"
}

// Usage in UI:
<h1>Manage {labels.entity.user.plural}</h1>          // "Manage People"
<button>Add New {labels.entity.user.singular}</button> // "Add New Person"
```

## Data Flow

### Label Resolution Flow
```
1. User loads app
   ↓
2. LabelsContext initializes
   ↓
3. Fetch GET /api/organization/labels
   ↓
4. Backend queries custom_labels WHERE organization_id = ?
   ↓
5. Returns label mappings:
   {
     "entity.user": { singular: "Person", plural: "People" },
     "entity.workspace": { singular: "Pod", plural: "Pods" }
   }
   ↓
6. LabelsContext caches labels
   ↓
7. Components use: const labels = useLabels()
   ↓
8. UI renders with custom labels
```

### Label Update Flow
```
1. Admin goes to Settings > Customization
   ↓
2. Changes "Users" to "People"
   ↓
3. Frontend: PATCH /api/organization/labels
   {
     "entity.user": {
       singular: "Person",
       plural: "People"
     }
   }
   ↓
4. Backend validates (length, XSS, etc.)
   ↓
5. Update custom_labels table
   ↓
6. Return updated labels
   ↓
7. LabelsContext updates cache
   ↓
8. UI re-renders with new labels (React context propagation)
```

## Security Model

### Input Validation
```typescript
// Backend validation
function validateLabel(label: string): boolean {
  // Length check
  if (label.length > 30) return false;

  // XSS prevention (sanitize HTML)
  const sanitized = sanitizeHtml(label, { allowedTags: [] });
  if (sanitized !== label) return false;

  // No special characters that break UI
  if (!/^[a-zA-Z0-9\s\-']+$/.test(label)) return false;

  // No PII patterns (future enhancement)
  // if (containsPII(label)) return false;

  return true;
}
```

### Authorization
```typescript
// Only organization admins can modify labels
router.patch('/api/organization/labels', authenticateToken, requireRole('admin'), async (req, res) => {
  // ... update labels
});
```

## Performance Considerations

### Caching Strategy
```typescript
// Frontend: Cache in React Context (session-level)
const LabelsContext = createContext<Labels>({});

// Backend: Could add Redis cache (optional)
const getCachedLabels = async (orgId: string) => {
  const cached = await redis.get(`labels:${orgId}`);
  if (cached) return JSON.parse(cached);

  const labels = await db.query('SELECT * FROM custom_labels WHERE organization_id = ?', [orgId]);
  await redis.setex(`labels:${orgId}`, 3600, JSON.stringify(labels)); // 1 hour TTL
  return labels;
};
```

### Database Optimization
- Index on `organization_id` for fast lookups
- Denormalized (labels in separate table, not joined on every query)
- Small payload (max 5 entities × 2 labels × 30 chars = ~300 bytes)

## Migration & Rollout

### Phase 1: Add Infrastructure (No Breaking Changes)
1. Create `custom_labels` table
2. Seed with defaults for all organizations
3. Create Label Service API
4. Deploy (old UI still works)

### Phase 2: Split Groups (Data Migration)
1. Create `workspaces` and `access_groups` tables
2. Migrate existing `user_groups` → `access_groups` (all treated as Google Groups)
3. Update backend routes
4. Deploy (provide migration UI for users to classify)

### Phase 3: Update Frontend
1. Create LabelsContext
2. Refactor components to use tokens
3. Deploy (labels now applied)

### Phase 4: Update Settings UI
1. Replace localStorage implementation
2. Add singular/plural fields
3. Remove Department from top-level
4. Deploy

### Rollback Plan
Each phase can be rolled back independently:
- Phase 1: Drop `custom_labels` table
- Phase 2: Restore `user_groups` from backup
- Phase 3: Revert frontend to hardcoded strings
- Phase 4: Restore old Settings UI

## Testing Strategy

### Unit Tests
- Label validation (length, XSS, special chars)
- Label resolution logic
- Singular/plural selection

### Integration Tests
- Label Service API CRUD operations
- Custom labels persist across sessions
- Labels update throughout UI

### E2E Tests
```typescript
test('Customize entity labels', async ({ page }) => {
  await page.goto('/settings');
  await page.click('Customization');

  // Change "Users" to "People"
  await page.fill('[data-testid="entity-user-singular"]', 'Person');
  await page.fill('[data-testid="entity-user-plural"]', 'People');
  await page.click('Save Changes');

  // Verify applied in navigation
  await page.goto('/dashboard');
  expect(await page.textContent('[data-testid="nav-users"]')).toBe('People');

  // Verify persists after reload
  await page.reload();
  expect(await page.textContent('[data-testid="nav-users"]')).toBe('People');
});
```

### Migration Tests
- Existing organizations get default labels
- Existing groups migrate to access_groups
- No data loss during migration

## Future Enhancements

### Phase 2: "Rosetta Stone" UI for MTP
When building Helios MTP (multi-tenant platform for MSPs):
```tsx
// MSP sees both client term and canonical term
<h1>Manage {clientLabels.entity.user.plural} ({canonicalLabels.entity.user.plural})</h1>
// Renders: "Manage People (Users)"
```

### Phase 3: Internationalization
The canonical model makes i18n trivial:
```typescript
// English
{ "entity.user": { singular: "User", plural: "Users" } }

// Spanish
{ "entity.user": { singular: "Usuario", plural: "Usuarios" } }

// Code never changes!
```

### Phase 4: Attribute Labels
Extend to user profile attributes:
```typescript
{
  "attribute.user.firstName": "Given Name",
  "attribute.user.lastName": "Family Name",
  "attribute.user.department": "Cost Center"
}
```

## References
- Salesforce Object Label Customization: https://help.salesforce.com/s/articleView?id=sf.customize_labels.htm
- Microsoft Dynamics Label Management: https://docs.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-labels
- WCAG 2.5.3 Label in Name: https://www.w3.org/WAI/WCAG21/Understanding/label-in-name.html
