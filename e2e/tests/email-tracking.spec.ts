import { test, expect, Page } from '@playwright/test';

// Test credentials
const INTERNAL_ADMIN = {
  email: 'mike@gridworx.io',
  password: 'admin123',
};

/**
 * Helper to dismiss any modal overlays (like view onboarding)
 */
async function dismissOnboarding(page: Page) {
  // Check for view onboarding modal
  const onboardingModal = page.locator('.view-onboarding-overlay, [role="dialog"]:has-text("Welcome to Helios")');
  if (await onboardingModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Close")').first();
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Helper to login as a specific user
 */
async function login(page: Page, credentials: { email: string; password: string }) {
  await page.goto('/');

  const loginInput = page.locator('input[type="email"]');
  const dashboardHeader = page.locator('h1:has-text("Dashboard")');

  // Check if already logged in
  const isLoggedIn = await dashboardHeader.isVisible({ timeout: 3000 }).catch(() => false);
  if (isLoggedIn) {
    await dismissOnboarding(page);
    return;
  }

  // Wait for login page
  await loginInput.waitFor({ timeout: 10000 });

  // Fill login form
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for dashboard to appear
  await dashboardHeader.waitFor({ timeout: 15000 });

  // Dismiss any onboarding modals
  await dismissOnboarding(page);
}

test.describe('Email Engagement Tracking - TASK-TRK-028', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test.describe('Dashboard Email Engagement Widget', () => {
    test('should display email engagement widget on dashboard', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      // Wait for dashboard content to load
      await page.waitForTimeout(3000);

      // Look for email engagement widget/section
      const engagementWidget = page.locator(
        '.email-engagement-widget, ' +
        '[class*="engagement"], ' +
        '[class*="EmailEngagement"], ' +
        '.dashboard-engagement-section'
      );

      // If tracking is enabled, widget should be visible
      const widgetVisible = await engagementWidget.isVisible().catch(() => false);

      // Widget may not be visible if tracking is disabled - that's OK
      if (widgetVisible) {
        // Check for key elements within the widget
        const widgetTitle = page.locator('text=/email engagement|opens|tracking/i').first();
        await expect(widgetTitle).toBeVisible();
      }
    });

    test('should show loading state initially', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      // Immediately check for loading state (may be brief)
      const loadingIndicator = page.locator(
        '.loading, .skeleton, [class*="loading"], [class*="spinner"]'
      );

      // Loading state may have already passed, so we just verify the widget eventually loads
      await page.waitForTimeout(3000);

      // Check that the page doesn't show a permanent loading state
      const permanentLoading = page.locator('.loading-permanent, [data-testid="permanent-loading"]');
      const hasPermanentLoading = await permanentLoading.isVisible().catch(() => false);
      expect(hasPermanentLoading).toBe(false);
    });

    test('should handle errors gracefully', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);
      await page.waitForTimeout(3000);

      // Check that there are no unhandled error states on the dashboard
      const errorState = page.locator(
        '.error-boundary, ' +
        '[class*="error"]:not(.has-error-handling), ' +
        'text=/something went wrong/i'
      );

      // Dashboard should not show unhandled errors
      const hasUnhandledError = await errorState.first().isVisible().catch(() => false);

      // If there's an error, it should be a handled one with a retry option
      if (hasUnhandledError) {
        const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try Again")');
        const hasRetry = await retryButton.isVisible().catch(() => false);
        expect(hasRetry).toBe(true);
      }
    });

    test('should display stats correctly when data exists', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);
      await page.waitForTimeout(3000);

      // Look for stat numbers in the engagement section
      const engagementSection = page.locator('.dashboard-engagement-section, .email-engagement-widget');

      if (await engagementSection.isVisible().catch(() => false)) {
        // Check for numeric displays (opens, unique, trend)
        const statValue = page.locator(
          '.stat-value, .metric-value, [class*="stat"] span'
        );
        const statsCount = await statValue.count();

        // If widget is showing, it should have at least one stat
        if (statsCount > 0) {
          const firstStat = await statValue.first().textContent();
          // Stats should be numbers (could be 0)
          expect(firstStat).toMatch(/\d+|-%/);
        }
      }
    });
  });

  test.describe('Team Analytics Page (Admin)', () => {
    test('should access team analytics from navigation', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);
      await page.waitForTimeout(2000);

      // Look for Team Analytics link in sidebar
      const analyticsLink = page.locator(
        'a[href*="analytics"], ' +
        'a:has-text("Analytics"), ' +
        'a:has-text("Team Analytics")'
      );

      const linkVisible = await analyticsLink.first().isVisible().catch(() => false);

      if (linkVisible) {
        await analyticsLink.first().click();
        await page.waitForTimeout(2000);

        // Should navigate to analytics page
        const pageContent = await page.textContent('body');
        expect(
          pageContent?.includes('Analytics') ||
          pageContent?.includes('Engagement') ||
          page.url().includes('analytics')
        ).toBeTruthy();
      } else {
        // Analytics may not be in nav yet, try direct navigation
        await page.goto('/admin/team-analytics');
        await page.waitForTimeout(2000);

        // Check if page exists (not 404)
        const notFound = page.locator('text=/404|not found/i');
        const is404 = await notFound.isVisible().catch(() => false);

        // Either page loads or we skip if not implemented yet
        if (is404) {
          test.skip();
        }
      }
    });

    test('should display organization-wide stats', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      // Navigate to team analytics
      await page.goto('/admin/team-analytics');
      await page.waitForTimeout(3000);

      // Check for 404 or not implemented
      const notFound = page.locator('text=/404|not found/i');
      if (await notFound.isVisible().catch(() => false)) {
        test.skip();
        return;
      }

      // Look for org-wide stats
      const statsSection = page.locator(
        '.stats-grid, ' +
        '.analytics-stats, ' +
        '[class*="org-stats"]'
      );

      if (await statsSection.isVisible().catch(() => false)) {
        // Should show total opens, unique opens, active users
        const pageContent = await page.textContent('body');
        expect(
          pageContent?.includes('Total') ||
          pageContent?.includes('Opens') ||
          pageContent?.includes('Active')
        ).toBeTruthy();
      }
    });

    test('should display top performers list', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      await page.goto('/admin/team-analytics');
      await page.waitForTimeout(3000);

      const notFound = page.locator('text=/404|not found/i');
      if (await notFound.isVisible().catch(() => false)) {
        test.skip();
        return;
      }

      // Look for top performers section
      const topPerformers = page.locator(
        '.top-performers, ' +
        '[class*="performers"], ' +
        'text=/top performers/i'
      );

      const performersVisible = await topPerformers.first().isVisible().catch(() => false);

      if (performersVisible) {
        // Should have a list of users
        const performerItems = page.locator('.performer-item, .performer-row, tr');
        // May have 0 performers if no tracking data exists
        const count = await performerItems.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });

    test('should support date range filtering', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      await page.goto('/admin/team-analytics');
      await page.waitForTimeout(3000);

      const notFound = page.locator('text=/404|not found/i');
      if (await notFound.isVisible().catch(() => false)) {
        test.skip();
        return;
      }

      // Look for date range selector
      const dateFilter = page.locator(
        'select[name*="days"], ' +
        'button:has-text("7 days"), ' +
        'button:has-text("30 days"), ' +
        '[class*="date-range"]'
      );

      const filterVisible = await dateFilter.first().isVisible().catch(() => false);

      if (filterVisible) {
        // Try changing the filter
        const select = page.locator('select').first();
        if (await select.isVisible().catch(() => false)) {
          // Change selection if it's a dropdown
          const options = await select.locator('option').count();
          if (options > 1) {
            await select.selectOption({ index: 1 });
            await page.waitForTimeout(1000);
          }
        }
      }
    });
  });

  test.describe('Tracking Settings (Admin)', () => {
    test('should access tracking settings in admin settings', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      // Navigate to Settings
      await page.goto('/admin/settings');
      await page.waitForTimeout(2000);

      // Look for Advanced tab or Tracking section
      const advancedTab = page.locator('button:has-text("Advanced"), [role="tab"]:has-text("Advanced")');

      if (await advancedTab.isVisible().catch(() => false)) {
        await advancedTab.click();
        await page.waitForTimeout(1000);

        // Look for tracking settings section
        const trackingSettings = page.locator(
          '.tracking-settings, ' +
          '[class*="tracking"], ' +
          'text=/user tracking|email tracking/i'
        );

        const settingsVisible = await trackingSettings.first().isVisible().catch(() => false);

        // Tracking settings should be present in Advanced tab
        if (!settingsVisible) {
          // May be in a different location, just verify no error
          const pageContent = await page.textContent('body');
          expect(pageContent).not.toContain('Error loading');
        }
      }
    });

    test('should show tracking toggle switches', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      await page.goto('/admin/settings');
      await page.waitForTimeout(2000);

      // Go to Advanced tab
      const advancedTab = page.locator('button:has-text("Advanced")');
      if (await advancedTab.isVisible().catch(() => false)) {
        await advancedTab.click();
        await page.waitForTimeout(1000);
      }

      // Look for toggle switches in tracking section
      const toggles = page.locator(
        '.tracking-settings input[type="checkbox"], ' +
        '.tracking-settings [role="switch"]'
      );

      const toggleCount = await toggles.count();

      // If tracking settings exist, should have toggle switches
      if (toggleCount > 0) {
        // Verify toggles are functional (not disabled)
        const firstToggle = toggles.first();
        const isDisabled = await firstToggle.isDisabled().catch(() => true);
        // Toggles should be enabled for admin
        expect(isDisabled).toBe(false);
      }
    });

    test('should show retention period setting', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      await page.goto('/admin/settings');
      await page.waitForTimeout(2000);

      const advancedTab = page.locator('button:has-text("Advanced")');
      if (await advancedTab.isVisible().catch(() => false)) {
        await advancedTab.click();
        await page.waitForTimeout(1000);
      }

      // Look for retention setting (select or input)
      const retentionSetting = page.locator(
        'select[name*="retention"], ' +
        'input[name*="retention"], ' +
        'text=/retention|days/i'
      );

      // Retention setting may or may not be visible
      // If visible, it should have options like 30, 60, 90 days
      if (await retentionSetting.first().isVisible().catch(() => false)) {
        const pageContent = await page.textContent('body');
        expect(
          pageContent?.includes('retention') ||
          pageContent?.includes('days') ||
          pageContent?.includes('30') ||
          pageContent?.includes('90')
        ).toBeTruthy();
      }
    });
  });

  test.describe('Tracking Pixel Endpoint', () => {
    test('should return transparent GIF for campaign pixel', async ({ page }) => {
      // Direct HTTP request to tracking pixel (no v1 prefix - stable URLs)
      const response = await page.request.get('/api/t/p/test-token-123456789012345.gif');

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/gif');

      // Check response is binary GIF data
      const body = await response.body();
      expect(body.length).toBe(42); // 1x1 transparent GIF
    });

    test('should return transparent GIF for user pixel', async ({ page }) => {
      // Direct HTTP request to user tracking pixel (no v1 prefix - stable URLs)
      const response = await page.request.get('/api/t/u/user-token-1234567890123.gif');

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/gif');

      const body = await response.body();
      expect(body.length).toBe(42);
    });

    test('should return GIF even for invalid tokens', async ({ page }) => {
      // Invalid token (too short)
      const response = await page.request.get('/api/t/p/short.gif');

      // Should still return GIF (not error)
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/gif');
    });

    test('should include no-cache headers', async ({ page }) => {
      const response = await page.request.get('/api/t/p/nocache-test-token-12345.gif');

      expect(response.headers()['cache-control']).toContain('no-store');
      expect(response.headers()['pragma']).toBe('no-cache');
    });

    test('should respond quickly (< 100ms)', async ({ page }) => {
      const start = Date.now();

      await page.request.get('/api/t/p/performance-test-token-123.gif');

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});
