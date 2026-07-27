import { test, expect } from '@playwright/test';

test('Take dashboard screenshot', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3000');
  await page.fill('input[type="email"]', 'jack@gridworx.io');
  await page.fill('input[type="password"]', 'P@ssw0rd123!');
  await page.click('button[type="submit"]');

  // Wait for dashboard to load
  await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 10000 });

  // Wait a bit for everything to render
  await page.waitForTimeout(2000);

  // Take a full page screenshot
  await page.screenshot({
    path: 'openspec/testing/reports/screenshots/dashboard-updated.png',
    fullPage: true
  });

  console.log('Screenshot saved to openspec/testing/reports/screenshots/dashboard-updated.png');
});
