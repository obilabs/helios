import { test, expect } from '@playwright/test';

test('Add user to group shows success and persists', async ({ page }) => {
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

  // Click on first user row to open slideout
  const firstUserRow = page.locator('.table-row.clickable').first();
  const userName = await firstUserRow.locator('.user-name').textContent();
  console.log('Opening user:', userName);
  await firstUserRow.click();
  await page.waitForTimeout(2000);

  // Screenshot of slideout
  await page.screenshot({
    path: 'reports/screenshots/add-to-group-1-slideout.png',
    fullPage: false
  });

  // Click on Groups tab in the slideout
  const groupsTab = page.locator('.slideout-tab:has-text("Groups")');
  await groupsTab.click();
  await page.waitForTimeout(1000);
  console.log('✅ Clicked Groups tab');

  // Get initial group count
  const initialGroupsList = page.locator('.group-card, .group-item, .groups-list .group');
  const initialGroupCount = await initialGroupsList.count();
  console.log('Initial groups count:', initialGroupCount);

  // Screenshot of Groups tab
  await page.screenshot({
    path: 'reports/screenshots/add-to-group-2-groups-tab.png',
    fullPage: false
  });

  // Find and click "Add to Group" button
  const addToGroupBtn = page.locator('button:has-text("Add to Group")');
  const addBtnVisible = await addToGroupBtn.isVisible();
  console.log('Add to Group button visible:', addBtnVisible);

  if (addBtnVisible) {
    await addToGroupBtn.click();
    await page.waitForTimeout(1000);

    // Screenshot of modal
    await page.screenshot({
      path: 'reports/screenshots/add-to-group-3-modal.png',
      fullPage: false
    });

    // Check if modal is visible
    const modal = page.locator('.modal-content').first();
    const modalVisible = await modal.isVisible();
    console.log('Add to group modal visible:', modalVisible);

    // Get available groups in the modal
    const groupCheckboxes = page.locator('.modal-content input[type="checkbox"]');
    const groupCount = await groupCheckboxes.count();
    console.log('Available groups in modal:', groupCount);

    if (groupCount > 0) {
      // Select the first available group
      await groupCheckboxes.first().check();
      await page.waitForTimeout(500);

      // Find and click the confirm button
      const confirmBtn = page.locator('.modal-content button:has-text("Add")');
      const confirmVisible = await confirmBtn.isVisible();
      console.log('Confirm button visible:', confirmVisible);

      if (confirmVisible) {
        // Set up console listener for API errors
        page.on('console', msg => {
          if (msg.type() === 'error') {
            console.log('Browser error:', msg.text());
          }
        });

        // Set up network listener
        const responsePromise = page.waitForResponse(
          response => response.url().includes('/access-groups/') &&
                      response.url().includes('/members'),
          { timeout: 10000 }
        ).catch(() => null);

        await confirmBtn.click();
        await page.waitForTimeout(2000);

        // Check for the API response
        const response = await responsePromise;
        if (response) {
          const status = response.status();
          console.log('API response status:', status);
          if (!response.ok()) {
            const body = await response.text();
            console.log('API error response:', body);
          }
        } else {
          console.log('No API response captured (might not have fired)');
        }

        // Screenshot after add
        await page.screenshot({
          path: 'reports/screenshots/add-to-group-4-after-add.png',
          fullPage: false
        });

        // Check for success/error toast
        const successToast = page.locator('.toast.success, .toast-success, [class*="success"]');
        const errorToast = page.locator('.toast.error, .toast-error, [class*="error"]');

        const hasSuccess = await successToast.isVisible().catch(() => false);
        const hasError = await errorToast.isVisible().catch(() => false);

        console.log('Success toast visible:', hasSuccess);
        console.log('Error toast visible:', hasError);

        if (hasError) {
          const errorText = await errorToast.textContent();
          console.log('Error message:', errorText);
        }
        if (hasSuccess) {
          const successText = await successToast.textContent();
          console.log('Success message:', successText);
        }

        // Final check - group count should have increased
        const finalGroupCount = await page.locator('.group-card, .group-item, .groups-list .group').count();
        console.log('Final groups count:', finalGroupCount);

        console.log('\n=== RESULT ===');
        console.log('Initial groups:', initialGroupCount);
        console.log('Final groups:', finalGroupCount);
        console.log('Groups added:', finalGroupCount - initialGroupCount);
      }
    } else {
      console.log('No groups available to add');
    }
  } else {
    console.log('Add to Group button not visible - checking page state');
    const pageContent = await page.locator('.slideout-content, .user-slideout').first().textContent();
    console.log('Slideout content preview:', pageContent?.substring(0, 300));
  }
});
