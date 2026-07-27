import { test, expect } from '@playwright/test';

test('Dashboard diagnostic - check what is actually rendering', async ({ page }) => {
  // Enable console logging
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  // Go to login page
  await page.goto('http://localhost:3000');
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/diag-1-login.png', fullPage: true });

  // Login
  await page.fill('input[type="email"]', 'jack@gridworx.io');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');

  // Wait for navigation
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/diag-2-after-login.png', fullPage: true });

  // Check what's on the page
  const bodyHTML = await page.evaluate(() => document.body.innerHTML);
  console.log('PAGE CONTENT LENGTH:', bodyHTML.length);

  // Check for dashboard elements
  const hasDashboard = await page.locator('.dashboard-content').count();
  console.log('Dashboard content elements:', hasDashboard);

  const hasWidgetGrid = await page.locator('.dashboard-widget-grid').count();
  console.log('Widget grid elements:', hasWidgetGrid);

  const hasMetricCards = await page.locator('.metric-card').count();
  console.log('Metric card elements:', hasMetricCards);

  // Check for loading message
  const hasLoading = await page.getByText('Loading dashboard widgets').count();
  console.log('Loading message:', hasLoading);

  // Check network requests
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      requests.push({ url: request.url(), method: request.method() });
    }
  });

  await page.waitForTimeout(2000);

  console.log('API Requests made:', JSON.stringify(requests, null, 2));

  // Take final screenshot
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/diag-3-final.png', fullPage: true });
});
