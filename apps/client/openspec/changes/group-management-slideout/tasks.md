# Tasks: Group Management SlideOut

## Phase 0: Master Data Foundation (Prerequisite)

### Backend Tasks

- [x] **TASK-000A**: Create departments table migration
  - Hierarchical structure with parent_id
  - Manager reference
  - Google OU mapping
  - File: `database/migrations/019_create_canonical_data_model.sql`

- [x] **TASK-000B**: Create locations table migration
  - Hierarchical structure (regions > offices)
  - Type field (headquarters, office, remote)
  - File: `database/migrations/032_add_locations_and_cost_centers.sql`

- [x] **TASK-000C**: Create cost_centers table migration
  - Code and name fields
  - Link to department
  - File: `database/migrations/032_add_locations_and_cost_centers.sql`

- [x] **TASK-000D**: Update organization_users with FK columns
  - Add department_id, location_id, cost_center_id
  - Keep existing text fields for migration
  - File: `database/migrations/032_add_locations_and_cost_centers.sql`

- [x] **TASK-000E**: Create departments CRUD endpoints
  - GET/POST/PUT/DELETE for departments
  - Tree structure support
  - User count aggregation
  - File: `backend/src/routes/departments.routes.ts`

- [x] **TASK-000F**: Create data quality endpoints
  - GET /api/organization/data-quality/report
  - GET /api/organization/data-quality/orphans
  - POST /api/organization/data-quality/resolve-orphan
  - File: `backend/src/routes/data-quality.routes.ts`

- [x] **TASK-000G**: Create orphan detection service
  - Find department values not in master data
  - Fuzzy matching for suggestions
  - File: `backend/src/services/data-quality.service.ts`

### Frontend Tasks

- [x] **TASK-000H**: Create Department Manager page
  - Tree view of departments
  - Add/edit/delete departments
  - Show user counts
  - File: `frontend/src/components/settings/MasterDataSection.tsx` (combined with locations/cost centers)

- [x] **TASK-000I**: Create Data Quality Dashboard
  - Show orphan counts per entity
  - Resolution workflow
  - Progress indicators
  - File: `frontend/src/components/settings/MasterDataSection.tsx` (Data Quality tab)

- [x] **TASK-000J**: Create hierarchical dropdown component
  - Reusable tree selector
  - Search within tree
  - Show user counts
  - File: `frontend/src/components/ui/TreeSelect.tsx`

- [x] **TASK-000K**: Add Settings > Master Data section
  - Navigation to Departments, Locations, etc.
  - Data Quality link
  - File: `frontend/src/components/Settings.tsx`

## Phase 1: GroupSlideOut Basic (MVP)

### Backend Tasks

- [x] **TASK-001**: Create migration for access_groups schema updates
  - Add `group_type` column (static/dynamic)
  - Add `rule_logic` column (AND/OR)
  - Add sync setting columns
  - File: `database/migrations/031_add_dynamic_groups.sql`

- [x] **TASK-002**: Update GET `/api/organization/access-groups/:id` endpoint
  - Return full group details including sync settings
  - Include member count
  - File: `backend/src/routes/access-groups.routes.ts`

- [x] **TASK-003**: Implement PUT `/api/organization/access-groups/:id` endpoint
  - Update group name, description, email
  - Update group type and settings
  - File: `backend/src/routes/access-groups.routes.ts`

### Frontend Tasks

- [x] **TASK-004**: Create GroupSlideOut component structure
  - Basic slide-out panel with header
  - Tab navigation component
  - Close and save buttons
  - Files:
    - `frontend/src/components/GroupSlideOut.tsx`
    - `frontend/src/components/GroupSlideOut.css`

- [x] **TASK-005**: Implement Overview tab
  - Display group info (name, email, description)
  - Show group type badge (static/dynamic)
  - Member count and created date
  - Edit mode toggle
  - File: `frontend/src/components/GroupSlideOut.tsx`

- [x] **TASK-006**: Implement Members tab
  - List current members
  - Search within members
  - Remove member action
  - Add member modal with user search
  - File: `frontend/src/components/GroupSlideOut.tsx`

- [x] **TASK-007**: Integrate GroupSlideOut into Groups page
  - Click on group row opens slideout
  - Pass group data and callbacks
  - Refresh list on update
  - File: `frontend/src/pages/Groups.tsx`

## Phase 2: Sync Settings

### Backend Tasks

- [x] **TASK-008**: Create group sync endpoints
  - `POST /api/organization/access-groups/:id/sync/google`
  - `GET /api/organization/access-groups/:id/sync/status`
  - Update sync status and last_sync timestamp
  - File: `backend/src/routes/access-groups.routes.ts`

- [x] **TASK-009**: Implement group sync to Google Workspace
  - Sync members (add/remove) via `syncGroupMembers` method
  - Handle sync direction (push/pull/bidirectional)
  - File: `backend/src/services/google-workspace.service.ts`

- [x] **TASK-010**: Add sync status tracking
  - Store last sync timestamp via `synced_at` column
  - Return sync errors in response
  - Track sync direction via request parameter
  - File: `backend/src/routes/access-groups.routes.ts`

### Frontend Tasks

- [x] **TASK-011**: Implement Sync tab
  - Google Workspace sync toggle
  - Sync direction selector (push/pull/bidirectional)
  - Sync status display
  - Sync Now button
  - File: `frontend/src/components/GroupSlideOut.tsx`

- [x] **TASK-012**: Add Microsoft 365 placeholder
  - Feature flagged section
  - "Coming Soon" message
  - Disabled controls
  - File: `frontend/src/components/GroupSlideOut.tsx`

## Phase 3: Dynamic Groups

### Backend Tasks

- [x] **TASK-013**: Create dynamic_group_rules table
  - Migration with rule schema
  - Indexes for performance
  - File: `database/migrations/031_add_dynamic_groups.sql`

- [x] **TASK-014**: Create dynamic group rule endpoints
  - `GET /api/organization/access-groups/:id/rules`
  - `POST /api/organization/access-groups/:id/rules`
  - `PUT /api/organization/access-groups/:id/rules/:ruleId`
  - `DELETE /api/organization/access-groups/:id/rules/:ruleId`
  - File: `backend/src/routes/access-groups.routes.ts`

- [x] **TASK-015**: Implement rule evaluation engine
  - Parse and evaluate rules against users
  - Support all operators (equals, contains, regex, etc.)
  - Handle AND/OR logic
  - Performance optimization for large user sets
  - File: `backend/src/services/dynamic-group.service.ts`

- [x] **TASK-016**: Create rule preview endpoint
  - `POST /api/organization/access-groups/:id/evaluate`
  - Return matching user count
  - Optional: return sample users
  - File: `backend/src/routes/access-groups.routes.ts`

- [x] **TASK-017**: Implement automatic membership updates
  - Update members when rules change
  - Scheduled evaluation for refresh interval
  - Track last evaluation timestamp
  - File: `backend/src/services/dynamic-group.service.ts`

### Frontend Tasks

- [x] **TASK-018**: Create DynamicRuleBuilder component
  - Field selector dropdown
  - Operator selector dropdown
  - Value input (text, user picker, multi-select)
  - Case sensitivity toggle
  - Include nested toggle
  - Add/remove rule buttons
  - File: `frontend/src/components/GroupSlideOut.tsx` (integrated inline)

- [x] **TASK-019**: Implement Rules tab
  - Show/hide based on group type
  - Rule logic selector (AND/OR)
  - Rule list with DynamicRuleBuilder
  - Preview count with refresh button
  - Save rules button
  - File: `frontend/src/components/GroupSlideOut.tsx`

- [x] **TASK-020**: Add group type selector
  - Toggle between static and dynamic
  - Warning when switching from dynamic (rules will be deleted)
  - Show/hide Rules tab based on type
  - File: `frontend/src/components/GroupSlideOut.tsx`

## Phase 4: Advanced Features

### Backend Tasks

- [x] **TASK-021**: Implement nested reports_to support
  - Recursive query for org hierarchy
  - Support for user ID, email, or name matching
  - Helper methods for reporting chain and management chain
  - File: `backend/src/services/dynamic-group.service.ts`

- [x] **TASK-022**: Add audit logging for rule changes
  - Log rule create/update/delete
  - Log membership changes from rules
  - File: `backend/src/services/activity-tracker.service.ts` (via access-groups.routes.ts)

### Frontend Tasks

- [x] **TASK-023**: Implement Settings tab
  - Group visibility settings
  - Permission settings (who can see members)
  - File: `frontend/src/components/GroupSlideOut.tsx`

- [x] **TASK-024**: Implement Danger tab
  - Archive group option
  - Delete group with confirmation
  - Show sync impact warning
  - File: `frontend/src/components/GroupSlideOut.tsx`

## Testing Tasks

- [x] **TASK-025**: Unit tests for rule evaluation engine
  - Test each operator
  - Test AND/OR logic
  - Test edge cases (empty values, special chars)
  - File: `backend/src/__tests__/dynamic-group.service.test.ts`
  - **39 tests passing**

- [x] **TASK-026**: Integration tests for group sync
  - Test sync to Google Workspace
  - Test bidirectional sync
  - Test error handling
  - File: `backend/src/__tests__/access-groups.routes.test.ts`
  - **29 tests passing**

- [x] **TASK-027**: E2E tests for GroupSlideOut
  - Test slideout open/close
  - Test edit mode
  - Test rule builder
  - File: `e2e/tests/groups.spec.ts`
  - **20 test cases (Playwright)**

## Documentation Tasks

- [x] **TASK-028**: Update API documentation
  - Document new endpoints
  - Document rule schema
  - File: `docs/api/access-groups.md`
  - **Comprehensive API reference with all endpoints, field/operator references**

- [x] **TASK-029**: Create user guide for dynamic groups
  - How to create dynamic groups
  - Rule examples
  - Troubleshooting
  - File: `docs/guides/dynamic-groups.md`
  - **Complete user guide with examples, best practices, and FAQ**

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 0: Master Data | 11 tasks | 3-4 days |
| Phase 1: Basic | 7 tasks | 2-3 days |
| Phase 2: Sync | 5 tasks | 2 days |
| Phase 3: Dynamic | 8 tasks | 3-4 days |
| Phase 4: Advanced | 4 tasks | 1-2 days |
| Testing | 3 tasks | 1-2 days |
| Documentation | 2 tasks | 0.5 day |

**Total: ~14-18 days**

### Recommended Implementation Order

1. **Phase 0** - Master Data (enables clean data for everything)
2. **Phase 1** - GroupSlideOut Basic (quick win, visible progress)
3. **Phase 3** - Dynamic Groups (leverages master data dropdowns)
4. **Phase 2** - Sync Settings (can run in parallel with Phase 3)
5. **Phase 4** - Advanced Features

## Dependencies

```
TASK-001 (migration)
  └── TASK-002, TASK-003 (endpoints)
       └── TASK-004 (component)
            └── TASK-005, TASK-006 (tabs)
                 └── TASK-007 (integration)

TASK-013 (rules table)
  └── TASK-014 (rule endpoints)
       └── TASK-015 (evaluation engine)
            └── TASK-016 (preview)
                 └── TASK-017 (auto update)

TASK-015 (evaluation engine)
  └── TASK-018, TASK-019 (frontend rules)
```
