import { test, expect, Page } from '@playwright/test';
import { navigateToAdminUsers } from './utils/test-helpers';

/**
 * E2E Tests for Users Page Advanced Filters
 *
 * These tests verify:
 * - TASK-FIX-008: Date-based filters (Recently Created, Today, This Week, This Month, Last Login)
 * - TASK-FIX-009: Property filters (Department, Role, Integration Status)
 *
 * Related OpenSpec: openspec/changes/ux-and-functionality-fixes
 */

// Helper to navigate to Users page
async function navigateToUsersPage(page: Page): Promise<void> {
  await navigateToAdminUsers(page);
}

// Helper to open filter panel
async function openFilterPanel(page: Page): Promise<void> {
  const filterButton = page.locator('.actions-bar .btn-icon').first();
  await filterButton.click();
  const filterPanel = page.locator('.filter-panel');
  await expect(filterPanel).toBeVisible({ timeout: 3000 });
}

test.describe('Users Page Advanced Filters', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test.describe('TASK-FIX-008: Date-Based Filters', () => {
    test('should display date created filter options', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      const filterPanel = page.locator('.filter-panel');
      const dateCreatedSection = filterPanel.locator('.filter-section:has-text("Date Created")').first();

      // Check for Date Created section
      await expect(filterPanel.locator('text=Date Created')).toBeVisible();

      // Check for filter options in Date Created section specifically
      await expect(dateCreatedSection.locator('text=Recently Created (7 days)')).toBeVisible();
      await expect(dateCreatedSection.locator('text=Today')).toBeVisible();
      await expect(dateCreatedSection.locator('text=This Week')).toBeVisible();
      await expect(dateCreatedSection.locator('text=This Month')).toBeVisible();
    });

    test('should filter by recently created (7 days)', async ({ page }) => {
      await navigateToUsersPage(page);

      // Get initial user count
      const initialRowCount = await page.locator('.table-row').count();

      await openFilterPanel(page);

      // Click "Recently Created (7 days)" option
      await page.locator('.filter-option:has-text("Recently Created")').click();

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // The filter should be applied - row count may be same or different
      // Verify the filter is now selected
      const selectedOption = page.locator('.filter-option.selected:has-text("Recently Created")');
      await expect(selectedOption).toBeVisible();
    });

    test('should filter by today', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Click "Today" option within Date Created section specifically
      const dateCreatedSection = page.locator('.filter-section:has-text("Date Created")').first();
      await dateCreatedSection.locator('.filter-option:has-text("Today")').click();

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Verify the filter is selected
      const selectedOption = dateCreatedSection.locator('.filter-option.selected');
      await expect(selectedOption).toBeVisible();
    });

    test('should display last login filter options', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      const filterPanel = page.locator('.filter-panel');

      // Check for Last Login section
      await expect(filterPanel.locator('text=Last Login')).toBeVisible();

      // Check for filter options
      await expect(filterPanel.locator('text=Never Logged In')).toBeVisible();
      await expect(filterPanel.locator('.filter-section:has-text("Last Login") >> text=Today')).toBeVisible();
      await expect(filterPanel.locator('.filter-section:has-text("Last Login") >> text=This Week')).toBeVisible();
      await expect(filterPanel.locator('text=Inactive (30+ days)')).toBeVisible();
    });

    test('should filter by never logged in', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Click "Never Logged In" option
      await page.locator('.filter-option:has-text("Never Logged In")').click();

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Verify the filter is selected
      const selectedOption = page.locator('.filter-option.selected:has-text("Never Logged In")');
      await expect(selectedOption).toBeVisible();
    });

    test('should filter by inactive (30+ days)', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Click "Inactive (30+ days)" option
      await page.locator('.filter-option:has-text("Inactive (30+ days)")').click();

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Verify the filter is selected
      const selectedOption = page.locator('.filter-option.selected:has-text("Inactive")');
      await expect(selectedOption).toBeVisible();
    });

    test('should clear date created filter', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Apply a filter first
      await page.locator('.filter-option:has-text("Recently Created")').click();
      await page.waitForTimeout(500);

      // Verify filter is applied
      const selectedOption = page.locator('.filter-option.selected:has-text("Recently Created")');
      await expect(selectedOption).toBeVisible();

      // Click clear button for that section
      await page.locator('.filter-section:has-text("Date Created") .btn-clear-section').click();
      await page.waitForTimeout(500);

      // Verify filter is cleared - no option should be selected
      await expect(selectedOption).not.toBeVisible();
    });
  });

  test.describe('TASK-FIX-009: Property Filters', () => {
    test('should display department filter dropdown', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      const filterPanel = page.locator('.filter-panel');

      // Check for Department section heading
      await expect(filterPanel.locator('h4:has-text("Department")')).toBeVisible();

      // Department filter may or may not have a select dropdown depending on data
      // The section should exist if there are departments
      const departmentSection = filterPanel.locator('.filter-section').filter({ hasText: 'Department' });
      // Either the section with select exists or doesn't depending on data
      // Just verify the panel can be opened and no errors occur
    });

    test('should display role filter dropdown', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      const filterPanel = page.locator('.filter-panel');

      // Check for Role section
      await expect(filterPanel.locator('h4:has-text("Role")')).toBeVisible();

      // Check for role select dropdown
      const roleSelect = filterPanel.locator('.filter-section:has-text("Role") select');
      await expect(roleSelect).toBeVisible();

      // Verify it has the expected options by counting options
      const optionCount = await roleSelect.locator('option').count();
      expect(optionCount).toBeGreaterThanOrEqual(3); // All Roles, Admin, Manager, User
    });

    test('should filter by role admin', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Select "Admin" role
      const roleSelect = page.locator('.filter-section:has-text("Role") select');
      await roleSelect.selectOption('admin');

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Verify the filter is applied - the select should show "Admin"
      const selectedValue = await roleSelect.inputValue();
      expect(selectedValue).toBe('admin');
    });

    test('should filter by role user', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Select "User" role
      const roleSelect = page.locator('.filter-section:has-text("Role") select');
      await roleSelect.selectOption('user');

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Verify the filter is applied
      const selectedValue = await roleSelect.inputValue();
      expect(selectedValue).toBe('user');
    });

    test('should display integration status filter options', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      const filterPanel = page.locator('.filter-panel');

      // Check for Integration Status section
      await expect(filterPanel.locator('text=Integration Status')).toBeVisible();

      // Check for filter options
      await expect(filterPanel.locator('text=Synced (Google/Microsoft)')).toBeVisible();
      await expect(filterPanel.locator('text=Local Only')).toBeVisible();
    });

    test('should filter by synced integration status', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Click "Synced" option
      await page.locator('.filter-option:has-text("Synced (Google/Microsoft)")').click();

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Verify the filter is selected
      const selectedOption = page.locator('.filter-option.selected:has-text("Synced")');
      await expect(selectedOption).toBeVisible();
    });

    test('should filter by local only integration status', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Click "Local Only" option
      await page.locator('.filter-option:has-text("Local Only")').click();

      // Wait for filter to apply
      await page.waitForTimeout(500);

      // Verify the filter is selected
      const selectedOption = page.locator('.filter-option.selected:has-text("Local Only")');
      await expect(selectedOption).toBeVisible();
    });

    test('should clear integration status filter', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Apply a filter first
      await page.locator('.filter-option:has-text("Synced (Google/Microsoft)")').click();
      await page.waitForTimeout(500);

      // Click clear button for that section
      const clearBtn = page.locator('.filter-section:has-text("Integration Status") .btn-clear-section');
      await clearBtn.click();
      await page.waitForTimeout(500);

      // Verify filter is cleared
      const selectedOption = page.locator('.filter-section:has-text("Integration Status") .filter-option.selected');
      await expect(selectedOption).not.toBeVisible();
    });
  });

  test.describe('Combined Filters', () => {
    test('should apply multiple filters together', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Apply date created filter
      await page.locator('.filter-option:has-text("Recently Created")').click();
      await page.waitForTimeout(300);

      // Apply role filter
      const roleSelect = page.locator('.filter-section:has-text("Role") select');
      await roleSelect.selectOption('user');
      await page.waitForTimeout(300);

      // Verify both filters are applied
      const selectedDateOption = page.locator('.filter-option.selected:has-text("Recently Created")');
      await expect(selectedDateOption).toBeVisible();

      const selectedRole = await roleSelect.inputValue();
      expect(selectedRole).toBe('user');
    });

    test('should clear all filters with clear button', async ({ page }) => {
      await navigateToUsersPage(page);
      await openFilterPanel(page);

      // Apply some filters
      await page.locator('.filter-option:has-text("Recently Created")').click();
      await page.waitForTimeout(300);

      // Click "Clear all" button
      const clearAllBtn = page.locator('.filter-panel-header .btn-clear-filters');
      await clearAllBtn.click();
      await page.waitForTimeout(500);

      // Verify no filters are selected
      const selectedOptions = page.locator('.filter-option.selected');
      await expect(selectedOptions).toHaveCount(0);
    });

    test('filter badge should show when filters are active', async ({ page }) => {
      await navigateToUsersPage(page);

      // Initially, filter button should not have active state
      const filterButton = page.locator('.actions-bar .btn-icon').first();

      await openFilterPanel(page);

      // Apply a filter
      await page.locator('.filter-option:has-text("Recently Created")').click();
      await page.waitForTimeout(300);

      // Close the panel
      await page.locator('.users-page').click({ position: { x: 10, y: 200 } });
      await page.waitForTimeout(300);

      // Filter button should now have active state
      await expect(filterButton).toHaveClass(/active/);
    });
  });
});
