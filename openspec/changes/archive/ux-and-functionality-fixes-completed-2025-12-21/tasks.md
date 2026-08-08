# UX & Functionality Fixes - Tasks (TDD Approach)

## Phase 1: Data Integrity Fixes

### TASK-FIX-001: Fix Deleted Users Count Mismatch
- [x] Write test: Verify deleted count in header matches table row count
- [x] Investigate count query in UsersPage.tsx
- [x] Fix count to use same filter logic as table query
- [x] Verify all status counts (Active, Staged, Suspended, Deleted) are accurate

**Status: COMPLETE** - Tests pass. Count logic is correct: both header count and table rows use `userStatus` field consistently.

**Test First:**
```typescript
test('deleted users count matches displayed rows', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="filter-deleted"]');
  const countBadge = await page.locator('[data-testid="deleted-count"]').textContent();
  const rowCount = await page.locator('tbody tr').count();
  expect(parseInt(countBadge)).toBe(rowCount);
});
```

### TASK-FIX-002: Normalize Department Field (Strip OU Paths)
- [x] Write test: Department should not contain "/" characters
- [x] Find where Google OU path is being stored as department
- [x] Create normalization function to extract department name
- [x] Apply on sync and on display
- [x] Update existing records with migration or script

**Status: COMPLETE** - Tests pass. Normalization is done:
1. Backend: `extractDepartmentFromOUPath()` in organization.routes.ts:500-507
2. Frontend: Fallback normalization in UserList.tsx:700-706 for display

**Test First:**
```typescript
test('department displays clean name without OU path', async ({ page }) => {
  await page.goto('/admin/users');
  const departments = await page.locator('[data-testid="user-department"]').allTextContents();
  departments.forEach(dept => {
    expect(dept).not.toContain('/');
  });
});
```

---

## Phase 2: Users Page Header Redesign

### TASK-FIX-003: Redesign Stats Cards Layout
- [x] Write test: Stats cards have proper spacing and alignment
- [x] Update CSS for stats cards container
- [x] Add proper gap between cards
- [x] Ensure consistent card heights

**Status: COMPLETE** - All 4 tests pass for stats cards layout.

### TASK-FIX-004: Fix INTEGRATIONS/STATUS Column Blending
- [x] Write test: Column headers have clear visual separation
- [x] Add proper column width constraints
- [x] Add subtle border or spacing between columns
- [x] Ensure text doesn't wrap unexpectedly

**Status: COMPLETE** - All 3 tests pass for column separation.

### TASK-FIX-005: Align Search Box with Filters
- [x] Write test: Search box and filter buttons are horizontally aligned
- [x] Reduce search box height to match button height
- [x] Use flexbox with proper alignment
- [x] Consistent border-radius across all elements

**Status: COMPLETE** - All 3 tests pass for search and filter alignment.

**Test First:**
```typescript
test('search box and filter buttons are aligned', async ({ page }) => {
  await page.goto('/admin/users');
  const searchBox = await page.locator('[data-testid="search-input"]').boundingBox();
  const filterBtn = await page.locator('[data-testid="filter-button"]').boundingBox();
  // Verify vertical center alignment (within 2px tolerance)
  const searchCenter = searchBox.y + searchBox.height / 2;
  const filterCenter = filterBtn.y + filterBtn.height / 2;
  expect(Math.abs(searchCenter - filterCenter)).toBeLessThan(3);
});
```

---

## Phase 3: Filter Panel Implementation

### TASK-FIX-006: Implement Filter Button Click Handler
- [x] Write test: Clicking filter icon opens filter panel
- [x] Create FilterPanel component
- [x] Add state for panel visibility
- [x] Wire onClick to toggle panel

**Status: COMPLETE** - FilterPanel component exists and works. Tests pass.

### TASK-FIX-007: Implement Column Visibility Toggle
- [x] Write test: Clicking columns icon opens column selector
- [x] Create ColumnSelector component
- [x] Allow hiding/showing columns
- [x] Persist preference to localStorage

**Status: COMPLETE** - ColumnSelector component exists and works. Tests pass.

### TASK-FIX-008: Add Date-Based Filters
- [x] Write test: Can filter by "Recently Created" (last 7 days)
- [x] Write test: Can filter by date created range
- [x] Write test: Can filter by last login date range
- [x] Add date picker components
- [x] Implement filter logic in API query

**Status: COMPLETE** - All 7 date filter tests pass.

### TASK-FIX-009: Add Property Filters
- [x] Write test: Can filter by department
- [x] Write test: Can filter by role
- [x] Write test: Can filter by integration status (Google/Microsoft/None)
- [x] Add dropdown selectors for each filter
- [x] Combine filters with AND logic

**Status: COMPLETE** - All 11 property filter tests pass.

**Test First:**
```typescript
test('filter panel opens and filters by recently created', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="filter-button"]');
  await expect(page.locator('.filter-panel')).toBeVisible();
  await page.click('[data-testid="filter-recently-created"]');
  // Verify only users created in last 7 days shown
  const dates = await page.locator('[data-testid="user-created-date"]').allTextContents();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  dates.forEach(dateStr => {
    expect(new Date(dateStr).getTime()).toBeGreaterThan(sevenDaysAgo.getTime());
  });
});
```

---

## Phase 4: User Slideout Layout Redesign

### TASK-FIX-010: Redesign Overview Tab to 2-Column Layout
- [x] Write test: Profile fields use 2-column grid on desktop
- [x] Update UserSlideOut.tsx Overview section
- [x] Create `.info-grid-2col` CSS class
- [x] Group related fields: Name row, Email/Phone row, Job/Dept row, etc.

**Status: COMPLETE** - All 3 layout tests pass for 2-column grid.

### TASK-FIX-011: Improve Field Grouping
- [x] Write test: Related fields are visually grouped
- [x] Add section dividers between User Info, Profile Info, Account Info
- [x] Ensure consistent label styling
- [x] Add proper spacing between sections

**Status: COMPLETE** - All 6 field grouping tests pass.

**Test First:**
```typescript
test('user slideout uses 2-column layout for profile fields', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row"]');
  const grid = page.locator('.info-grid-2col');
  await expect(grid).toBeVisible();
  const gridStyle = await grid.evaluate(el => getComputedStyle(el).display);
  expect(gridStyle).toBe('grid');
});
```

---

## Phase 5: Fix Add to Group Functionality

### TASK-FIX-012: Debug Add to Group API Call
- [x] Write test: Adding user to group persists in database
- [x] Check network tab for API call on add
- [x] Verify endpoint `/api/v1/groups/:id/members` exists and works
- [x] Fix any missing request body or auth issues

**Status: COMPLETE** - All 3 API tests pass.

### TASK-FIX-013: Add Success/Error Toast for Group Actions
- [x] Write test: Success toast appears after adding to group
- [x] Write test: Error toast appears if add fails
- [x] Import and use toast from Toast component
- [x] Show group name in success message

**Status: COMPLETE** - All 2 toast tests pass.

### TASK-FIX-014: Refresh Group List After Add
- [x] Write test: Group list updates after successful add
- [x] Call refetch/refresh after successful API call
- [x] Optimistic UI update if desired

**Status: COMPLETE** - All 2 refresh tests pass.

**Test First:**
```typescript
test('adding user to group shows success and persists', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row-david"]');
  await page.click('[data-testid="tab-groups"]');
  await page.click('[data-testid="btn-add-to-group"]');
  await page.click('[data-testid="group-option-all-users"]');
  await page.click('[data-testid="btn-confirm-add"]');
  await expect(page.locator('.toast-success')).toBeVisible();
  // Verify group now appears in list
  await expect(page.locator('[data-testid="group-all-users"]')).toBeVisible();
});
```

---

## Phase 6: Fix Create in Google Workspace

### TASK-FIX-015: Debug Google Workspace User Creation
- [x] Write test: Creating user with GW checkbox calls GW API
- [x] Check if user is created in Helios first
- [x] Verify Google Admin SDK credentials are configured
- [x] Check for silent error handling that swallows errors

**Status: COMPLETE** - All 3 GW creation tests pass.

### TASK-FIX-016: Add Error Handling for GW Creation
- [x] Write test: Error toast shown if GW creation fails
- [x] Wrap GW API call in try/catch
- [x] Show specific error message (quota, permissions, etc.)
- [x] Still create Helios user even if GW fails (with warning)

**Status: COMPLETE** - All 2 error handling tests pass.

### TASK-FIX-017: Fix User Creation Flow
- [x] Write test: User appears in Helios after creation
- [x] Debug why user isn't being created at all
- [x] Check for validation errors not being shown
- [x] Verify database insert is happening

**Status: COMPLETE** - All 2 creation flow tests pass.

**Test First:**
```typescript
test('create user with GW creates in Helios and shows feedback', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="btn-add-user"]');
  await page.fill('[name="firstName"]', 'Test');
  await page.fill('[name="lastName"]', 'User');
  await page.fill('[name="email"]', 'test.user@example.com');
  await page.check('[data-testid="create-in-gw"]');
  await page.click('[data-testid="btn-submit"]');
  // Should see either success or error toast
  const toast = page.locator('.toast');
  await expect(toast).toBeVisible();
  // Verify user exists in list
  await page.goto('/admin/users');
  await expect(page.locator('text=test.user@example.com')).toBeVisible();
});
```

---

## Phase 7: Activity Log Population

### TASK-FIX-018: Log Group Membership Changes
- [x] Write test: Activity log shows group add/remove events
- [x] Add activity_logs insert in group membership endpoints
- [x] Include actor, action, target, timestamp

**Status: COMPLETE** - Test passes for group membership changes.

### TASK-FIX-019: Log Google Workspace Sync Events
- [x] Write test: Activity log shows GW sync attempts
- [x] Add activity_logs insert in GW service
- [x] Log success and failures with details

**Status: COMPLETE** - Activity service logs GW sync events.

### TASK-FIX-020: Log Status Changes
- [x] Write test: Activity log shows status changes
- [x] Add activity_logs insert in user status update endpoint
- [x] Include old status, new status, actor

**Status: COMPLETE** - Activity service logs status changes.

### TASK-FIX-021: Display Activity Log in Slideout
- [x] Write test: Activity tab shows recent events
- [x] Fetch from `/api/v1/users/:id/activity`
- [x] Display with timestamps and actor names
- [x] Add pagination or "load more"

**Status: COMPLETE** - All 6 activity log display tests pass.

**Test First:**
```typescript
test('activity log shows recent user events', async ({ page }) => {
  // First make a change
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row-david"]');
  await page.click('[data-testid="tab-settings"]');
  await page.selectOption('[name="status"]', 'suspended');
  await page.click('[data-testid="btn-save"]');

  // Check activity log
  await page.click('[data-testid="tab-activity"]');
  await expect(page.locator('.activity-item')).toHaveCount({ min: 1 });
  await expect(page.locator('text=status changed')).toBeVisible();
});
```

---

## Phase 8: Scheduled Actions Page Fix

### TASK-FIX-022: Fix Scheduled Actions Layout
- [x] Write test: Empty state is full-width centered
- [x] Remove split-panel layout for empty state
- [x] Show full-width card with empty illustration
- [x] When items exist, use proper table or card list

**Status: COMPLETE** - All 6 layout tests pass for empty state and list display.

### TASK-FIX-023: Add Proper Split-Panel (Optional)
- [x] Write test: Clicking an action shows details panel
- [x] Only show split layout when item selected
- [x] Left: list, Right: details
- [x] Or use slideout pattern consistent with Users page

**Status: COMPLETE** - All 7 split-panel and filter tests pass.

**Test First:**
```typescript
test('scheduled actions empty state is full width', async ({ page }) => {
  await page.goto('/admin/scheduled-actions');
  const emptyState = page.locator('.empty-state');
  await expect(emptyState).toBeVisible();
  const box = await emptyState.boundingBox();
  const pageWidth = page.viewportSize().width;
  // Empty state should be centered and reasonably wide
  expect(box.width).toBeGreaterThan(pageWidth * 0.5);
});
```

---

## Verification Checklist

- [x] Deleted count matches actual deleted users
- [x] Department shows clean name (no OU paths)
- [x] Stats cards properly spaced
- [x] Column headers clearly separated
- [x] Search box aligned with filters
- [x] Filter button opens filter panel
- [x] Column visibility toggle works
- [x] Date filters work (recently created, date range)
- [x] Property filters work (department, role, integration)
- [x] User slideout uses 2-column layout
- [x] Add to group works and shows toast
- [x] Create in Google Workspace works or shows error
- [x] User creation flow works
- [x] Activity log shows events
- [x] Scheduled actions page has proper layout
- [x] All actions show success/error feedback
- [x] No console errors during interactions

---

## Summary

**All 23 tasks completed** - 100% of E2E tests passing.

- **Phase 1**: Data Integrity (2/2 tasks complete)
- **Phase 2**: Users Page Header (3/3 tasks complete)
- **Phase 3**: Filter Panel (4/4 tasks complete)
- **Phase 4**: User Slideout Layout (2/2 tasks complete)
- **Phase 5**: Add to Group (3/3 tasks complete)
- **Phase 6**: Create in Google Workspace (3/3 tasks complete)
- **Phase 7**: Activity Log (4/4 tasks complete)
- **Phase 8**: Scheduled Actions Layout (2/2 tasks complete)

Total E2E tests: **81 tests passing**

---

## Dependencies

- Toast component (exists)
- Filter panel component (create)
- Column selector component (create)
- Activity service (may need creation)

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/pages/UsersPage.tsx` | Count fix, header layout, filters |
| `frontend/src/pages/UsersPage.css` | Header styling, grid layout |
| `frontend/src/components/UserSlideOut.tsx` | 2-col layout, group fix, activity |
| `frontend/src/components/UserSlideOut.css` | Grid styling |
| `frontend/src/components/FilterPanel.tsx` | NEW - filter UI |
| `frontend/src/components/ColumnSelector.tsx` | NEW - column visibility |
| `frontend/src/pages/ScheduledActionsPage.tsx` | Layout fix |
| `backend/src/routes/groups.routes.ts` | Fix add member |
| `backend/src/routes/user.routes.ts` | Fix creation, add logging |
| `backend/src/services/activity.service.ts` | NEW or enhance |
| `backend/src/services/google-workspace.service.ts` | Error handling |
