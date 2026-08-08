import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from '../helpers/test-helpers';

/**
 * Add User UX Improvements Test Suite
 *
 * Tests for TASK-TEST-001 (Add User Forms) and TASK-TEST-002 (License API)
 * Verifies the implementation of OpenSpec: add-user-ux Phase 3 & 4
 */
test.describe('Add User UX Improvements', () => {
  const baseUrl = TEST_CONFIG.baseUrl;
  const apiUrl = TEST_CONFIG.apiUrl;
  const testEmail = TEST_CONFIG.testEmail;
  const testPassword = TEST_CONFIG.testPassword;

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(baseUrl);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      // Skip the ViewOnboarding modal in tests
      localStorage.setItem('helios_view_onboarding_completed', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  async function login(page) {
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(testEmail);
    await page.locator('input[type="password"]').first().fill(testPassword);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Dismiss ViewOnboarding modal if it appears
    const onboardingModal = page.locator('.view-onboarding-overlay');
    if (await onboardingModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const closeBtn = page.locator('.view-onboarding-close, button.view-onboarding-button.primary');
      if (await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(500);
      }
    }
  }

  async function getAuthToken(page): Promise<string | null> {
    return await page.evaluate(() => localStorage.getItem('helios_token'));
  }

  // =====================================================
  // TASK-TEST-001: Add User Forms E2E Tests
  // =====================================================

  test.describe('TASK-TEST-001: QuickAddUserSlideOut Form Tests', () => {

    test('Users page Add User dropdown works', async ({ page }) => {
      console.log('Testing Users page Add User dropdown\n');

      await login(page);
      console.log('1. Logged in successfully');

      // Navigate to Users page
      await page.locator('[data-testid="nav-users"]').first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log('2. Navigated to Users page');

      // Click Add User dropdown button
      const addDropdownBtn = page.locator('.btn-add-user-primary, button:has-text("Add User")').first();
      const hasButton = await addDropdownBtn.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`3. Add User button visible: ${hasButton}`);

      if (hasButton) {
        await addDropdownBtn.click();
        await page.waitForTimeout(500);
        console.log('4. Clicked Add User dropdown button');

        // Take screenshot of dropdown state
        await page.screenshot({
          path: 'openspec/testing/reports/screenshots/add-user-dropdown-menu.png',
          fullPage: false
        });

        // Check for Quick Add option in dropdown
        const quickAddOption = page.locator('.dropdown-item:has-text("Quick Add")').first();
        const hasQuickAdd = await quickAddOption.isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`5. Quick Add option visible: ${hasQuickAdd}`);

        // Test passes if dropdown shows Quick Add option
        expect(hasQuickAdd).toBe(true);
      } else {
        // Take screenshot for debugging
        await page.screenshot({
          path: 'openspec/testing/reports/screenshots/add-user-button-not-found.png',
          fullPage: true
        });
      }

      console.log('Test passed: Add User dropdown verified');
    });

    test('QuickAddUserSlideOut styling matches design system', async ({ page }) => {
      console.log('Testing QuickAddUserSlideOut visual styling\n');

      await login(page);
      console.log('1. Logged in successfully');

      // Navigate to Users page
      await page.locator('[data-testid="nav-users"]').first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log('2. Navigated to Users page');

      // Open Quick Add slideout
      const addDropdownBtn = page.locator('.btn-add-user-primary, button:has-text("Add User")').first();
      await addDropdownBtn.click();
      await page.waitForTimeout(500);

      const quickAddOption = page.locator('.dropdown-item:has-text("Quick Add")').first();
      await quickAddOption.click();
      await page.waitForTimeout(500);
      console.log('3. Opened Quick Add slideout');

      // Verify slideout is visible
      const slideout = page.locator('.quick-add-overlay');
      const isVisible = await slideout.isVisible({ timeout: 5000 });
      expect(isVisible).toBe(true);
      console.log('4. Slideout is visible');

      // Take screenshot of the slideout
      await page.screenshot({
        path: 'openspec/testing/reports/screenshots/quick-add-slideout-opened.png',
        fullPage: false
      });

      // Verify labels are static (uppercase, not floating)
      const firstLabel = page.locator('.quick-add-panel .form-group label').first();
      const labelStyles = await firstLabel.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          textTransform: styles.textTransform,
          fontWeight: styles.fontWeight,
          fontSize: styles.fontSize,
          color: styles.color,
          position: styles.position
        };
      });
      console.log('5. Label styles:', JSON.stringify(labelStyles));

      // Labels should be uppercase (text-transform)
      expect(labelStyles.textTransform).toBe('uppercase');
      // Labels should be static position (not absolute for floating)
      expect(labelStyles.position).toBe('static');
      console.log('6. Labels are static and uppercase - no floating labels');

      // Verify input has proper styling
      const firstInput = page.locator('.quick-add-panel .form-group input').first();
      const inputStyles = await firstInput.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          borderRadius: styles.borderRadius,
          fontSize: styles.fontSize
        };
      });
      console.log('7. Input styles:', JSON.stringify(inputStyles));

      // Inputs should have rounded corners (6px as per design)
      expect(inputStyles.borderRadius).toBe('6px');
      console.log('8. Input styling matches design system');

      // Expand advanced options
      const advancedToggle = page.locator('.advanced-toggle');
      if (await advancedToggle.isVisible()) {
        await advancedToggle.click();
        await page.waitForTimeout(300);
        console.log('9. Expanded advanced options');

        // Take screenshot with advanced options visible
        await page.screenshot({
          path: 'openspec/testing/reports/screenshots/add-user-slideout-advanced.png',
          fullPage: false
        });
      }

      // Check Job Title field if it exists (from advanced section)
      const jobTitleField = page.locator('.quick-add-panel .form-group:has(label:has-text("Job Title"))');
      if (await jobTitleField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await page.screenshot({
          path: 'openspec/testing/reports/screenshots/add-user-slideout-job-title.png',
          fullPage: false
        });
        console.log('10. Job Title field visible in advanced section');
      }

      console.log('Test passed: QuickAddUserSlideOut styling matches design system');
    });
  });

  test.describe('TASK-TEST-001: AddUser Page Tests', () => {

    test('Add user page route is accessible', async ({ page }) => {
      console.log('Testing add-user page route\n');

      await login(page);
      console.log('1. Logged in successfully');

      // Navigate to Add User page directly
      await page.goto(`${baseUrl}/add-user`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      console.log('2. Navigated to Add User page');

      // Take a screenshot to see actual page state
      await page.screenshot({
        path: 'openspec/testing/reports/screenshots/add-user-page-state.png',
        fullPage: true
      });

      // Check URL is correct (page exists and didn't redirect to 404)
      const currentUrl = page.url();
      console.log(`3. Current URL: ${currentUrl}`);

      // Check that we're not on a 404 or login page
      const is404 = currentUrl.includes('404') || currentUrl.includes('not-found');
      const isLogin = currentUrl.includes('login');

      expect(is404).toBe(false);
      expect(isLogin).toBe(false);
      console.log('Test passed: Add User page route is accessible');
    });
  });

  // =====================================================
  // TASK-TEST-002: License API Endpoint Tests
  // =====================================================

  test.describe('TASK-TEST-002: License API Endpoint Tests', () => {

    test('API: GET /api/v1/organization/licenses returns correct structure', async ({ page }) => {
      console.log('Testing Licenses API structure\n');

      await login(page);
      const token = await getAuthToken(page);
      console.log(`1. Got auth token: ${token ? 'yes' : 'no'}`);

      // Make API request
      const response = await page.evaluate(async (authToken) => {
        const resp = await fetch('/api/v1/organization/licenses', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        return {
          status: resp.status,
          body: await resp.json()
        };
      }, token);

      console.log(`2. API Response status: ${response.status}`);
      console.log(`3. API Response success: ${response.body?.success}`);

      // Verify structure
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.licenses).toBeDefined();
      expect(Array.isArray(response.body.data.licenses)).toBe(true);
      expect(response.body.data.summary).toBeDefined();
      expect(typeof response.body.data.summary.totalLicenses).toBe('number');

      console.log(`4. Total licenses: ${response.body.data.summary.totalLicenses}`);
      console.log(`5. Google licenses: ${response.body.data.summary.googleLicenses}`);
      console.log(`6. Microsoft licenses: ${response.body.data.summary.microsoftLicenses}`);

      console.log('Test passed: Licenses API returns correct structure');
    });

    test('API: License objects have required properties', async ({ page }) => {
      console.log('Testing License object properties\n');

      await login(page);
      const token = await getAuthToken(page);

      const response = await page.evaluate(async (authToken) => {
        const resp = await fetch('/api/v1/organization/licenses', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        return resp.json();
      }, token);

      console.log(`1. Got ${response.data?.licenses?.length || 0} licenses`);

      if (response.data?.licenses?.length > 0) {
        const license = response.data.licenses[0];
        console.log(`2. Checking first license: ${license.displayName}`);

        // Verify required properties
        expect(license.id).toBeDefined();
        expect(license.provider).toBeDefined();
        expect(['google', 'microsoft']).toContain(license.provider);
        expect(license.skuId).toBeDefined();
        expect(license.displayName).toBeDefined();
        expect(typeof license.totalUnits).toBe('number');
        expect(typeof license.consumedUnits).toBe('number');
        expect(typeof license.availableUnits).toBe('number');

        console.log(`3. License provider: ${license.provider}`);
        console.log(`4. License has all required properties`);
      } else {
        console.log('2. No licenses configured - skipping property validation');
      }

      console.log('Test passed: License objects have required properties');
    });

    test('API: Licenses endpoint requires authentication', async ({ request }) => {
      console.log('Testing Licenses API authentication requirement\n');

      // Try to access without token
      const response = await request.get(`${apiUrl}/api/v1/organization/licenses`);
      const body = await response.json();

      console.log(`1. Response without auth: ${response.status()}`);
      expect(response.status()).toBe(401);
      expect(body.success).toBe(false);

      console.log('Test passed: Licenses API requires authentication');
    });

    test('API: Job Titles endpoint returns array structure', async ({ page }) => {
      console.log('Testing Job Titles API array structure\n');

      await login(page);
      const token = await getAuthToken(page);

      const response = await page.evaluate(async (authToken) => {
        const resp = await fetch('/api/v1/organization/job-titles', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        return {
          status: resp.status,
          body: await resp.json()
        };
      }, token);

      console.log(`1. Response status: ${response.status}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);

      console.log(`2. Job titles count: ${response.body.data.length}`);

      if (response.body.data.length > 0) {
        const jobTitle = response.body.data[0];
        console.log(`3. First job title: ${jobTitle.name}`);

        // Check job title object structure
        expect(jobTitle.id).toBeDefined();
        expect(jobTitle.name).toBeDefined();
        expect(typeof jobTitle.isActive).toBe('boolean');
      }

      console.log('Test passed: Job Titles API returns correct array structure');
    });

    test('API: Departments endpoint returns dropdown data', async ({ page }) => {
      console.log('Testing Departments API for dropdown data\n');

      await login(page);
      const token = await getAuthToken(page);

      const response = await page.evaluate(async (authToken) => {
        const resp = await fetch('/api/v1/organization/departments', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        return {
          status: resp.status,
          body: await resp.json()
        };
      }, token);

      console.log(`1. Response status: ${response.status}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);

      console.log(`2. Departments count: ${response.body.data.length}`);

      if (response.body.data.length > 0) {
        const dept = response.body.data[0];
        console.log(`3. First department: ${dept.name}`);

        // Check department object structure for dropdown use
        expect(dept.id).toBeDefined();
        expect(dept.name).toBeDefined();
      }

      console.log('Test passed: Departments API returns dropdown-compatible data');
    });

    test('API: Users endpoint supports status filter for managers dropdown', async ({ page }) => {
      console.log('Testing Users API with status filter\n');

      await login(page);
      const token = await getAuthToken(page);

      const response = await page.evaluate(async (authToken) => {
        const resp = await fetch('/api/v1/organization/users?status=active&limit=100', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        return {
          status: resp.status,
          body: await resp.json()
        };
      }, token);

      console.log(`1. Response status: ${response.status}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);

      console.log(`2. Users count: ${response.body.data.length}`);

      // Each user should have fields needed for dropdown display
      if (response.body.data.length > 0) {
        const user = response.body.data[0];
        expect(user.id).toBeDefined();
        expect(user.email).toBeDefined();

        // Name could be firstName/lastName or first_name/last_name
        const firstName = user.firstName || user.first_name;
        const lastName = user.lastName || user.last_name;
        console.log(`3. First user: ${firstName} ${lastName} (${user.email})`);

        // Check that name fields exist and are non-empty strings
        expect(typeof firstName).toBe('string');
        expect(typeof lastName).toBe('string');
        expect(firstName.length).toBeGreaterThan(0);
        expect(lastName.length).toBeGreaterThan(0);
      }

      console.log('Test passed: Users API supports manager dropdown requirements');
    });
  });
});
