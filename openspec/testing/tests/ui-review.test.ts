import { test, expect } from '@playwright/test';

test('UI Review - Users and Groups Pages', async ({ page }) => {
  console.log('🎨 Starting UI Review of Users and Groups pages');

  // Navigate to the application
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Login as Jack
  console.log('📝 Logging in as Jack...');
  await page.fill('input#email', 'jack@gridworx.io');
  await page.fill('input#password', 'Jack123');
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await page.waitForTimeout(3000);

  // ================== USERS PAGE REVIEW ==================
  console.log('\n=== REVIEWING USERS PAGE ===\n');

  // Navigate to Users page
  const usersButton = page.locator('button.nav-item:has-text("Users")');
  if (await usersButton.count() > 0) {
    await usersButton.click();
    await page.waitForTimeout(2000);

    // Take full screenshot of Users page
    await page.screenshot({
      path: 'openspec/testing/screenshots/users-page-full.png',
      fullPage: true
    });
    console.log('📸 Users page screenshot saved');

    // Analyze Users page elements
    console.log('\n📋 Users Page Analysis:');

    // Check for tabs (Staff, Guests, Contacts)
    const tabs = page.locator('.user-tabs button');
    const tabCount = await tabs.count();
    console.log(`- Tab count: ${tabCount}`);
    if (tabCount > 0) {
      for (let i = 0; i < tabCount; i++) {
        const tabText = await tabs.nth(i).textContent();
        console.log(`  • Tab ${i + 1}: ${tabText?.trim()}`);
      }
    }

    // Check status filter
    const statusFilter = page.locator('select, .status-filter');
    if (await statusFilter.count() > 0) {
      console.log('- Status filter: Present');
    } else {
      console.log('- Status filter: Not found');
    }

    // Check search bars
    const searchBars = page.locator('input[placeholder*="Search"], input[type="search"]');
    const searchCount = await searchBars.count();
    if (searchCount > 0) {
      console.log(`- Search bars found: ${searchCount}`);
      for (let i = 0; i < searchCount; i++) {
        const placeholder = await searchBars.nth(i).getAttribute('placeholder');
        console.log(`  • Search ${i + 1}: "${placeholder}"`);
      }
    } else {
      console.log('- Search bar: Not found');
    }

    // Check add user button
    const addUserBtn = page.locator('button:has-text("Add User"), button:has-text("New User")');
    if (await addUserBtn.count() > 0) {
      console.log('- Add User button: Present');
    } else {
      console.log('- Add User button: Not found');
    }

    // Check user table
    const userTable = page.locator('table');
    if (await userTable.count() > 0) {
      console.log('- User table: Present');

      // Check table headers
      const headers = page.locator('thead th');
      const headerCount = await headers.count();
      console.log(`  • Column count: ${headerCount}`);
      for (let i = 0; i < headerCount && i < 10; i++) {
        const headerText = await headers.nth(i).textContent();
        console.log(`    - Column ${i + 1}: ${headerText?.trim()}`);
      }

      // Check row count
      const rows = page.locator('tbody tr');
      const rowCount = await rows.count();
      console.log(`  • User rows: ${rowCount}`);

      // Check for action menus
      const actionMenus = page.locator('tbody button[title*="Actions"], tbody button:has(svg)');
      const actionCount = await actionMenus.count();
      console.log(`  • Action buttons: ${actionCount}`);

      // Check for checkboxes
      const checkboxes = page.locator('tbody input[type="checkbox"]');
      const checkboxCount = await checkboxes.count();
      console.log(`  • Selection checkboxes: ${checkboxCount}`);
    } else {
      console.log('- User table: Not found');
    }

    // Click on first user to test slideout
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.count() > 0) {
      console.log('\n📌 Testing user slideout...');
      await firstRow.click();
      await page.waitForTimeout(1500);

      const slideout = page.locator('.user-slideout, .slideout-panel, [class*="slideout"]');
      if (await slideout.count() > 0) {
        console.log('- Slideout panel: Opened successfully');

        // Take screenshot of slideout
        await page.screenshot({
          path: 'openspec/testing/screenshots/user-slideout.png',
          fullPage: true
        });

        // Check slideout tabs
        const slideoutTabs = page.locator('.slideout-tab, .tab-button');
        const slideoutTabCount = await slideoutTabs.count();
        console.log(`- Slideout tabs: ${slideoutTabCount}`);

        // Close slideout
        const closeBtn = page.locator('button.slideout-close, button[aria-label*="Close"]');
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
          console.log('- Slideout: Closed');
        }
      } else {
        console.log('- Slideout panel: Not found');
      }
    }
  } else {
    console.log('❌ Users button not found');
  }

  // ================== GROUPS PAGE REVIEW ==================
  console.log('\n=== REVIEWING GROUPS PAGE ===\n');

  // Navigate to Groups page
  const groupsButton = page.locator('button.nav-item:has-text("Groups")');
  if (await groupsButton.count() > 0) {
    await groupsButton.click();
    await page.waitForTimeout(2000);

    // Take full screenshot of Groups page
    await page.screenshot({
      path: 'openspec/testing/screenshots/groups-page-full.png',
      fullPage: true
    });
    console.log('📸 Groups page screenshot saved');

    // Analyze Groups page elements
    console.log('\n📋 Groups Page Analysis:');

    // Check for create group button
    const createGroupBtn = page.locator('button:has-text("Create Group"), button:has-text("New Group"), button:has-text("Add Group")');
    if (await createGroupBtn.count() > 0) {
      console.log('- Create Group button: Present');
    } else {
      console.log('- Create Group button: Not found');
    }

    // Check for search functionality
    const groupSearch = page.locator('input[placeholder*="Search"], input[placeholder*="group"]');
    if (await groupSearch.count() > 0) {
      console.log('- Search functionality: Present');
    } else {
      console.log('- Search functionality: Not found');
    }

    // Check for groups display
    const groupCards = page.locator('.group-card, .group-item, [class*="group-card"]');
    const groupCardCount = await groupCards.count();

    if (groupCardCount > 0) {
      console.log(`- Group display type: Cards (${groupCardCount} groups)`);
    } else {
      // Check for table/list view
      const groupTable = page.locator('table');
      const groupRows = page.locator('tbody tr');
      const groupRowCount = await groupRows.count();
      if (groupRowCount > 0) {
        console.log(`- Group display type: Table/List (${groupRowCount} groups)`);
      } else {
        console.log('- Groups display: Empty or not found');
      }
    }

    // Check for group statistics
    const stats = page.locator('.group-stats, .stats-card, [class*="stats"]');
    if (await stats.count() > 0) {
      console.log('- Group statistics: Present');
    }

    // Check for filter options
    const filters = page.locator('.filter-section, .filter-bar, [class*="filter"]');
    if (await filters.count() > 0) {
      console.log('- Filter options: Present');
    }

    // Try clicking on a group if available
    if (groupCardCount > 0) {
      console.log('\n📌 Testing group interaction...');
      await groupCards.first().click();
      await page.waitForTimeout(1500);

      // Check if it opened a detail view or modal
      const groupDetail = page.locator('.group-detail, .group-modal, [class*="group-detail"]');
      if (await groupDetail.count() > 0) {
        console.log('- Group detail view: Opened');

        await page.screenshot({
          path: 'openspec/testing/screenshots/group-detail.png',
          fullPage: true
        });

        // Check for member list
        const memberList = page.locator('.member-list, .group-members, [class*="member"]');
        if (await memberList.count() > 0) {
          console.log('- Member list: Present');
        }

        // Go back or close
        const backBtn = page.locator('button:has-text("Back"), button[aria-label*="Back"], button[aria-label*="Close"]');
        if (await backBtn.count() > 0) {
          await backBtn.click();
        }
      }
    }
  } else {
    console.log('❌ Groups button not found');
  }

  // ================== UI/UX OBSERVATIONS ==================
  console.log('\n=== UI/UX OBSERVATIONS ===\n');

  // Check overall theme consistency
  const primaryButtons = page.locator('button.btn-primary, button[class*="primary"]');
  const primaryButtonCount = await primaryButtons.count();
  console.log(`🎨 Design Consistency:`);
  console.log(`- Primary buttons found: ${primaryButtonCount}`);

  // Check for loading states
  const loadingIndicators = page.locator('.loading, .spinner, [class*="loading"], [class*="spinner"]');
  console.log(`- Loading indicators present: ${await loadingIndicators.count() > 0}`);

  // Check for empty states
  const emptyStates = page.locator('.empty-state, .no-data, [class*="empty"]');
  console.log(`- Empty state components: ${await emptyStates.count()}`);

  // Check responsive behavior
  console.log('\n📱 Responsive Design Check:');

  // Test tablet view
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'openspec/testing/screenshots/users-tablet-view.png',
    fullPage: false
  });
  console.log('- Tablet view screenshot saved');

  // Test mobile view
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'openspec/testing/screenshots/users-mobile-view.png',
    fullPage: false
  });
  console.log('- Mobile view screenshot saved');

  console.log('\n✅ UI Review Complete!');
  console.log('📁 Screenshots saved in: openspec/testing/screenshots/');
});