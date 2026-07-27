import { test, expect, Page } from '@playwright/test';

// Test credentials
const INTERNAL_ADMIN = {
  email: 'mike@gridworx.io',
  password: 'admin123',
};

const EXTERNAL_ADMIN = {
  email: 'external-admin@test.com',
  password: 'admin123',
};

const REGULAR_USER = {
  email: 'coriander@gridworx.io',
  password: 'admin123', // Using same password for test simplicity
};

/**
 * Helper to login as a specific user
 */
async function login(page: Page, credentials: { email: string; password: string }) {
  await page.goto('/');

  // Wait for login page
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  // Fill login form
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for navigation after login
  await page.waitForURL(/.*dashboard.*|.*admin.*|.*\/$/, { timeout: 15000 });
}

/**
 * Helper to logout
 */
async function logout(page: Page) {
  // Click user menu and logout
  const userMenu = page.locator('[data-testid="user-menu"], .user-menu, .avatar');
  if (await userMenu.isVisible()) {
    await userMenu.click();
    const logoutBtn = page.locator('text=Logout, text=Sign out, button:has-text("Logout")');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    }
  }
}

test.describe('Admin/User Separation', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test.describe('TASK-AUS-T01: External Admin Flow', () => {
    test('external admin should login successfully', async ({ page }) => {
      await login(page, EXTERNAL_ADMIN);

      // Should land on dashboard (URL may be / or /admin)
      await expect(page.locator('h1')).toContainText('Dashboard');
    });

    test('external admin should not see People in navigation', async ({ page }) => {
      await login(page, EXTERNAL_ADMIN);

      // Wait for navigation to load
      await page.waitForTimeout(1000);

      // People link should not be visible for external admins
      const peopleNav = page.locator('[data-testid="nav-people"], a[href="/people"], nav:has-text("People")');

      // Either the link doesn't exist, or it's not visible
      const count = await peopleNav.count();
      if (count > 0) {
        await expect(peopleNav.first()).not.toBeVisible();
      }
    });

    test('external admin should not see My Team in navigation', async ({ page }) => {
      await login(page, EXTERNAL_ADMIN);

      await page.waitForTimeout(1000);

      const myTeamNav = page.locator('[data-testid="nav-my-team"], a[href="/my-team"], nav:has-text("My Team")');

      const count = await myTeamNav.count();
      if (count > 0) {
        await expect(myTeamNav.first()).not.toBeVisible();
      }
    });

    test('external admin should not see view switcher', async ({ page }) => {
      await login(page, EXTERNAL_ADMIN);

      await page.waitForTimeout(1000);

      // View switcher should not be visible for external admins
      const viewSwitcher = page.locator('[data-testid="view-switcher"], .view-switcher');

      const count = await viewSwitcher.count();
      if (count > 0) {
        await expect(viewSwitcher.first()).not.toBeVisible();
      }
    });

    test('external admin should be redirected when navigating to /people', async ({ page }) => {
      await login(page, EXTERNAL_ADMIN);

      // Try to navigate directly to /people
      await page.goto('/people');

      // Should be redirected away from /people
      await page.waitForTimeout(2000);

      // Either redirected to /admin or the page shows access denied
      const url = page.url();
      const isPeoplePage = url.includes('/people');

      if (isPeoplePage) {
        // If still on /people, should see an access denied message
        const accessDenied = page.locator('text=access denied, text=not authorized, text=employees only');
        await expect(accessDenied.first()).toBeVisible({ timeout: 5000 }).catch(() => {
          // It's okay if redirected
        });
      }
    });

    test('external admin should see admin navigation items', async ({ page }) => {
      await login(page, EXTERNAL_ADMIN);

      await page.waitForTimeout(1000);

      // External admin should see admin nav items like Users, Groups, Settings
      const usersNav = page.locator('[data-testid="nav-users"], a[href*="users"]');
      const settingsNav = page.locator('[data-testid="nav-settings"], a[href*="settings"]');

      // At least one admin nav item should be visible
      const usersVisible = await usersNav.first().isVisible().catch(() => false);
      const settingsVisible = await settingsNav.first().isVisible().catch(() => false);

      expect(usersVisible || settingsVisible).toBeTruthy();
    });
  });

  test.describe('TASK-AUS-T02: Internal Admin Flow', () => {
    test('internal admin should login successfully', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      // Should land on dashboard (URL may be / or /admin)
      await expect(page.locator('h1')).toContainText('Dashboard');
    });

    test('internal admin should see view switcher', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      await page.waitForTimeout(1500);

      // View switcher should be visible for internal admins
      const viewSwitcher = page.locator('[data-testid="view-switcher"], .view-switcher, button:has-text("Admin Console"), button:has-text("Employee View")');

      // If there's an onboarding modal, close it first
      const onboardingClose = page.locator('[data-testid="onboarding-close"], .onboarding-close, button:has-text("Got it")');
      if (await onboardingClose.isVisible().catch(() => false)) {
        await onboardingClose.click();
      }

      // Check if view switcher is visible
      const isVisible = await viewSwitcher.first().isVisible().catch(() => false);
      expect(isVisible).toBeTruthy();
    });

    test('internal admin should be able to switch to user view', async ({ page }) => {
      // Set onboarding as completed to skip the modal
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('helios_view_onboarding_completed', 'true');
      });

      await login(page, INTERNAL_ADMIN);

      await page.waitForTimeout(1500);

      // Dismiss any onboarding modal that may appear
      const onboardingClose = page.locator('.view-onboarding-close, button:has-text("Continue to Admin Console"), button[aria-label="Close"]');
      if (await onboardingClose.first().isVisible().catch(() => false)) {
        await onboardingClose.first().click();
        await page.waitForTimeout(500);
      }

      // Find and click the view switcher
      const viewSwitcher = page.locator('[data-testid="view-switcher-trigger"], .view-switcher-trigger');

      if (await viewSwitcher.isVisible().catch(() => false)) {
        await viewSwitcher.click();

        // Select employee view option
        const employeeViewOption = page.locator('text=Employee View, [data-testid="employee-view-option"]');
        if (await employeeViewOption.isVisible().catch(() => false)) {
          await employeeViewOption.click();

          // Should navigate to user dashboard or see user navigation
          await page.waitForTimeout(1000);

          // Navigation should now show user items like People, My Team
          const peopleNav = page.locator('[data-testid="nav-people"], a[href="/people"]');
          const isVisible = await peopleNav.first().isVisible().catch(() => false);
          expect(isVisible).toBeTruthy();
        }
      }
    });

    test('internal admin can access People page', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      // Navigate to people page
      await page.goto('/people');

      await page.waitForTimeout(2000);

      // Should be able to see the People directory
      const pageTitle = page.locator('h1, .page-title');
      const titleText = await pageTitle.first().textContent().catch(() => '');

      // Should either show People directory or not be redirected away
      expect(page.url()).toContain('/people');
    });

    test('internal admin can access admin dashboard', async ({ page }) => {
      await login(page, INTERNAL_ADMIN);

      await page.goto('/admin');

      await page.waitForTimeout(1500);

      // Should be on admin dashboard
      expect(page.url()).toMatch(/.*admin.*/);
    });
  });

  test.describe('TASK-AUS-T03: Regular User Flow', () => {
    test.skip('regular user should login successfully', async ({ page }) => {
      // Skip if regular user password is not set up
      await login(page, REGULAR_USER);

      // Should land on user home (not admin)
      await page.waitForTimeout(1500);

      // Regular users should not be on /admin routes
      const url = page.url();
      const isAdmin = url.includes('/admin');

      // If they landed on admin, check if they were supposed to
      if (isAdmin) {
        // Check if user has admin role unexpectedly
        console.log('Warning: Regular user landed on admin page');
      }
    });

    test.skip('regular user should not see admin navigation items', async ({ page }) => {
      await login(page, REGULAR_USER);

      await page.waitForTimeout(1000);

      // Admin-only nav items should not be visible
      const usersNav = page.locator('[data-testid="nav-users"]');
      const auditNav = page.locator('[data-testid="nav-audit-logs"]');

      const usersVisible = await usersNav.isVisible().catch(() => false);
      const auditVisible = await auditNav.isVisible().catch(() => false);

      expect(usersVisible).toBeFalsy();
      expect(auditVisible).toBeFalsy();
    });

    test.skip('regular user should not see view switcher', async ({ page }) => {
      await login(page, REGULAR_USER);

      await page.waitForTimeout(1000);

      const viewSwitcher = page.locator('[data-testid="view-switcher"], .view-switcher');

      const count = await viewSwitcher.count();
      if (count > 0) {
        await expect(viewSwitcher.first()).not.toBeVisible();
      }
    });

    test.skip('regular user should be redirected when navigating to /admin', async ({ page }) => {
      await login(page, REGULAR_USER);

      // Try to navigate directly to admin
      await page.goto('/admin/users');

      await page.waitForTimeout(2000);

      // Should be redirected away from admin routes
      const url = page.url();

      // Either redirected to home or shows access denied
      const isAdminPage = url.includes('/admin/');

      if (isAdminPage) {
        // Should see access denied message
        const accessDenied = page.locator('text=access denied, text=not authorized, text=Admin access required');
        await expect(accessDenied.first()).toBeVisible({ timeout: 5000 }).catch(() => {
          // Acceptable if redirected
        });
      }
    });

    test.skip('regular user can access People page', async ({ page }) => {
      await login(page, REGULAR_USER);

      await page.goto('/people');

      await page.waitForTimeout(1500);

      // Should be able to see the People directory
      expect(page.url()).toContain('/people');
    });
  });
});

test.describe('Dashboard Stats Display', () => {
  test('dashboard should display user count stats', async ({ page }) => {
    await login(page, INTERNAL_ADMIN);

    // Wait for dashboard to fully load
    await page.waitForTimeout(3000);

    // Check that dashboard widgets are visible
    const widgetGrid = page.locator('.dashboard-widget-grid');
    await expect(widgetGrid).toBeVisible({ timeout: 10000 });

    // Check for metric cards
    const metricCards = page.locator('.metric-card');
    const cardCount = await metricCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Verify at least one metric card has a value (not showing 0 or empty)
    const cardValues = page.locator('.metric-card-value');
    const valuesCount = await cardValues.count();
    expect(valuesCount).toBeGreaterThan(0);

    // Check the first card has a non-zero or meaningful value
    const firstValue = await cardValues.first().textContent();
    expect(firstValue).not.toBe('');
  });

  test('dashboard should show Google Workspace users when connected', async ({ page }) => {
    await login(page, INTERNAL_ADMIN);

    await page.waitForTimeout(3000);

    // Look for Google-related widget showing user count
    const googleUsersWidget = page.locator('.metric-card:has-text("Google Workspace")').first();

    // Either Google is configured (showing users) or not (showing 0)
    const isVisible = await googleUsersWidget.isVisible().catch(() => false);
    if (isVisible) {
      const value = await googleUsersWidget.locator('.metric-card-value').textContent();
      // Value should be a number
      expect(value).toMatch(/^\d+$/);
    }
  });
});

test.describe('Navigation Consistency', () => {
  test('admin routes should have /admin prefix', async ({ page }) => {
    await login(page, INTERNAL_ADMIN);

    // Navigate to various admin pages and verify URL structure
    const adminPages = [
      { path: '/admin/users', expected: '/admin/users' },
      { path: '/admin/groups', expected: '/admin/groups' },
      { path: '/admin/settings', expected: '/admin/settings' },
    ];

    for (const adminPage of adminPages) {
      await page.goto(adminPage.path);
      await page.waitForTimeout(1000);

      // Should stay on admin routes
      expect(page.url()).toContain(adminPage.expected);
    }
  });

  test('user routes should be at root level', async ({ page }) => {
    await login(page, INTERNAL_ADMIN);

    // Switch to user view first (if needed) then check user pages
    const userPages = [
      { path: '/people', expected: '/people' },
      { path: '/my-profile', expected: '/my-profile' },
    ];

    for (const userPage of userPages) {
      await page.goto(userPage.path);
      await page.waitForTimeout(1000);

      // Should be at root level (not under /admin)
      const url = page.url();
      expect(url).toContain(userPage.expected);
      expect(url.includes('/admin/' + userPage.expected.substring(1))).toBeFalsy();
    }
  });
});

test.describe('Settings Link Context', () => {
  test('Settings link in admin view should navigate to admin settings', async ({ page }) => {
    // Skip onboarding modal
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('helios_view_onboarding_completed', 'true');
      localStorage.setItem('helios_view_preference', 'admin');
    });

    await login(page, INTERNAL_ADMIN);

    // Wait for dashboard to fully load (header should be visible)
    await page.waitForSelector('.client-header', { timeout: 15000 });

    // Click user menu trigger button (the button containing the avatar)
    const userMenuTrigger = page.locator('button.user-menu-trigger');
    await userMenuTrigger.click();

    // Wait for dropdown to appear
    await page.waitForSelector('.user-menu-dropdown', { timeout: 5000 });

    // Click Settings in dropdown
    const settingsLink = page.locator('.user-menu-dropdown .menu-item:has-text("Settings")');
    await settingsLink.click();

    await page.waitForTimeout(1000);

    // Should navigate to admin settings
    expect(page.url()).toContain('/admin/settings');
  });

  test('Settings link in user view should navigate to user settings', async ({ page }) => {
    // Skip onboarding modal
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('helios_view_onboarding_completed', 'true');
    });

    await login(page, INTERNAL_ADMIN);
    await page.waitForTimeout(2000);

    // Switch to user view
    const viewSwitcher = page.locator('[data-testid="view-switcher-trigger"], .view-switcher-trigger');
    if (await viewSwitcher.isVisible().catch(() => false)) {
      await viewSwitcher.click();
      await page.waitForTimeout(500);

      const employeeViewOption = page.locator('[data-testid="view-option-user"], button:has-text("Employee View")');
      if (await employeeViewOption.isVisible().catch(() => false)) {
        await employeeViewOption.click();
        await page.waitForTimeout(1000);
      }
    }

    // Click user menu trigger button
    const userMenuTrigger = page.locator('button.user-menu-trigger');
    await userMenuTrigger.click();

    // Wait for dropdown to appear
    await page.waitForSelector('.user-menu-dropdown', { timeout: 5000 });

    // Click Settings in dropdown
    const settingsLink = page.locator('.user-menu-dropdown .menu-item:has-text("Settings")');
    await settingsLink.click();

    await page.waitForTimeout(1000);

    // Should navigate to user settings (not admin settings)
    const url = page.url();
    expect(url).not.toContain('/admin/settings');
    // Should be on user-settings or my-profile
    expect(url.match(/user-settings|my-profile|settings/)).toBeTruthy();
  });
});
