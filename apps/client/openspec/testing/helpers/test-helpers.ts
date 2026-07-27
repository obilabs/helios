import { Page } from '@playwright/test';

/**
 * Shared test configuration
 *
 * IMPORTANT: Test credentials must match actual database records.
 * - mike@gridworx.io has password "admin123" (verified 2025-12-19)
 * - Other users may have different passwords from seed data
 */
export const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:3001',
  testEmail: 'mike@gridworx.io',
  testPassword: 'admin123',
};

/**
 * Login helper that properly handles browser state
 * @param page Playwright page object
 */
export async function login(page: Page) {
  // First, clear any existing auth state
  await page.goto(TEST_CONFIG.baseUrl);

  // Clear localStorage and sessionStorage, but preserve the onboarding completion flag
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Skip the ViewOnboarding modal in tests
    localStorage.setItem('helios_view_onboarding_completed', 'true');
  });

  // Reload to ensure clean state
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Wait for login form to be visible (with timeout)
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });

  // Fill in login credentials
  await emailInput.fill(TEST_CONFIG.testEmail);
  await page.locator('input[type="password"]').first().fill(TEST_CONFIG.testPassword);

  // Submit the form
  await page.locator('button[type="submit"]').first().click();

  // Wait for navigation to complete
  await page.waitForLoadState('networkidle');

  // Wait a bit for React to render
  await page.waitForTimeout(1000);

  // Handle ViewOnboarding modal if it still appears
  await dismissViewOnboarding(page);
}

/**
 * Dismiss ViewOnboarding modal if present
 * @param page Playwright page object
 */
export async function dismissViewOnboarding(page: Page) {
  const onboardingModal = page.locator('.view-onboarding-overlay');
  const isVisible = await onboardingModal.isVisible().catch(() => false);

  if (isVisible) {
    // Click the close button to dismiss
    const closeButton = page.locator('.view-onboarding-close');
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Logout helper
 * @param page Playwright page object
 */
export async function logout(page: Page) {
  // Clear auth state
  await page.evaluate(() => {
    localStorage.removeItem('helios_token');
    localStorage.removeItem('helios_refresh_token');
    localStorage.removeItem('helios_organization');
    localStorage.removeItem('helios_user');
    localStorage.removeItem('helios_client_config');
  });

  // Navigate to home
  await page.goto(TEST_CONFIG.baseUrl);
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to a page using sidebar navigation
 * @param page Playwright page object
 * @param pageName Name of the page to navigate to (e.g., "Users", "Groups", "Settings")
 */
export async function navigateTo(page: Page, pageName: string) {
  const navButton = page.locator(`nav button:has-text("${pageName}")`).first();
  await navButton.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500); // Allow React to render
}

/**
 * Wait for services to be ready before running tests
 */
export async function waitForServices(): Promise<boolean> {
  const maxRetries = 10;
  const retryDelay = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Check backend health
      const healthResponse = await fetch(`${TEST_CONFIG.apiUrl}/health`);
      if (!healthResponse.ok) {
        throw new Error('Backend not healthy');
      }

      // Check frontend is serving
      const frontendResponse = await fetch(TEST_CONFIG.baseUrl);
      if (!frontendResponse.ok) {
        throw new Error('Frontend not responding');
      }

      // Check setup status
      const setupResponse = await fetch(`${TEST_CONFIG.apiUrl}/api/organization/setup/status`);
      if (!setupResponse.ok) {
        throw new Error('Setup status endpoint not responding');
      }

      console.log('✅ All services are ready');
      return true;

    } catch (err) {
      console.log(`⏳ Waiting for services (attempt ${i + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  console.error('❌ Services failed to become ready');
  return false;
}

/**
 * Take a screenshot with a descriptive name
 * @param page Playwright page object
 * @param name Screenshot name
 */
export async function takeScreenshot(page: Page, name: string) {
  const filename = name.toLowerCase().replace(/\s+/g, '-');
  await page.screenshot({
    path: `openspec/testing/reports/screenshots/${filename}.png`,
    fullPage: true
  });
}
