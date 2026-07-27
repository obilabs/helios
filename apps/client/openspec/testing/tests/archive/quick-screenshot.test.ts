import { test, expect } from '@playwright/test';

test('take screenshot of users page', async ({ page }) => {
  // Navigate directly to users page with a dummy token
  await page.goto('http://localhost:3000/users');

  // Wait a bit for the page to load
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ path: 'screenshots/current-users-page.png', fullPage: true });

  console.log('Screenshot saved to screenshots/current-users-page.png');
});