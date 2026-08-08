# Design: Focus Google Workspace Messaging

## Architecture

This is a frontend-only change. No backend, database, or API modifications required.

## File Changes

### 1. AccountSetup.tsx (Lines 127, 134-135)

**Current:**
```tsx
<div className="form-hint">
  This will be used for module configurations (Google Workspace, Microsoft 365, etc.)
</div>
...
<p>
  After setup, you'll be able to enable modules like Google Workspace,
  Microsoft 365, Slack, and more from your dashboard settings.
</p>
```

**Target:**
```tsx
<div className="form-hint">
  This will be used for Google Workspace integration and future modules.
</div>
...
<p>
  After setup, you'll be able to connect your Google Workspace domain
  to sync users, groups, and organizational units.
</p>
```

### 2. LoginPage.tsx (Line 138)

**Current:**
```tsx
<p>
  Manage users, permissions, and configurations across Google Workspace,
  Microsoft 365, and other SaaS platforms from one dashboard.
</p>
```

**Target:**
```tsx
<p>
  Manage users, groups, and configurations for your Google Workspace
  domain from one centralized dashboard.
</p>
```

### 3. App.tsx (Lines 479-480, 840, 898)

**Current:**
```tsx
// Line 479-480
<p>
  Self-hosted SaaS administration platform starting with Google Workspace.
  Microsoft 365, Slack, and other integrations coming soon.
</p>

// Line 840 - Microsoft sync activity
<div className="activity-text">Microsoft 365 sync completed</div>

// Line 898 - Microsoft sync alert
<div className="alert-text">Initial Microsoft 365 sync recommended</div>
```

**Target:**
```tsx
// Line 479-480
<p>
  Self-hosted Google Workspace administration platform.
  Manage your organization with enterprise-grade tools.
</p>

// Lines 840, 898 - Remove or hide Microsoft sections entirely
// (Conditional render based on module availability)
```

### 4. UserList.tsx (Line 1059)

**Current:**
```tsx
: 'Start by connecting to Google Workspace or Microsoft 365'
```

**Target:**
```tsx
: 'Connect to Google Workspace to sync your organization users'
```

### 5. Groups.tsx (Line 203)

**Current:**
```tsx
<option value="all">All Platforms</option>
<option value="google_workspace">Google Workspace</option>
<option value="microsoft_365">Microsoft 365</option>
```

**Target:**
```tsx
<option value="all">All Sources</option>
<option value="google_workspace">Google Workspace</option>
<option value="local">Local Only</option>
```

### 6. config/widgets.tsx

**Current:** Microsoft 365 widgets defined and visible

**Target:** Add `hidden: true` or remove from default widget set

### 7. utils/widget-data.tsx

**Current:** Returns Microsoft widget data

**Target:** Return null or empty for Microsoft widgets (graceful degradation)

## UI/UX Considerations

### Messaging Principles

1. **Honest** - Don't promise features that don't exist
2. **Focused** - Emphasize Google Workspace excellence
3. **Forward-looking** - Use "future modules" language, not specific product names
4. **Professional** - Enterprise-appropriate language

### Tone Examples

| Avoid | Prefer |
|-------|--------|
| "Microsoft 365, Slack, and more" | "and future integrations" |
| "coming soon" in active areas | Remove or use "roadmap" in settings only |
| "other SaaS platforms" | "your Google Workspace domain" |

## Component Behavior

### Dashboard Widgets

```typescript
// In widget-data.tsx or widget config
const isModuleEnabled = (moduleSlug: string) => {
  // Check if module is actually enabled and configured
  return enabledModules.includes(moduleSlug);
};

// Only show widgets for enabled modules
const visibleWidgets = allWidgets.filter(w =>
  w.category === 'system' ||
  w.category === 'helios' ||
  isModuleEnabled(w.category)
);
```

### Platform Filters

```typescript
// Only show platforms that have data
const availablePlatforms = [
  { value: 'all', label: 'All Sources' },
  { value: 'google_workspace', label: 'Google Workspace' },
  // Only add local if there are local-only users
  ...(hasLocalUsers ? [{ value: 'local', label: 'Local Only' }] : [])
];
```

## Testing Strategy

### E2E Test: Setup Page Messaging
```typescript
test('setup page shows focused Google Workspace messaging', async ({ page }) => {
  await page.goto('/setup');

  // Should NOT contain
  await expect(page.locator('body')).not.toContainText('Microsoft 365');
  await expect(page.locator('body')).not.toContainText('Slack');

  // Should contain
  await expect(page.locator('body')).toContainText('Google Workspace');
});
```

### E2E Test: Login Page Messaging
```typescript
test('login page focuses on Google Workspace', async ({ page }) => {
  await page.goto('/login');

  const description = page.locator('.feature-description, .login-description');
  await expect(description).not.toContainText('Microsoft');
  await expect(description).toContainText('Google Workspace');
});
```

### E2E Test: Dashboard Widgets
```typescript
test('dashboard hides Microsoft widgets when module disabled', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard');

  // Microsoft widgets should not be visible
  await expect(page.locator('[data-widget-category="microsoft"]')).toHaveCount(0);

  // Google widgets should be visible (if GW enabled)
  // or show "Connect Google Workspace" prompt
});
```

### E2E Test: Groups Filter
```typescript
test('groups filter does not show Microsoft 365 option', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/groups');

  const platformFilter = page.locator('select[name="platform"], .platform-filter');
  await expect(platformFilter).not.toContainText('Microsoft 365');
});
```

## Implementation Order

1. Write E2E tests (tests should fail initially)
2. Update AccountSetup.tsx
3. Update LoginPage.tsx
4. Update App.tsx (dashboard messaging)
5. Update UserList.tsx
6. Update Groups.tsx
7. Update widget configs
8. Run E2E tests (should pass)
9. Manual verification
10. Screenshot documentation

## Rollback Plan

All changes are in version control. If issues arise:
```bash
git revert <commit-hash>
```

No database migrations or API changes means instant rollback capability.
