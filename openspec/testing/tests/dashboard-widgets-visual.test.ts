import { test, expect } from '@playwright/test';

test('Dashboard widgets visual test', async ({ page }) => {
  test.setTimeout(60000); // 60 second timeout

  // Enable logging
  page.on('console', msg => console.log(`[${msg.type().toUpperCase()}]:`, msg.text()));
  page.on('pageerror', error => console.error('[PAGE ERROR]:', error.message));

  console.log('\n=== Step 1: Navigate to application ===');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  console.log('\n=== Step 2: Login ===');
  await page.fill('input[type="email"]', 'jack@gridworx.io');
  await page.fill('input[type="password"]', 'P@ssw0rd123!');
  await page.click('button[type="submit"]');

  // Wait for login to complete
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('\n=== Step 3: Check for dashboard widgets ===');

  // Take screenshot
  await page.screenshot({
    path: 'openspec/testing/reports/screenshots/dashboard-widgets.png',
    fullPage: true
  });

  // Check for metric cards (dashboard widgets)
  const metricCards = page.locator('.metric-card');
  const cardCount = await metricCards.count();
  console.log(`Found ${cardCount} metric cards`);

  // Check for specific widget titles
  const widgetTitles = [
    'Google Workspace',
    'Suspended',
    'Admins',
    'Total Users',
    'Guests',
    'Alerts'
  ];

  for (const title of widgetTitles) {
    const hasTitle = await page.locator(`text="${title}"`).count();
    console.log(`Widget "${title}": ${hasTitle > 0 ? 'FOUND' : 'NOT FOUND'}`);
  }

  // Check for dashboard stats
  const statsPresent = await page.locator('text=/\\d+/').count();
  console.log(`Stats numbers found: ${statsPresent}`);

  // Check page content
  const bodyText = await page.evaluate(() => document.body.textContent);
  console.log(`Page content length: ${bodyText?.length} chars`);

  if (bodyText) {
    console.log('\nPage content preview:');
    console.log(bodyText.substring(0, 500));
  }

  // Assert we have widgets
  console.log('\n=== Final Assertions ===');
  expect(cardCount).toBeGreaterThan(0);
  console.log(`✓ Found ${cardCount} metric cards`);
});
