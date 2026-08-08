import { test, expect } from '@playwright/test';

test.describe('Debug Blank Page Issue', () => {
  test('Capture console errors and network failures', async ({ page }) => {
    const consoleMessages: string[] = [];
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    // Capture all console messages
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

    // Capture network failures
    page.on('requestfailed', request => {
      networkErrors.push(`[NETWORK FAILED] ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Navigate to the page
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait a bit for any async errors
    await page.waitForTimeout(3000);

    // Take a screenshot
    await page.screenshot({
      path: './openspec/testing/reports/screenshots/blank-page-debug.png',
      fullPage: true
    });

    // Check if root div has any content
    const rootContent = await page.locator('#root').innerHTML();
    const hasContent = rootContent.trim().length > 0;

    // Get page title
    const title = await page.title();

    // Print diagnostic information
    console.log('\n========== DIAGNOSTIC REPORT ==========\n');
    console.log('Page Title:', title);
    console.log('Root Element Has Content:', hasContent);
    console.log('Root HTML Length:', rootContent.length);

    if (rootContent.length < 200) {
      console.log('Root HTML:', rootContent);
    }

    console.log('\n--- CONSOLE MESSAGES ---');
    consoleMessages.forEach(msg => console.log(msg));

    console.log('\n--- CONSOLE ERRORS ---');
    if (consoleErrors.length === 0) {
      console.log('No console errors detected');
    } else {
      consoleErrors.forEach(err => console.log(err));
    }

    console.log('\n--- NETWORK ERRORS ---');
    if (networkErrors.length === 0) {
      console.log('No network errors detected');
    } else {
      networkErrors.forEach(err => console.log(err));
    }

    console.log('\n--- LOADED RESOURCES ---');
    const resources = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .map((r: any) => ({ name: r.name, status: r.responseStatus }))
        .filter(r => r.name.includes('localhost:3000'));
    });
    console.log('Resources loaded:', resources.length);
    resources.slice(0, 10).forEach(r => console.log(`  - ${r.name}`));

    // Check if specific components are accessible
    console.log('\n--- COMPONENT FILES ---');
    const componentTests = [
      '/src/components/MetricCard.tsx',
      '/src/components/DashboardCustomizer.tsx',
      '/src/config/widgets.tsx',
      '/src/utils/widget-data.tsx',
      '/src/App.tsx'
    ];

    for (const component of componentTests) {
      const response = await page.goto(`http://localhost:3000${component}`);
      const status = response?.status();
      console.log(`${component}: HTTP ${status}`);
      await page.goBack();
    }

    console.log('\n========================================\n');

    // Write detailed report to file
    const report = {
      timestamp: new Date().toISOString(),
      title,
      hasContent,
      rootHTMLLength: rootContent.length,
      rootHTML: rootContent.substring(0, 500),
      consoleMessages,
      consoleErrors,
      networkErrors,
      resources: resources.slice(0, 20)
    };

    await page.evaluate((reportData) => {
      console.log('DIAGNOSTIC REPORT:', JSON.stringify(reportData, null, 2));
    }, report);

    // If there are console errors, fail the test with details
    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
    }

    // If root is empty, fail with details
    if (!hasContent) {
      throw new Error('Root element is empty - no React content rendered');
    }
  });
});
