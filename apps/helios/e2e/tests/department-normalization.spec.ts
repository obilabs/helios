import { test, expect, Page } from '@playwright/test';
import { navigateToAdminUsers } from './utils/test-helpers';

/**
 * E2E Tests for TASK-FIX-002: Department Field Normalization
 *
 * This test verifies that department fields are displayed as clean names
 * without OU (Organizational Unit) paths like "/Staff/Sales".
 *
 * Related OpenSpec: openspec/changes/ux-and-functionality-fixes
 */

// Helper to navigate to Users page
async function navigateToUsersPage(page: Page): Promise<void> {
  await navigateToAdminUsers(page);
}

test.describe('TASK-FIX-002: Department Field Normalization', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('department column should not contain OU path characters', async ({ page }) => {
    await navigateToUsersPage(page);

    // Wait for table to load
    await page.waitForSelector('.table-body', { timeout: 10000 });

    // Get all department values from the table
    const departmentCells = page.locator('.table-body .col-department');
    const count = await departmentCells.count();

    console.log(`Found ${count} department cells`);

    // Check each department cell
    for (let i = 0; i < count; i++) {
      const cellText = await departmentCells.nth(i).textContent();
      if (cellText && cellText.trim()) {
        console.log(`Department: "${cellText}"`);
        // Allow "N/A" as it's a special case, but reject OU paths like "/Staff/Sales"
        if (cellText !== 'N/A') {
          // Should not start with "/" (OU path indicator)
          expect(cellText, `Department should not start with "/" but got: "${cellText}"`).not.toMatch(/^\//);
          // Should not contain multiple path segments like "/Staff/Sales"
          expect(cellText, `Department should not contain OU path but got: "${cellText}"`).not.toMatch(/\/.*\//);
        }
      }
    }
  });

  test('user slideout should show clean department name', async ({ page }) => {
    await navigateToUsersPage(page);

    // Wait for table to load
    await page.waitForSelector('.table-body .table-row', { timeout: 10000 });

    // Click on a user row to open slideout
    const firstRow = page.locator('.table-body .table-row').first();
    await firstRow.click();

    // Wait for slideout to open
    const slideout = page.locator('.user-slideout, .slideout-panel');
    await expect(slideout).toBeVisible({ timeout: 5000 });

    // Find department field in slideout
    const departmentField = slideout.locator('[class*="department"], label:has-text("Department") + *, [data-field="department"]');

    if (await departmentField.count() > 0) {
      const departmentValue = await departmentField.first().textContent();
      console.log(`Slideout department: "${departmentValue}"`);

      if (departmentValue && departmentValue.trim()) {
        expect(departmentValue, 'Department in slideout should not contain "/"').not.toContain('/');
      }
    }

    // Close slideout
    await page.keyboard.press('Escape');
  });

  test('Google Workspace users should have extracted department name', async ({ page }) => {
    await navigateToUsersPage(page);

    // Wait for table to load
    await page.waitForSelector('.table-body .table-row', { timeout: 10000 });

    // Look for a user that has Google Workspace platform icon
    const gwUsers = page.locator('.table-body .table-row:has([title*="Google"], [class*="google"])');
    const gwUserCount = await gwUsers.count();

    console.log(`Found ${gwUserCount} Google Workspace users`);

    if (gwUserCount > 0) {
      // Check department for GW users
      const gwUserDepts = gwUsers.locator('.col-department');
      for (let i = 0; i < Math.min(gwUserCount, 5); i++) {
        const deptText = await gwUserDepts.nth(i).textContent();
        if (deptText && deptText.trim()) {
          console.log(`GW user department: "${deptText}"`);
          // Should be a clean name like "Sales" not "/Staff/Sales"
          expect(deptText, 'GW user department should not start with "/"').not.toMatch(/^\//);
          expect(deptText, 'GW user department should not contain path separators').not.toMatch(/\/.*\//);
        }
      }
    }
  });
});
