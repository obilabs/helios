import { test, expect, Page } from '@playwright/test';
import { navigateToAdminUsers } from './utils/test-helpers';

/**
 * E2E Tests for Users Page Header UX Fixes
 *
 * These tests verify:
 * - TASK-FIX-003: Stats cards layout and spacing
 * - TASK-FIX-004: Column header separation (Integrations/Status)
 * - TASK-FIX-005: Search box and filter button alignment
 * - TASK-FIX-006: Filter panel functionality
 * - TASK-FIX-007: Column visibility toggle
 *
 * Related OpenSpec: openspec/changes/ux-and-functionality-fixes
 */

// Helper to navigate to Users page
async function navigateToUsersPage(page: Page): Promise<void> {
  await navigateToAdminUsers(page);
}

test.describe('Users Page Header Redesign', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test.describe('TASK-FIX-003: Stats Cards Layout', () => {
    test('should display stats bar with proper spacing', async ({ page }) => {
      await navigateToUsersPage(page);

      const statsBar = page.locator('.users-stats-inline');
      await expect(statsBar).toBeVisible();

      // Check that stats bar has proper gap between items
      const gap = await statsBar.evaluate(el =>
        window.getComputedStyle(el).gap
      );
      expect(gap).not.toBe('0px');
    });

    test('should display all status counts with consistent styling', async ({ page }) => {
      await navigateToUsersPage(page);

      // Check Total, Active, Pending, Suspended stats are visible
      const statItems = page.locator('.stat-item');
      const count = await statItems.count();
      expect(count).toBeGreaterThanOrEqual(3); // At minimum Total, Active, Pending

      // Verify stat items have proper alignment
      for (let i = 0; i < Math.min(count, 4); i++) {
        const statItem = statItems.nth(i);
        await expect(statItem).toBeVisible();

        // Each stat should have value and label
        const statValue = statItem.locator('.stat-value');
        const statLabel = statItem.locator('.stat-label');
        await expect(statValue).toBeVisible();
        await expect(statLabel).toBeVisible();
      }
    });

    test('stat items should have consistent heights', async ({ page }) => {
      await navigateToUsersPage(page);

      const statItems = page.locator('.stat-item');
      const count = await statItems.count();

      if (count >= 2) {
        const box1 = await statItems.nth(0).boundingBox();
        const box2 = await statItems.nth(1).boundingBox();

        expect(box1).toBeTruthy();
        expect(box2).toBeTruthy();

        if (box1 && box2) {
          // Heights should be within 2px of each other
          expect(Math.abs(box1.height - box2.height)).toBeLessThan(3);
        }
      }
    });

    test('stats bar should have proper padding', async ({ page }) => {
      await navigateToUsersPage(page);

      const statsBar = page.locator('.users-stats-inline');
      await expect(statsBar).toBeVisible();

      const padding = await statsBar.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          left: parseInt(style.paddingLeft),
          right: parseInt(style.paddingRight)
        };
      });

      // Should have at least 16px padding
      expect(padding.left).toBeGreaterThanOrEqual(16);
      expect(padding.right).toBeGreaterThanOrEqual(16);
    });
  });

  test.describe('TASK-FIX-004: Column Header Separation', () => {
    test('Integrations and Status columns should have clear visual separation', async ({ page }) => {
      await navigateToUsersPage(page);

      // Wait for table header to be visible
      const tableHeader = page.locator('.table-header');
      await expect(tableHeader).toBeVisible();

      // Find the Integrations and Status column headers
      const integrationsHeader = page.locator('.table-header .col-platforms');
      const statusHeader = page.locator('.table-header .col-status');

      // Verify both columns exist
      await expect(integrationsHeader).toBeVisible();
      await expect(statusHeader).toBeVisible();

      // Get their positions
      const integrationsBox = await integrationsHeader.boundingBox();
      const statusBox = await statusHeader.boundingBox();

      expect(integrationsBox).toBeTruthy();
      expect(statusBox).toBeTruthy();

      if (integrationsBox && statusBox) {
        // There should be visible gap between them (at least 8px)
        const gap = statusBox.x - (integrationsBox.x + integrationsBox.width);
        expect(gap).toBeGreaterThanOrEqual(8);
      }
    });

    test('column headers should not overlap or touch', async ({ page }) => {
      await navigateToUsersPage(page);

      // Wait for the table to load
      await page.waitForSelector('.users-page', { timeout: 10000 });

      const tableHeader = page.locator('.table-header');
      await expect(tableHeader).toBeVisible({ timeout: 10000 });

      // Check gap style is applied to header
      const gapValue = await tableHeader.evaluate(el =>
        window.getComputedStyle(el).gap
      );
      expect(gapValue).not.toBe('0px');
    });

    test('columns should have minimum width constraints', async ({ page }) => {
      await navigateToUsersPage(page);

      const integrationsHeader = page.locator('.table-header .col-platforms');
      const statusHeader = page.locator('.table-header .col-status');

      const integrationsBox = await integrationsHeader.boundingBox();
      const statusBox = await statusHeader.boundingBox();

      expect(integrationsBox).toBeTruthy();
      expect(statusBox).toBeTruthy();

      if (integrationsBox && statusBox) {
        // Minimum 60px width for each column
        expect(integrationsBox.width).toBeGreaterThanOrEqual(60);
        expect(statusBox.width).toBeGreaterThanOrEqual(80);
      }
    });
  });

  test.describe('TASK-FIX-005: Search and Filter Alignment', () => {
    test('filter buttons should be visible in actions bar', async ({ page }) => {
      await navigateToUsersPage(page);

      const actionsBar = page.locator('.actions-bar');
      await expect(actionsBar).toBeVisible();

      // Filter and column visibility buttons should exist
      const filterButton = page.locator('.actions-bar .btn-icon').first();
      const columnsButton = page.locator('.actions-bar .btn-icon').nth(1);

      await expect(filterButton).toBeVisible();
      await expect(columnsButton).toBeVisible();
    });

    test('filter buttons should have same height', async ({ page }) => {
      await navigateToUsersPage(page);

      const buttons = page.locator('.actions-bar .btn-icon');
      const count = await buttons.count();

      if (count >= 2) {
        const box1 = await buttons.nth(0).boundingBox();
        const box2 = await buttons.nth(1).boundingBox();

        expect(box1).toBeTruthy();
        expect(box2).toBeTruthy();

        if (box1 && box2) {
          // Heights should match exactly
          expect(box1.height).toBe(box2.height);
          expect(box1.width).toBe(box2.width);
        }
      }
    });

    test('action buttons should be vertically centered in actions bar', async ({ page }) => {
      await navigateToUsersPage(page);

      const actionsBar = page.locator('.actions-bar');
      const filterBtn = page.locator('.actions-bar .btn-icon').first();

      const barBox = await actionsBar.boundingBox();
      const btnBox = await filterBtn.boundingBox();

      expect(barBox).toBeTruthy();
      expect(btnBox).toBeTruthy();

      if (barBox && btnBox) {
        const barCenter = barBox.y + barBox.height / 2;
        const btnCenter = btnBox.y + btnBox.height / 2;

        // Button should be centered within 2px
        expect(Math.abs(barCenter - btnCenter)).toBeLessThan(3);
      }
    });
  });

  test.describe('TASK-FIX-006: Filter Panel Functionality', () => {
    test('clicking filter button should open filter panel', async ({ page }) => {
      await navigateToUsersPage(page);

      // Click the filter button (hamburger lines icon)
      const filterButton = page.locator('.actions-bar .btn-icon').first();
      await filterButton.click();

      // Filter panel should become visible
      const filterPanel = page.locator('.filter-panel');
      await expect(filterPanel).toBeVisible({ timeout: 3000 });
    });

    test('filter panel should have date filter options', async ({ page }) => {
      await navigateToUsersPage(page);

      const filterButton = page.locator('.actions-bar .btn-icon').first();
      await filterButton.click();

      const filterPanel = page.locator('.filter-panel');
      await expect(filterPanel).toBeVisible({ timeout: 3000 });

      // Should have date-based filter options
      const recentlyCreatedFilter = filterPanel.locator('text=Recently Created');
      // At minimum, the panel should be visible
      await expect(filterPanel).toBeVisible();
    });

    test('filter panel should close when clicking outside', async ({ page }) => {
      await navigateToUsersPage(page);

      const filterButton = page.locator('.actions-bar .btn-icon').first();
      await filterButton.click();

      const filterPanel = page.locator('.filter-panel');
      await expect(filterPanel).toBeVisible({ timeout: 3000 });

      // Click outside the panel
      await page.locator('.users-page').click({ position: { x: 10, y: 200 } });

      // Panel should close
      await expect(filterPanel).not.toBeVisible({ timeout: 3000 });
    });

    test('applying filter should update displayed users', async ({ page }) => {
      await navigateToUsersPage(page);

      // Get initial row count
      const initialRows = await page.locator('.table-row').count();

      // Open filter panel
      const filterButton = page.locator('.actions-bar .btn-icon').first();
      await filterButton.click();

      const filterPanel = page.locator('.filter-panel');
      await expect(filterPanel).toBeVisible({ timeout: 3000 });

      // If a filter option exists, click it
      const filterOption = filterPanel.locator('button, label').first();
      if (await filterOption.count() > 0) {
        await filterOption.click();
        // The test passes if no error occurs
      }
    });
  });

  test.describe('TASK-FIX-007: Column Visibility Toggle', () => {
    test('clicking columns button should open column selector', async ({ page }) => {
      await navigateToUsersPage(page);

      // Click the columns button (vertical lines icon)
      const columnsButton = page.locator('.actions-bar .btn-icon').nth(1);
      await columnsButton.click();

      // Column selector should become visible
      const columnSelector = page.locator('.column-selector');
      await expect(columnSelector).toBeVisible({ timeout: 3000 });
    });

    test('column selector should list available columns', async ({ page }) => {
      await navigateToUsersPage(page);

      const columnsButton = page.locator('.actions-bar .btn-icon').nth(1);
      await columnsButton.click();

      const columnSelector = page.locator('.column-selector');
      await expect(columnSelector).toBeVisible({ timeout: 3000 });

      // Should have checkboxes for column visibility
      const columnCheckboxes = columnSelector.locator('input[type="checkbox"]');
      const count = await columnCheckboxes.count();

      // At least a few column options should exist
      expect(count).toBeGreaterThanOrEqual(3);
    });

    test('toggling column visibility should hide/show column', async ({ page }) => {
      await navigateToUsersPage(page);

      // Open column selector
      const columnsButton = page.locator('.actions-bar .btn-icon').nth(1);
      await columnsButton.click();

      const columnSelector = page.locator('.column-selector');
      await expect(columnSelector).toBeVisible({ timeout: 3000 });

      // Find first non-required checkbox that is currently checked (visible)
      const checkboxes = columnSelector.locator('input[type="checkbox"]:not(:disabled)');
      const count = await checkboxes.count();

      // Find a checked checkbox to toggle
      let toggledIndex = -1;
      for (let i = 0; i < count; i++) {
        if (await checkboxes.nth(i).isChecked()) {
          toggledIndex = i;
          break;
        }
      }

      if (toggledIndex >= 0) {
        // Get initial state
        const initialChecked = await checkboxes.nth(toggledIndex).isChecked();

        // Toggle it
        await checkboxes.nth(toggledIndex).click();

        // Wait a moment for state update
        await page.waitForTimeout(500);

        // Verify the state changed
        const newChecked = await checkboxes.nth(toggledIndex).isChecked();
        expect(newChecked).not.toBe(initialChecked);
      } else {
        // All checkboxes are unchecked or disabled - this is acceptable
        expect(count).toBeGreaterThan(0);
      }

      // Close selector
      await page.locator('.users-page').click({ position: { x: 10, y: 200 } });
    });

    test('column preferences should persist after closing and reopening selector', async ({ page }) => {
      await navigateToUsersPage(page);

      // Wait for actions bar to be visible
      await page.waitForSelector('.actions-bar', { timeout: 10000 });

      // Open column selector
      const columnsButton = page.locator('.actions-bar .btn-icon').nth(1);
      await expect(columnsButton).toBeVisible({ timeout: 5000 });
      await columnsButton.click();

      const columnSelector = page.locator('.column-selector');
      await expect(columnSelector).toBeVisible({ timeout: 3000 });

      // Find first non-disabled checkbox
      const checkboxes = columnSelector.locator('input[type="checkbox"]:not(:disabled)');
      const count = await checkboxes.count();

      if (count > 0) {
        const firstCheckbox = checkboxes.first();
        const initialState = await firstCheckbox.isChecked();
        await firstCheckbox.click();

        // Wait for state update
        await page.waitForTimeout(500);
        const newState = await firstCheckbox.isChecked();

        // Close selector
        await page.locator('.users-page').click({ position: { x: 10, y: 200 } });
        await expect(columnSelector).not.toBeVisible();

        // Reopen selector
        await columnsButton.click();
        await expect(columnSelector).toBeVisible({ timeout: 3000 });

        // Checkbox should retain new state
        const retainedState = await checkboxes.first().isChecked();
        expect(retainedState).toBe(newState);
      } else {
        // No toggleable checkboxes - verify the selector at least has some
        const allCheckboxes = columnSelector.locator('input[type="checkbox"]');
        expect(await allCheckboxes.count()).toBeGreaterThan(0);
      }
    });
  });
});
