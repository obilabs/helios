import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('Login and navigate through app', async ({ page }) => {
  const screenshots: string[] = [];

  // Helper to take numbered screenshots
  let screenshotNum = 1;
  const takeScreenshot = async (name: string) => {
    const filename = `reports/screenshots/${screenshotNum}-${name}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    screenshots.push(filename);
    screenshotNum++;
    console.log(`📸 Screenshot: ${filename}`);
  };

  // Navigate to login page
  await page.goto('http://localhost:3000');
  await takeScreenshot('login-page');

  // Login
  await page.fill('input[type="email"], input[placeholder*="email" i]', 'testproxy@gridworx.io');
  await page.fill('input[type="password"], input[placeholder*="password" i]', 'password123');
  await takeScreenshot('login-filled');

  await page.click('button:has-text("Sign In")');

  // Wait for navigation after login
  await page.waitForTimeout(3000);
  await takeScreenshot('after-login');

  // Navigate to Users page
  try {
    await page.click('button:has-text("Users"), a:has-text("Users")');
    await page.waitForTimeout(2000);
    await takeScreenshot('users-page');

    // Check user count
    const userCountText = await page.locator('.user-count, .stat-value, .count-badge').first().textContent();
    console.log('User count from UI:', userCountText);

    // Count actual users in table
    const userRows = await page.locator('.user-row, .table-row').count();
    console.log('User rows in table:', userRows);

  } catch (error) {
    console.log('Could not navigate to Users page:', error);
    await takeScreenshot('navigation-error');
  }

  // Try to navigate to Settings
  try {
    await page.click('button:has-text("Settings"), a:has-text("Settings")');
    await page.waitForTimeout(2000);
    await takeScreenshot('settings-page');
  } catch (error) {
    console.log('Could not navigate to Settings:', error);
  }

  // Save summary
  const summary = {
    screenshots: screenshots,
    timestamp: new Date().toISOString(),
    url: 'http://localhost:3000'
  };

  fs.writeFileSync('reports/test-summary.json', JSON.stringify(summary, null, 2));
  console.log('\n✅ Test complete! Check reports/screenshots/ for all images');
});
