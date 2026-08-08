import { test, expect } from '@playwright/test';

test('verify user counts and statuses with testproxy login', async ({ page }) => {
  // Login with testproxy (admin user with working password)
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'testproxy@gridworx.io');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  // Wait for navigation
  await page.waitForTimeout(2000);

  // Navigate to Users page
  await page.goto('http://localhost:3000/users');
  await page.waitForTimeout(2000);

  // Take screenshot of current state
  await page.screenshot({ path: 'screenshots/users-page-after-fix.png', fullPage: true });

  // Check the header user count
  const headerText = await page.locator('.users-header h1').textContent();
  console.log('Header text:', headerText);

  // Get all status badge texts - using exact button locators
  console.log('\n=== Badge Counts ===');

  // Click All tab first
  await page.click('button:has-text("All")');
  await page.waitForTimeout(500);
  const allBadge = await page.locator('button:has-text("All")').textContent();
  console.log('All:', allBadge);

  const activeBadge = await page.locator('button:has-text("Active")').textContent();
  console.log('Active:', activeBadge);

  const pendingBadge = await page.locator('button:has-text("Pending")').textContent();
  console.log('Pending:', pendingBadge);

  const suspendedBadge = await page.locator('button:has-text("Suspended")').textContent();
  console.log('Suspended:', suspendedBadge);

  const deletedBadge = await page.locator('button:has-text("Deleted")').textContent();
  console.log('Deleted:', deletedBadge);

  // Count visible rows in the table
  await page.waitForTimeout(500);
  const rows = await page.locator('.table-row').count();
  console.log('\nVisible rows in All tab:', rows);

  // Check each user's displayed status in All tab
  console.log('\n=== User Statuses in All Tab ===');
  const userRows = page.locator('.table-row');
  const rowCount = await userRows.count();

  for (let i = 0; i < rowCount; i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const statusIndicator = await row.locator('.status-indicator').textContent();
    console.log(`  ${email?.trim()}: ${statusIndicator?.trim()}`);
  }

  // Test Active tab
  console.log('\n=== Testing Active Tab ===');
  await page.click('button:has-text("Active")');
  await page.waitForTimeout(500);
  const activeRows = await page.locator('.table-row').count();
  console.log('Active tab rows:', activeRows);

  for (let i = 0; i < Math.min(activeRows, 5); i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const statusIndicator = await row.locator('.status-indicator').textContent();
    console.log(`  ${email?.trim()}: ${statusIndicator?.trim()}`);
  }

  // Test Pending tab
  console.log('\n=== Testing Pending Tab ===');
  await page.click('button:has-text("Pending")');
  await page.waitForTimeout(500);
  const pendingRows = await page.locator('.table-row').count();
  console.log('Pending tab rows:', pendingRows);

  for (let i = 0; i < Math.min(pendingRows, 5); i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const statusIndicator = await row.locator('.status-indicator').textContent();
    console.log(`  ${email?.trim()}: ${statusIndicator?.trim()}`);
  }

  // Test Suspended tab
  console.log('\n=== Testing Suspended Tab ===');
  await page.click('button:has-text("Suspended")');
  await page.waitForTimeout(500);
  const suspendedRows = await page.locator('.table-row').count();
  console.log('Suspended tab rows:', suspendedRows);

  for (let i = 0; i < Math.min(suspendedRows, 5); i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const statusIndicator = await row.locator('.status-indicator').textContent();
    console.log(`  ${email?.trim()}: ${statusIndicator?.trim()}`);
  }

  // Test Deleted tab
  console.log('\n=== Testing Deleted Tab ===');
  await page.click('button:has-text("Deleted")');
  await page.waitForTimeout(500);
  const deletedRows = await page.locator('.table-row').count();
  console.log('Deleted tab rows:', deletedRows);

  for (let i = 0; i < Math.min(deletedRows, 5); i++) {
    const row = userRows.nth(i);
    const email = await row.locator('.col-email').textContent();
    const statusIndicator = await row.locator('.status-indicator').textContent();
    console.log(`  ${email?.trim()}: ${statusIndicator?.trim()}`);
  }

  console.log('\n=== Expected vs Actual ===');
  console.log('Expected: All (9), Active (4), Pending (2), Suspended (1), Deleted (2)');
  console.log('Actual:', allBadge, activeBadge, pendingBadge, suspendedBadge, deletedBadge);

  // Add assertions
  expect(allBadge).toContain('9');
  expect(activeBadge).toContain('4');
  expect(pendingBadge).toContain('2');
  expect(suspendedBadge).toContain('1');
  expect(deletedBadge).toContain('2');
});
