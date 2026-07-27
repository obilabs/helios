import { test, expect, Page } from '@playwright/test';
import { login } from './utils/test-helpers';

/**
 * E2E Tests for Scheduled Actions Page Layout
 *
 * These tests verify:
 * - TASK-FIX-022: Empty state is full-width centered
 * - TASK-FIX-023: Proper layout when items exist (optional)
 *
 * Related OpenSpec: openspec/changes/ux-and-functionality-fixes
 */

// Helper to navigate to Scheduled Actions page
async function navigateToScheduledActions(page: Page): Promise<void> {
  await login(page);

  // Navigate to Scheduled Actions - it's under Lifecycle menu
  // First try clicking the Lifecycle menu item
  const lifecycleMenu = page.locator('button:has-text("Lifecycle"), a:has-text("Lifecycle"), .nav-item:has-text("Lifecycle")');
  if (await lifecycleMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
    await lifecycleMenu.click();
    await page.waitForTimeout(300);
  }

  // Then click Scheduled Actions
  const scheduledActionsLink = page.locator('a:has-text("Scheduled Actions"), button:has-text("Scheduled Actions"), .nav-item:has-text("Scheduled Actions")');
  if (await scheduledActionsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await scheduledActionsLink.click();
  } else {
    // Try direct navigation
    await page.goto('/admin/scheduled-actions');
  }

  await page.waitForTimeout(1000); // Wait for page load
}

test.describe('Scheduled Actions Page Layout', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test.describe('TASK-FIX-022: Empty State Layout', () => {
    test('should display page header', async ({ page }) => {
      await navigateToScheduledActions(page);

      // Should see page header with title
      const pageTitle = page.locator('.page-header h1, h1:has-text("Scheduled Actions")');
      await expect(pageTitle).toBeVisible({ timeout: 10000 });
    });

    test('should display toolbar with search and filters', async ({ page }) => {
      await navigateToScheduledActions(page);

      // Should see toolbar elements - use more specific selector
      const toolbar = page.locator('.toolbar');
      await expect(toolbar).toBeVisible({ timeout: 10000 });

      const searchBox = toolbar.locator('.search-box');
      await expect(searchBox).toBeVisible();

      const filterSelect = page.locator('.filter-group select');
      await expect(filterSelect.first()).toBeVisible();
    });

    test('should display view toggle buttons', async ({ page }) => {
      await navigateToScheduledActions(page);

      // Wait for page to load
      await page.waitForTimeout(1000);

      // Should see list and calendar view toggle buttons
      const viewToggle = page.locator('.view-toggle');
      await expect(viewToggle).toBeVisible({ timeout: 15000 });

      const listButton = page.locator('.toggle-btn').first();
      const calendarButton = page.locator('.toggle-btn').nth(1);

      await expect(listButton).toBeVisible();
      await expect(calendarButton).toBeVisible();
    });

    test('empty state should be centered horizontally', async ({ page }) => {
      await navigateToScheduledActions(page);

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Check if empty state is visible
      const emptyState = page.locator('.empty-state');
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      if (hasEmptyState) {
        // Verify it's centered using CSS
        const emptyStateBox = await emptyState.boundingBox();
        const contentArea = page.locator('.content-area');
        const contentAreaBox = await contentArea.boundingBox();

        if (emptyStateBox && contentAreaBox) {
          // Empty state should be centered - its center should be close to content area center
          const emptyStateCenter = emptyStateBox.x + emptyStateBox.width / 2;
          const contentAreaCenter = contentAreaBox.x + contentAreaBox.width / 2;

          // Allow some tolerance (within 50px of center)
          expect(Math.abs(emptyStateCenter - contentAreaCenter)).toBeLessThan(50);
        }

        // Verify empty state has proper structure
        const emptyIcon = emptyState.locator('.empty-icon');
        await expect(emptyIcon).toBeVisible();

        const emptyHeading = emptyState.locator('h2');
        await expect(emptyHeading).toBeVisible();
        await expect(emptyHeading).toHaveText('No scheduled actions');
      }
    });

    test('empty state should be full width (not split-panel)', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      const emptyState = page.locator('.empty-state');
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      if (hasEmptyState) {
        // Content area should NOT have 'with-panel' class when showing empty state
        const contentArea = page.locator('.content-area');
        const hasWithPanel = await contentArea.evaluate((el) => el.classList.contains('with-panel'));

        expect(hasWithPanel).toBe(false);

        // Detail panel should not be visible
        const detailPanel = page.locator('.detail-panel');
        await expect(detailPanel).not.toBeVisible();
      }
    });

    test('empty state should have proper styling', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      const emptyState = page.locator('.empty-state');
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      if (hasEmptyState) {
        // Verify styling - should have flex column, centered
        const styles = await emptyState.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            display: computed.display,
            flexDirection: computed.flexDirection,
            alignItems: computed.alignItems,
            justifyContent: computed.justifyContent,
            textAlign: computed.textAlign
          };
        });

        expect(styles.display).toBe('flex');
        expect(styles.flexDirection).toBe('column');
        expect(styles.alignItems).toBe('center');
        expect(styles.justifyContent).toBe('center');
        expect(styles.textAlign).toBe('center');
      }
    });
  });

  test.describe('TASK-FIX-023: Actions List Layout (When Items Exist)', () => {
    test('actions table should be visible when actions exist', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      // Either actions table or empty state should be visible
      const actionsTable = page.locator('.actions-table');
      const emptyState = page.locator('.empty-state');

      const hasTable = await actionsTable.isVisible().catch(() => false);
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      expect(hasTable || hasEmptyState).toBe(true);

      if (hasTable) {
        // Verify table has proper structure
        const tableHeaders = actionsTable.locator('thead th');
        const headerCount = await tableHeaders.count();

        // Should have User, Action, Scheduled For, Status, Progress columns
        expect(headerCount).toBeGreaterThanOrEqual(5);
      }
    });

    test('clicking action row should show detail panel', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      const actionsTable = page.locator('.actions-table');
      const hasTable = await actionsTable.isVisible().catch(() => false);

      if (hasTable) {
        // Click first action row
        const firstRow = actionsTable.locator('tbody tr').first();
        const hasRows = await firstRow.isVisible().catch(() => false);

        if (hasRows) {
          await firstRow.click();
          await page.waitForTimeout(500);

          // Detail panel should appear
          const detailPanel = page.locator('.detail-panel');
          await expect(detailPanel).toBeVisible({ timeout: 3000 });

          // Content area should have 'with-panel' class
          const contentArea = page.locator('.content-area');
          const hasWithPanel = await contentArea.evaluate((el) => el.classList.contains('with-panel'));
          expect(hasWithPanel).toBe(true);
        }
      }
    });

    test('detail panel should have close button', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      const actionsTable = page.locator('.actions-table');
      const hasTable = await actionsTable.isVisible().catch(() => false);

      if (hasTable) {
        const firstRow = actionsTable.locator('tbody tr').first();
        const hasRows = await firstRow.isVisible().catch(() => false);

        if (hasRows) {
          await firstRow.click();
          await page.waitForTimeout(500);

          const detailPanel = page.locator('.detail-panel');
          if (await detailPanel.isVisible()) {
            // Should have close button
            const closeBtn = detailPanel.locator('.close-btn');
            await expect(closeBtn).toBeVisible();

            // Clicking close should hide the panel
            await closeBtn.click();
            await page.waitForTimeout(300);

            await expect(detailPanel).not.toBeVisible();
          }
        }
      }
    });

    test('calendar view should work', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      // Click calendar view toggle
      const calendarToggle = page.locator('.toggle-btn').nth(1);
      await calendarToggle.click();
      await page.waitForTimeout(500);

      // Should show calendar view or empty state
      const calendarView = page.locator('.calendar-view');
      const emptyState = page.locator('.empty-state');

      const hasCalendar = await calendarView.isVisible().catch(() => false);
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      expect(hasCalendar || hasEmptyState).toBe(true);
    });
  });

  test.describe('Filter Functionality', () => {
    test('status filter should have all options', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      // Find status filter dropdown
      const statusFilter = page.locator('.filter-group select').first();
      await expect(statusFilter).toBeVisible();

      // Check options
      const options = await statusFilter.locator('option').allTextContents();

      expect(options).toContain('All Status');
      expect(options).toContain('Pending');
      expect(options).toContain('In Progress');
      expect(options).toContain('Completed');
      expect(options).toContain('Failed');
      expect(options).toContain('Cancelled');
    });

    test('type filter should have all options', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      // Find type filter dropdown (second select)
      const typeFilter = page.locator('.filter-group select').nth(1);

      if (await typeFilter.isVisible()) {
        const options = await typeFilter.locator('option').allTextContents();

        expect(options).toContain('All Types');
        expect(options).toContain('Onboarding');
        expect(options).toContain('Offboarding');
      }
    });

    test('refresh button should be visible', async ({ page }) => {
      await navigateToScheduledActions(page);

      await page.waitForTimeout(1000);

      const refreshBtn = page.locator('button:has-text("Refresh")');
      await expect(refreshBtn).toBeVisible();
    });
  });
});
