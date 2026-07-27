import { test, expect } from '@playwright/test';

test('Verify deleted users count matches list', async ({ page }) => {
  const baseUrl = 'http://localhost:3000';

  // Login
  await page.goto(baseUrl);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('helios_view_onboarding_completed', 'true');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').first().fill('jack@gridworx.io');
  await page.locator('input[type="password"]').first().fill('password123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('✅ Logged in');

  // Navigate to Users page
  await page.locator('[data-testid="nav-users"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('✅ On Users page');

  // Get the count from the badge before clicking
  const deletedBadge = page.locator('button:has-text("Deleted")').first();
  const deletedBadgeText = await deletedBadge.textContent();
  console.log('Deleted badge text:', deletedBadgeText);

  // Extract number from badge (e.g., "Deleted (7)" -> 7)
  const badgeCountMatch = deletedBadgeText?.match(/\((\d+)\)/);
  const badgeCount = badgeCountMatch ? parseInt(badgeCountMatch[1]) : 0;

  // Get count from stats header
  const deletedStatText = await page.locator('.stat-deleted').first().textContent().catch(() => '0');
  const statCount = parseInt(deletedStatText || '0');
  console.log('Deleted stat value:', statCount);

  // Click on the Deleted filter
  await deletedBadge.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Get the displayed count from table header (e.g., "7 users")
  const userCountText = await page.locator('.user-count').first().textContent().catch(() => '0');
  const tableCountMatch = userCountText?.match(/(\d+)/);
  const tableCount = tableCountMatch ? parseInt(tableCountMatch[1]) : 0;
  console.log('Table user count:', tableCount);

  // Take screenshot
  await page.screenshot({
    path: 'reports/screenshots/deleted-users-count-test.png',
    fullPage: false
  });

  console.log('\n=== COMPARISON ===');
  console.log('Badge shows:', badgeCount);
  console.log('Stat shows:', statCount);
  console.log('Table shows:', tableCount);

  // ASSERTIONS: All three counts should match
  expect(badgeCount).toBe(statCount);
  expect(tableCount).toBe(statCount);
  expect(tableCount).toBe(badgeCount);

  console.log('✅ All counts match!');
});
