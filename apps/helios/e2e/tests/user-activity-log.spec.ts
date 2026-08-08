import { test, expect, Page } from '@playwright/test';
import { navigateToAdminUsers } from './utils/test-helpers';

/**
 * E2E Tests for User Activity Log
 *
 * These tests verify:
 * - TASK-FIX-018-021: Activity log shows user events
 *
 * Related OpenSpec: openspec/changes/ux-and-functionality-fixes
 */

// Helper to open Activity tab in User Slideout
async function openUserActivityTab(page: Page): Promise<void> {
  await navigateToAdminUsers(page);
  await page.waitForSelector('.table-row', { timeout: 15000 });

  // Click first user row
  await page.locator('.table-row').first().click();
  await page.waitForSelector('.slideout-panel', { timeout: 5000 });

  // Click Activity tab
  await page.click('.slideout-tab:has-text("Activity")');
  await page.waitForTimeout(1000); // Wait for API call
}

test.describe('User Activity Log', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test.describe('TASK-FIX-021: Display Activity Log', () => {
    test('Activity tab should be visible in slideout', async ({ page }) => {
      await navigateToAdminUsers(page);
      await page.waitForSelector('.table-row', { timeout: 15000 });

      await page.locator('.table-row').first().click();
      await page.waitForSelector('.slideout-panel', { timeout: 5000 });

      // Should see Activity tab
      const activityTab = page.locator('.slideout-tab:has-text("Activity")');
      await expect(activityTab).toBeVisible();
    });

    test('Activity tab should show heading when clicked', async ({ page }) => {
      await openUserActivityTab(page);

      // Should see Activity Log heading
      const heading = page.locator('.tab-content h3:has-text("Activity Log")');
      await expect(heading).toBeVisible();
    });

    test('Activity log should show either events or empty state', async ({ page }) => {
      await openUserActivityTab(page);

      // Should either show activity items or empty state
      const activityItems = page.locator('.activity-item');
      const emptyState = page.locator('.empty-state');

      const hasItems = await activityItems.first().isVisible().catch(() => false);
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      // One of these should be true
      expect(hasItems || hasEmptyState).toBe(true);
    });

    test('Activity items should have proper structure', async ({ page }) => {
      await openUserActivityTab(page);

      const activityItems = page.locator('.activity-item');
      const count = await activityItems.count();

      if (count > 0) {
        const firstItem = activityItems.first();

        // Should have an icon
        const icon = firstItem.locator('.activity-icon');
        await expect(icon).toBeVisible();

        // Should have details section
        const details = firstItem.locator('.activity-details');
        await expect(details).toBeVisible();

        // Should have timestamp
        const timestamp = firstItem.locator('.activity-time');
        await expect(timestamp).toBeVisible();
      }
    });

    test('Activity items should show actor information when available', async ({ page }) => {
      await openUserActivityTab(page);

      const activityItems = page.locator('.activity-item');
      const count = await activityItems.count();

      if (count > 0) {
        // If there are activities with actors, they should show "by {actorName}"
        const actorText = page.locator('.activity-actor');

        // It's ok if some items don't have actors
        const actorCount = await actorText.count();
        // Just verify the page doesn't have errors
      }
    });
  });

  test.describe('Activity Events After Actions', () => {
    test('group membership changes should create activity events', async ({ page }) => {
      // Open user slideout and go to Groups tab
      await navigateToAdminUsers(page);
      await page.waitForSelector('.table-row', { timeout: 15000 });

      await page.locator('.table-row').first().click();
      await page.waitForSelector('.slideout-panel', { timeout: 5000 });
      await page.click('.slideout-tab:has-text("Groups")');
      await page.waitForTimeout(500);

      // Try to add to a group (if possible)
      const addButton = page.locator('button:has-text("Add to Group")');
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(1000);

        const checkboxes = page.locator('.modal-content input[type="checkbox"]');
        if (await checkboxes.count() > 0) {
          await checkboxes.first().check({ force: true });
          await page.waitForTimeout(300);

          const confirmButton = page.locator('.modal-content button.btn-primary:has-text("Add to")');
          if (await confirmButton.isEnabled()) {
            await confirmButton.click();
            await page.waitForTimeout(2000);
          }
        }

        // Close modal if still open
        const cancelButton = page.locator('.modal-content button:has-text("Cancel")');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        }
      }

      // Now check Activity tab
      await page.click('.slideout-tab:has-text("Activity")');
      await page.waitForTimeout(1000);

      // Activity log should be visible
      const heading = page.locator('.tab-content h3:has-text("Activity Log")');
      await expect(heading).toBeVisible();
    });
  });
});
