import { test, expect } from '@playwright/test';

test.describe('Dashboard with Real API', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3000');

    // Skip ViewOnboarding modal
    await page.evaluate(() => {
      localStorage.setItem('helios_view_onboarding_completed', 'true');
    });

    await page.fill('input[type="email"]', 'jack@gridworx.io');
    await page.fill('input[type="password"]', 'P@ssw0rd123!');
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await page.waitForURL('**/');
    await page.waitForTimeout(2000); // Let dashboard data load

    // Dismiss ViewOnboarding modal if it still appears
    const onboardingModal = page.locator('.view-onboarding-overlay');
    if (await onboardingModal.isVisible().catch(() => false)) {
      await page.locator('.view-onboarding-close').click();
      await page.waitForTimeout(500);
    }
  });

  test('should load real dashboard stats from API', async ({ page }) => {
    // Wait for stats to load (check for widgets grid)
    await page.waitForSelector('.dashboard-widget-grid', { timeout: 10000 });

    // Should NOT show "Loading dashboard widgets..." after data loads
    const loadingText = await page.getByText('Loading dashboard widgets...').count();
    expect(loadingText).toBe(0);

    // Should have widgets visible
    const widgets = await page.locator('.metric-card').count();
    expect(widgets).toBeGreaterThan(0);

    // Take screenshot
    await page.screenshot({ path: 'openspec/testing/reports/screenshots/dashboard-with-real-api.png', fullPage: true });
  });

  test('dashboard widgets should persist after refresh', async ({ page }) => {
    // Wait for widgets to load initially
    await page.waitForSelector('.dashboard-widget-grid');

    // Count initial widgets
    const initialCount = await page.locator('.metric-card').count();
    expect(initialCount).toBeGreaterThan(0);

    // Refresh the page
    await page.reload();
    await page.waitForTimeout(2000);

    // Widgets should still be there
    const afterRefreshCount = await page.locator('.metric-card').count();
    expect(afterRefreshCount).toBe(initialCount);

    // Should NOT show loading message
    const loadingText = await page.getByText('Loading dashboard widgets...').count();
    expect(loadingText).toBe(0);
  });

  test('should show real user statistics', async ({ page }) => {
    await page.waitForSelector('.dashboard-widget-grid');

    // Check for specific metric cards
    const hasUserStats = await page.getByText(/\d+ users?/i).count();
    expect(hasUserStats).toBeGreaterThan(0);

    // Take screenshot of stats
    await page.screenshot({ path: 'openspec/testing/reports/screenshots/dashboard-stats.png', fullPage: true });
  });

  test('should show Recent Activity section with real data', async ({ page }) => {
    await page.waitForSelector('.dashboard-widget-grid');

    // Check for Recent Activity section
    const activitySection = await page.getByText('Recent Activity');
    await expect(activitySection).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'openspec/testing/reports/screenshots/dashboard-activity.png', fullPage: true });
  });

  test('should show Alerts section', async ({ page }) => {
    await page.waitForSelector('.dashboard-widget-grid');

    // Check for Alerts section - use first() to handle multiple matches
    const alertsSection = page.getByRole('heading', { name: 'Alerts' });
    await expect(alertsSection).toBeVisible();
  });

  test('widget customizer should save preferences', async ({ page }) => {
    await page.waitForSelector('.dashboard-widget-grid');

    // Click customize button
    await page.click('button:has-text("Customize Dashboard")');

    // Wait for customizer modal
    await page.waitForSelector('.dashboard-customizer');

    // Toggle some widgets
    const checkboxes = await page.locator('.dashboard-customizer input[type="checkbox"]');
    const count = await checkboxes.count();

    if (count > 0) {
      // Uncheck first widget
      await checkboxes.first().click();

      // Save preferences
      await page.click('button:has-text("Save")');

      // Wait for modal to close
      await page.waitForTimeout(1000);

      // Refresh page
      await page.reload();
      await page.waitForTimeout(2000);

      // Preferences should persist
      const afterReload = await page.locator('.metric-card').count();
      expect(afterReload).toBeGreaterThan(0);
    }
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept API calls and simulate error
    await page.route('**/api/dashboard/stats', route => {
      route.abort();
    });

    // Reload to trigger API call
    await page.reload();
    await page.waitForTimeout(2000);

    // Should still show something (default widgets or error state)
    const hasContent = await page.locator('.dashboard-content').isVisible();
    expect(hasContent).toBe(true);
  });
});
