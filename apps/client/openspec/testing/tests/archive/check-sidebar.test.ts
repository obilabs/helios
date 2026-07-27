import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'jack@gridworx.io';
const TEST_PASSWORD = 'P@ssw0rd123!';

test('Check sidebar navigation links', async ({ page }) => {
  // Login
  await page.goto(BASE_URL);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);

  // Get all navigation links
  const sidebar = page.locator('nav, aside, [role="navigation"]');
  const links = await sidebar.locator('a, button').allTextContents();

  console.log('=== Sidebar Navigation Links ===');
  links.forEach((link, i) => {
    console.log(`${i + 1}. ${link.trim()}`);
  });

  // Take screenshot
  await page.screenshot({ path: 'sidebar-navigation.png', fullPage: true });

  // Try to find Developer Console link
  const devConsoleLink = page.locator('text=Developer Console');
  const exists = await devConsoleLink.count();

  console.log(`\nDeveloper Console link count: ${exists}`);

  if (exists > 0) {
    console.log('✅ Developer Console link found!');
    await devConsoleLink.first().click();
    await page.waitForTimeout(2000);
    console.log('Current URL after click:', page.url());
  } else {
    console.log('❌ Developer Console link NOT found');
    console.log('Checking for similar links...');

    const possibleLinks = [
      'Console',
      'Developer',
      'CLI',
      'Terminal',
      'Settings'
    ];

    for (const linkText of possibleLinks) {
      const count = await page.locator(`text=${linkText}`).count();
      if (count > 0) {
        console.log(`Found: ${linkText} (${count} matches)`);
      }
    }
  }
});
