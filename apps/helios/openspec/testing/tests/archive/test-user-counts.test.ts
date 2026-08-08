import { test, expect } from '@playwright/test';

test('user counts and status display correctly', async ({ page }) => {
  // Navigate to login page
  await page.goto('http://localhost:3000/login');

  // Login
  await page.fill('input[type="email"]', 'testproxy@gridworx.io');
  await page.fill('input[type="password"]', 'test123');
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await page.waitForURL('**/dashboard');

  // Navigate to Users page
  await page.click('text=Users');
  await page.waitForURL('**/users');

  // Check tab label is "Users" not "Staff"
  await expect(page.locator('button').filter({ hasText: /^Users$/ })).toBeVisible();

  // Check status badges
  const allBadge = page.locator('button').filter({ hasText: /^All/ }).first();
  const activeBadge = page.locator('button').filter({ hasText: /^Active/ }).first();
  const pendingBadge = page.locator('button').filter({ hasText: /^Pending/ }).first();
  const deletedBadge = page.locator('button').filter({ hasText: /^Deleted/ }).first();

  // Get badge texts
  const allText = await allBadge.textContent();
  const activeText = await activeBadge.textContent();
  const pendingText = await pendingBadge.textContent();
  const deletedText = await deletedBadge.textContent();

  console.log('Badge counts:');
  console.log('  All:', allText);
  console.log('  Active:', activeText);
  console.log('  Pending:', pendingText);
  console.log('  Deleted:', deletedText);

  // Check status indicators on pending users
  await page.click('button:has-text("Pending")');
  await page.waitForTimeout(500);

  // Look for indigo and jack - they should show "Pending" status
  const userRows = page.locator('.table-row');
  const rowCount = await userRows.count();

  console.log('\nPending tab users:');
  for (let i = 0; i < rowCount; i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const status = await row.locator('.status-indicator').textContent();
    console.log(`  ${email}: ${status}`);

    // Check that pending users show Pending status, not Active
    if (email?.includes('indigo') || email?.includes('jack')) {
      await expect(row.locator('.status-indicator')).toContainText('Pending');
    }
  }

  // Take screenshots
  await page.screenshot({ path: 'screenshots/fixed-users-pending-tab.png', fullPage: true });

  // Switch to All tab
  await page.click('button:has-text("All")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/fixed-users-all-tab.png', fullPage: true });

  // Check expected counts
  // Based on database: 5 non-deleted (anthony, indigo, jack, mike, testproxy)
  // Active: 3 (anthony, mike, testproxy)
  // Pending: 2 (indigo, jack)
  // Deleted: 4 (aberdeen, chikezie, coriander, pewter)

  await expect(allBadge).toContainText('All (5)');
  await expect(activeBadge).toContainText('Active (3)');
  await expect(pendingBadge).toContainText('Pending (2)');
  await expect(deletedBadge).toContainText('Deleted (4)');
});