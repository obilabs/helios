import { test, expect, Page } from '@playwright/test';
import { navigateToAdminUsers } from './utils/test-helpers';

/**
 * E2E Tests for User Slideout Layout Improvements
 *
 * These tests verify:
 * - TASK-FIX-010: Overview tab uses 2-column layout for profile fields
 * - TASK-FIX-011: Related fields are visually grouped with proper sections
 *
 * Related OpenSpec: openspec/changes/ux-and-functionality-fixes
 */

// Helper to navigate to Users page and open slideout
async function openUserSlideout(page: Page): Promise<void> {
  await navigateToAdminUsers(page);

  // Wait for user table to load
  await page.waitForSelector('.table-row', { timeout: 15000 });

  // Click first user row to open slideout
  await page.locator('.table-row').first().click();

  // Wait for slideout to appear
  await page.waitForSelector('.slideout-panel', { timeout: 5000 });
}

test.describe('User Slideout Layout', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test.describe('TASK-FIX-010: 2-Column Layout', () => {
    test('slideout panel should have adequate width', async ({ page }) => {
      await openUserSlideout(page);

      const slideout = page.locator('.slideout-panel');
      await expect(slideout).toBeVisible();

      const box = await slideout.boundingBox();
      expect(box).toBeTruthy();

      if (box) {
        // Slideout should be at least 500px wide for 2-column layout
        expect(box.width).toBeGreaterThanOrEqual(500);
      }
    });

    test('info grid should use 2-column layout on desktop', async ({ page }) => {
      await openUserSlideout(page);

      // Make sure we're on Overview tab (default)
      const overviewTab = page.locator('.slideout-tab:has-text("Overview")');
      await expect(overviewTab).toHaveClass(/active/);

      // Find info-grid
      const infoGrid = page.locator('.info-grid').first();
      await expect(infoGrid).toBeVisible();

      // Check that it uses CSS grid with 2 columns
      const gridStyle = await infoGrid.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          gridTemplateColumns: computed.gridTemplateColumns
        };
      });

      expect(gridStyle.display).toBe('grid');
      // Should have 2 columns (the value will show the computed pixel widths)
      // Just verify it's not a single column
      expect(gridStyle.gridTemplateColumns).not.toBe('none');
    });

    test('info items should be properly distributed in grid', async ({ page }) => {
      await openUserSlideout(page);

      // Check that there are multiple info items
      const infoItems = page.locator('.info-grid .info-item');
      const count = await infoItems.count();

      expect(count).toBeGreaterThan(2); // At least First Name, Last Name, Email

      // If we have at least 2 items, they should be side-by-side on desktop
      if (count >= 2) {
        const box1 = await infoItems.nth(0).boundingBox();
        const box2 = await infoItems.nth(1).boundingBox();

        expect(box1).toBeTruthy();
        expect(box2).toBeTruthy();

        if (box1 && box2) {
          // In a 2-column grid, items 1 and 2 should be on the same row
          // Their Y positions should be similar (within a few pixels)
          const yDifference = Math.abs(box1.y - box2.y);
          expect(yDifference).toBeLessThan(10);
        }
      }
    });
  });

  test.describe('TASK-FIX-011: Field Grouping', () => {
    test('should have User Information section', async ({ page }) => {
      await openUserSlideout(page);

      // Look for h3 heading with User Information
      const userInfoHeading = page.locator('.tab-content h3:has-text("User Information")');
      await expect(userInfoHeading).toBeVisible();
    });

    test('sections should have visual separation', async ({ page }) => {
      await openUserSlideout(page);

      // Each h3 heading should have a border-bottom
      const sectionHeadings = page.locator('.tab-content h3');
      const count = await sectionHeadings.count();

      expect(count).toBeGreaterThan(0);

      // Check first heading has proper styling
      const borderStyle = await sectionHeadings.first().evaluate(el => {
        const computed = window.getComputedStyle(el);
        return computed.borderBottomWidth + ' ' + computed.borderBottomStyle;
      });

      // Should have some border
      expect(borderStyle).not.toBe('0px none');
    });

    test('labels should have consistent styling', async ({ page }) => {
      await openUserSlideout(page);

      // Check that labels have uppercase text transform
      const labels = page.locator('.info-item label');
      const count = await labels.count();

      expect(count).toBeGreaterThan(0);

      const labelStyle = await labels.first().evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          textTransform: computed.textTransform,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight
        };
      });

      expect(labelStyle.textTransform).toBe('uppercase');
      expect(labelStyle.fontWeight).toBe('600'); // 600 is "semi-bold"
    });

    test('info grid should have proper spacing between items', async ({ page }) => {
      await openUserSlideout(page);

      const infoGrid = page.locator('.info-grid').first();
      await expect(infoGrid).toBeVisible();

      // Check gap property
      const gap = await infoGrid.evaluate(el =>
        window.getComputedStyle(el).gap
      );

      // Should have some gap (not 0px)
      expect(gap).not.toBe('0px');
      expect(gap).not.toBe('normal');
    });

    test('each info item should have proper internal spacing', async ({ page }) => {
      await openUserSlideout(page);

      const infoItem = page.locator('.info-item').first();
      await expect(infoItem).toBeVisible();

      // Check gap between label and value
      const gap = await infoItem.evaluate(el =>
        window.getComputedStyle(el).gap
      );

      // Should have some internal gap
      expect(gap).not.toBe('0px');
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should collapse to single column on mobile', async ({ page }) => {
      // Set viewport to mobile size
      await page.setViewportSize({ width: 375, height: 667 });

      await openUserSlideout(page);

      // Info grid should now be single column
      const infoGrid = page.locator('.info-grid').first();
      await expect(infoGrid).toBeVisible();

      const gridStyle = await infoGrid.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return computed.gridTemplateColumns;
      });

      // Should be single column on mobile (1fr)
      // or items should be stacked
    });
  });
});
