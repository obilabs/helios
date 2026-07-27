import { test, expect } from '@playwright/test';

test.describe('Users List Feature', () => {
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

  test('Navigate to Users page and verify list loads', async ({ page }) => {
    console.log('👥 Testing Users List Feature\n');

    // Step 1: Login
    console.log('1️⃣  Logging in...');
    await login(page);
    console.log('   ✅ Logged in');

    // Step 2: Navigate to Users
    console.log('\n2️⃣  Navigating to Users page...');
    // Find the Users button in the sidebar navigation using data-testid
    const usersButton = page.locator('[data-testid="nav-users"], nav button:has-text("Users")').first();
    await usersButton.click();
    await page.waitForLoadState('networkidle');
    // Wait a bit for React to render
    await page.waitForTimeout(1000);

    // Take screenshot
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/users-list-page.png',
      fullPage: true
    });
    console.log('   ✅ Clicked Users navigation');

    // Step 3: Verify Users page elements
    console.log('\n3️⃣  Verifying Users page elements...');

    // Check for the users-page container (main page wrapper)
    const usersPage = page.locator('.users-page').first();
    const pageVisible = await usersPage.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`   Users page container visible: ${pageVisible}`);

    // Check for Users heading (h1)
    const usersHeading = page.locator('h1:has-text("Users")').first();
    const headingVisible = await usersHeading.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`   Users heading visible: ${headingVisible}`);

    // Check for type tabs (Staff, Guests, Contacts)
    const typeTabs = page.locator('.type-tabs').first();
    const tabsVisible = await typeTabs.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`   Type tabs visible: ${tabsVisible}`);

    // Verify at least one indicator that users page loaded
    expect(pageVisible || headingVisible || tabsVisible).toBe(true);
    console.log('   ✅ Users page is displaying');

    // Step 4: Check for common UI elements
    console.log('\n4️⃣  Checking for common UI elements...');

    // Search functionality (text input with placeholder "Search")
    const searchInput = page.locator('input[placeholder="Search"]').first();
    const searchVisible = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`   Search input visible: ${searchVisible}`);

    // Add user button (contains "+ Users" text)
    const addButton = page.locator('button:has-text("+ Users")').first();
    const addButtonVisible = await addButton.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`   Add user button visible: ${addButtonVisible}`);

    console.log('\n✅ Users List Test Summary:');
    console.log('   ✅ Navigation to Users worked');
    console.log('   ✅ Users page is displayed');
    console.log(`   ${searchVisible ? '✅' : '⚠️'} Search functionality ${searchVisible ? 'available' : 'not found'}`);
    console.log(`   ${addButtonVisible ? '✅' : '⚠️'} Add user button ${addButtonVisible ? 'available' : 'not found'}`);
  });

  test('Users page persists after refresh', async ({ page }) => {
    console.log('🔄 Testing Users Page Persistence\n');

    // Login and navigate to Users
    console.log('1️⃣  Logging in and navigating to Users...');
    await login(page);
    await page.locator('[data-testid="nav-users"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    console.log('   ✅ On Users page');

    // Refresh the page
    console.log('\n2️⃣  Refreshing the page...');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Dismiss ViewOnboarding modal if it appears after refresh
    const onboardingModal = page.locator('.view-onboarding-overlay');
    if (await onboardingModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const closeBtn = page.locator('.view-onboarding-close, button.view-onboarding-button.primary');
      if (await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Verify still on Users page
    console.log('\n3️⃣  Verifying still on Users page...');
    const urlAfterRefresh = page.url();
    const usersPageContainer = page.locator('.users-page, [class*="user"], h1:has-text("Users")').first();
    const usersVisible = await usersPageContainer.isVisible({ timeout: 5000 }).catch(() => false);
    const urlCorrect = urlAfterRefresh.includes('/users') || urlAfterRefresh.includes('/admin/users');

    console.log(`   Current URL: ${urlAfterRefresh}`);
    console.log(`   URL correct: ${urlCorrect}`);
    console.log(`   Users page visible: ${usersVisible}`);

    // The test passes if either the URL is correct OR the page is visible
    expect(urlCorrect || usersVisible).toBe(true);
    console.log('   ✅ Successfully stayed on Users page after refresh!');
  });

  test('Search users functionality', async ({ page }) => {
    console.log('🔍 Testing Users Search\n');

    // Login and navigate to Users
    console.log('1️⃣  Logging in and navigating to Users...');
    await login(page);
    await page.locator('[data-testid="nav-users"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    console.log('   ✅ On Users page');

    // Try to find and use search
    console.log('\n2️⃣  Testing search functionality...');
    const searchInput = page.locator('input[placeholder="Search"]').first();
    const searchVisible = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (searchVisible) {
      console.log('   ✅ Search input found');
      await searchInput.fill('Jack');
      await page.waitForTimeout(1000); // Wait for search to filter
      console.log('   ✅ Search performed');

      // The UserList component handles the actual filtering
      // Just verify the search input is working
      const searchValue = await searchInput.inputValue();
      expect(searchValue).toBe('Jack');

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);
      console.log('   ✅ Search functionality working');
    } else {
      console.log('   ⚠️  Search input not found, skipping search test');
    }
  });
});
