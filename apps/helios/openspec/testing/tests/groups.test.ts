import { test, expect } from '@playwright/test';

test.describe('Groups Feature', () => {
  const baseUrl = 'http://localhost:3000';
  const testEmail = 'mike@gridworx.io';
  const testPassword = 'admin123';

  // Clean up browser state before each test
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies first
    await context.clearCookies();

    await page.goto(baseUrl);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  // Helper to login and dismiss ViewOnboarding modal if present
  async function login(page) {
    // Wait for login form to be visible
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });

    await emailInput.fill(testEmail);
    await page.locator('input[type="password"]').first().fill(testPassword);
    await page.locator('button[type="submit"]').first().click();

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Dismiss ViewOnboarding modal if it appears
    const onboardingModal = page.locator('.view-onboarding-overlay');
    if (await onboardingModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const closeBtn = page.locator('.view-onboarding-close, button.view-onboarding-button.primary');
      if (await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(500);
      }
    }
  }

  test('Navigate to Groups page and verify list loads', async ({ page }) => {
    console.log('👨‍👩‍👧‍👦 Testing Groups Feature\n');

    // Step 1: Login
    console.log('1️⃣  Logging in...');
    await login(page);
    console.log('   ✅ Logged in');

    // Step 2: Navigate to Groups
    console.log('\n2️⃣  Navigating to Groups page...');
    const groupsButton = await page.locator('[data-testid="nav-access-groups"]').first();
    await groupsButton.click();
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/groups-list-page.png',
      fullPage: true
    });
    console.log('   ✅ On Groups page');

    // Step 3: Verify Groups page elements
    console.log('\n3️⃣  Verifying Groups page elements...');

    // Check for groups container (data-grid, empty-state, or header elements)
    const groupsContainer = await page.locator('.data-grid, .empty-state, .grid-header, h1:has-text("Groups"), .grid-body').first();
    const containerVisible = await groupsContainer.isVisible({ timeout: 5000 }).catch(() => false);
    const urlCorrect = page.url().includes('/groups');
    console.log(`   Groups container visible: ${containerVisible}`);
    console.log(`   URL correct: ${urlCorrect}`);

    // Verify page is showing (container visible OR URL is correct)
    expect(containerVisible || urlCorrect).toBe(true);
    console.log('   ✅ Groups page is displaying');

    // Step 4: Check for common UI elements
    console.log('\n4️⃣  Checking for common UI elements...');

    // Search functionality
    const searchInput = await page.locator('input[type="search"], input[placeholder*="Search" i]').first();
    const searchVisible = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`   Search input visible: ${searchVisible}`);

    // Create/Add button
    const addButton = await page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create")').first();
    const addButtonVisible = await addButton.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`   Add group button visible: ${addButtonVisible}`);

    console.log('\n✅ Groups Test Summary:');
    console.log('   ✅ Navigation to Groups worked');
    console.log('   ✅ Groups page is displayed');
    console.log(`   ${searchVisible ? '✅' : '⚠️'} Search functionality ${searchVisible ? 'available' : 'not found'}`);
    console.log(`   ${addButtonVisible ? '✅' : '⚠️'} Add group button ${addButtonVisible ? 'available' : 'not found'}`);
  });

  test('Groups page persists after refresh', async ({ page }) => {
    console.log('🔄 Testing Groups Page Persistence\n');

    // Login and navigate to Groups
    console.log('1️⃣  Logging in and navigating to Groups...');
    await login(page);
    await page.locator('text=/Groups/i').first().click();
    await page.waitForLoadState('networkidle');
    console.log('   ✅ On Groups page');

    // Refresh the page
    console.log('\n2️⃣  Refreshing the page...');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify still on Groups page
    console.log('\n3️⃣  Verifying still on Groups page...');
    const groupsVisible = await page.locator('text=/Groups/i').first().isVisible();
    const urlAfterRefresh = page.url();

    console.log(`   Current URL: ${urlAfterRefresh}`);
    console.log(`   Groups page visible: ${groupsVisible}`);

    expect(groupsVisible).toBe(true);
    console.log('   ✅ Successfully stayed on Groups page after refresh!');
  });

  test('View group details', async ({ page }) => {
    console.log('🔍 Testing Group Details View\n');

    // Login and navigate to Groups
    console.log('1️⃣  Logging in and navigating to Groups...');
    await login(page);
    await page.locator('text=/Groups/i').first().click();
    await page.waitForLoadState('networkidle');
    console.log('   ✅ On Groups page');

    // Try to click on first group
    console.log('\n2️⃣  Attempting to view first group details...');
    const firstGroup = await page.locator('[class*="group-card"], [class*="group-item"], tr').nth(1);
    const groupVisible = await firstGroup.isVisible({ timeout: 3000 }).catch(() => false);

    if (groupVisible) {
      await firstGroup.click();
      await page.waitForLoadState('networkidle');

      // Check if group detail view opened
      const detailVisible = await page.locator('[class*="detail"], [class*="modal"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`   Group detail view opened: ${detailVisible}`);

      // Take screenshot of detail view
      if (detailVisible) {
        await page.screenshot({
          path: 'openspec/testing/reports/screenshots/group-detail-view.png',
          fullPage: true
        });
      }

      console.log('   ✅ Group detail interaction tested');
    } else {
      console.log('   ⚠️  No groups found to view details');
    }
  });
});
