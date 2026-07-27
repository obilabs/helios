import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'jack@gridworx.io';
const TEST_PASSWORD = 'P@ssw0rd123!';

test('Debug console navigation', async ({ page }) => {
  // Enable console logs
  page.on('console', msg => console.log('BROWSER:', msg.text()));

  // Login
  console.log('1. Logging in...');
  await page.goto(BASE_URL);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  console.log('Current URL after login:', page.url());

  // Check if we're logged in
  const welcomeText = await page.locator('text=Welcome, Jack!').count();
  console.log('Welcome text found:', welcomeText);

  // Click user menu
  console.log('\n2. Clicking user menu...');
  const userMenuButton = page.locator('button:has-text("JD")');
  console.log('User menu button count:', await userMenuButton.count());

  if (await userMenuButton.count() > 0) {
    await userMenuButton.click();
    await page.waitForTimeout(1000);

    // Check if menu opened
    const menuItems = await page.locator('.menu-item').allTextContents();
    console.log('Menu items:', menuItems);

    // Click Developer Console
    console.log('\n3. Clicking Developer Console...');
    const devConsoleItem = page.locator('text=Developer Console');
    console.log('Developer Console item count:', await devConsoleItem.count());

    if (await devConsoleItem.count() > 0) {
      await devConsoleItem.click();
      await page.waitForTimeout(2000);

      console.log('Current URL after clicking:', page.url());

      // Take screenshot
      await page.screenshot({ path: 'console-navigation.png', fullPage: true });

      // Check what's on the page
      const pageText = await page.textContent('body');
      console.log('Page contains (first 300 chars):', pageText?.substring(0, 300));

      // Look for console elements
      const consoleOutput = await page.locator('.console-output').count();
      const consoleInput = await page.locator('input.console-input').count();
      const consoleInputAlt = await page.locator('input[type="text"]').count();

      console.log('\n4. Console elements:');
      console.log('  - .console-output:', consoleOutput);
      console.log('  - input.console-input:', consoleInput);
      console.log('  - input[type="text"]:', consoleInputAlt);

      // Try to find ANY input on the page
      const allInputs = await page.locator('input').all();
      console.log('  - Total input elements:', allInputs.length);

      for (let i = 0; i < Math.min(allInputs.length, 5); i++) {
        const inputType = await allInputs[i].getAttribute('type').catch(() => 'none');
        const inputClass = await allInputs[i].getAttribute('class').catch(() => 'none');
        const inputPlaceholder = await allInputs[i].getAttribute('placeholder').catch(() => 'none');
        console.log(`  Input ${i}: type=${inputType}, class=${inputClass}, placeholder=${inputPlaceholder}`);
      }

      // Check if there's a welcome message or loading state
      const welcomeMsg = await page.locator('text=/Welcome to.*Console/i').count();
      console.log('  - Welcome message:', welcomeMsg);

      // Check for any error messages
      const errorMsg = await page.locator('text=/error|failed/i').count();
      console.log('  - Error messages:', errorMsg);

    } else {
      console.log('❌ Developer Console menu item not found');
    }
  } else {
    console.log('❌ User menu button not found');
  }
});
