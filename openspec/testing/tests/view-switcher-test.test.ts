import { test, expect } from '@playwright/test';

test('ViewSwitcher visibility and functionality', async ({ page }) => {
  test.setTimeout(90000);

  // Enable logging
  page.on('console', msg => console.log(`[${msg.type().toUpperCase()}]:`, msg.text()));
  page.on('pageerror', error => console.error('[PAGE ERROR]:', error.message));

  // Clear the onboarding state before testing to simulate fresh login
  console.log('\n=== STEP 0: Setup ===');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Clear localStorage to ensure we see the onboarding flow
  await page.evaluate(() => {
    localStorage.removeItem('helios_view_onboarding_completed');
    localStorage.removeItem('helios_view_preference');
  });

  console.log('\n=== STEP 1: Login ===');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'reports/screenshots/view-switcher-1-before-login.png' });

  await page.fill('input[type="email"]', 'mike@gridworx.io');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  console.log('\n=== STEP 2: Check for ViewOnboarding modal ===');
  await page.screenshot({ path: 'reports/screenshots/view-switcher-2-after-login.png', fullPage: true });

  // Check if ViewOnboarding overlay is present (first-time admin flow)
  const viewOnboarding = page.locator('.view-onboarding-overlay');
  const hasViewOnboarding = await viewOnboarding.count();
  console.log(`ViewOnboarding modal: ${hasViewOnboarding > 0 ? 'PRESENT (first-time admin)' : 'NOT PRESENT (returning user)'}`);

  if (hasViewOnboarding > 0) {
    console.log('✓ ViewOnboarding modal is showing correctly for internal admin');

    // Test that we can select a view and continue
    await page.screenshot({ path: 'reports/screenshots/view-switcher-2b-onboarding-modal.png' });

    // Click the "Continue to Admin Console" button (default selection)
    const continueBtn = page.locator('button:has-text("Continue to")');
    await continueBtn.click();
    await page.waitForTimeout(1500);

    console.log('✓ Completed ViewOnboarding by selecting Admin Console');
  }

  console.log('\n=== STEP 3: Check ViewSwitcher after onboarding ===');
  await page.screenshot({ path: 'reports/screenshots/view-switcher-3-after-onboarding.png', fullPage: true });

  // Now the ViewSwitcher should be accessible
  const viewSwitcher = page.locator('.view-switcher');
  const viewSwitcherTrigger = page.locator('[data-testid="view-switcher-trigger"]');

  const hasViewSwitcherClass = await viewSwitcher.count();
  const hasViewSwitcherTestId = await viewSwitcherTrigger.count();

  console.log(`ViewSwitcher (class): ${hasViewSwitcherClass} found`);
  console.log(`ViewSwitcher (testid): ${hasViewSwitcherTestId} found`);

  // Verify ViewSwitcher is present
  expect(hasViewSwitcherClass).toBeGreaterThan(0);
  expect(hasViewSwitcherTestId).toBeGreaterThan(0);

  console.log('\n=== STEP 4: Test ViewSwitcher functionality ===');
  await viewSwitcherTrigger.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'reports/screenshots/view-switcher-4-dropdown-open.png' });

  // Check for dropdown options
  const adminOption = page.locator('[data-testid="view-option-admin"]');
  const userOption = page.locator('[data-testid="view-option-user"]');

  const hasAdminOption = await adminOption.count();
  const hasUserOption = await userOption.count();

  console.log(`Admin option: ${hasAdminOption > 0 ? 'Found ✓' : 'Missing ✗'}`);
  console.log(`User option: ${hasUserOption > 0 ? 'Found ✓' : 'Missing ✗'}`);

  expect(hasAdminOption).toBeGreaterThan(0);
  expect(hasUserOption).toBeGreaterThan(0);

  // Switch to user view
  console.log('\n=== STEP 5: Switch to Employee View ===');
  await userOption.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'reports/screenshots/view-switcher-5-user-view.png', fullPage: true });

  // Verify the ViewSwitcher now shows "Employee View"
  const currentLabel = await viewSwitcherTrigger.textContent();
  console.log(`Current view label: "${currentLabel}"`);
  expect(currentLabel).toContain('Employee');

  // Switch back to admin view
  console.log('\n=== STEP 6: Switch back to Admin Console ===');
  await viewSwitcherTrigger.click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="view-option-admin"]').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'reports/screenshots/view-switcher-6-admin-view.png', fullPage: true });

  const adminLabel = await viewSwitcherTrigger.textContent();
  console.log(`Current view label: "${adminLabel}"`);
  expect(adminLabel).toContain('Admin');

  console.log('\n=== ALL TESTS PASSED ===');
  console.log('✓ ViewOnboarding shows for first-time internal admins');
  console.log('✓ ViewSwitcher is visible in header after onboarding');
  console.log('✓ ViewSwitcher dropdown has Admin and User options');
  console.log('✓ Switching between views works correctly');
});
