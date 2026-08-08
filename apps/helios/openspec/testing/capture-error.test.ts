import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('Capture frontend error', async ({ page }) => {
  const errors: string[] = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    errors.push(`Page Error: ${error.message}\n${error.stack}`);
  });

  // Navigate to app
  await page.goto('http://localhost:3000');

  // Wait a bit for errors to appear
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({
    path: 'reports/screenshots/error-state.png',
    fullPage: true
  });

  // Save console logs
  fs.writeFileSync('reports/error-logs.txt', errors.join('\n\n'));

  // Save page content
  const content = await page.content();
  fs.writeFileSync('reports/page-content.html', content);

  console.log('Errors captured:', errors.length);
  console.log('Screenshot saved to: reports/screenshots/error-state.png');
  console.log('Logs saved to: reports/error-logs.txt');
});
