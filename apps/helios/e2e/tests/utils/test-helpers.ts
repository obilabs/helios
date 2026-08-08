import { Page } from '@playwright/test';

// Test fixtures
export const TEST_CREDENTIALS = {
  email: 'mike@gridworx.io',
  password: 'admin123',
};

/**
 * Mark the view onboarding as already completed.
 * This prevents the onboarding modal from appearing during tests.
 */
export async function skipViewOnboarding(page: Page): Promise<void> {
  // Navigate to the origin first if needed
  const currentUrl = page.url();
  if (!currentUrl.includes('localhost')) {
    await page.goto('/');
  }
  // Set localStorage before any interaction
  await page.evaluate(() => {
    localStorage.setItem('helios_view_onboarding_completed', 'true');
  });
}

/**
 * Dismiss the ViewOnboarding modal if present.
 * This modal appears for internal admins on first login to let them choose their default view.
 */
export async function dismissViewOnboarding(page: Page): Promise<void> {
  // Wait a moment for the modal to potentially appear after login
  await page.waitForTimeout(500);

  const onboardingModal = page.locator('.view-onboarding-overlay');

  // Check if modal is visible (it might not render at all if localStorage says onboarding is complete)
  const isVisible = await onboardingModal.isVisible().catch(() => false);

  if (isVisible) {
    // Try clicking the continue button
    const continueBtn = page.locator('.view-onboarding-button.primary');
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click();
      await onboardingModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
        // If waitFor fails, try force clicking the close button
      });
    }

    // If still visible, try the close button (X)
    if (await onboardingModal.isVisible().catch(() => false)) {
      const closeBtn = page.locator('.view-onboarding-close');
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await onboardingModal.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      }
    }
  }
}

/**
 * Login to the application and wait for dashboard.
 * Pre-sets localStorage to skip onboarding modal and use admin view for consistent test behavior.
 * If already logged in (session exists), just navigates to dashboard without re-logging in.
 */
export async function login(page: Page, email?: string, password?: string): Promise<void> {
  // Navigate to the site first to set localStorage (must be same origin)
  await page.goto('/');

  // Pre-set localStorage to skip the view onboarding modal and default to admin view
  await page.evaluate(() => {
    localStorage.setItem('helios_view_onboarding_completed', 'true');
    localStorage.setItem('helios_view_preference', 'admin');
  });

  // Wait for page to stabilize after navigation
  await page.waitForTimeout(500);

  // Check if login form is visible - this is the most reliable way to detect login state
  const emailInputVisible = await page.locator('input[type="email"]').isVisible({ timeout: 2000 }).catch(() => false);

  if (!emailInputVisible) {
    // No login form visible - user is already logged in
    await dismissViewOnboarding(page);
    return;
  }

  // We're on the login page - proceed with login

  // Fill login form
  await page.fill('input[type="email"]', email || TEST_CREDENTIALS.email);
  await page.fill('input[type="password"]', password || TEST_CREDENTIALS.password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for navigation away from login page - wait for login form to disappear
  // This is more reliable than URL matching since the post-login URL varies
  await page.waitForSelector('input[type="email"]', { state: 'hidden', timeout: 15000 }).catch(() => {
    // If selector timeout, check if we're no longer on login by another method
  });

  // Wait a moment for page to stabilize
  await page.waitForTimeout(500);

  // Extra safety: dismiss any modal that might still appear
  await dismissViewOnboarding(page);
}

/**
 * Login and navigate to a specific page.
 * Automatically dismisses ViewOnboarding modal if present.
 */
export async function loginAndNavigateTo(
  page: Page,
  selector: string,
  waitForSelector: string,
  email?: string,
  password?: string
): Promise<void> {
  await login(page, email, password);

  // Navigate to the target page
  await page.click(selector);

  // Wait for the page to load
  await page.waitForSelector(waitForSelector, { timeout: 15000 });
}

/**
 * Login as admin and navigate directly to an admin page URL.
 * Use this for tests that require admin functionality.
 */
export async function loginAsAdminAndGoTo(
  page: Page,
  path: string,
  waitForSelector?: string,
  email?: string,
  password?: string
): Promise<void> {
  await login(page, email, password);

  // Navigate directly to the admin page
  await page.goto(path);

  // Wait for the page to load if selector provided
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout: 15000 });
  }
}

/**
 * Navigate to admin Users page after login.
 */
export async function navigateToAdminUsers(page: Page): Promise<void> {
  await login(page);

  // Navigate to Users using the navigation button with data-testid
  const usersNavButton = page.locator('[data-testid="nav-users"]');

  // Check if we can see the admin navigation
  const isVisible = await usersNavButton.isVisible({ timeout: 3000 }).catch(() => false);

  if (isVisible) {
    await usersNavButton.click();
  } else {
    // Fallback: navigate directly via URL
    await page.goto('/admin/users');
  }

  // Wait for the users page to load
  await page.waitForSelector('.users-page, [data-testid="users-page"]', { timeout: 15000 });
}
