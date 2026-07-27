import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'jack@gridworx.io';
const TEST_PASSWORD = 'P@ssw0rd123!';

test('Debug login flow', async ({ page }) => {
  // Enable console logs
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

  console.log('Navigating to', BASE_URL);
  await page.goto(BASE_URL);

  // Take screenshot of initial page
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/1-initial-page.png', fullPage: true });

  console.log('Current URL:', page.url());

  // Wait a bit for page to load
  await page.waitForTimeout(2000);

  // Check what's on the page
  const pageText = await page.textContent('body');
  console.log('Page contains:', pageText?.substring(0, 200));

  // Look for login form
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button[type="submit"]');

  console.log('Email input visible:', await emailInput.isVisible().catch(() => false));
  console.log('Password input visible:', await passwordInput.isVisible().catch(() => false));
  console.log('Submit button visible:', await submitButton.isVisible().catch(() => false));

  // If login form is not visible, check if we need to go to /login
  if (!await emailInput.isVisible().catch(() => false)) {
    console.log('Login form not visible, trying /login');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'openspec/testing/reports/screenshots/2-login-page.png', fullPage: true });
  }

  // Fill login form
  console.log('Filling email:', TEST_EMAIL);
  await emailInput.fill(TEST_EMAIL);

  console.log('Filling password');
  await passwordInput.fill(TEST_PASSWORD);

  await page.screenshot({ path: 'openspec/testing/reports/screenshots/3-filled-form.png', fullPage: true });

  console.log('Clicking submit');
  await submitButton.click();

  // Wait for navigation
  console.log('Waiting for navigation...');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'openspec/testing/reports/screenshots/4-after-submit.png', fullPage: true });

  console.log('Final URL:', page.url());

  const finalText = await page.textContent('body');
  console.log('Final page contains:', finalText?.substring(0, 200));

  // Check if we're on dashboard
  if (page.url().includes('/dashboard')) {
    console.log('✅ Successfully logged in!');
  } else {
    console.log('❌ Not on dashboard page');

    // Check for error messages
    const errorElement = page.locator('.error, .alert, [role="alert"]');
    if (await errorElement.isVisible().catch(() => false)) {
      const errorText = await errorElement.textContent();
      console.log('Error message:', errorText);
    }
  }
});
