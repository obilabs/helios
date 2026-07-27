import { test, expect } from '@playwright/test';

test.describe('Dashboard Widget Loading Test', () => {
  test('Complete dashboard widget loading verification', async ({ page }) => {
    const consoleMessages: string[] = [];
    const consoleErrors: string[] = [];
    const networkRequests: { url: string; status: number | null; method: string }[] = [];
    const networkErrors: string[] = [];

    // Capture console messages
    page.on('console', msg => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleMessages.push(text);

      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      consoleErrors.push(`[PAGE ERROR] ${error.message}\n${error.stack}`);
    });

    // Capture all network requests
    page.on('response', response => {
      networkRequests.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method()
      });
    });

    // Capture network failures
    page.on('requestfailed', request => {
      networkErrors.push(`[NETWORK FAILED] ${request.url()} - ${request.failure()?.errorText}`);
    });

    console.log('\n========== DASHBOARD WIDGET TEST ==========\n');

    // Step 1: Navigate to login page
    console.log('Step 1: Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Check if we're on login page
    const hasLoginForm = await page.locator('input[type="email"], input[name="email"]').count() > 0;
    console.log('On login page:', hasLoginForm);

    if (hasLoginForm) {
      // Step 2: Login
      console.log('Step 2: Logging in as jack@gridworx.io...');
      await page.fill('input[type="email"], input[name="email"]', 'jack@gridworx.io');
      await page.fill('input[type="password"], input[name="password"]', 'P@ssw0rd123!');

      // Take screenshot before login
      await page.screenshot({ path: './openspec/testing/reports/screenshots/widget-test-01-login-form.png' });

      await page.click('button[type="submit"]');

      // Wait for navigation to dashboard
      await page.waitForTimeout(2000);
    }

    // Take screenshot of current state
    await page.screenshot({ path: './openspec/testing/reports/screenshots/widget-test-02-after-login.png', fullPage: true });

    // Step 3: Check if dashboard is visible
    console.log('\nStep 3: Checking dashboard state...');
    const pageContent = await page.content();
    const hasContent = pageContent.length > 500;
    console.log('Page has content:', hasContent, `(${pageContent.length} chars)`);

    // Check for loading state
    const loadingText = await page.locator('text=Loading dashboard widgets').count();
    console.log('Shows "Loading dashboard widgets...":', loadingText > 0);

    // Check for actual widgets
    const widgetCards = await page.locator('.metric-card, .dashboard-widget, [class*="widget"], [class*="metric"]').count();
    console.log('Widget cards found:', widgetCards);

    // Check for "Customize Dashboard" button
    const customizeButton = await page.locator('text=Customize Dashboard, button:has-text("Customize")').count();
    console.log('Customize Dashboard button found:', customizeButton > 0);

    // Step 4: Check network requests
    console.log('\n--- NETWORK REQUESTS ---');
    const relevantRequests = networkRequests.filter(r =>
      r.url.includes('localhost:3001') &&
      (r.url.includes('/api/') || r.url.includes('/auth/'))
    );

    console.log(`Total API requests: ${relevantRequests.length}`);

    relevantRequests.forEach(req => {
      const statusColor = req.status && req.status < 400 ? '✓' : '✗';
      console.log(`  ${statusColor} ${req.method} ${req.url.replace('http://localhost:3001', '')} -> ${req.status}`);
    });

    // Check specifically for user-preferences request
    const preferencesRequests = relevantRequests.filter(r => r.url.includes('/user-preferences'));
    console.log(`\nUser preferences requests: ${preferencesRequests.length}`);
    preferencesRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url} -> ${req.status}`);
    });

    // Check for stats request
    const statsRequests = relevantRequests.filter(r => r.url.includes('/stats'));
    console.log(`\nStats requests: ${statsRequests.length}`);
    statsRequests.forEach(req => {
      console.log(`  ${req.method} ${req.url} -> ${req.status}`);
    });

    // Step 5: Check console errors
    console.log('\n--- CONSOLE ERRORS ---');
    if (consoleErrors.length === 0) {
      console.log('No console errors detected');
    } else {
      console.log(`Found ${consoleErrors.length} console errors:`);
      consoleErrors.forEach(err => console.log(`  ${err}`));
    }

    // Step 6: Check network errors
    console.log('\n--- NETWORK ERRORS ---');
    if (networkErrors.length === 0) {
      console.log('No network errors detected');
    } else {
      console.log(`Found ${networkErrors.length} network errors:`);
      networkErrors.forEach(err => console.log(`  ${err}`));
    }

    // Step 7: Try to interact with customize button
    if (customizeButton > 0) {
      console.log('\nStep 7: Testing Customize Dashboard button...');
      await page.click('text=Customize Dashboard');
      await page.waitForTimeout(1000);

      const modalVisible = await page.locator('.modal-overlay, .dashboard-customizer, [class*="customizer"]').count();
      console.log('Customizer modal opened:', modalVisible > 0);

      await page.screenshot({ path: './openspec/testing/reports/screenshots/widget-test-03-customizer-modal.png', fullPage: true });

      if (modalVisible > 0) {
        // Close modal
        await page.click('.modal-close-btn, button:has-text("Cancel")');
        await page.waitForTimeout(500);
      }
    }

    // Step 8: Test refresh behavior
    console.log('\nStep 8: Testing page refresh...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const afterRefreshLoading = await page.locator('text=Loading dashboard widgets').count();
    const afterRefreshWidgets = await page.locator('.metric-card, .dashboard-widget, [class*="widget"]').count();

    console.log('After refresh - Loading state:', afterRefreshLoading > 0);
    console.log('After refresh - Widget count:', afterRefreshWidgets);

    await page.screenshot({ path: './openspec/testing/reports/screenshots/widget-test-04-after-refresh.png', fullPage: true });

    console.log('\n========================================\n');

    // Write detailed report
    const report = {
      timestamp: new Date().toISOString(),
      test: 'Dashboard Widget Loading',
      results: {
        hasContent,
        showingLoadingState: loadingText > 0,
        widgetCardsFound: widgetCards,
        customizeButtonFound: customizeButton > 0,
        afterRefresh: {
          loadingState: afterRefreshLoading > 0,
          widgetCount: afterRefreshWidgets
        }
      },
      networkRequests: relevantRequests.slice(0, 30),
      preferencesRequests,
      statsRequests,
      consoleErrors: consoleErrors.slice(0, 10),
      networkErrors: networkErrors.slice(0, 10)
    };

    console.log('\n--- SUMMARY ---');
    console.log(JSON.stringify(report.results, null, 2));

    // Assertions
    expect(consoleErrors.length).toBe(0);
    expect(loadingText).toBe(0); // Should not show loading state
    expect(widgetCards).toBeGreaterThan(0); // Should have at least one widget
    expect(afterRefreshWidgets).toBeGreaterThan(0); // Should persist after refresh
  });
});
