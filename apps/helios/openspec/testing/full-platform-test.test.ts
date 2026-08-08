import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('Full Platform Test - Desktop and Tablet', async ({ page }) => {
  let screenshotNum = 1;
  const issues: string[] = [];

  const takeScreenshot = async (name: string) => {
    const filename = `reports/screenshots/${screenshotNum}-${name}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    screenshotNum++;
    console.log(`📸 ${filename}`);
  };

  const logIssue = (issue: string) => {
    issues.push(issue);
    console.log(`🐛 ${issue}`);
  };

  // ==== DESKTOP TESTS ====
  console.log('\n' + '='.repeat(60));
  console.log('DESKTOP TESTS (1280x720)');
  console.log('='.repeat(60));

  await page.setViewportSize({ width: 1280, height: 720 });

  // Login
  await page.goto('http://localhost:3000');
  await page.fill('input[type="email"]', 'testproxy@gridworx.io');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(3000);
  await takeScreenshot('desktop-01-dashboard');

  // Test each page
  const pages = [
    { name: 'Users', selector: 'button:has-text("Users")' },
    { name: 'Groups', selector: 'button:has-text("Groups")' },
    { name: 'Org Units', selector: 'button:has-text("Org Units")' },
    { name: 'Asset Management', selector: 'button:has-text("Asset Management")' },
    { name: 'Workflows', selector: 'button:has-text("Workflows")' },
    { name: 'Templates', selector: 'button:has-text("Templates")' },
    { name: 'Reports', selector: 'button:has-text("Reports")' },
    { name: 'Analytics', selector: 'button:has-text("Analytics")' },
    { name: 'Settings', selector: 'button:has-text("Settings")' }
  ];

  for (const testPage of pages) {
    try {
      console.log(`\nTesting: ${testPage.name}`);
      await page.click(testPage.selector);
      await page.waitForTimeout(2000);
      await takeScreenshot(`desktop-${testPage.name.toLowerCase().replace(/ /g, '-')}`);

      // Check for errors on page
      const errorText = await page.locator('text=/error|something went wrong/i').count();
      if (errorText > 0) {
        const errorMsg = await page.locator('text=/error|something went wrong/i').first().textContent();
        logIssue(`${testPage.name} page shows error: ${errorMsg}`);
      }
    } catch (error) {
      logIssue(`${testPage.name} page failed to load: ${error}`);
    }
  }

  // Test Users page tabs
  console.log('\nTesting Users page tabs...');
  await page.click('button:has-text("Users")');
  await page.waitForTimeout(1000);

  const userTabs = ['Staff', 'Guests', 'Contacts'];
  for (const tab of userTabs) {
    try {
      await page.click(`button:has-text("${tab}")`);
      await page.waitForTimeout(1000);
      await takeScreenshot(`desktop-users-tab-${tab.toLowerCase()}`);
    } catch (error) {
      logIssue(`Users ${tab} tab failed: ${error}`);
    }
  }

  // Back to Staff tab
  await page.click('button:has-text("Staff")');
  await page.waitForTimeout(1000);

  // Test status tabs
  const statusTabs = ['All', 'Active', 'Pending', 'Suspended', 'Deleted'];
  for (const status of statusTabs) {
    try {
      await page.click(`button:has-text("${status}")`);
      await page.waitForTimeout(1000);
      await takeScreenshot(`desktop-users-status-${status.toLowerCase()}`);

      // Count users shown
      const userCount = await page.locator('.user-row, .table-row').count();
      console.log(`  ${status} tab: ${userCount} users`);
    } catch (error) {
      logIssue(`Status tab ${status} failed: ${error}`);
    }
  }

  // ==== TABLET TESTS ====
  console.log('\n' + '='.repeat(60));
  console.log('TABLET TESTS (768x1024)');
  console.log('='.repeat(60));

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(1000);

  // Go back to dashboard
  await page.click('button:has-text("Home")');
  await page.waitForTimeout(1000);
  await takeScreenshot('tablet-01-dashboard');

  // Test each page on tablet
  for (const testPage of pages) {
    try {
      console.log(`\nTesting ${testPage.name} (tablet)`);
      await page.click(testPage.selector);
      await page.waitForTimeout(2000);
      await takeScreenshot(`tablet-${testPage.name.toLowerCase().replace(/ /g, '-')}`);
    } catch (error) {
      logIssue(`${testPage.name} page (tablet) failed: ${error}`);
    }
  }

  // ==== SUMMARY ====
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Screenshots: ${screenshotNum - 1}`);
  console.log(`Issues: ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n🐛 ISSUES FOUND:');
    issues.forEach((issue, i) => {
      console.log(`${i + 1}. ${issue}`);
    });
  } else {
    console.log('\n✅ NO ISSUES FOUND!');
  }

  fs.writeFileSync('reports/comprehensive-issues.txt', issues.join('\n\n'));
  console.log('\n📄 Issues saved to: reports/comprehensive-issues.txt');
  console.log('📸 Screenshots saved to: reports/screenshots/');
  console.log('='.repeat(60));
});
