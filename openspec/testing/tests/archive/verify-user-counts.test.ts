import { test, expect } from '@playwright/test';

test('verify user counts and statuses with real login', async ({ page }) => {
  // Login with jack
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'jack@gridworx.io');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  // Wait for navigation
  await page.waitForTimeout(2000);

  // Navigate to Users page
  await page.goto('http://localhost:3000/users');
  await page.waitForTimeout(1000);

  // Take screenshot of current state
  await page.screenshot({ path: 'screenshots/actual-users-page.png', fullPage: true });

  // Check the header user count
  const headerCount = await page.locator('text=/\\d+ Users/').first().textContent();
  console.log('Header count:', headerCount);

  // Get all status badge texts
  const allBadge = await page.locator('button:has-text("All")').first().textContent();
  const activeBadge = await page.locator('button:has-text("Active")').first().textContent();
  const pendingBadge = await page.locator('button:has-text("Pending")').first().textContent();
  const suspendedBadge = await page.locator('button:has-text("Suspended")').first().textContent();
  const deletedBadge = await page.locator('button:has-text("Deleted")').first().textContent();

  console.log('Badge counts:');
  console.log('  All:', allBadge);
  console.log('  Active:', activeBadge);
  console.log('  Pending:', pendingBadge);
  console.log('  Suspended:', suspendedBadge);
  console.log('  Deleted:', deletedBadge);

  // Count visible rows in the table
  const rows = await page.locator('.table-row').count();
  console.log('Visible rows:', rows);

  // Check each user's displayed status
  const userRows = page.locator('.table-row');
  const rowCount = await userRows.count();

  console.log('\nUser statuses in All tab:');
  for (let i = 0; i < rowCount; i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const statusIndicator = await row.locator('.status-indicator').textContent();
    console.log(`  ${email}: ${statusIndicator}`);
  }

  // Test each status tab
  console.log('\n=== Testing Pending Tab ===');
  await page.click('button:has-text("Pending")');
  await page.waitForTimeout(500);
  const pendingRows = await page.locator('.table-row').count();
  console.log('Pending tab rows:', pendingRows);

  for (let i = 0; i < pendingRows; i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const statusIndicator = await row.locator('.status-indicator').textContent();
    console.log(`  ${email}: ${statusIndicator}`);
  }

  console.log('\n=== Testing Suspended Tab ===');
  await page.click('button:has-text("Suspended")');
  await page.waitForTimeout(500);
  const suspendedRows = await page.locator('.table-row').count();
  console.log('Suspended tab rows:', suspendedRows);

  for (let i = 0; i < suspendedRows; i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const statusIndicator = await row.locator('.status-indicator').textContent();
    console.log(`  ${email}: ${statusIndicator}`);
  }

  console.log('\n=== Expected vs Actual ===');
  console.log('Expected: All (9), Active (4), Pending (2), Suspended (1), Deleted (2)');
  console.log('Actual:', allBadge, activeBadge, pendingBadge, suspendedBadge, deletedBadge);
});