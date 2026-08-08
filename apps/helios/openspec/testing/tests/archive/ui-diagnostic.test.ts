import { test, expect } from '@playwright/test';

test('UI Diagnostic - Check for blank page issue', async ({ page }) => {
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(text);
      console.log(`[Console Error] ${text}`);
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    consoleErrors.push(`[PAGE ERROR] ${error.message}`);
    console.log(`[Page Error] ${error.message}`);
  });

  // Capture network failures
  page.on('requestfailed', request => {
    networkErrors.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    console.log(`[Network Error] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
  });

  console.log('Navigating to http://localhost:3000...');

  // Navigate with longer timeout
  const response = await page.goto('http://localhost:3000', {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  console.log(`Page loaded with status: ${response?.status()}`);

  // Wait a bit for React to render
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({
    path: 'openspec/testing/screenshots/ui-diagnostic.png',
    fullPage: true
  });
  console.log('Screenshot saved to: openspec/testing/screenshots/ui-diagnostic.png');

  // Get page title
  const title = await page.title();
  console.log(`Page title: ${title}`);

  // Check if root element has content
  const rootElement = await page.$('#root');
  const hasContent = await rootElement?.evaluate(el => el.innerHTML.length > 0);
  console.log(`Root element has content: ${hasContent}`);

  if (rootElement) {
    const rootHTML = await rootElement.evaluate(el => el.innerHTML);
    console.log(`Root HTML length: ${rootHTML.length} characters`);

    // Check for key elements
    const hasLogin = rootHTML.includes('email') || rootHTML.includes('password') || rootHTML.includes('Login');
    const hasDashboard = rootHTML.includes('Dashboard');
    const hasError = rootHTML.includes('error') || rootHTML.includes('Error');

    console.log(`Contains login elements: ${hasLogin}`);
    console.log(`Contains dashboard: ${hasDashboard}`);
    console.log(`Contains error: ${hasError}`);

    // If blank or very short, show the content
    if (rootHTML.length < 100) {
      console.log(`Root HTML content: ${rootHTML}`);
    } else {
      console.log(`First 500 chars of HTML: ${rootHTML.substring(0, 500)}...`);
    }
  }

  // Report errors
  if (consoleErrors.length > 0) {
    console.log('\n=== Console Errors Found ===');
    consoleErrors.forEach(err => console.log(err));
  } else {
    console.log('\n✓ No console errors');
  }

  if (networkErrors.length > 0) {
    console.log('\n=== Network Errors Found ===');
    networkErrors.forEach(err => console.log(err));
  } else {
    console.log('\n✓ No network errors');
  }

  // Check for specific import errors that indicate the blank page issue
  const hasImportError = consoleErrors.some(err =>
    err.includes('does not provide an export') ||
    err.includes('import type') ||
    err.includes('Module')
  );

  if (hasImportError) {
    console.log('\n⚠️  TypeScript import error detected - this is the blank page issue!');
    console.log('Fix: Use "import type" for TypeScript types');
  }

  // Check for authentication issues
  const hasAuthError = consoleErrors.some(err =>
    err.includes('401') ||
    err.includes('Unauthorized') ||
    err.includes('token')
  );

  if (hasAuthError) {
    console.log('\n⚠️  Authentication error detected');
    console.log('Fix: Check if requireAuth middleware is present on routes');
  }

  // Final verdict
  console.log('\n=== Diagnostic Summary ===');
  if (hasContent && !consoleErrors.length && !networkErrors.length) {
    console.log('✅ UI is loading correctly');
  } else if (!hasContent) {
    console.log('❌ BLANK PAGE DETECTED - Root element is empty');
  } else if (consoleErrors.length > 0) {
    console.log('❌ UI has console errors that may prevent rendering');
  } else {
    console.log('⚠️  UI loaded but may have issues');
  }

  // Assert at least that the page loaded
  expect(response?.status()).toBeLessThan(400);

  // Save HTML for debugging
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('openspec/testing/reports/page-content.html', html);
  console.log('Full HTML saved to: openspec/testing/reports/page-content.html');
});