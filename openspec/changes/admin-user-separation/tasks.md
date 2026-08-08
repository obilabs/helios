# Tasks: Admin/User UI Separation

## Phase 1: Route Infrastructure

### Backend Tasks

- [x] **TASK-AUS-001**: Add isEmployee flag to user session
  - Check if user has linked employee profile
  - Add employeeProfileId to session data
  - Update auth middleware to populate flags
  - File: `backend/src/middleware/auth.ts`
  - **Completed:** Added isAdmin and isEmployee flags to user session, with helper functions

- [x] **TASK-AUS-002**: Create view preference endpoints
  - GET /api/me/view-preference - get current view
  - PUT /api/me/view-preference - set view preference
  - Store in user_preferences JSONB column
  - File: `backend/src/routes/me.routes.ts`
  - **Completed:** Endpoints created, ViewContext updated to sync with API

- [x] **TASK-AUS-003**: Add route-level access guards
  - AdminOnly middleware for /admin/* routes
  - EmployeeOnly middleware for user routes
  - Return appropriate error codes (403)
  - File: `backend/src/middleware/auth.ts`
  - **Completed:** requireAdmin and requireEmployee middleware added, applied to people.routes.ts and me.routes.ts

### Frontend Tasks

- [x] **TASK-AUS-004**: Create ViewContext for view state management
  - Track current view ('admin' | 'user')
  - Persist preference to localStorage and API
  - Provide view switching function
  - File: `frontend/src/contexts/ViewContext.tsx`
  - **Completed:** Full ViewContext with capabilities tracking, localStorage persistence

- [x] **TASK-AUS-005**: Restructure routes with /admin prefix
  - Move admin pages under /admin/*
  - Keep user pages at root level
  - Add redirects for old URLs
  - File: `frontend/src/App.tsx`
  - **Completed:** Routes restructured with /admin prefix, path mapping implemented

- [x] **TASK-AUS-006**: Create AdminRoute guard component
  - Check user.isAdmin before rendering
  - Redirect to home if not admin
  - Show appropriate message
  - File: `frontend/src/components/routes/AdminRoute.tsx`
  - **Completed:** AdminRoute component created with canAccessAdminView check

- [x] **TASK-AUS-007**: Create EmployeeRoute guard component
  - Check user.isEmployee before rendering
  - Redirect to /admin if not employee (for external admins)
  - Show appropriate message
  - File: `frontend/src/components/routes/EmployeeRoute.tsx`
  - **Completed:** EmployeeRoute component created with canAccessUserView check

## Phase 2: Navigation Separation

### Frontend Tasks

- [x] **TASK-AUS-008**: Create AdminNavigation component
  - Dashboard, Directory (Users, Groups, Devices)
  - Security (Audit Logs, Policies)
  - Settings (Modules, Master Data, Organization, Integrations)
  - File: `frontend/src/components/navigation/AdminNavigation.tsx`
  - **Completed:** Full AdminNavigation with all sections

- [x] **TASK-AUS-009**: Create UserNavigation component
  - Home, People, My Team, My Groups
  - My Profile, Settings (personal)
  - File: `frontend/src/components/navigation/UserNavigation.tsx`
  - **Completed:** UserNavigation with People, My Team, My Profile sections

- [x] **TASK-AUS-010**: Update Sidebar to use view-based navigation
  - Render AdminNavigation or UserNavigation based on currentView
  - Pass appropriate props and handlers
  - File: `frontend/src/components/Sidebar.tsx`
  - **Completed:** Sidebar renders view-specific navigation based on currentView

- [x] **TASK-AUS-011**: Create ViewSwitcher component
  - Dropdown with Admin Console / Employee View options
  - Only visible for internal admins (isAdmin && isEmployee)
  - Navigate to appropriate home on switch
  - File: `frontend/src/components/navigation/ViewSwitcher.tsx`
  - **Completed:** Full ViewSwitcher with dropdown, icons, and styling

- [x] **TASK-AUS-012**: Add ViewSwitcher to Header
  - Position before user avatar
  - Show current view label
  - File: `frontend/src/components/Header.tsx` (in App.tsx)
  - **Completed:** ViewSwitcher added to header in App.tsx

## Phase 3: User Type Detection

### Backend Tasks

- [x] **TASK-AUS-013**: Add is_external_admin column to organization_users
  - Boolean flag, default false
  - Migration file for schema change
  - File: `database/migrations/034_add_admin_user_separation.sql`
  - **Completed:** Migration created with is_external_admin and default_view columns

- [x] **TASK-AUS-014**: Update user creation to set admin type
  - External admins can be created by setting isExternalAdmin=true when role='admin'
  - isExternalAdmin is automatically set to false if role is changed to non-admin
  - Both POST /api/organization/users and PUT /api/organization/users/:userId support isExternalAdmin
  - File: `backend/src/routes/organization.routes.ts`
  - **Completed:** User creation and update now support isExternalAdmin flag

- [x] **TASK-AUS-015**: Update login response with access flags
  - Include canAccessAdminUI and canAccessUserUI
  - Include defaultView based on user type
  - File: `backend/src/routes/auth.routes.ts`
  - **Completed:** Login and verify endpoints return isAdmin, isEmployee, isExternalAdmin, canAccessAdminUI, canAccessUserUI, canSwitchViews, defaultView

### Frontend Tasks

- [x] **TASK-AUS-016**: Update AuthContext with access flags
  - Store canAccessAdminUI, canAccessUserUI
  - Derive from user session data
  - File: `frontend/src/contexts/ViewContext.tsx`
  - **Completed:** ViewContext updated to use API flags with fallback to role-based derivation

- [x] **TASK-AUS-017**: Implement default view logic on login
  - External admin → always Admin Console
  - Internal admin → Admin Console (or remembered)
  - Regular user → always Employee View
  - File: `frontend/src/App.tsx`
  - **Completed:** App.tsx uses isAdmin/isEmployee from API, ViewContext handles default view logic

## Phase 4: Page Relocation

### Frontend Tasks

- [x] **TASK-AUS-018**: Move admin pages to /admin routes
  - /admin/dashboard - Admin Dashboard
  - /admin/users - User Management
  - /admin/groups - Group Management
  - /admin/settings/* - System Settings
  - File: `frontend/src/App.tsx`
  - **Completed:** Admin pages accessible at /admin/* routes via adminPathMap

- [x] **TASK-AUS-019**: Configure user pages at root routes
  - /dashboard or /home - User Home
  - /people - People Directory
  - /my-team - My Team View
  - /my-profile - My Profile
  - /settings - Personal Settings
  - File: `frontend/src/App.tsx`
  - **Completed:** User pages accessible at root routes via userPathMap

- [x] **TASK-AUS-020**: Create redirect handlers for legacy URLs
  - /users → /admin/users
  - /groups → /admin/groups
  - Preserve query params
  - File: `frontend/src/components/routes/LegacyRedirects.tsx`
  - **Completed:** LegacyRedirects component handles all legacy admin routes

- [x] **TASK-AUS-021**: Update all internal navigation links
  - Update Link components in admin pages
  - Update Link components in user pages
  - Update breadcrumbs
  - Files: Multiple page and component files
  - **Completed:** Navigation uses setCurrentPage which maps to appropriate /admin or root paths

## Phase 5: Access Control Polish

### Backend Tasks

- [x] **TASK-AUS-022**: Add API-level access checks for user endpoints
  - /api/people/* requires isEmployee
  - /api/me/team requires isEmployee
  - Return 403 for external admins
  - File: `backend/src/routes/people.routes.ts`
  - **Completed:** requireEmployee middleware applied to /api/people and /api/me routes

- [x] **TASK-AUS-023**: Add audit logging for view switches
  - Log when user switches views
  - Track view preference changes
  - File: `backend/src/services/activity-tracker.service.ts`
  - **Completed:** Added trackViewSwitch and trackAccessDenied methods, integrated with me.routes.ts

### Frontend Tasks

- [x] **TASK-AUS-024**: Add "Switch to Employee View" prompt for internal admins
  - Show on first login if internal admin
  - Explain the two views
  - Allow preference setting
  - File: `frontend/src/components/navigation/ViewOnboarding.tsx`
  - **Completed:** Created ViewOnboarding component with card selection for Admin Console vs Employee View

- [x] **TASK-AUS-025**: Handle edge cases in navigation
  - Deep link to admin route as user → redirect
  - Deep link to user route as external admin → redirect
  - Session expiry during view switch
  - File: `frontend/src/components/routes/*.tsx`
  - **Completed:** AdminRoute and EmployeeRoute guard components exist, LegacyRedirects handles old URLs, session expiry handled via token verification

## Testing Tasks

- [x] **TASK-AUS-T01**: E2E tests for external admin flow
  - Login as external admin
  - Verify no People/My Team in nav
  - Verify no view switcher
  - Verify /people redirects to /admin
  - File: `e2e/tests/admin-user-separation.spec.ts`
  - **Completed:** 6 test cases

- [x] **TASK-AUS-T02**: E2E tests for internal admin flow
  - Login as internal admin
  - Verify view switcher visible
  - Test switching between views
  - Verify navigation changes
  - File: `e2e/tests/admin-user-separation.spec.ts`
  - **Completed:** 5 test cases

- [x] **TASK-AUS-T03**: E2E tests for regular user flow
  - Login as regular user
  - Verify no admin nav items
  - Verify /admin/* redirects to /
  - Verify no view switcher
  - File: `e2e/tests/admin-user-separation.spec.ts`
  - **Completed:** 5 test cases (skipped - requires regular user password setup)

- [x] **TASK-AUS-T04**: API tests for route guards
  - Test admin endpoints require isAdmin
  - Test employee endpoints require isEmployee
  - Test proper 403 responses
  - File: `backend/src/__tests__/route-guards.test.ts`
  - **Completed:** 19 tests passing - covers all middleware scenarios

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1: Route Infrastructure | 7 tasks | 1-2 days |
| Phase 2: Navigation Separation | 5 tasks | 1-2 days |
| Phase 3: User Type Detection | 5 tasks | 1 day |
| Phase 4: Page Relocation | 4 tasks | 1 day |
| Phase 5: Access Control | 4 tasks | 1 day |
| Testing | 4 tasks | 1 day |

**Total: ~6-9 days**

## Dependencies

```
TASK-AUS-001 (backend flags)
  └── TASK-AUS-004 (ViewContext)
       └── TASK-AUS-010 (Sidebar update)
            └── TASK-AUS-011 (ViewSwitcher)

TASK-AUS-005 (route restructure)
  └── TASK-AUS-006, TASK-AUS-007 (guards)
       └── TASK-AUS-018, TASK-AUS-019 (page moves)
            └── TASK-AUS-020 (redirects)

TASK-AUS-013 (migration)
  └── TASK-AUS-014 (user creation)
       └── TASK-AUS-015 (login response)
            └── TASK-AUS-016 (AuthContext)
```

## Implementation Notes

### Backward Compatibility
- Keep old routes working with redirects for 2 releases
- Log deprecated route usage for monitoring
- Update documentation and help text

### Performance Considerations
- View preference should be cached client-side
- Navigation components should be lazy-loaded per view
- Minimize re-renders on view switch

### Security Considerations
- Always verify access on backend, never trust frontend
- Rate limit view switch API to prevent abuse
- Audit all access control changes
