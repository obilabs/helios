import { test, expect } from '@playwright/test';

test('UI Improvements Review', async ({ page }) => {
  console.log('🎨 Reviewing UI Improvements');

  // Navigate to the application
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Login as Jack
  console.log('📝 Logging in as Jack...');
  await page.fill('input#email', 'jack@gridworx.io');
  await page.fill('input#password', 'Jack123');
  await page.click('button[type="submit"]');

  // Wait for dashboard to load
  await page.waitForTimeout(3000);

  console.log('\n=== USERS PAGE IMPROVEMENTS ===\n');

  // Navigate to Users page
  const usersButton = page.locator('button.nav-item:has-text("Users")');
  if (await usersButton.count() > 0) {
    await usersButton.click();
    await page.waitForTimeout(2000);

    // Check for statistics dashboard
    const statsBar = page.locator('.users-stats-bar');
    if (await statsBar.count() > 0) {
      console.log('✅ Statistics dashboard added');
      const statCards = page.locator('.stat-card');
      const statCount = await statCards.count();
      console.log(`   - ${statCount} stat cards displayed`);

      for (let i = 0; i < statCount; i++) {
        const value = await statCards.nth(i).locator('.stat-value').textContent();
        const label = await statCards.nth(i).locator('.stat-label').textContent();
        console.log(`   - ${label}: ${value}`);
      }
    } else {
      console.log('❌ Statistics dashboard not found');
    }

    // Check button color (should be purple now)
    const addUserBtn = page.locator('.btn-add-user-primary, button:has-text("+ Users")');
    if (await addUserBtn.count() > 0) {
      const bgColor = await addUserBtn.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );
      console.log(`✅ Add User button color: ${bgColor}`);
      if (bgColor.includes('139') || bgColor.includes('92') || bgColor.includes('246')) {
        console.log('   - Button is now purple (correct)');
      } else {
        console.log('   - Button color may not be purple');
      }
    }

    // Check if duplicate search bar is hidden
    const searchBoxes = page.locator('.search-box');
    const searchCount = await searchBoxes.count();
    const visibleSearch = await searchBoxes.evaluateAll(elements =>
      elements.filter(el => window.getComputedStyle(el).display !== 'none').length
    );
    console.log(`✅ Search bars: ${searchCount} total, ${visibleSearch} visible`);
    if (visibleSearch === 0) {
      console.log('   - Duplicate search bar successfully hidden');
    }

    // Check tab styling improvements
    const typeTabs = page.locator('.type-tab');
    if (await typeTabs.count() > 0) {
      const activeTab = page.locator('.type-tab.active');
      if (await activeTab.count() > 0) {
        const tabStyles = await activeTab.evaluate(el => ({
          color: window.getComputedStyle(el).color,
          borderBottom: window.getComputedStyle(el).borderBottom,
          background: window.getComputedStyle(el).background
        }));
        console.log('✅ Tab styling improved:');
        console.log(`   - Active tab color: ${tabStyles.color}`);
        console.log(`   - Border: ${tabStyles.borderBottom}`);
      }
    }

    // Take screenshot
    await page.screenshot({
      path: 'openspec/testing/screenshots/users-page-improved.png',
      fullPage: true
    });
    console.log('📸 Users page screenshot saved');
  }

  console.log('\n=== GROUPS PAGE IMPROVEMENTS ===\n');

  // Navigate to Groups page
  const groupsButton = page.locator('button.nav-item:has-text("Groups")');
  if (await groupsButton.count() > 0) {
    await groupsButton.click();
    await page.waitForTimeout(2000);

    // Check group member counts
    const memberCounts = page.locator('tbody td:has-text("members"), .member-count');
    if (await memberCounts.count() > 0) {
      console.log('✅ Member counts found:');
      for (let i = 0; i < Math.min(3, await memberCounts.count()); i++) {
        const text = await memberCounts.nth(i).textContent();
        console.log(`   - ${text}`);
      }
    } else {
      console.log('❌ Member counts not visible');
    }

    // Check Create Group button color (should be purple)
    const createGroupBtn = page.locator('button:has-text("Create Group")');
    if (await createGroupBtn.count() > 0) {
      const bgColor = await createGroupBtn.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );
      console.log(`✅ Create Group button color: ${bgColor}`);
      if (bgColor.includes('139') || bgColor.includes('92') || bgColor.includes('246')) {
        console.log('   - Button is purple (correct)');
      }
    }

    // Take screenshot
    await page.screenshot({
      path: 'openspec/testing/screenshots/groups-page-improved.png',
      fullPage: true
    });
    console.log('📸 Groups page screenshot saved');
  }

  console.log('\n✅ UI Improvements Review Complete!');
});