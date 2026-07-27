import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('Comprehensive Helios v1.0 Test', async ({ page }) => {
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
    console.log(`🐛 ISSUE: ${issue}`);
  };

  // 1. LOGIN
  console.log('\n=== TEST 1: LOGIN ===');
  await page.goto('http://localhost:3000');
  await takeScreenshot('login-page');

  await page.fill('input[type="email"], input[placeholder*="email" i]', 'testproxy@gridworx.io');
  await page.fill('input[type="password"], input[placeholder*="password" i]', 'password123');
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(3000);
  await takeScreenshot('after-login-dashboard');

  // 2. USERS PAGE
  console.log('\n=== TEST 2: USERS PAGE ===');
  await page.click('button:has-text("Users"), a:has-text("Users")');
  await page.waitForTimeout(2000);
  await takeScreenshot('users-page');

  // Check user count discrepancy
  const headerCount = await page.locator('.stat-value, text=/\\d+ Users/').first().textContent();
  const tableRows = await page.locator('.user-row, .table-row, tr[class*="user"]').count();
  console.log(`📊 Header shows: ${headerCount}`);
  console.log(`📊 Table has: ${tableRows} rows`);
  if (headerCount && tableRows && !headerCount.includes(String(tableRows))) {
    logIssue(`User count mismatch: Header="${headerCount}" but table has ${tableRows} rows`);
  }

  // 3. CHECK ELLIPSIS MENU
  console.log('\n=== TEST 3: ELLIPSIS MENU ===');
  try {
    const firstEllipsis = page.locator('button:has(svg), button.btn-ellipsis').first();
    if (await firstEllipsis.isVisible()) {
      await firstEllipsis.click();
      await page.waitForTimeout(1000);
      await takeScreenshot('ellipsis-menu-open');

      // Close menu by clicking elsewhere
      await page.click('body');
      await page.waitForTimeout(500);
    } else {
      logIssue('Ellipsis menu button not found on user rows');
    }
  } catch (error) {
    logIssue(`Ellipsis menu error: ${error}`);
  }

  // 4. CHECK DELETED TAB
  console.log('\n=== TEST 4: DELETED TAB ===');
  try {
    const deletedTab = page.locator('button:has-text("Deleted")');
    if (await deletedTab.isVisible()) {
      await deletedTab.click();
      await page.waitForTimeout(2000);
      await takeScreenshot('deleted-tab');

      const deletedCount = await page.locator('.user-row, .table-row').count();
      console.log(`📊 Deleted users: ${deletedCount}`);

      // Go back to All tab
      await page.click('button:has-text("All")');
      await page.waitForTimeout(1000);
    } else {
      logIssue('Deleted tab not found');
    }
  } catch (error) {
    logIssue(`Deleted tab error: ${error}`);
  }

  // 5. USER SLIDE-OUT
  console.log('\n=== TEST 5: USER SLIDE-OUT ===');
  try {
    // Click first user row
    await page.click('.user-row, .table-row');
    await page.waitForTimeout(2000);
    await takeScreenshot('user-slideout');

    // Try to go to Danger Zone tab
    const dangerTab = page.locator('button:has-text("Danger Zone")');
    if (await dangerTab.isVisible()) {
      await dangerTab.click();
      await page.waitForTimeout(1000);
      await takeScreenshot('user-slideout-danger-zone');

      // Check if Delete User button exists
      const deleteBtn = page.locator('button:has-text("Delete User")');
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await page.waitForTimeout(1500);
        await takeScreenshot('delete-modal');

        // Check if modal shows 3 options
        const modalVisible = await page.locator('.modal-overlay, .delete-modal, [role="dialog"]').isVisible();
        if (modalVisible) {
          const radioButtons = await page.locator('input[type="radio"], .delete-option').count();
          console.log(`📊 Delete options: ${radioButtons}`);
          if (radioButtons !== 3) {
            logIssue(`Expected 3 delete options, found ${radioButtons}`);
          }
        } else {
          logIssue('Delete modal did not appear (might be browser confirm instead)');
        }

        // Close modal/dialog
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Close slide-out
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (error) {
    logIssue(`User slide-out error: ${error}`);
  }

  // 6. SETTINGS PAGE
  console.log('\n=== TEST 6: SETTINGS PAGE ===');
  try {
    await page.click('button:has-text("Settings"), a:has-text("Settings")');
    await page.waitForTimeout(2000);
    await takeScreenshot('settings-page');

    // Try to access Security tab
    const securityTab = page.locator('button:has-text("Security"), a:has-text("Security")');
    if (await securityTab.isVisible()) {
      await securityTab.click();
      await page.waitForTimeout(2000);
      await takeScreenshot('settings-security');
    }
  } catch (error) {
    logIssue(`Settings page error: ${error}`);
  }

  // 7. GROUPS PAGE
  console.log('\n=== TEST 7: GROUPS PAGE ===');
  try {
    await page.click('button:has-text("Groups"), a:has-text("Groups")');
    await page.waitForTimeout(2000);
    await takeScreenshot('groups-page');
  } catch (error) {
    logIssue(`Groups page error: ${error}`);
  }

  // FINAL SUMMARY
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Screenshots taken: ${screenshotNum - 1}`);
  console.log(`Issues found: ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n🐛 ISSUES FOUND:');
    issues.forEach((issue, i) => {
      console.log(`${i + 1}. ${issue}`);
    });
  } else {
    console.log('\n✅ No issues found!');
  }

  // Save issues to file
  fs.writeFileSync('reports/issues-found.txt', issues.join('\n'));
  console.log('\n📄 Full report saved to reports/issues-found.txt');
  console.log('📸 Screenshots saved to reports/screenshots/');
  console.log('='.repeat(60));
});
