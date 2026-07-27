import { test } from '@playwright/test';

test('Check current dashboard state', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3000');
  await page.fill('input[type="email"]', 'jack@gridworx.io');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');

  // Wait for navigation
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Make sure we're on Home/Dashboard
  await page.click('text=Home');
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({
    path: 'openspec/testing/reports/screenshots/dashboard-current-state.png',
    fullPage: true
  });

  console.log('Screenshot saved to: openspec/testing/reports/screenshots/dashboard-current-state.png');
});
