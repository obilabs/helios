# OpenSpec Proposal: Admin/User Separation Bug Fixes

**ID:** admin-user-separation-fixes
**Status:** Draft
**Priority:** P0 (Blocking)
**Author:** Claude (Autonomous Agent)
**Created:** 2025-12-08
**Related:** admin-user-separation

## Summary

Fix regression bugs introduced during the admin-user-separation implementation. These bugs prevent proper view switching and break the dashboard functionality.

## Problem Statement

After the admin-user-separation feature was implemented, several critical regressions were introduced:

1. **ViewSwitcher disappears after onboarding** - Internal admins can only select their view during first login. After that, there's no way to switch between Admin Console and Employee View.

2. **Settings link ignores view context** - When in Employee View, clicking Settings in the avatar dropdown navigates to admin settings instead of personal profile settings.

3. **Dashboard design regression** - The modern sleek widget design has reverted to chunky/old style.

4. **Dashboard stats not displaying** - Despite having synced data in the database, the dashboard shows empty stats.

## Bug Details

### BUG-AUS-001: ViewSwitcher Not Persistent

**Severity:** Critical
**Impact:** Internal admins cannot switch views after initial selection

**Current Behavior:**
- On first login, `ViewOnboarding` component shows
- User selects Admin Console or Employee View
- After selection, no way to switch views
- ViewSwitcher component exists but not rendered in header

**Expected Behavior:**
- ViewSwitcher should be visible in header for all internal admins (isAdmin && isEmployee)
- Should show current view with dropdown to switch
- Should persist across all pages and sessions

**Likely Affected Files:**
- `frontend/src/App.tsx` - Header rendering
- `frontend/src/components/navigation/ViewSwitcher.tsx` - Component exists but not used
- `frontend/src/components/Header.tsx` - May not include ViewSwitcher

### BUG-AUS-002: Settings Link Wrong Context

**Severity:** High
**Impact:** User view exposes admin settings, security/UX concern

**Current Behavior:**
- In Employee View, click avatar → Settings
- Navigates to `/admin/settings` (admin configuration)
- Exposes module settings, master data, etc. to user context

**Expected Behavior:**
- In Employee View: Settings → `/my-profile` or `/settings` (personal preferences)
- In Admin Console: Settings → `/admin/settings` (system configuration)
- Links should be context-aware based on `currentView`

**Likely Affected Files:**
- `frontend/src/App.tsx` - Avatar dropdown menu
- `frontend/src/components/Header.tsx` - If dropdown is here
- Need to check where avatar dropdown is rendered

### BUG-AUS-003: Dashboard Design Regression

**Severity:** Medium
**Impact:** Visual inconsistency, poor UX

**Current Behavior:**
- Dashboard widgets are chunky/blocky
- Old design style showing

**Expected Behavior:**
- Sleek modern widgets with subtle shadows
- Consistent with DESIGN-SYSTEM.md specifications
- Professional enterprise look

**Likely Affected Files:**
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/components/DashboardWidget.tsx` or similar
- CSS files for dashboard components

### BUG-AUS-004: Dashboard Stats Empty

**Severity:** High
**Impact:** Dashboard provides no value, looks broken

**Current Behavior:**
- Stats widgets show 0 or empty
- Data exists in database (verified: 5 users, 3 groups)
- API endpoints return correct data when called directly

**Expected Behavior:**
- User count, group count, etc. displayed correctly
- Data refreshes on dashboard load
- Shows real synced data from Google Workspace

**Likely Affected Files:**
- `frontend/src/pages/Dashboard.tsx` - API calls
- `frontend/src/services/api.ts` - Endpoint paths may have changed
- Backend routes may have been affected by /admin prefix changes

## Root Cause Analysis

The admin-user-separation implementation likely:

1. **Created ViewSwitcher but only used it in onboarding** - The component renders in `ViewOnboarding.tsx` but was never added to the persistent header layout.

2. **Hardcoded settings links** - Avatar dropdown links were not updated to be context-aware when the route restructuring happened.

3. **Dashboard component replaced or modified** - During route restructuring, the dashboard may have been copied, modified, or had its imports broken.

4. **API endpoint paths changed** - Routes moved to `/admin/*` but frontend API calls may still point to old paths, or the dashboard is calling wrong endpoints.

5. **CRITICAL: Hardcoded localhost URLs** - The frontend has 176+ hardcoded `http://localhost:3001` URLs. When accessing the app remotely, these API calls fail silently, causing widgets to "spin forever". This is being addressed in the `frontend-api-url-refactor` proposal.

**Note:** The dashboard widget loading issue (spinning forever) is primarily caused by the hardcoded localhost URLs. The `frontend-api-url-refactor` proposal MUST be completed before these dashboard bugs can be fully resolved for remote access.

## Success Criteria

1. Internal admins see ViewSwitcher in header on every page after login
2. Clicking ViewSwitcher toggles between Admin Console and Employee View
3. Settings link in avatar dropdown respects current view context
4. Dashboard displays modern sleek design per DESIGN-SYSTEM.md
5. Dashboard stats show accurate counts from database
6. All existing E2E tests pass
7. No visual regressions in other pages

## Technical Approach

### Fix 1: Persistent ViewSwitcher

```tsx
// In App.tsx or Header component, add ViewSwitcher to header
{user && capabilities.canSwitchViews && (
  <ViewSwitcher />
)}
```

### Fix 2: Context-Aware Settings Link

```tsx
// In avatar dropdown
const settingsPath = currentView === 'admin'
  ? '/admin/settings'
  : '/my-profile';

<Link to={settingsPath}>Settings</Link>
```

### Fix 3: Dashboard Design

- Review Dashboard.tsx against DESIGN-SYSTEM.md
- Restore modern widget styling
- Check for CSS class changes or removals

### Fix 4: Dashboard Stats

- Verify API endpoint paths in Dashboard.tsx
- Check if endpoints moved to /admin/* prefix
- Ensure correct authorization headers sent
- Test API responses directly

## Files to Investigate

```
frontend/src/App.tsx                           # Header, routing
frontend/src/components/navigation/ViewSwitcher.tsx  # Exists, needs integration
frontend/src/components/navigation/ViewOnboarding.tsx # Check if blocking ViewSwitcher
frontend/src/pages/Dashboard.tsx               # Stats and design
frontend/src/services/api.ts                   # Endpoint paths
frontend/src/contexts/ViewContext.tsx          # View state
backend/src/routes/organization.routes.ts      # Dashboard API
```

## Testing Requirements

- E2E test: ViewSwitcher visible and functional
- E2E test: Settings link context-aware
- E2E test: Dashboard loads with stats
- Visual regression test: Dashboard design
