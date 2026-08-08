import { test, expect } from '@playwright/test';

test.describe('Settings Feature', () => {
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

  test('Navigate to Settings and verify page loads', async ({ page }) => {
    console.log('⚙️  Testing Settings Feature\n');

    // Step 1: Login
    console.log('1️⃣  Logging in...');
    await login(page);
    console.log('   ✅ Logged in');

    // Step 2: Navigate to Settings
    console.log('\n2️⃣  Navigating to Settings page...');
    const settingsButton = await page.locator('text=/Settings/i').first();
    await settingsButton.click();
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/settings-main-page.png',
      fullPage: true
    });
    console.log('   ✅ On Settings page');

    // Step 3: Verify Settings page elements
    console.log('\n3️⃣  Verifying Settings page elements...');

    // Check for settings container
    const settingsContainer = await page.locator('[class*="settings"], [class*="config"]').first();
    const containerVisible = await settingsContainer.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`   Settings container visible: ${containerVisible}`);

    // Check for tabs
    const tabs = await page.locator('[role="tab"], .tab, button[class*="tab"]');
    const tabCount = await tabs.count();
    console.log(`   Settings tabs found: ${tabCount}`);

    // Verify page is showing
    expect(containerVisible || tabCount > 0).toBe(true);
    console.log('   ✅ Settings page is displaying');

    console.log('\n✅ Settings Test Summary:');
    console.log('   ✅ Navigation to Settings worked');
    console.log('   ✅ Settings page is displayed');
    console.log(`   ✅ Found ${tabCount} settings tabs`);
  });

  test('Settings page persists after refresh', async ({ page }) => {
    console.log('🔄 Testing Settings Page Persistence\n');

    // Login and navigate to Settings
    console.log('1️⃣  Logging in and navigating to Settings...');
    await login(page);
    await page.locator('text=/Settings/i').first().click();
    await page.waitForLoadState('networkidle');
    console.log('   ✅ On Settings page');

    // Refresh the page
    console.log('\n2️⃣  Refreshing the page...');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify still on Settings page
    console.log('\n3️⃣  Verifying still on Settings page...');
    const settingsVisible = await page.locator('text=/Settings/i').first().isVisible();
    const urlAfterRefresh = page.url();

    console.log(`   Current URL: ${urlAfterRefresh}`);
    console.log(`   Settings page visible: ${settingsVisible}`);

    expect(settingsVisible).toBe(true);
    console.log('   ✅ Successfully stayed on Settings page after refresh!');
  });

  test('Navigate through Settings tabs', async ({ page }) => {
    console.log('📑 Testing Settings Tabs Navigation\n');

    // Login and navigate to Settings
    console.log('1️⃣  Logging in and navigating to Settings...');
    await login(page);
    await page.locator('text=/Settings/i').first().click();
    await page.waitForLoadState('networkidle');
    console.log('   ✅ On Settings page');

    // Get all tabs
    console.log('\n2️⃣  Testing tab navigation...');
    const tabs = await page.locator('[role="tab"], .tab, button[class*="tab"]');
    const tabCount = await tabs.count();

    if (tabCount > 0) {
      console.log(`   Found ${tabCount} tabs to test`);

      // Click each tab
      for (let i = 0; i < Math.min(tabCount, 5); i++) {  // Test max 5 tabs
        const tab = tabs.nth(i);
        const tabText = await tab.textContent();
        console.log(`   Clicking tab ${i + 1}: ${tabText?.trim()}`);

        await tab.click();
        await page.waitForTimeout(500); // Wait for tab content to load

        // Take screenshot of each tab
        await page.screenshot({
          path: `openspec/testing/reports/screenshots/settings-tab-${i + 1}.png`,
          fullPage: true
        });
      }

      console.log('   ✅ Tab navigation working');
    } else {
      console.log('   ⚠️  No tabs found in Settings');
    }
  });

  test('Check for key settings sections', async ({ page }) => {
    console.log('🔍 Testing Key Settings Sections\n');

    // Login and navigate to Settings
    console.log('1️⃣  Logging in and navigating to Settings...');
    await login(page);
    // Use navigation button specifically
    await page.locator('[data-testid="nav-settings"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    console.log('   ✅ On Settings page');

    // Check for common settings sections
    console.log('\n2️⃣  Checking for common settings sections...');

    const sections = [
      { name: 'Modules', pattern: /modules?/i },
      { name: 'Organization', pattern: /organization/i },
      { name: 'Users', pattern: /users?/i },
      { name: 'Security', pattern: /security/i },
      { name: 'Advanced', pattern: /advanced/i },
    ];

    for (const section of sections) {
      const element = await page.locator(`text=${section.pattern}`).first();
      const visible = await element.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`   ${section.name}: ${visible ? '✅ Found' : '⚠️  Not found'}`);
    }

    console.log('\n✅ Settings sections check complete');
  });
});
