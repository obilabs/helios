import { test } from '@playwright/test';

test('Debug: What is the app showing?', async ({ page }) => {
  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ BROWSER ERROR:', msg.text());
    }
  });

  // Listen for page errors
  page.on('pageerror', err => {
    console.log('❌ PAGE ERROR:', err.message);
    console.log('Stack:', err.stack);
  });

  // Don't clear cookies - use existing session if any
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: 'debug-app-state.png', fullPage: true });

  // Get page title
  const title = await page.title();
  console.log('Page title:', title);

  // Check for login form
  const emailInput = await page.locator('input[type="email"]').count();
  console.log('Email inputs found:', emailInput);

  // Check for dashboard
  const navUsers = await page.locator('[data-testid="nav-users"]').count();
  console.log('Nav users found:', navUsers);

  // Check for any error messages
  const bodyText = await page.textContent('body');
  if (bodyText.includes('Error') || bodyText.includes('error')) {
    console.log('ERROR TEXT FOUND IN BODY');
    console.log(bodyText.substring(0, 500));
  }

  // Get all visible text
  console.log('Page has content, length:', bodyText.length);
  console.log('First 200 chars:', bodyText.substring(0, 200));
});
