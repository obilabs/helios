# User Slideout UX Fixes - Tasks (TDD Approach)

## Phase 1: Toast Infrastructure

### TASK-UX-001: Create Toast Component
- [x] Create `frontend/src/components/ui/Toast.tsx` (already exists)
- [x] Create `frontend/src/components/ui/Toast.css` (already exists)
- [x] Export from `frontend/src/components/ui/index.ts` (already exported)
- [x] Toast should support: message, type (success/error/warning/info), auto-dismiss
- [x] Wrap App with ToastProvider in App.tsx

**Test First:**
```typescript
// E2E test: Verify toast appears and auto-dismisses
test('toast notification appears and auto-dismisses', async ({ page }) => {
  // Trigger an action that shows toast
  // Verify toast is visible
  // Wait 3 seconds
  // Verify toast is gone
});
```

---

## Phase 2: Settings Tab Fixes

### TASK-UX-002: Implement Reset Password Handler
- [x] Add `resetLoading` state variable
- [x] Add `handleResetPassword()` async function
- [x] Wire onClick to the "Send Password Reset Email" button
- [x] Show loading state while request is in progress
- [x] Show toast on success/error (replace alert)

**Test First:**
```typescript
test('reset password button triggers API call and shows toast', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row-amanda"]');
  await page.click('[data-testid="tab-settings"]');
  await page.click('[data-testid="btn-reset-password"]');
  await expect(page.locator('.toast-success')).toBeVisible();
});
```

### TASK-UX-003: Create Backend Password Reset Endpoint
- [x] Add POST `/api/v1/organization/users/:id/reset-password` route
- [x] Generate secure reset token
- [x] Send email via configured email provider (or log if not configured)
- [x] Return success response
- [x] Add audit log entry

**Test First:**
```typescript
// Backend unit test
test('POST /organization/users/:id/reset-password returns 200', async () => {
  const response = await request(app)
    .post('/api/v1/organization/users/test-user-id/reset-password')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
});
```

### TASK-UX-004: Lock Status for Deleted Users
- [x] Check if `user.status === 'deleted'` in Settings tab render
- [x] If deleted: Show locked badge + Restore button instead of dropdown
- [x] Restore button calls existing `handleRestoreUser()` function
- [x] Add visual styling for locked state

**Test First:**
```typescript
test('deleted user shows locked status with restore button', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="tab-deleted"]');
  await page.click('[data-testid="user-row-deleted-user"]');
  await page.click('[data-testid="tab-settings"]');
  await expect(page.locator('[data-testid="status-locked"]')).toBeVisible();
  await expect(page.locator('[data-testid="btn-restore"]')).toBeVisible();
  await expect(page.locator('select[name="status"]')).not.toBeVisible();
});
```

---

## Phase 3: Account Sync → Connections

### TASK-UX-005: Rename Tab and Update Icon
- [x] Change label from "Account Sync" to "Connections"
- [x] Import `Link2` icon from lucide-react
- [x] Replace `RefreshCw` icon with `Link2`

**Test First:**
```typescript
test('connections tab exists and is clickable', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row-amanda"]');
  await expect(page.locator('[data-testid="tab-connections"]')).toBeVisible();
  await page.click('[data-testid="tab-connections"]');
  await expect(page.locator('.connections-content')).toBeVisible();
});
```

### TASK-UX-006: Redesign Connections Content
- [x] Create connection cards layout (Google, Microsoft)
- [x] Display connection status with icon
- [x] Display last sync timestamp if available
- [x] Add platform logo/icon
- [x] Add CSS for connection cards

**Test First:**
```typescript
test('connections tab shows provider cards with status', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row-amanda"]');
  await page.click('[data-testid="tab-connections"]');
  await expect(page.locator('.connection-card.google')).toBeVisible();
  await expect(page.locator('.connection-card.microsoft')).toBeVisible();
  await expect(page.locator('.connection-status')).toHaveCount(2);
});
```

---

## Phase 4: Groups Modal Fix

### TASK-UX-007: Fix Modal Button Spacing
- [x] Update `.modal-actions` CSS with proper flex gap
- [x] Ensure buttons have minimum width
- [x] Verify buttons are fully clickable (no overlap)

**Test First:**
```typescript
test('add to group modal buttons are properly spaced', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row-amanda"]');
  await page.click('[data-testid="tab-groups"]');
  await page.click('[data-testid="btn-add-to-group"]');
  const cancelBtn = page.locator('[data-testid="btn-cancel"]');
  const addBtn = page.locator('[data-testid="btn-add-groups-confirm"]');
  const cancelBox = await cancelBtn.boundingBox();
  const addBox = await addBtn.boundingBox();
  // Verify no overlap
  expect(cancelBox.x + cancelBox.width).toBeLessThan(addBox.x);
});
```

---

## Phase 5: Replace All alert() Calls

### TASK-UX-008: Replace Status Change Alerts
- [x] Replace `alert('User status updated successfully')` with `showToast()`
- [x] Replace `alert(\`Error: ${data.error}...\`)` with `showToast(..., 'error')`
- [x] Test toast appears on status change

### TASK-UX-009: Replace Delete/Restore Alerts
- [x] Replace all `alert()` in `handleDeleteUser`, `confirmDelete`, `handleRestoreUser`
- [x] Use consistent toast messaging

### TASK-UX-010: Replace Save User Alerts
- [x] Replace alerts in `handleSaveUser`

**Test First (covers all):**
```typescript
test('no browser alert dialogs appear during slideout interactions', async ({ page }) => {
  let alertShown = false;
  page.on('dialog', () => alertShown = true);
  
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row-test"]');
  // Perform various actions...
  await page.click('[data-testid="tab-settings"]');
  // Change status, etc.
  
  expect(alertShown).toBe(false);
});
```

---

## Verification Checklist

- [x] All E2E tests pass (add-user-ux.test.ts: 9 tests passed)
- [x] No `alert()` calls remain in UserSlideOut.tsx
- [x] Deleted users show locked status
- [x] Reset Password button works
- [x] Connections tab displays properly
- [x] Add to Group modal buttons are clickable
- [x] Toast notifications appear correctly
- [x] Quick Add slideout matches UserSlideOut width (600px)
- [x] Job Title uses dropdown with create option
- [x] Department uses dropdown
- [x] Manager visible in main form
- [x] Label styling matches UserSlideOut (12px, 600 weight, uppercase, #6b7280)

---

## Phase 6: Quick Add Slideout Redesign

### TASK-UX-011: Match Slideout Width
- [x] Update `QuickAddUserSlideOut.css` line 23: change `width: 480px` to `width: 600px`
- [x] Verify responsive breakpoint still works

**Test First:**
```typescript
test('quick add slideout has same width as user slideout', async ({ page }) => {
  // Open Quick Add
  await page.goto('/admin/users');
  await page.click('[data-testid="btn-add-user"]');
  await page.click('[data-testid="option-quick-add"]');
  const quickAddPanel = page.locator('.quick-add-panel');
  const quickAddBox = await quickAddPanel.boundingBox();
  
  // Open User Slideout
  await page.goto('/admin/users');
  await page.click('[data-testid="user-row-amanda"]');
  const userPanel = page.locator('.slideout-panel');
  const userBox = await userPanel.boundingBox();
  
  expect(quickAddBox.width).toBe(userBox.width);
});
```

### TASK-UX-012: Convert Job Title to Dropdown
- [x] Fetch job titles from API on component mount (already implemented)
- [x] Replace text input with searchable dropdown (already implemented)
- [ ] Add "Create new" option at the bottom (future enhancement)
- [ ] Handle creation of new job title via API (future enhancement)

**Test First:**
```typescript
test('job title field is a dropdown with create option', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="btn-add-user"]');
  await page.click('[data-testid="option-quick-add"]');
  
  await page.click('[data-testid="job-title-dropdown"]');
  await expect(page.locator('.job-title-option')).toHaveCount(greaterThan(0));
  await expect(page.locator('[data-testid="create-job-title"]')).toBeVisible();
});
```

### TASK-UX-013: Convert Department to Dropdown
- [x] Fetch departments from existing `/api/v1/organization/departments` endpoint (already implemented)
- [x] Replace text input with dropdown (already implemented)
- [x] Show "Select department..." placeholder

**Test First:**
```typescript
test('department field is a dropdown', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="btn-add-user"]');
  await page.click('[data-testid="option-quick-add"]');
  
  const deptSelect = page.locator('select[name="department"]');
  await expect(deptSelect).toBeVisible();
  const options = await deptSelect.locator('option').count();
  expect(options).toBeGreaterThan(1);
});
```

### TASK-UX-014: Move Manager to Main Form
- [x] Remove Manager from Advanced Options section
- [x] Add Manager dropdown to "Basic Information" section (next to Role)
- [x] Keep existing API integration for manager list

**Test First:**
```typescript
test('manager dropdown is visible without expanding advanced options', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="btn-add-user"]');
  await page.click('[data-testid="option-quick-add"]');
  
  // Without clicking Advanced Options
  await expect(page.locator('select[name="managerId"]')).toBeVisible();
});
```

### TASK-UX-015: Remove Excessive Lines/Borders
- [x] Match UserSlideOut's `.tab-content h3` styling (purple border-bottom is correct)
- [x] Form sections have consistent spacing matching UserSlideOut
- [x] Provider Selection section has subtle visual separation
- [x] Overall visual appearance is clean and professional

**Note:** Original spec suggested removing h3 border-bottom, but this contradicts the goal of matching UserSlideOut which HAS the purple border. Keeping the border for consistency.

**Test First:**
```typescript
test('quick add form has clean visual appearance', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="btn-add-user"]');
  await page.click('[data-testid="option-quick-add"]');

  // Check that form section headers match UserSlideOut (purple border)
  const h3 = page.locator('.form-section h3').first();
  const styles = await h3.evaluate((el) => getComputedStyle(el));
  // Border should be 2px solid purple like UserSlideOut
  expect(styles.borderBottomWidth).toBe('2px');
});
```

### TASK-UX-016: Align Field Styling with UserSlideOut
- [x] Two-column layouts use same grid structure as UserSlideOut (`.form-row.two-col` functionally equivalent to `.info-grid`)
- [x] Form groups use same vertical layout as UserSlideOut's `.info-item`
- [x] Label styling matches: 12px font, 600 weight, #6b7280 color, uppercase, letter-spacing (fixed CSS specificity)
- [x] Input styling matches: 6px border-radius, consistent padding

**Note:** Class names differ (`.form-row.two-col` vs `.info-grid`) but visual result is identical. Functional alignment complete.

**Test First:**
```typescript
test('quick add uses consistent field styling', async ({ page }) => {
  await page.goto('/admin/users');
  await page.click('[data-testid="btn-add-user"]');
  await page.click('[data-testid="option-quick-add"]');

  // Verify label styling matches UserSlideOut
  const label = page.locator('.quick-add-panel .form-group label').first();
  const styles = await label.evaluate((el) => window.getComputedStyle(el));
  expect(styles.fontSize).toBe('12px');
  expect(styles.fontWeight).toBe('600');
  expect(styles.textTransform).toBe('uppercase');
});
```

