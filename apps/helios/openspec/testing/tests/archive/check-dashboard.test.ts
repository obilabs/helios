import { test, expect } from '@playwright/test';

test('Check dashboard cards rendering', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3000');
  await page.fill('input[type="email"]', 'jack@gridworx.io');
  await page.fill('input[type="password"]', 'P@ssw0rd123!');
  await page.click('button[type="submit"]');

  // Wait for dashboard to load
  await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 10000 });

  // Wait a bit for stats to load
  await page.waitForTimeout(2000);

  // Check what stats contains in the browser
  const statsValue = await page.evaluate(() => {
    return (window as any).statsDebug || 'stats not found';
  });
  console.log('Stats in browser:', JSON.stringify(statsValue, null, 2));

  // Take a screenshot
  await page.screenshot({ path: 'openspec/testing/reports/screenshots/dashboard-current.png', fullPage: true });

  // Check for platform cards section
  const platformCardsSection = await page.locator('.platform-cards-section');
  console.log('Platform cards section exists:', await platformCardsSection.count() > 0);

  // Check for individual cards
  const googleCard = await page.locator('.google-card');
  const heliosCard = await page.locator('.helios-card');

  console.log('Google card exists:', await googleCard.count() > 0);
  console.log('Helios card exists:', await heliosCard.count() > 0);

  // Get the HTML structure
  const dashboardHTML = await page.locator('.dashboard-content').innerHTML();
  console.log('Dashboard HTML structure:', dashboardHTML.substring(0, 1000));

  // Check what's actually in the platform cards section
  if (await platformCardsSection.count() > 0) {
    const cardsHTML = await platformCardsSection.innerHTML();
    console.log('Platform cards HTML:', cardsHTML);
  }
});
