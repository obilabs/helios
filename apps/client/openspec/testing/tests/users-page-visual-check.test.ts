import { test, expect } from '@playwright/test';

test('Capture Users page layout for review', async ({ page }) => {
  const baseUrl = 'http://localhost:3000';

  // Login
  await page.goto(baseUrl);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('helios_view_onboarding_completed', 'true');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').first().fill('jack@gridworx.io');
  await page.locator('input[type="password"]').first().fill('password123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('✅ Logged in');

  // Navigate to Users page
  await page.locator('[data-testid="nav-users"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('✅ On Users page');

  // Capture full page screenshot
  await page.screenshot({
    path: 'reports/screenshots/users-page-layout.png',
    fullPage: true
  });
  console.log('✅ Screenshot saved to reports/screenshots/users-page-layout.png');

  // Analyze header layout
  const statsContainer = await page.locator('.users-stats-inline').boundingBox();
  const actionsBar = await page.locator('.actions-bar').boundingBox();
  const searchBox = await page.locator('.search-box').boundingBox();

  console.log('\n=== LAYOUT ANALYSIS ===');
  if (statsContainer) {
    console.log('Stats container:', {
      x: statsContainer.x,
      y: statsContainer.y,
      width: statsContainer.width,
      height: statsContainer.height
    });
  }
  if (actionsBar) {
    console.log('Actions bar:', {
      x: actionsBar.x,
      y: actionsBar.y,
      width: actionsBar.width,
      height: actionsBar.height
    });
  }
  if (searchBox) {
    console.log('Search box:', {
      x: searchBox.x,
      y: searchBox.y,
      width: searchBox.width,
      height: searchBox.height
    });
  }

  // Check column headers
  const tableHeaders = await page.locator('.table-header').first().textContent();
  console.log('Table headers:', tableHeaders);
});
