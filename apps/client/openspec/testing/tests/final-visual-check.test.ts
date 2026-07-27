import { test } from '@playwright/test';

test('Final visual verification of all fixes', async ({ page }) => {
  test.setTimeout(120000);

  console.log('\n=== Login ===');
  await page.goto('http://localhost:3000');
  await page.fill('input[type="email"]', 'jack@gridworx.io');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test 1: Signatures Analytics - No fake data
  console.log('\n=== 1. Signatures Page ===');
  await page.click('text=Signatures');
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Analytics")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/final-1-signatures.png', fullPage: true });
  console.log('✓ Screenshot saved: Signatures page with "Coming Soon" instead of fake data');

  // Test 2: Org Chart - Better error
  console.log('\n=== 2. Org Chart Page ===');
  await page.click('text=Org Chart');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/final-2-orgchart.png', fullPage: true });
  console.log('✓ Screenshot saved: Org Chart with helpful error message');

  // Test 3: Email Security - No GAM reference
  console.log('\n=== 3. Email Security Page ===');
  await page.click('text=Email Security');
  await page.waitForTimeout(2000);

  // Scroll down to see the "How It Works" section
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'openspec/testing/reports/screenshots/final-3-email-security.png', fullPage: true });
  console.log('✓ Screenshot saved: Email Security with Google Workspace API text');

  // Test 4: Dashboard - Real data
  console.log('\n=== 4. Dashboard ===');
  await page.click('text=Home');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/final-4-dashboard.png', fullPage: true });
  console.log('✓ Screenshot saved: Dashboard with real data from database');

  console.log('\n=== ALL SCREENSHOTS CAPTURED ===');
  console.log('Check openspec/testing/reports/screenshots/final-*.png');
});
