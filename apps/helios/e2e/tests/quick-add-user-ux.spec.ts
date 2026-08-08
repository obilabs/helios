import { test, expect, Page } from '@playwright/test';
import { navigateToAdminUsers } from './utils/test-helpers';

/**
 * E2E Tests for QuickAddUserSlideOut UX Alignment
 *
 * These tests verify that the Quick Add User slideout is visually aligned
 * with the UserSlideOut component (design system consistency).
 *
 * Related OpenSpec: openspec/changes/quick-add-ux-refactor
 */

// Helper to navigate to Users page and open Quick Add slideout
async function openQuickAddSlideout(page: Page): Promise<void> {
  await navigateToAdminUsers(page);

  // Click "Add User" dropdown button
  const addUserButton = page.locator('.btn-add-user-primary');
  await expect(addUserButton).toBeVisible({ timeout: 5000 });
  await addUserButton.click();

  // Wait for dropdown menu to appear
  await page.waitForSelector('.add-dropdown-menu', { timeout: 3000 });

  // Click "Quick Add" option in the dropdown
  const quickAddOption = page.locator('.dropdown-item:has-text("Quick Add")');
  await quickAddOption.click();

  // Wait for slideout to appear
  await page.waitForSelector('.quick-add-panel', { timeout: 5000 });
}

test.describe('Quick Add User UX Alignment', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test.describe('TASK-TEST-001: Labels are static and aligned top-left', () => {
    test('should display labels above inputs (not floating)', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Check that labels are visible and positioned above inputs
      const formGroups = page.locator('.quick-add-panel .form-group');
      const formGroupCount = await formGroups.count();
      expect(formGroupCount).toBeGreaterThan(0);

      // Verify first form group structure: label comes before input
      const firstGroup = formGroups.first();
      const label = firstGroup.locator('label');
      const input = firstGroup.locator('input, select');

      await expect(label).toBeVisible();
      await expect(input).toBeVisible();

      // Verify label is positioned above input by checking DOM order
      // In standard label+input structure, label appears first in the DOM
      const labelBox = await label.boundingBox();
      const inputBox = await input.boundingBox();

      expect(labelBox).toBeTruthy();
      expect(inputBox).toBeTruthy();

      if (labelBox && inputBox) {
        // Label should be above input (lower y value)
        expect(labelBox.y).toBeLessThan(inputBox.y);
      }
    });

    test('should not have floating label behavior on focus', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Get the Work Email label's initial position (use first() to get primary email field)
      const emailLabel = page.locator('.quick-add-panel .form-group label').filter({ hasText: /Work Email/ }).first();
      const emailInput = page.locator('.quick-add-panel input[type="email"]').first();

      await expect(emailLabel).toBeVisible();
      await expect(emailInput).toBeVisible();

      const labelBoxBefore = await emailLabel.boundingBox();

      // Focus the input
      await emailInput.focus();
      await page.waitForTimeout(100); // Wait for any animations

      const labelBoxAfter = await emailLabel.boundingBox();

      // Label Y position should NOT change on focus (no floating behavior)
      // We only check Y position as that's what floating labels animate
      expect(labelBoxBefore?.y).toEqual(labelBoxAfter?.y);
    });

    test('labels should have uppercase styling', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Get a form field label (not a section header)
      const label = page.locator('.quick-add-panel .form-group > label').first();
      await expect(label).toBeVisible();

      // Check that label has uppercase text-transform
      const textTransform = await label.evaluate(el =>
        window.getComputedStyle(el).textTransform
      );
      expect(textTransform).toBe('uppercase');
    });

    test('labels should have subdued gray color', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Get a form field label (not a section header)
      const label = page.locator('.quick-add-panel .form-group > label').first();
      await expect(label).toBeVisible();

      // Check label color - should be a subdued gray (not black or white)
      // Accept #6b7280 (rgb(107, 114, 128)) or #374151 (rgb(55, 65, 81))
      const color = await label.evaluate(el =>
        window.getComputedStyle(el).color
      );
      // Parse RGB values and verify it's a gray shade (not primary color)
      const rgbMatch = color.match(/rgb\((\d+), (\d+), (\d+)\)/);
      expect(rgbMatch).toBeTruthy();
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch.map(Number);
        // Should be a gray (R, G, B within ~20 of each other)
        expect(Math.abs(r - g)).toBeLessThan(30);
        expect(Math.abs(g - b)).toBeLessThan(30);
        // Should be darker than white but lighter than black
        expect(r).toBeGreaterThan(30);
        expect(r).toBeLessThan(200);
      }
    });
  });

  test.describe('TASK-TEST-002: Input fields match UserSlideOut styling', () => {
    test('input fields should have consistent border radius', async ({ page }) => {
      await openQuickAddSlideout(page);

      const input = page.locator('.quick-add-panel input[type="email"]').first();
      await expect(input).toBeVisible();

      const borderRadius = await input.evaluate(el =>
        window.getComputedStyle(el).borderRadius
      );
      // Should be 6px (0.375rem or similar)
      expect(borderRadius).toBe('6px');
    });

    test('input fields should have correct border color', async ({ page }) => {
      await openQuickAddSlideout(page);

      const input = page.locator('.quick-add-panel input[type="email"]').first();
      await expect(input).toBeVisible();

      const borderColor = await input.evaluate(el =>
        window.getComputedStyle(el).borderColor
      );
      // Should be #d1d5db (rgb(209, 213, 219))
      expect(borderColor).toBe('rgb(209, 213, 219)');
    });

    test('input fields should have consistent padding', async ({ page }) => {
      await openQuickAddSlideout(page);

      const input = page.locator('.quick-add-panel .form-group input[type="text"]').first();
      await expect(input).toBeVisible();

      const padding = await input.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          top: style.paddingTop,
          right: style.paddingRight,
          bottom: style.paddingBottom,
          left: style.paddingLeft
        };
      });

      // Padding should be ~10px (0.625rem)
      // Allow for input-with-icon having left padding for the icon
      expect(parseFloat(padding.top)).toBeCloseTo(10, 1);
      expect(parseFloat(padding.bottom)).toBeCloseTo(10, 1);
    });

    test('select elements should have same styling as inputs', async ({ page }) => {
      await openQuickAddSlideout(page);

      const select = page.locator('.quick-add-panel select').first();
      await expect(select).toBeVisible();

      const borderRadius = await select.evaluate(el =>
        window.getComputedStyle(el).borderRadius
      );
      expect(borderRadius).toBe('6px');

      const borderColor = await select.evaluate(el =>
        window.getComputedStyle(el).borderColor
      );
      expect(borderColor).toBe('rgb(209, 213, 219)');
    });

    test('input focus state should show primary color border', async ({ page }) => {
      await openQuickAddSlideout(page);

      const input = page.locator('.quick-add-panel input[type="email"]').first();
      await expect(input).toBeVisible();

      // Focus the input
      await input.focus();
      await page.waitForTimeout(50);

      // Border should change to theme primary color on focus
      const borderColor = await input.evaluate(el =>
        window.getComputedStyle(el).borderColor
      );

      // Primary color is #8b5cf6 (rgb(139, 92, 246)) per design system
      // But CSS uses var(--theme-primary) which could vary
      // Just verify it's not the default border color
      expect(borderColor).not.toBe('rgb(209, 213, 219)');
    });
  });

  test.describe('TASK-TEST-003: Validation errors display correctly', () => {
    test('should show error text below input when validation fails', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Try to submit empty form
      const createButton = page.locator('.quick-add-footer button:has-text("Create User")');
      await createButton.click();

      // Wait for validation
      await page.waitForTimeout(100);

      // Error text should be visible below Email field
      const errorText = page.locator('.quick-add-panel .error-text').first();
      await expect(errorText).toBeVisible();
    });

    test('error text should have correct color (#ef4444)', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Trigger validation by submitting empty form
      const createButton = page.locator('.quick-add-footer button:has-text("Create User")');
      await createButton.click();

      await page.waitForTimeout(100);

      const errorText = page.locator('.quick-add-panel .error-text').first();
      await expect(errorText).toBeVisible();

      const color = await errorText.evaluate(el =>
        window.getComputedStyle(el).color
      );
      // Should be #ef4444 (rgb(239, 68, 68))
      expect(color).toBe('rgb(239, 68, 68)');
    });

    test('input with error should have error class applied', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Submit empty form to trigger validation
      const createButton = page.locator('.quick-add-footer button:has-text("Create User")');
      await createButton.click();

      await page.waitForTimeout(200);

      // Email input should have error class applied
      const emailInput = page.locator('.quick-add-panel input[type="email"]').first();
      await expect(emailInput).toHaveClass(/error/);
    });

    test('error should clear when user starts typing', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Trigger validation error
      const createButton = page.locator('.quick-add-footer button:has-text("Create User")');
      await createButton.click();
      await page.waitForTimeout(100);

      const emailInput = page.locator('.quick-add-panel input[type="email"]').first();
      await expect(emailInput).toHaveClass(/error/);

      // Start typing in the email field
      await emailInput.fill('test@example.com');

      // Error class should be removed
      await expect(emailInput).not.toHaveClass(/error/);
    });
  });

  test.describe('Provider Section Styling', () => {
    test('provider checkboxes should have card styling', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Provider section may only be visible if integrations are enabled
      const providerCheckbox = page.locator('.quick-add-panel .provider-checkbox');
      const hasProviders = await providerCheckbox.count() > 0;

      if (hasProviders) {
        await expect(providerCheckbox.first()).toBeVisible();

        // Should have card-like styling with padding and border
        const padding = await providerCheckbox.first().evaluate(el =>
          window.getComputedStyle(el).padding
        );
        expect(parseFloat(padding)).toBeGreaterThan(0);

        const border = await providerCheckbox.first().evaluate(el =>
          window.getComputedStyle(el).border
        );
        expect(border).toContain('1px');
      }
    });

    test('provider icons should be properly sized', async ({ page }) => {
      await openQuickAddSlideout(page);

      const providerIcon = page.locator('.quick-add-panel .provider-icon');
      const hasProviders = await providerIcon.count() > 0;

      if (hasProviders) {
        await expect(providerIcon.first()).toBeVisible();

        // Provider icons should be 48x48 like in UserSlideOut platform cards
        const size = await providerIcon.first().evaluate(el => {
          const style = window.getComputedStyle(el);
          return {
            width: style.width,
            height: style.height
          };
        });

        expect(size.width).toBe('48px');
        expect(size.height).toBe('48px');
      }
    });
  });

  test.describe('Section Headers', () => {
    test('section headers should have bottom border', async ({ page }) => {
      await openQuickAddSlideout(page);

      const sectionHeader = page.locator('.quick-add-panel .form-section h3').first();
      await expect(sectionHeader).toBeVisible();

      const borderBottom = await sectionHeader.evaluate(el =>
        window.getComputedStyle(el).borderBottom
      );

      // Should have primary color border (2px solid)
      expect(borderBottom).toContain('2px');
    });

    test('section headers should have correct font styling', async ({ page }) => {
      await openQuickAddSlideout(page);

      const sectionHeader = page.locator('.quick-add-panel .form-section h3').first();
      await expect(sectionHeader).toBeVisible();

      const fontSize = await sectionHeader.evaluate(el =>
        window.getComputedStyle(el).fontSize
      );
      // Should be 1.125rem (16-18px depending on base font size)
      const fontSizeNum = parseFloat(fontSize);
      expect(fontSizeNum).toBeGreaterThanOrEqual(16);
      expect(fontSizeNum).toBeLessThanOrEqual(20);

      const fontWeight = await sectionHeader.evaluate(el =>
        window.getComputedStyle(el).fontWeight
      );
      expect(fontWeight).toBe('600');
    });
  });

  test.describe('Form Layout', () => {
    test('two-column layout should have proper gap', async ({ page }) => {
      await openQuickAddSlideout(page);

      const twoColRow = page.locator('.quick-add-panel .form-row.two-col').first();
      await expect(twoColRow).toBeVisible();

      const gap = await twoColRow.evaluate(el =>
        window.getComputedStyle(el).gap
      );
      // Should be 1.5rem (24px)
      expect(gap).toBe('24px');
    });

    test('form sections should have bottom margin', async ({ page }) => {
      await openQuickAddSlideout(page);

      const formSection = page.locator('.quick-add-panel .form-section').first();
      await expect(formSection).toBeVisible();

      const marginBottom = await formSection.evaluate(el =>
        window.getComputedStyle(el).marginBottom
      );
      // Should be 2rem (32px)
      expect(marginBottom).toBe('32px');
    });
  });

  test.describe('Slideout Panel Basics', () => {
    test('should open Quick Add slideout', async ({ page }) => {
      await openQuickAddSlideout(page);

      const panel = page.locator('.quick-add-panel');
      await expect(panel).toBeVisible();
    });

    test('should have header with title', async ({ page }) => {
      await openQuickAddSlideout(page);

      const header = page.locator('.quick-add-header');
      await expect(header).toBeVisible();

      const title = header.locator('h2:has-text("Add New User")');
      await expect(title).toBeVisible();
    });

    test('should close when clicking X button', async ({ page }) => {
      await openQuickAddSlideout(page);

      const closeButton = page.locator('.quick-add-panel .close-btn');
      await closeButton.click();

      await expect(page.locator('.quick-add-panel')).not.toBeVisible();
    });

    test('should close when clicking overlay', async ({ page }) => {
      await openQuickAddSlideout(page);

      // Click on the overlay (outside the panel)
      await page.locator('.quick-add-overlay').click({ position: { x: 10, y: 300 } });

      await expect(page.locator('.quick-add-panel')).not.toBeVisible();
    });
  });
});
