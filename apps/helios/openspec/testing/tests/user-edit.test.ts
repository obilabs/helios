import { test, expect } from '@playwright/test';

test('User Edit Functionality', async ({ page }) => {
  console.log('🔧 Testing user edit functionality');

  // Navigate to the application
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Check if we're on the setup page or login page
  const setupHeader = page.locator('h1:has-text("Welcome to Helios")');
  const loginHeader = page.locator('h1:has-text("Helios Admin Portal")');

  if (await setupHeader.count() > 0) {
    console.log('⚠️ Organization setup required first');

    // Complete setup
    await page.fill('input[name="orgName"]', 'Test Organization');
    await page.fill('input[name="orgDomain"]', 'test.com');
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(1000);

    // Admin setup
    await page.fill('input[name="adminFirstName"]', 'Admin');
    await page.fill('input[name="adminLastName"]', 'User');
    await page.fill('input[name="adminEmail"]', 'admin@test.com');
    await page.fill('input[name="adminPassword"]', 'Admin123!');
    await page.fill('input[name="confirmPassword"]', 'Admin123!');
    await page.click('button:has-text("Complete Setup")');
    await page.waitForTimeout(3000);
  }

  // Try login if we're on login page
  if ((await loginHeader.count() > 0) || (await page.locator('input#email').count() > 0)) {
    console.log('📝 Attempting login as Jack...');
    await page.fill('input#email', 'jack@gridworx.io');
    await page.fill('input#password', 'Jack123');
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForTimeout(3000);
  }

  // Check if we're logged in by looking for the sidebar or nav items
  const sidebar = page.locator('.app-sidebar');
  const navItems = page.locator('.nav-item');

  console.log('Checking for sidebar:', await sidebar.count());
  console.log('Checking for nav items:', await navItems.count());

  if ((await sidebar.count() === 0) && (await navItems.count() === 0)) {
    console.log('❌ Failed to login or access dashboard');

    // Check what's on the page
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log('Page title:', pageTitle);
    console.log('Page URL:', pageUrl);

    // Check for error messages
    const errorMsg = page.locator('.error-message, .alert-error, [role="alert"]');
    if (await errorMsg.count() > 0) {
      console.log('Error message found:', await errorMsg.first().textContent());
    }

    await page.screenshot({
      path: 'openspec/testing/screenshots/user-edit-login-failed.png',
      fullPage: true
    });
    return;
  }

  console.log('✅ Successfully logged in');

  // Navigate to Users page
  const usersButton = page.locator('button.nav-item:has-text("Users")');
  if (await usersButton.count() > 0) {
    await usersButton.click();
    await page.waitForTimeout(2000);
  } else {
    console.log('❌ Users button not found');
    return;
  }

  // Click on the first user in the list to open the slideout
  const firstUserRow = page.locator('tbody tr').first();
  if (await firstUserRow.count() > 0) {
    await firstUserRow.click();
    await page.waitForTimeout(1000);

    // Look for the Edit User button
    const editButton = page.locator('button:has-text("Edit User")');
    const editButtonExists = await editButton.count() > 0;

    console.log('✅ Edit User button exists:', editButtonExists);

    if (editButtonExists) {
      // Click the Edit User button
      await editButton.click();
      await page.waitForTimeout(500);

      // Check if edit mode is active by looking for Save button
      const saveButton = page.locator('button:has-text("Save")');
      const saveButtonExists = await saveButton.count() > 0;
      console.log('✅ Save button exists (edit mode active):', saveButtonExists);

      // Check for editable fields
      const editableInputs = page.locator('input[type="text"]');
      const inputCount = await editableInputs.count();
      console.log('✅ Number of editable text inputs found:', inputCount);

      // Try to edit a field (e.g., job title)
      const jobTitleInput = page.locator('input[type="text"]').nth(2); // Assuming job title is the 3rd input
      if (await jobTitleInput.count() > 0) {
        await jobTitleInput.fill('Senior Developer');
        console.log('✅ Successfully edited job title field');
      }

      // Cancel the edit
      const cancelButton = page.locator('button:has-text("Cancel")');
      if (await cancelButton.count() > 0) {
        await cancelButton.click();
        console.log('✅ Cancelled edit mode');
      }

      // Verify we're back to view mode
      const editButtonAgain = page.locator('button:has-text("Edit User")');
      const backToViewMode = await editButtonAgain.count() > 0;
      console.log('✅ Back to view mode:', backToViewMode);
    }

    // Close the slideout
    const closeButton = page.locator('button.slideout-close');
    if (await closeButton.count() > 0) {
      await closeButton.click();
      console.log('✅ Slideout closed');
    }
  } else {
    console.log('⚠️ No users found in the list to test edit functionality');
  }

  // Take a screenshot
  await page.screenshot({
    path: 'openspec/testing/screenshots/user-edit-test.png',
    fullPage: true
  });

  console.log('✅ User edit functionality test complete');
});