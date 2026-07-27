import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth.helper';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import { DatabaseHelper } from '../helpers/database.helper';

test.describe('Authentication Flow', () => {
  let authHelper: AuthHelper;
  let screenshotHelper: ScreenshotHelper;
  let dbHelper: DatabaseHelper;

  test.beforeAll(async () => {
    authHelper = new AuthHelper();
    screenshotHelper = new ScreenshotHelper('authentication');
    dbHelper = new DatabaseHelper();

    // Seed database with test data
    await dbHelper.seed('authentication');
  });

  test.afterAll(async () => {
    await dbHelper.cleanup();
    await dbHelper.disconnect();
  });

  test('Admin user can login successfully', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Take screenshot of login page
    await screenshotHelper.capture(page, 'login-page');

    // Login as admin
    await authHelper.loginAsAdmin(page);

    // Verify successful login
    expect(page.url()).toContain('/dashboard');

    // Take screenshot of dashboard
    await screenshotHelper.capture(page, 'admin-dashboard');

    // Verify user menu is visible
    const userMenu = page.locator('[data-test="user-menu"]');
    await expect(userMenu).toBeVisible();
  });

  test('Invalid credentials show error message', async ({ page }) => {
    await page.goto('/login');

    // Enter invalid credentials
    await page.fill('[data-test="email-input"]', 'invalid@example.com');
    await page.fill('[data-test="password-input"]', 'wrongpassword');

    // Submit form
    await page.click('[data-test="login-button"]');

    // Verify error message
    const errorMessage = page.locator('[data-test="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Invalid email or password');

    // Screenshot of error state
    await screenshotHelper.capture(page, 'login-error');
  });

  test('Password reset flow works', async ({ page }) => {
    await page.goto('/login');

    // Click forgot password
    await page.click('[data-test="forgot-password-link"]');

    // Verify redirect to reset page
    await expect(page).toHaveURL(/.*\/forgot-password/);

    // Enter email for reset
    await page.fill('[data-test="reset-email-input"]', 'admin@test.helios.local');
    await page.click('[data-test="reset-password-button"]');

    // Verify success message
    const successMessage = page.locator('[data-test="reset-email-sent"]');
    await expect(successMessage).toBeVisible();

    // Screenshot of success state
    await screenshotHelper.capture(page, 'password-reset-success');
  });

  test('Session expires after timeout', async ({ page, context }) => {
    // Login first
    await authHelper.loginAsAdmin(page);

    // Manually set expired token
    await page.evaluate(() => {
      const expiredToken = 'expired.jwt.token';
      localStorage.setItem('token', expiredToken);
    });

    // Try to access protected route
    await page.goto('/settings');

    // Should redirect to login
    await expect(page).toHaveURL(/.*\/login/);

    // Verify session expired message
    const message = page.locator('[data-test="session-expired"]');
    await expect(message).toBeVisible();
  });

  test('Logout clears session', async ({ page }) => {
    // Login first
    await authHelper.loginAsAdmin(page);

    // Verify logged in
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Logout
    await authHelper.logout(page);

    // Verify redirected to login
    await expect(page).toHaveURL(/.*\/login/);

    // Try to access protected route
    await page.goto('/dashboard');

    // Should redirect back to login
    await expect(page).toHaveURL(/.*\/login/);
  });
});