import { test, expect, Page, BrowserContext } from '@playwright/test';

const baseUrl = 'http://localhost:3000';
const testEmail = 'jack@gridworx.io';
const testPassword = 'password123';

test.describe('Canonical Data Model - Custom Labels', () => {
  test.beforeEach(async ({ page, context }: { page: Page; context: BrowserContext }) => {
    // Clear cookies and storage
    await context.clearCookies();
    await page.goto(baseUrl);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  /**
   * Test: Default labels are displayed
   */
  test('Default labels appear in navigation', async ({ page }) => {
    // Login
    await page.goto(baseUrl);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL(/.*/, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Wait for navigation to be visible (indicates app loaded)
    await page.waitForSelector('.nav-section', { timeout: 10000 });

    // Wait a bit for labels to load and apply
    await page.waitForTimeout(2000);

    // Verify default labels in navigation using generic selectors
    const usersNav = page.locator('.nav-item:has-text("Users")');
    await expect(usersNav).toBeVisible();

    const groupsNav = page.locator('.nav-item:has-text("Groups")');
    await expect(groupsNav).toBeVisible();

    // Org Units is now called Org Chart
    const orgChartNav = page.locator('.nav-item:has-text("Org Chart")');
    await expect(orgChartNav).toBeVisible();
  });

  /**
   * Test: Feature flags hide unavailable entities
   */
  test('Workspaces hidden when Microsoft 365 not enabled', async ({ page }) => {
    // Login
    await page.goto(baseUrl);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL(/.*/, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForSelector('.nav-section', { timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for labels to load and apply

    // Verify workspace navigation is NOT present (no M365 module)
    const workspacesNav = page.locator('[data-testid="nav-workspaces"]');
    await expect(workspacesNav).toHaveCount(0);

    console.log('✓ Workspaces correctly hidden (M365 not enabled)');
  });

  /**
   * Test: Access Groups visible when Google Workspace enabled
   */
  test('Access Groups visible when Google Workspace enabled', async ({ page }) => {
    // Listen to console logs from browser
    page.on('console', msg => {
      if (msg.text().includes('[LabelsContext]')) {
        console.log('BROWSER:', msg.text());
      }
    });

    // Login
    await page.goto(baseUrl);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL(/.*/, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForSelector('.nav-section', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Debug: Check data-labels-loaded attribute
    const labelsLoaded = await page.getAttribute('.nav-section', 'data-labels-loaded');
    console.log('Labels loaded:', labelsLoaded);

    // Debug: Fetch labels API directly to see what backend returns
    const token = await page.evaluate(() => localStorage.getItem('helios_token'));
    const apiResponse = await page.evaluate(async (authToken) => {
      const res = await fetch('/api/v1/organization/labels/with-availability', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      return await res.json();
    }, token);
    console.log('Backend API says access_group available:', apiResponse.data?.availability?.['entity.access_group']?.available);

    // Verify access groups navigation IS present (GWS enabled)
    // Check all nav items to see what's rendered
    const allNavItems = await page.locator('.nav-item').allTextContents();
    console.log('All nav items:', allNavItems);

    const groupsNav = page.locator('.nav-item:has-text("Groups")');
    const count = await groupsNav.count();
    console.log('Groups nav items found:', count);

    await expect(groupsNav).toBeVisible();

    console.log('✓ Access Groups correctly visible (GWS enabled)');
  });

  /**
   * Test: Core entities always visible
   */
  test('Core entities (Users, Org Chart) always visible', async ({ page }) => {
    // Login
    await page.goto(baseUrl);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL(/.*/, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForSelector('.nav-section', { timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for labels to load and apply

    // Core entities should always be visible
    const usersNav = page.locator('[data-testid="nav-users"]');
    await expect(usersNav).toBeVisible();

    // Org Chart is always visible (core nav)
    const orgChartNav = page.locator('[data-testid="nav-org-chart"]');
    await expect(orgChartNav).toBeVisible();

    console.log('✓ Core entities always visible regardless of modules');
  });

  /**
   * Test: Labels API returns correct data
   */
  test('Labels API returns expected structure', async ({ page }) => {
    // Login
    await page.goto(baseUrl);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard and ensure fully loaded
    await page.waitForURL(/.*/, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForSelector('.nav-section', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Get token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('helios_token'));
    expect(token).toBeTruthy();

    // Call labels API directly
    const response = await page.evaluate(async (authToken) => {
      const res = await fetch('/api/v1/organization/labels/with-availability', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      return await res.json();
    }, token);

    // Verify structure
    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty('labels');
    expect(response.data).toHaveProperty('availability');

    // Verify all canonical entities present
    expect(response.data.labels['entity.user']).toBeDefined();
    expect(response.data.labels['entity.workspace']).toBeDefined();
    expect(response.data.labels['entity.access_group']).toBeDefined();
    expect(response.data.labels['entity.policy_container']).toBeDefined();
    expect(response.data.labels['entity.device']).toBeDefined();

    // Verify label structure (singular + plural)
    expect(response.data.labels['entity.user']).toHaveProperty('singular');
    expect(response.data.labels['entity.user']).toHaveProperty('plural');

    // Verify availability based on modules
    expect(response.data.availability['entity.user'].available).toBe(true); // Core
    expect(response.data.availability['entity.access_group'].available).toBe(true); // GWS enabled
    expect(response.data.availability['entity.workspace'].available).toBe(false); // No M365

    console.log('✓ Labels API structure correct');
    console.log('✓ Availability flags correct based on modules');
  });

  /**
   * Test: Dashboard loads correctly with widgets
   */
  test('Dashboard loads with widgets', async ({ page }) => {
    // Login
    await page.goto(baseUrl);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL(/.*/, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Wait for dashboard widget grid
    await page.waitForSelector('.dashboard-widget-grid', { timeout: 10000 });

    // Verify dashboard header is present
    const dashboardTitle = page.locator('.dashboard-title');
    await expect(dashboardTitle).toBeVisible();

    // Verify some widgets loaded (may contain stats about users, groups, etc.)
    const widgetGrid = page.locator('.dashboard-widget-grid');
    await expect(widgetGrid).toBeVisible();

    console.log('✓ Dashboard loads correctly with widgets');
  });
});

test.describe('Canonical Data Model - Label Validation', () => {
  /**
   * Test: Label validation (will test once Settings UI is built)
   * For now, test via API directly
   */
  test('Label Service validates character limits', async ({ page }) => {
    // Login
    await page.goto(baseUrl);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard and token to be set
    await page.waitForURL(/.*/, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const token = await page.evaluate(() => localStorage.getItem('helios_token'));

    // Try to update with too-long label (> 30 chars)
    const response = await page.evaluate(async (authToken) => {
      const res = await fetch('/api/v1/organization/labels', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          labels: {
            'entity.user': {
              singular: 'This is a very long label that exceeds thirty characters',
              plural: 'Users'
            }
          }
        })
      });
      return await res.json();
    }, token);

    // Should fail validation
    expect(response.success).toBe(false);
    expect(response.message).toMatch(/Label must be 30 characters or less/i);

    console.log('✓ Character limit validation working');
  });

  test('Label Service prevents XSS attacks', async ({ page }) => {
    // Login
    await page.goto(baseUrl);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard and token to be set
    await page.waitForURL(/.*/, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const token = await page.evaluate(() => localStorage.getItem('helios_token'));

    // Try to inject HTML
    const response = await page.evaluate(async (authToken) => {
      const res = await fetch('/api/v1/organization/labels', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          labels: {
            'entity.user': {
              singular: '<script>alert("xss")</script>',
              plural: 'Users'
            }
          }
        })
      });
      return await res.json();
    }, token);

    // Should fail validation
    expect(response.success).toBe(false);
    expect(response.message).toMatch(/cannot contain HTML tags/i);

    console.log('✓ XSS prevention working');
  });
});
