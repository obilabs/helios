import { test, expect } from '@playwright/test';

test('Complete auth and dashboard flow', async ({ page }) => {
  // Enable console and error logging
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
  });

  page.on('pageerror', error => {
    console.error('[PAGE ERROR]:', error.message);
    console.error('[STACK]:', error.stack);
  });

  // Monitor network requests
  const apiRequests: any[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      apiRequests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
      console.log(`[API REQUEST] ${request.method()} ${request.url()}`);
    }
  });

  page.on('response', async response => {
    if (response.url().includes('/api/')) {
      console.log(`[API RESPONSE] ${response.status()} ${response.url()}`);
      if (response.status() >= 400) {
        const text = await response.text().catch(() => 'Could not read response body');
        console.error(`[ERROR RESPONSE]:`, text);
      }
    }
  });

  console.log('\n=== STEP 1: Navigate to login page ===');
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/auth-1-login-page.png', fullPage: true });

  // Check if already logged in (redirected to dashboard)
  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);

  if (currentUrl.includes('/dashboard')) {
    console.log('Already logged in, skipping login step');
  } else {
    console.log('\n=== STEP 2: Fill login form ===');

    // Wait for login form
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });

    // Fill credentials - CORRECT credentials for Gridworx
    await page.fill('input[type="email"]', 'mike@gridworx.io');
    await page.fill('input[type="password"]', 'admin123');
    await page.screenshot({ path: 'openspec/testing/reports/screenshots/auth-2-form-filled.png', fullPage: true });

    console.log('\n=== STEP 3: Submit login ===');
    await page.click('button[type="submit"]');

    // Wait for navigation or error
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'openspec/testing/reports/screenshots/auth-3-after-submit.png', fullPage: true });
  }

  console.log('\n=== STEP 4: Check localStorage for token ===');
  const token = await page.evaluate(() => localStorage.getItem('helios_token'));
  console.log('Token in localStorage:', token ? `Present (${token.substring(0, 20)}...)` : 'NOT FOUND');

  if (!token) {
    console.error('ERROR: No token found in localStorage after login!');

    // Check for error messages
    const errorText = await page.locator('.error, .alert, [role="alert"]').textContent().catch(() => null);
    if (errorText) {
      console.error('Error message on page:', errorText);
    }
  }

  console.log('\n=== STEP 5: Wait for dashboard to load ===');
  await page.waitForTimeout(3000);
  const finalUrl = page.url();
  console.log('Final URL:', finalUrl);
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/auth-4-dashboard.png', fullPage: true });

  console.log('\n=== STEP 6: Check dashboard elements ===');
  const dashboardElements = await page.locator('.dashboard-content, [class*="dashboard"]').count();
  const widgetElements = await page.locator('.metric-card, [class*="widget"]').count();
  const statElements = await page.locator('[class*="stat"]').count();

  console.log(`Dashboard elements found: ${dashboardElements}`);
  console.log(`Widget/card elements found: ${widgetElements}`);
  console.log(`Stat elements found: ${statElements}`);

  // Check page content
  const pageContent = await page.evaluate(() => document.body.textContent);
  console.log(`Page text content length: ${pageContent?.length || 0} chars`);
  console.log(`Page text preview: ${pageContent?.substring(0, 200)}`);

  console.log('\n=== STEP 7: API Requests Summary ===');
  console.log(`Total API requests made: ${apiRequests.length}`);

  if (apiRequests.length === 0) {
    console.error('WARNING: No API requests were made!');
  } else {
    apiRequests.forEach((req, i) => {
      console.log(`  ${i + 1}. ${req.method} ${req.url}`);
      if (req.headers.authorization) {
        console.log(`     Authorization: ${req.headers.authorization.substring(0, 30)}...`);
      } else {
        console.log('     WARNING: No Authorization header!');
      }
    });
  }

  console.log('\n=== STEP 8: Check for dashboard data ===');
  // Try to find stats
  const statsVisible = await page.locator('text=/Total Users|Active Users|Total Groups/i').count();
  console.log(`Dashboard stats visible: ${statsVisible > 0 ? 'YES' : 'NO'}`);

  // Check for loading states
  const loadingVisible = await page.locator('text=/loading/i').count();
  console.log(`Loading indicators: ${loadingVisible}`);

  console.log('\n=== TEST COMPLETE ===');

  // Final assertions
  expect(token).toBeTruthy(); // Should have a token
  // URL might be '/' or '/admin/dashboard' depending on routing - check for logged in state
  expect(apiRequests.length).toBeGreaterThan(0); // Should have made API calls

  // Verify dashboard content is visible (regardless of exact URL)
  const dashboardHeading = await page.locator('h1:has-text("Dashboard")').count();
  expect(dashboardHeading).toBeGreaterThan(0); // Dashboard heading should be visible
});
