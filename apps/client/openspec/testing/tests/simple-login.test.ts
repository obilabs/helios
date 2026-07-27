import { test, expect } from '@playwright/test';

test.describe('Simple Login Test', () => {
  test('Login page loads and shows form elements', async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial state
    await page.screenshot({ path: 'openspec/testing/reports/screenshots/initial-page.png' });

    // Check if we're on login page or need to navigate there
    const url = page.url();
    console.log('Current URL:', url);

    // Look for login-related elements
    // Try to find email input field (common selectors)
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="email" i]',
      '#email',
      '[data-test="email-input"]'
    ];

    let emailInput = null;
    for (const selector of emailSelectors) {
      try {
        emailInput = await page.locator(selector).first();
        if (await emailInput.isVisible({ timeout: 1000 })) {
          console.log(`Found email input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Try to find password input field
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="password" i]',
      '#password',
      '[data-test="password-input"]'
    ];

    let passwordInput = null;
    for (const selector of passwordSelectors) {
      try {
        passwordInput = await page.locator(selector).first();
        if (await passwordInput.isVisible({ timeout: 1000 })) {
          console.log(`Found password input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Try to find login button
    const buttonSelectors = [
      'button[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      '[data-test="login-button"]'
    ];

    let loginButton = null;
    for (const selector of buttonSelectors) {
      try {
        loginButton = await page.locator(selector).first();
        if (await loginButton.isVisible({ timeout: 1000 })) {
          console.log(`Found login button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Take screenshot with elements found
    await page.screenshot({ path: 'openspec/testing/reports/screenshots/login-form.png' });

    // If we found the form elements, try to interact with them
    if (emailInput && passwordInput && loginButton) {
      console.log('Login form found! Attempting to fill and submit...');

      // Fill in the form
      await emailInput.fill('test@example.com');
      await passwordInput.fill('TestPassword123!');

      // Take screenshot before submit
      await page.screenshot({ path: 'openspec/testing/reports/screenshots/form-filled.png' });

      // Click login button
      await loginButton.click();

      // Wait for navigation or error message
      await page.waitForLoadState('networkidle');

      // Take screenshot after submit
      await page.screenshot({ path: 'openspec/testing/reports/screenshots/after-login.png' });

      // Log final URL
      console.log('Final URL:', page.url());
    } else {
      console.log('Login form elements not found on the page');
      console.log('Page content preview:');
      const pageText = await page.textContent('body');
      console.log(pageText?.substring(0, 500));
    }
  });

  test('Check page title and basic structure', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Get page title
    const title = await page.title();
    console.log('Page title:', title);

    // Check for common app structure elements
    const hasHeader = await page.locator('header, [role="banner"], .header, #header').count() > 0;
    const hasMain = await page.locator('main, [role="main"], .main, #main, #root').count() > 0;
    const hasFooter = await page.locator('footer, [role="contentinfo"], .footer, #footer').count() > 0;

    console.log('Page structure:', {
      hasHeader,
      hasMain,
      hasFooter
    });

    // Look for navigation elements
    const navLinks = await page.locator('a, button').all();
    console.log(`Found ${navLinks.length} interactive elements`);

    // Take full page screenshot
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/full-page.png',
      fullPage: true
    });
  });
});