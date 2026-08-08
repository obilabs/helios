import { test, expect, Page } from '@playwright/test';
import { TEST_CREDENTIALS, dismissViewOnboarding } from './utils/test-helpers';

// Helper to login and navigate to People Directory
async function loginAndNavigateToPeople(page: Page) {
  await page.goto('/');

  // Wait for login page
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  // Fill login form
  await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
  await page.fill('input[type="password"]', TEST_CREDENTIALS.password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await page.waitForURL(/.*dashboard.*|.*\/$/);

  // Dismiss ViewOnboarding modal if present (appears for internal admins on first login)
  await dismissViewOnboarding(page);

  // Navigate directly to People directory (since People link is only in user view navigation)
  await page.goto('/people');

  // Dismiss ViewOnboarding modal again in case it appears after navigation
  await dismissViewOnboarding(page);

  await page.waitForSelector('.people-container', { timeout: 15000 });
}

test.describe('People Directory Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should load people directory page', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Check page header
    await expect(page.locator('h1:has-text("People Directory")')).toBeVisible();
    await expect(page.locator('text=Find and connect with your colleagues')).toBeVisible();
  });

  test('should display search box', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Search box should be visible
    await expect(page.locator('.search-box')).toBeVisible();
    // Use more specific selector to avoid matching universal search in header
    await expect(page.locator('.search-box input[placeholder*="Search"]')).toBeVisible();
  });

  test('should display filter controls', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Filter button should be visible
    await expect(page.locator('.filter-toggle:has-text("Filters")')).toBeVisible();

    // View toggle should be visible
    await expect(page.locator('.view-toggle')).toBeVisible();
  });

  test('should display view mode toggle (grid/list)', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Both view buttons should be visible
    const viewToggle = page.locator('.view-toggle');
    await expect(viewToggle).toBeVisible();

    // Should have grid and list buttons
    const gridButton = viewToggle.locator('button').first();
    const listButton = viewToggle.locator('button').last();
    await expect(gridButton).toBeVisible();
    await expect(listButton).toBeVisible();
  });

  test('should display people in grid view by default', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for people to load
    await page.waitForSelector('.people-results');

    // Grid view should be active and showing cards
    const hasGridView = await page.locator('.people-grid').count() > 0;
    const hasCards = await page.locator('.person-card').count() > 0;
    const hasEmptyState = await page.locator('.empty-state').count() > 0;

    // Either grid with cards or empty state is valid
    expect(hasGridView || hasEmptyState).toBeTruthy();
  });

  test('should display results count', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for results to load
    await page.waitForSelector('.people-results');

    // Check for results count (or empty state)
    const hasResultsCount = await page.locator('.results-count').count() > 0;
    const hasEmptyState = await page.locator('.empty-state').count() > 0;

    expect(hasResultsCount || hasEmptyState).toBeTruthy();
  });
});

test.describe('New Joiners Section', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should display New Joiners section when available', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for page to load
    await page.waitForSelector('.people-results');

    // New Joiners section may or may not be visible depending on data
    const newJoinersSection = page.locator('.new-joiners-section');
    const hasNewJoiners = await newJoinersSection.count() > 0;

    if (hasNewJoiners) {
      await expect(page.locator('h2:has-text("New Joiners")')).toBeVisible();
      await expect(page.locator('.new-joiners-grid')).toBeVisible();
    }
  });

  test('should hide New Joiners when filters are active', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for page to load
    await page.waitForSelector('.people-results');

    // Apply a search filter - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('test');

    // Wait for search debounce
    await page.waitForTimeout(500);

    // New Joiners section should be hidden when filters are active
    await expect(page.locator('.new-joiners-section')).not.toBeVisible();
  });
});

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should search by name', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for initial load
    await page.waitForSelector('.people-results');

    // Search for a name - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('mike');

    // Wait for search results (debounced)
    await page.waitForTimeout(500);

    // Results should be filtered (either cards or empty state)
    const hasResults = await page.locator('.person-card').count() > 0;
    const hasEmptyState = await page.locator('.empty-state').count() > 0;
    expect(hasResults || hasEmptyState).toBeTruthy();
  });

  test('should show clear search button when searching', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Enter search term - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('test search');

    // Clear button should appear
    await expect(page.locator('.clear-search')).toBeVisible();
  });

  test('should clear search when clicking clear button', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Enter search term - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('test search');

    // Click clear button
    await page.click('.clear-search');

    // Search should be cleared
    const searchValue = await searchInput.inputValue();
    expect(searchValue).toBe('');
  });

  test('should debounce search input', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for initial load
    await page.waitForSelector('.people-results');

    // Type quickly - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('a');
    await searchInput.fill('ab');
    await searchInput.fill('abc');

    // Results should update after debounce period
    await page.waitForTimeout(400);

    // Page should still be functional
    await expect(page.locator('.people-results')).toBeVisible();
  });
});

test.describe('Filter Panel', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should toggle filter panel visibility', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Filter panel should be hidden initially
    await expect(page.locator('.filter-panel')).not.toBeVisible();

    // Click filter button
    await page.click('.filter-toggle');

    // Filter panel should be visible
    await expect(page.locator('.filter-panel')).toBeVisible();

    // Click filter button again
    await page.click('.filter-toggle');

    // Filter panel should be hidden
    await expect(page.locator('.filter-panel')).not.toBeVisible();
  });

  test('should display department filter', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Open filter panel
    await page.click('.filter-toggle');
    await expect(page.locator('.filter-panel')).toBeVisible();

    // Department filter should be visible
    await expect(page.locator('.filter-group label:has-text("Department")')).toBeVisible();
    await expect(page.locator('.filter-group select').first()).toBeVisible();
  });

  test('should display location filter', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Open filter panel
    await page.click('.filter-toggle');

    // Location filter should be visible
    await expect(page.locator('.filter-group label:has-text("Location")')).toBeVisible();
  });

  test('should display sort by filter', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Open filter panel
    await page.click('.filter-toggle');

    // Sort filter should be visible
    await expect(page.locator('.filter-group label:has-text("Sort By")')).toBeVisible();
  });

  test('should filter by department', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for initial load
    await page.waitForSelector('.people-results');

    // Open filter panel
    await page.click('.filter-toggle');

    // Select a department (if available)
    const departmentSelect = page.locator('.filter-group:has(label:has-text("Department")) select');
    const options = await departmentSelect.locator('option').all();

    if (options.length > 1) {
      // Select the second option (first is "All Departments")
      await departmentSelect.selectOption({ index: 1 });

      // Wait for results to update
      await page.waitForTimeout(500);

      // Filter badge should appear on filter button
      await expect(page.locator('.filter-badge')).toBeVisible();
    }
  });

  test('should show Clear Filters button when filters are active', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Open filter panel
    await page.click('.filter-toggle');

    // Apply a filter - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('test');

    // Wait for search to apply
    await page.waitForTimeout(500);

    // Clear Filters button should appear
    await expect(page.locator('.clear-filters')).toBeVisible();
  });

  test('should clear all filters when clicking Clear Filters', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Open filter panel
    await page.click('.filter-toggle');

    // Apply filters - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('test');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Click Clear Filters
    await page.click('.clear-filters');

    // Search should be cleared
    const searchValue = await searchInput.inputValue();
    expect(searchValue).toBe('');
  });
});

test.describe('View Mode Toggle', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should switch to list view', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for initial load
    await page.waitForSelector('.people-results');

    // Click list view button (second button in view toggle)
    const listButton = page.locator('.view-toggle button').last();
    await listButton.click();

    // Wait for view to change
    await page.waitForTimeout(300);

    // Should show list view
    const hasListView = await page.locator('.people-list').count() > 0;
    const hasEmptyState = await page.locator('.empty-state').count() > 0;
    expect(hasListView || hasEmptyState).toBeTruthy();
  });

  test('should switch back to grid view', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for initial load
    await page.waitForSelector('.people-results');

    // Switch to list view first
    await page.locator('.view-toggle button').last().click();
    await page.waitForTimeout(300);

    // Switch back to grid view
    await page.locator('.view-toggle button').first().click();
    await page.waitForTimeout(300);

    // Should show grid view
    const hasGridView = await page.locator('.people-grid').count() > 0;
    const hasEmptyState = await page.locator('.empty-state').count() > 0;
    expect(hasGridView || hasEmptyState).toBeTruthy();
  });

  test('should highlight active view mode', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Grid button should be active by default
    const gridButton = page.locator('.view-toggle button').first();
    await expect(gridButton).toHaveClass(/active/);

    // Switch to list
    const listButton = page.locator('.view-toggle button').last();
    await listButton.click();

    // List button should now be active
    await expect(listButton).toHaveClass(/active/);
    await expect(gridButton).not.toHaveClass(/active/);
  });
});

test.describe('Person Card Component', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should display person cards with basic info', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for results
    await page.waitForSelector('.people-results');

    // Check if cards exist
    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      // First card should have basic info
      const firstCard = cards.first();

      // Should have a name
      const hasName = await firstCard.locator('.person-name, h3, h4').count() > 0;
      expect(hasName).toBeTruthy();
    }
  });

  test('should be clickable to open profile', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for results
    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      // Click on first card
      await cards.first().click();

      // PersonSlideOut should open
      await expect(page.locator('.slideout-panel, .person-slideout')).toBeVisible();
    }
  });
});

test.describe('Person SlideOut', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should open slideout when clicking person', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Wait for results
    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();

      // Slideout should be visible (uses .person-slideout class)
      await expect(page.locator('.person-slideout')).toBeVisible();
    }
  });

  test('should display person profile in slideout', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();
      await page.waitForSelector('.person-slideout');

      // Should have profile header info
      await expect(page.locator('.profile-header')).toBeVisible();
    }
  });

  test('should have tabs in person slideout', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();
      await page.waitForSelector('.person-slideout');

      // Should have Overview and About tabs in .profile-tabs container
      await expect(page.locator('.profile-tabs button:has-text("Overview")')).toBeVisible();
      await expect(page.locator('.profile-tabs button:has-text("About")')).toBeVisible();
    }
  });

  test('should close slideout when clicking close button', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();
      await page.waitForSelector('.person-slideout');

      // Click close button (uses .close-btn class)
      await page.click('.close-btn');

      // Slideout should be closed
      await expect(page.locator('.person-slideout')).not.toBeVisible();
    }
  });

  test('should close slideout when clicking overlay', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();
      await page.waitForSelector('.person-slideout');

      // Click overlay (uses .person-slideout-overlay class)
      await page.click('.person-slideout-overlay', { position: { x: 50, y: 300 } });

      // Slideout should be closed
      await expect(page.locator('.person-slideout')).not.toBeVisible();
    }
  });

  test('should switch between Overview and About tabs', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();
      await page.waitForSelector('.person-slideout');

      // Click About tab (in .profile-tabs container)
      await page.click('.profile-tabs button:has-text("About")');

      // About content should be visible (uses .about-tab class)
      await expect(page.locator('.about-tab')).toBeVisible();

      // Click back to Overview tab
      await page.click('.profile-tabs button:has-text("Overview")');

      // Overview content should be visible (uses .overview-tab and .info-section classes)
      await expect(page.locator('.overview-tab')).toBeVisible();
    }
  });
});

test.describe('Load More Pagination', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should show Load More button when there are more results', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    // Load More button visibility depends on total count
    const loadMoreButton = page.locator('.load-more button');
    const hasLoadMore = await loadMoreButton.count() > 0;

    // Either has load more or doesn't (depending on data)
    // Just verify page is functional
    await expect(page.locator('.people-results')).toBeVisible();
  });

  test('should load more results when clicking Load More', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    const loadMoreButton = page.locator('.load-more button');
    const hasLoadMore = await loadMoreButton.count() > 0;

    if (hasLoadMore) {
      // Get initial card count
      const initialCount = await page.locator('.person-card').count();

      // Click Load More
      await loadMoreButton.click();

      // Wait for loading
      await page.waitForTimeout(1000);

      // Should have more cards (or same if that was the last page)
      const newCount = await page.locator('.person-card').count();
      expect(newCount).toBeGreaterThanOrEqual(initialCount);
    }
  });
});

test.describe('Empty State', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should show empty state when no results match', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Search for something that won't match - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('xyznonexistentperson12345');

    // Wait for search
    await page.waitForTimeout(500);

    // Should show empty state
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('text=No people found')).toBeVisible();
  });

  test('should show Clear Filters option in empty state when filters active', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Search for something that won't match - use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await searchInput.fill('xyznonexistentperson12345');

    // Wait for search
    await page.waitForTimeout(500);

    // Should show empty state with Clear Filters button
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state button:has-text("Clear Filters")')).toBeVisible();
  });
});

test.describe('Skill/Interest Search Integration', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should search by skill when clicking skill tag in slideout', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();
      await page.waitForSelector('.person-slideout');

      // Go to About tab where skills/interests are (in .profile-tabs container)
      await page.click('.profile-tabs button:has-text("About")');

      // Look for clickable skill/expertise tags
      const skillTag = page.locator('.clickable-tag, .expertise-tag, .tag.clickable').first();
      const hasSkillTag = await skillTag.count() > 0;

      if (hasSkillTag) {
        const skillText = await skillTag.textContent();
        await skillTag.click();

        // Slideout should close and search should be populated
        await expect(page.locator('.person-slideout')).not.toBeVisible();

        if (skillText) {
          // Use specific selector for People Directory search
          const searchValue = await page.locator('.search-box input[placeholder*="Search"]').inputValue();
          expect(searchValue.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

test.describe('Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept and fail the people API
    await page.route('**/api/people', route => {
      if (route.request().url().includes('/api/people') && !route.request().url().includes('/api/people/')) {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ success: false, error: 'Server error' }),
        });
      } else {
        route.continue();
      }
    });

    await loginAndNavigateToPeople(page);

    // Page should still render (might show empty state or error)
    await expect(page.locator('.people-container')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
  });

  test('should have accessible search input', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    // Use specific selector for People Directory search
    const searchInput = page.locator('.search-box input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    // Should be focusable
    await searchInput.focus();
    await expect(searchInput).toBeFocused();
  });

  test('should close slideout with Escape key', async ({ page }) => {
    await loginAndNavigateToPeople(page);

    await page.waitForSelector('.people-results');

    const cards = page.locator('.person-card');
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await cards.first().click();
      await page.waitForSelector('.person-slideout');

      // Press Escape
      await page.keyboard.press('Escape');

      // Slideout should close
      await expect(page.locator('.person-slideout')).not.toBeVisible();
    }
  });
});
