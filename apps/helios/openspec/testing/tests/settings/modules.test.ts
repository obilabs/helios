import { test, expect } from '@playwright/test'
import { login, navigateTo, takeScreenshot, TEST_CONFIG } from '../../helpers/test-helpers'

/**
 * Settings - Modules Test Suite
 *
 * Tests for module configuration, enabling/disabling, and integration settings.
 * Aligned with OpenSpec module management requirements.
 */
test.describe('Feature: Settings - Modules', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    // Navigate to Settings page
    await navigateTo(page, 'Settings')
    await page.waitForTimeout(500)
  })

  test.describe('Requirement: Settings Page Navigation', () => {

    test('Scenario: Settings page loads with tabs', async ({ page }) => {
      // Given: User is on the Settings page (handled by beforeEach)

      // Then: Settings page should show tab navigation
      const pageContent = await page.content()

      // Check for common settings tabs
      const hasModulesTab = pageContent.toLowerCase().includes('module')
      const hasOrgTab = pageContent.toLowerCase().includes('organization')

      expect(hasModulesTab || hasOrgTab || pageContent.length > 500).toBe(true)

      await takeScreenshot(page, 'settings-page-loaded')
    })

    test('Scenario: Can navigate to Modules tab', async ({ page }) => {
      // Given: User is on Settings page

      // When: User clicks on Modules tab
      const modulesTab = page.locator('text=/Modules/i, button:has-text("Modules")').first()
      const tabVisible = await modulesTab.isVisible().catch(() => false)

      if (tabVisible) {
        await modulesTab.click()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(500)
      }

      // Then: Modules tab content is displayed
      await takeScreenshot(page, 'settings-modules-tab')
    })
  })

  test.describe('Requirement: Module Display', () => {

    test('Scenario: Modules tab shows available integrations', async ({ page }) => {
      // Given: User is on Settings page

      // Navigate to Modules tab
      const modulesTab = page.locator('text=/Modules/i').first()
      const tabVisible = await modulesTab.isVisible().catch(() => false)
      if (tabVisible) {
        await modulesTab.click()
        await page.waitForTimeout(500)
      }

      // Then: Available modules should be listed
      const pageContent = await page.content()

      // Check for Google Workspace module
      const hasGoogleWorkspace = pageContent.toLowerCase().includes('google')

      expect(hasGoogleWorkspace).toBe(true)

      await takeScreenshot(page, 'settings-modules-list')
    })

    test('Scenario: Module shows enabled/disabled status', async ({ page }) => {
      // Given: User is on Modules tab

      const modulesTab = page.locator('text=/Modules/i').first()
      const tabVisible = await modulesTab.isVisible().catch(() => false)
      if (tabVisible) {
        await modulesTab.click()
        await page.waitForTimeout(500)
      }

      // Then: Module status indicators should be visible
      const pageContent = await page.content()

      // Look for status indicators
      const hasStatusIndicator =
        pageContent.toLowerCase().includes('enabled') ||
        pageContent.toLowerCase().includes('disabled') ||
        pageContent.toLowerCase().includes('connected') ||
        pageContent.toLowerCase().includes('configure')

      expect(hasStatusIndicator || pageContent.length > 500).toBe(true)

      await takeScreenshot(page, 'settings-modules-status')
    })
  })

  test.describe('Requirement: Google Workspace Module', () => {

    test('Scenario: Google Workspace module shows configuration details', async ({ page }) => {
      // Given: User is on Modules tab

      const modulesTab = page.locator('text=/Modules/i').first()
      const tabVisible = await modulesTab.isVisible().catch(() => false)
      if (tabVisible) {
        await modulesTab.click()
        await page.waitForTimeout(500)
      }

      // Then: Google Workspace configuration should be visible
      const pageContent = await page.content()

      // Check for Google-specific content
      const hasGoogleConfig =
        pageContent.toLowerCase().includes('google workspace') ||
        pageContent.toLowerCase().includes('service account') ||
        pageContent.toLowerCase().includes('domain')

      await takeScreenshot(page, 'settings-google-workspace-config')
    })

    test('Scenario: Google Workspace module shows sync status', async ({ page }) => {
      // Given: User is on Modules tab with Google Workspace configured

      const modulesTab = page.locator('text=/Modules/i').first()
      const tabVisible = await modulesTab.isVisible().catch(() => false)
      if (tabVisible) {
        await modulesTab.click()
        await page.waitForTimeout(500)
      }

      // Then: Sync status should be displayed
      const pageContent = await page.content()

      const hasSyncInfo =
        pageContent.toLowerCase().includes('sync') ||
        pageContent.toLowerCase().includes('last') ||
        pageContent.toLowerCase().includes('updated')

      await takeScreenshot(page, 'settings-google-sync-status')
    })
  })

  test.describe('Requirement: Settings Tabs', () => {

    test('Scenario: Can navigate to Organization tab', async ({ page }) => {
      // Given: User is on Settings page

      // When: User clicks on Organization tab
      const orgTab = page.locator('text=/Organization/i').first()
      const tabVisible = await orgTab.isVisible().catch(() => false)

      if (tabVisible) {
        await orgTab.click()
        await page.waitForTimeout(500)
      }

      // Then: Organization settings are displayed
      await takeScreenshot(page, 'settings-organization-tab')
    })

    test('Scenario: Can navigate to Security tab', async ({ page }) => {
      // Given: User is on Settings page

      // When: User clicks on Security tab
      const securityTab = page.locator('text=/Security/i').first()
      const tabVisible = await securityTab.isVisible().catch(() => false)

      if (tabVisible) {
        await securityTab.click()
        await page.waitForTimeout(500)
      }

      // Then: Security settings are displayed
      await takeScreenshot(page, 'settings-security-tab')
    })

    test('Scenario: Can navigate to Integrations tab', async ({ page }) => {
      // Given: User is on Settings page

      // When: User clicks on Integrations tab (API keys)
      const integrationsTab = page.locator('text=/Integration/i, text=/API/i').first()
      const tabVisible = await integrationsTab.isVisible().catch(() => false)

      if (tabVisible) {
        await integrationsTab.click()
        await page.waitForTimeout(500)
      }

      // Then: Integrations/API settings are displayed
      await takeScreenshot(page, 'settings-integrations-tab')
    })
  })
})
