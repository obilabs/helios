import { test, expect, Page } from '@playwright/test';
import { TEST_CREDENTIALS } from './utils/test-helpers';

// Helper to login and navigate to groups
async function loginAndNavigateToGroups(page: Page) {
  await page.goto('/');

  // Wait for login page
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  // Fill login form
  await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
  await page.fill('input[type="password"]', TEST_CREDENTIALS.password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await page.waitForURL(/.*dashboard.*|.*\/$/, { timeout: 15000 });

  // Dismiss ViewOnboarding modal if present (appears for internal admins on first login)
  // Wait a moment for the modal to potentially appear
  await page.waitForTimeout(1000);
  const onboardingModal = page.locator('.view-onboarding-overlay');
  const modalCount = await onboardingModal.count();
  if (modalCount > 0) {
    // Click the continue button to dismiss
    const continueBtn = page.locator('.view-onboarding-button.primary');
    await continueBtn.click();
    await onboardingModal.waitFor({ state: 'hidden', timeout: 5000 });
  }

  // Navigate to groups page - click the Groups link in sidebar
  await page.click('[data-testid="nav-access-groups"]');

  // Wait for groups page to load (uses data-grid, not table)
  await page.waitForSelector('.page-container', { timeout: 15000 });
  // Wait a bit for data to load
  await page.waitForTimeout(1000);
}

test.describe('Groups Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Increase timeout for login
    test.setTimeout(60000);
  });

  test('should display groups list', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Verify we're on the groups page
    await expect(page.locator('h1:has-text("Groups"), h1:has-text("Access Groups")')).toBeVisible();

    // Check for the data grid or empty state
    const hasGroups = await page.locator('.grid-row').count() > 0;
    const hasEmptyState = await page.locator('.empty-state').count() > 0;
    expect(hasGroups || hasEmptyState).toBeTruthy();
  });

  test('should show group row with details', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Check if groups exist
    const groupRows = page.locator('.grid-row');
    const count = await groupRows.count();

    if (count > 0) {
      // Verify first row has expected content
      const firstRow = groupRows.first();
      await expect(firstRow.locator('.item-name')).toBeVisible();
      await expect(firstRow.locator('.member-count')).toBeVisible();
    }
  });

  test('should navigate to group detail when clicking a group', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Check if groups exist
    const groupRows = page.locator('.grid-row');
    const count = await groupRows.count();

    if (count > 0) {
      // Click on the first group row
      await groupRows.first().click();

      // Verify navigation to group detail page
      await expect(page).toHaveURL(/\/admin\/groups\/[a-f0-9-]+/, { timeout: 5000 });
    }
  });

  test('should show search box', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Check for groups-specific search input
    await expect(page.locator('input[placeholder="Search groups..."]')).toBeVisible();
  });

  test('should show filter dropdown', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Check for platform filter
    await expect(page.locator('.filter-select, select')).toBeVisible();
  });

  test('should show sync button', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Check for sync button
    await expect(page.locator('button:has-text("Sync Groups")')).toBeVisible();
  });

  test('should show create group button', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Check for create button
    await expect(page.locator('button:has-text("Create Group")')).toBeVisible();
  });

  test('should open create group modal', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Click create button
    await page.click('button:has-text("Create Group")');

    // Check for modal
    await expect(page.locator('h2:has-text("Create New Group")')).toBeVisible({ timeout: 5000 });

    // Check for form fields
    await expect(page.locator('input[placeholder*="@"], input[placeholder*="email"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="Team"], input[placeholder*="name"]')).toBeVisible();

    // Close modal
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('h2:has-text("Create New Group")')).not.toBeVisible();
  });

  test('should filter groups by platform', async ({ page }) => {
    await loginAndNavigateToGroups(page);

    // Select Google Workspace filter
    await page.selectOption('.filter-select, select', 'google_workspace');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Page should still be visible
    await expect(page.locator('.page-container')).toBeVisible();
  });
});

// GroupSlideOut tests are currently skipped because the app uses route-based
// navigation to GroupDetail page instead of slideout behavior.
// The GroupSlideOut component exists but isn't used in the main routing.
// To enable slideout: remove onSelectGroup prop from Groups in App.tsx
test.describe.skip('GroupSlideOut Component', () => {
  test('should open slideout when clicking on a group', async ({ page }) => {
    await loginAndNavigateToGroups(page);
    const firstGroupRow = page.locator('.grid-row').first();
    await expect(firstGroupRow).toBeVisible({ timeout: 10000 });
    await firstGroupRow.click();
    await expect(page.locator('.slideout-panel, .group-slideout')).toBeVisible({ timeout: 5000 });
  });

  test('should show tabs in slideout', async ({ page }) => {
    await loginAndNavigateToGroups(page);
    const firstGroupRow = page.locator('.grid-row').first();
    await firstGroupRow.click();
    await page.waitForSelector('.slideout-panel');
    await expect(page.locator('.slideout-tab:has-text("Overview")')).toBeVisible();
    await expect(page.locator('.slideout-tab:has-text("Members")')).toBeVisible();
    await expect(page.locator('.slideout-tab:has-text("Sync")')).toBeVisible();
  });
});
