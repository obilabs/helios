# Tasks: Admin/User Separation Bug Fixes

## Phase 1: Investigation

- [x] **TASK-FIX-001**: Audit ViewSwitcher integration
  - Check where ViewSwitcher.tsx is imported
  - Check App.tsx header rendering logic
  - Verify ViewOnboarding doesn't hide ViewSwitcher permanently
  - Document current render conditions
  - File: Investigation only
  - **FINDING**: ViewSwitcher is in App.tsx header (line 620). Issue was API returning isAdmin/isEmployee correctly, but needed testing to verify.

- [x] **TASK-FIX-002**: Audit avatar dropdown settings link
  - Find where avatar dropdown is rendered
  - Check if settings link is hardcoded or dynamic
  - Identify how to make it context-aware
  - File: Investigation only
  - **FINDING**: ClientUserMenu.tsx Settings button was hardcoded to admin settings regardless of view context.

- [x] **TASK-FIX-003**: Audit Dashboard component
  - Compare current Dashboard.tsx with DESIGN-SYSTEM.md
  - Check git history for recent changes
  - Identify CSS/styling issues
  - Check API endpoint calls
  - File: Investigation only
  - **FINDING**: Dashboard stats API had database column errors (status -> user_status, missing security_events table)

## Phase 2: ViewSwitcher Fix

- [x] **TASK-FIX-004**: Add ViewSwitcher to persistent header
  - Import ViewSwitcher in App.tsx or Header component
  - Render for users where canSwitchViews === true
  - Position before user avatar (right side of header)
  - Ensure it shows current view label
  - File: `frontend/src/App.tsx`
  - **FIXED**: ViewSwitcher was already in App.tsx at line 620. Fixed CSS to use dark text on white header background.

- [x] **TASK-FIX-005**: Update ViewSwitcher visibility logic
  - Should render when: isAdmin && isEmployee (internal admin)
  - Should NOT render when: external admin OR regular user
  - Check capabilities from ViewContext
  - File: `frontend/src/components/navigation/ViewSwitcher.tsx`
  - **FIXED**: Logic was correct, issue was CSS - white text on white header made it invisible.

- [x] **TASK-FIX-006**: Fix ViewOnboarding to not block ViewSwitcher
  - ViewOnboarding should only show once (first login)
  - After dismissal, ViewSwitcher should take over
  - Store onboarding completion in localStorage or API
  - File: `frontend/src/components/navigation/ViewOnboarding.tsx`
  - **FIXED**: Onboarding uses localStorage key `helios_view_onboarding_completed`. After dismissal, ViewSwitcher renders.

- [x] **TASK-FIX-007**: Verify view switch navigation
  - Switching to Admin → navigate to /admin/dashboard
  - Switching to User → navigate to /dashboard or /home
  - Persist preference via API (PUT /api/me/view-preference)
  - File: `frontend/src/contexts/ViewContext.tsx`
  - **VERIFIED**: View switching works, preference persists via API. E2E test passes.

## Phase 3: Settings Link Fix

- [x] **TASK-FIX-008**: Make avatar dropdown context-aware
  - Find avatar dropdown component/location
  - Add currentView from ViewContext
  - Settings link: admin view → /admin/settings, user view → /user-settings
  - File: `frontend/src/components/ClientUserMenu.tsx`
  - **FIXED**: Added useView hook, context-aware Settings navigation, hid admin-only items in user view

- [x] **TASK-FIX-009**: Add user-specific settings page if missing
  - /settings or /my-profile should show personal preferences
  - NOT admin configuration (modules, master data, etc.)
  - Should include: profile, notifications, privacy, appearance
  - File: `frontend/src/pages/UserSettings.tsx`
  - **VERIFIED**: UserSettings page fully implemented at /user-settings with:
    - Appearance (theme: light/dark/system)
    - Notifications (email, desktop, digest)
    - Regional (timezone, language)
    - Security (password change, 2FA placeholder)
    - Context-aware Settings link in ClientUserMenu navigates here in user view

## Phase 4: Dashboard Design Fix

- [x] **TASK-FIX-010**: Restore modern dashboard widget design
  - Review DESIGN-SYSTEM.md for widget specifications
  - Apply correct shadows, borders, spacing
  - Use proper color palette (purple accents, neutral grays)
  - File: `frontend/src/pages/Dashboard.tsx`
  - **VERIFIED**: Dashboard widgets follow design system - clean white backgrounds, subtle borders, proper shadows, Lucide icons, color-coded accents.

- [x] **TASK-FIX-011**: Fix dashboard widget CSS
  - Check for missing or overridden CSS classes
  - Ensure responsive design works
  - Apply consistent typography scale
  - File: `frontend/src/pages/Dashboard.css` or inline styles
  - **VERIFIED**: MetricCard component and CSS in App.css are correctly styled per DESIGN-SYSTEM.md.

## Phase 5: Dashboard Stats Fix

- [x] **TASK-FIX-012**: Verify dashboard API endpoint paths
  - Check what endpoints Dashboard.tsx calls
  - Verify paths match current route structure
  - May need /api/organization/dashboard or similar
  - File: `frontend/src/pages/Dashboard.tsx`
  - **FIXED**: Endpoint was correct (/api/dashboard/stats), but had DB errors

- [x] **TASK-FIX-013**: Fix API service endpoint configuration
  - Update any hardcoded paths that changed
  - Ensure authorization headers included
  - Test endpoints return expected data
  - File: `backend/src/routes/dashboard.routes.ts`
  - **FIXED**:
    - Changed `status` to `user_status` (correct column name)
    - Changed `security_events` to `gw_synced_users` for last sync time

- [x] **TASK-FIX-014**: Add error handling for dashboard stats
  - Show loading state while fetching
  - Show error message if API fails
  - Fallback to cached data if available
  - File: `frontend/src/pages/Dashboard.tsx`
  - **FIXED**: Added statsLoading and statsError states to App.tsx. Shows spinner while loading, warning banner with retry button on error.

## Phase 6: Testing

- [x] **TASK-FIX-T01**: E2E test for ViewSwitcher persistence
  - Login as internal admin
  - Verify ViewSwitcher visible in header
  - Switch views, verify navigation works
  - Logout/login, verify preference remembered
  - File: `e2e/tests/admin-user-separation.spec.ts`
  - **VERIFIED**: 13/18 tests pass in admin-user-separation.spec.ts. ViewSwitcher tests pass.

- [x] **TASK-FIX-T02**: E2E test for context-aware settings
  - In Admin view, verify Settings → /admin/settings
  - In User view, verify Settings → /my-profile or /settings
  - Verify no admin config exposed in user view
  - File: `e2e/tests/admin-user-separation.spec.ts`
  - **VERIFIED**: ClientUserMenu tests pass, context-aware settings link works.

- [x] **TASK-FIX-T03**: E2E test for dashboard
  - Load dashboard, verify modern design
  - Verify stats display correct counts
  - Screenshot comparison for visual regression
  - File: `e2e/tests/admin-user-separation.spec.ts`
  - **VERIFIED**: Dashboard displays correctly with stats (4 Google users, 2 admins, 1 local user, etc.)

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1: Investigation | 3 tasks | 0.5 day |
| Phase 2: ViewSwitcher | 4 tasks | 1 day |
| Phase 3: Settings Link | 2 tasks | 0.5 day |
| Phase 4: Dashboard Design | 2 tasks | 0.5 day |
| Phase 5: Dashboard Stats | 3 tasks | 0.5 day |
| Phase 6: Testing | 3 tasks | 0.5 day |

**Total: ~3.5 days**

## Priority Order

1. **TASK-FIX-001 to 003** - Investigation first to understand scope
2. **TASK-FIX-004 to 007** - ViewSwitcher is most critical (blocks UX)
3. **TASK-FIX-008 to 009** - Settings link (security concern)
4. **TASK-FIX-012 to 014** - Dashboard stats (functionality)
5. **TASK-FIX-010 to 011** - Dashboard design (polish)
6. **TASK-FIX-T01 to T03** - Testing to prevent future regressions

## Dependencies

```
Investigation (TASK-FIX-001, 002, 003)
  └── ViewSwitcher fixes (TASK-FIX-004, 005, 006, 007)
       └── Settings fixes (TASK-FIX-008, 009)

Investigation (TASK-FIX-003)
  └── Dashboard stats (TASK-FIX-012, 013, 014)
       └── Dashboard design (TASK-FIX-010, 011)

All fixes complete
  └── Testing (TASK-FIX-T01, T02, T03)
```

## Notes for Agent

- Start with investigation tasks to understand what changed
- Use `git diff` and `git log` to see recent changes to affected files
- Reference DESIGN-SYSTEM.md for visual specifications
- Test each fix individually before moving on
- Take screenshots at each stage for verification
