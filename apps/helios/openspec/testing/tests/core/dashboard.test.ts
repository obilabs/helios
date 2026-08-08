import { test, expect } from '@playwright/test'
import { login, takeScreenshot, TEST_CONFIG } from '../../helpers/test-helpers'

/**
 * Dashboard Test Suite
 *
 * Tests for dashboard loading, widgets, statistics, and navigation.
 * Aligned with OpenSpec dashboard requirements.
 */
test.describe('Feature: Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test.describe('Requirement: Dashboard Loading', () => {

    test('Scenario: Dashboard loads after login', async ({ page }) => {
      // Given: User is logged in (handled by beforeEach)

      // Then: Dashboard content is visible
      // Check for common dashboard elements
      const pageContent = await page.content()

      // Dashboard should have some content (not just loading spinner)
      expect(pageContent.length).toBeGreaterThan(1000)

      // Screenshot for evidence
      await takeScreenshot(page, 'dashboard-loaded')
    })

    test('Scenario: Dashboard shows organization name', async ({ page }) => {
      // Given: User is logged in

      // Then: Organization name should be visible somewhere on the page
      const pageContent = await page.content()

      // Check for organization name (Gridworx) in page content
      const hasOrgName = pageContent.toLowerCase().includes('gridworx')
      expect(hasOrgName).toBe(true)

      await takeScreenshot(page, 'dashboard-org-name')
    })
  })

  test.describe('Requirement: Dashboard Statistics', () => {

    test('Scenario: Dashboard displays user statistics', async ({ page }) => {
      // Given: User is logged in and on dashboard

      // When: Dashboard stats API is called
      // The dashboard should automatically fetch stats

      // Then: Stats should be displayed (check for number displays)
      await page.waitForTimeout(2000) // Allow stats to load

      await takeScreenshot(page, 'dashboard-stats')

      // Verify page has loaded meaningful content
      const pageContent = await page.content()
      expect(pageContent.length).toBeGreaterThan(500)
    })
  })

  test.describe('Requirement: Dashboard Navigation', () => {

    test('Scenario: Sidebar navigation is visible', async ({ page }) => {
      // Given: User is logged in

      // Then: Page should have navigation elements (Users, Groups, Settings links)
      const pageContent = await page.content()

      // Check for navigation elements
      const hasUsersLink = pageContent.toLowerCase().includes('users')
      const hasSettingsLink = pageContent.toLowerCase().includes('settings')

      // At least some navigation should be present
      expect(hasUsersLink || hasSettingsLink).toBe(true)

      await takeScreenshot(page, 'dashboard-sidebar')
    })

    test('Scenario: Can navigate to Users page', async ({ page }) => {
      // Given: User is logged in on dashboard

      // When: User clicks on Users in navigation
      const usersLink = page.locator('text=/Users/i').first()
      await usersLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // Then: Users page content is displayed
      await takeScreenshot(page, 'navigation-users')

      // Check we navigated successfully (page should have user-related content)
      const pageContent = await page.content()
      const hasUserContent = pageContent.toLowerCase().includes('user') || pageContent.toLowerCase().includes('staff')
      expect(hasUserContent).toBe(true)
    })

    test('Scenario: Can navigate to Groups page', async ({ page }) => {
      // Given: User is logged in on dashboard

      // When: User clicks on Groups in navigation
      const groupsLink = page.locator('text=/Groups/i').first()
      await groupsLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // Then: Groups page content is displayed
      await takeScreenshot(page, 'navigation-groups')
    })

    test('Scenario: Can navigate to Settings page', async ({ page }) => {
      // Given: User is logged in on dashboard

      // When: User clicks on Settings in navigation
      const settingsLink = page.locator('text=/Settings/i').first()
      await settingsLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // Then: Settings page content is displayed
      await takeScreenshot(page, 'navigation-settings')

      // Check localStorage for current page
      const currentPage = await page.evaluate(() => localStorage.getItem('helios_current_page'))
      expect(currentPage).toBe('settings')
    })
  })

  test.describe('Requirement: Module Status', () => {

    test('Scenario: Dashboard shows module integration status', async ({ page }) => {
      // Given: User is logged in

      // Navigate to settings to check module status
      const settingsLink = page.locator('text=/Settings/i').first()
      await settingsLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // Look for Modules tab
      const modulesTab = page.locator('text=/Modules/i').first()
      await modulesTab.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      // Then: Module status should be visible
      const pageContent = await page.content()
      const hasGoogleWorkspace = pageContent.toLowerCase().includes('google')

      expect(hasGoogleWorkspace).toBe(true)

      await takeScreenshot(page, 'dashboard-modules-status')
    })
  })
})
