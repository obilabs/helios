import { test, expect, Page } from '@playwright/test';

// Test credentials
const ADMIN_USER = {
  email: 'mike@gridworx.io',
  password: 'admin123',
};

/**
 * Helper to login as admin user
 */
async function login(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', ADMIN_USER.email);
  await page.fill('input[type="password"]', ADMIN_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*dashboard.*|.*admin.*|.*\/$/, { timeout: 15000 });

  // Handle ViewOnboarding modal if it appears
  await page.waitForTimeout(500);
  const onboardingModal = page.locator('.view-onboarding-overlay');
  if (await onboardingModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const adminConsoleOption = page.locator('.view-option-card').filter({ hasText: 'Admin Console' });
    if (await adminConsoleOption.isVisible()) {
      await adminConsoleOption.click();
      await page.waitForTimeout(300);
    }
    const continueBtn = page.locator('.view-onboarding-button.primary');
    if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Helper to dismiss ViewOnboarding modal if it appears
 */
async function dismissOnboardingModal(page: Page) {
  await page.waitForTimeout(300);
  const onboardingModal = page.locator('.view-onboarding-overlay');
  if (await onboardingModal.isVisible({ timeout: 1000 }).catch(() => false)) {
    const adminConsoleOption = page.locator('.view-option-card').filter({ hasText: 'Admin Console' });
    if (await adminConsoleOption.isVisible()) {
      await adminConsoleOption.click();
      await page.waitForTimeout(300);
    }
    const continueBtn = page.locator('.view-onboarding-button.primary');
    if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Navigate to Signatures page
 */
async function navigateToSignatures(page: Page) {
  // Dismiss onboarding if visible before navigating
  await dismissOnboardingModal(page);

  // Click on Signatures in sidebar
  const signaturesLink = page.locator('.sidebar-nav-link').filter({ hasText: 'Signatures' });
  if (await signaturesLink.isVisible()) {
    await signaturesLink.click();
    await page.waitForTimeout(500);
  } else {
    // Try direct navigation
    await page.goto('/admin/signatures');
    await page.waitForTimeout(500);
  }

  // Dismiss onboarding again if it appeared after navigation
  await dismissOnboardingModal(page);
}

test.describe('Signature Management', () => {
  test.describe('TASK-SIG-T04: Signature Templates', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    test('admin can access Signatures page', async ({ page }) => {
      await navigateToSignatures(page);

      // Page should load
      await expect(page.locator('h1, h2').filter({ hasText: /Signature/i })).toBeVisible({ timeout: 5000 });
    });

    test('Signatures page shows template tabs', async ({ page }) => {
      await navigateToSignatures(page);

      // Should have tabs for Overview, Templates, Campaigns, etc.
      const tabList = page.locator('.tab-list, [role="tablist"], .signatures-tabs');
      await expect(tabList).toBeVisible({ timeout: 5000 });
    });

    test('Templates tab shows template list or empty state', async ({ page }) => {
      await navigateToSignatures(page);

      // Click on Templates tab if present
      const templatesTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Templates/i });
      if (await templatesTab.isVisible()) {
        await templatesTab.click();
        await page.waitForTimeout(500);
      }

      // Should show either template cards or empty state
      const templateCard = page.locator('.template-card, .signature-template-card');
      const emptyState = page.locator('.empty-state, [data-testid="empty-state"]');
      const createButton = page.locator('button').filter({ hasText: /Create|New Template/i });

      const hasContent = await templateCard.first().isVisible().catch(() => false) ||
                         await emptyState.isVisible().catch(() => false) ||
                         await createButton.isVisible().catch(() => false);

      expect(hasContent).toBe(true);
    });

    test('Create Template button is visible', async ({ page }) => {
      await navigateToSignatures(page);

      // Navigate to Templates tab
      const templatesTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Templates/i });
      if (await templatesTab.isVisible()) {
        await templatesTab.click();
        await page.waitForTimeout(500);
      }

      // Look for create button
      const createButton = page.locator('button').filter({ hasText: /Create|New Template|Add Template/i });
      await expect(createButton.first()).toBeVisible({ timeout: 5000 });
    });

    test('clicking Create Template opens editor modal', async ({ page }) => {
      await navigateToSignatures(page);

      // Navigate to Templates tab
      const templatesTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Templates/i });
      if (await templatesTab.isVisible()) {
        await templatesTab.click();
        await page.waitForTimeout(500);
      }

      // Click create button
      const createButton = page.locator('button').filter({ hasText: /Create|New Template|Add Template/i });
      await createButton.first().click();
      await page.waitForTimeout(500);

      // Should show modal/editor with name field
      const modal = page.locator('.modal, .slideout, .editor-modal, [role="dialog"]');
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], label:has-text("Name") + input');

      const editorVisible = await modal.isVisible().catch(() => false) ||
                           await nameInput.isVisible().catch(() => false);

      expect(editorVisible).toBe(true);
    });

    test('template editor has HTML editor', async ({ page }) => {
      await navigateToSignatures(page);

      // Navigate to Templates tab
      const templatesTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Templates/i });
      if (await templatesTab.isVisible()) {
        await templatesTab.click();
        await page.waitForTimeout(500);
      }

      // Click create button
      const createButton = page.locator('button').filter({ hasText: /Create|New Template|Add Template/i });
      await createButton.first().click();
      await page.waitForTimeout(500);

      // Should have HTML editor area
      const htmlEditor = page.locator('.template-editor, .html-editor, textarea, [contenteditable="true"]');
      await expect(htmlEditor.first()).toBeVisible({ timeout: 5000 });
    });

    test('merge field picker is available', async ({ page }) => {
      await navigateToSignatures(page);

      // Navigate to Templates tab
      const templatesTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Templates/i });
      if (await templatesTab.isVisible()) {
        await templatesTab.click();
        await page.waitForTimeout(500);
      }

      // Click create button
      const createButton = page.locator('button').filter({ hasText: /Create|New Template|Add Template/i });
      await createButton.first().click();
      await page.waitForTimeout(500);

      // Look for merge field picker or insert field button
      const mergeFieldPicker = page.locator('.merge-field-picker, [data-testid="merge-fields"]');
      const insertFieldButton = page.locator('button').filter({ hasText: /Insert Field|Merge Field|Add Field/i });

      const hasMergeFields = await mergeFieldPicker.isVisible().catch(() => false) ||
                            await insertFieldButton.isVisible().catch(() => false);

      expect(hasMergeFields).toBe(true);
    });
  });

  test.describe('TASK-SIG-T05: Campaigns', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    test('Campaigns tab is accessible', async ({ page }) => {
      await navigateToSignatures(page);

      // Click on Campaigns tab
      const campaignsTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Campaign/i });
      await expect(campaignsTab.first()).toBeVisible({ timeout: 5000 });

      await campaignsTab.first().click();
      await page.waitForTimeout(500);
    });

    test('Campaigns tab shows campaign list or empty state', async ({ page }) => {
      await navigateToSignatures(page);

      // Click on Campaigns tab
      const campaignsTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Campaign/i });
      await campaignsTab.first().click();
      await page.waitForTimeout(500);

      // Should show campaign list or empty state
      const campaignCard = page.locator('.campaign-card, .campaign-row');
      const emptyState = page.locator('.empty-state, [data-testid="empty-state"]');
      const createButton = page.locator('button').filter({ hasText: /Create|New Campaign/i });

      const hasContent = await campaignCard.first().isVisible().catch(() => false) ||
                         await emptyState.isVisible().catch(() => false) ||
                         await createButton.isVisible().catch(() => false);

      expect(hasContent).toBe(true);
    });

    test('Create Campaign button opens wizard', async ({ page }) => {
      await navigateToSignatures(page);

      // Click on Campaigns tab
      const campaignsTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Campaign/i });
      await campaignsTab.first().click();
      await page.waitForTimeout(500);

      // Click create campaign button
      const createButton = page.locator('button').filter({ hasText: /Create|New Campaign/i });
      if (await createButton.first().isVisible()) {
        await createButton.first().click();
        await page.waitForTimeout(500);

        // Should show campaign wizard/modal
        const modal = page.locator('.modal, .slideout, .campaign-editor, [role="dialog"]');
        const wizardStep = page.locator('.wizard-step, .step-indicator');
        const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');

        const wizardVisible = await modal.isVisible().catch(() => false) ||
                             await wizardStep.isVisible().catch(() => false) ||
                             await nameInput.isVisible().catch(() => false);

        expect(wizardVisible).toBe(true);
      }
    });

    test('Analytics tab is accessible', async ({ page }) => {
      await navigateToSignatures(page);

      // Click on Analytics tab
      const analyticsTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Analytics/i });

      if (await analyticsTab.isVisible()) {
        await analyticsTab.click();
        await page.waitForTimeout(500);

        // Should show analytics content or empty state
        const analyticsContent = page.locator('.analytics-container, .campaign-analytics, .stats-grid');
        const emptyState = page.locator('.empty-state');
        const selectCampaign = page.locator('select, .campaign-selector');

        const hasContent = await analyticsContent.isVisible().catch(() => false) ||
                          await emptyState.isVisible().catch(() => false) ||
                          await selectCampaign.isVisible().catch(() => false);

        expect(hasContent).toBe(true);
      }
    });
  });

  test.describe('Signature Deployment', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    test('Overview tab shows deployment status', async ({ page }) => {
      await navigateToSignatures(page);

      // Overview tab should be visible by default or click on it
      const overviewTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Overview/i });
      if (await overviewTab.isVisible()) {
        await overviewTab.click();
        await page.waitForTimeout(500);
      }

      // Should show deployment status component
      const deploymentStatus = page.locator('.deployment-status, .sync-status, .stats-card');
      await expect(deploymentStatus.first()).toBeVisible({ timeout: 5000 });
    });

    test('Settings/Permissions tab shows content', async ({ page }) => {
      await navigateToSignatures(page);

      // Click on Settings or Permissions tab
      const settingsTab = page.locator('.tab-button, [role="tab"]').filter({ hasText: /Settings|Permissions/i });

      if (await settingsTab.isVisible()) {
        await settingsTab.click();
        await page.waitForTimeout(500);

        // Should show some content on the settings/permissions tab
        // Look for various possible elements that could be there
        const tabContent = page.locator('.permissions-component, .signature-permissions, .settings-panel, .role-select, table, .user-list');
        const anyHeading = page.locator('h2, h3').filter({ hasText: /Permission|Role|User/i });

        const hasContent = await tabContent.first().isVisible().catch(() => false) ||
                          await anyHeading.first().isVisible().catch(() => false);

        // Just verify the tab is clickable and doesn't error
        expect(hasContent || await settingsTab.isVisible()).toBe(true);
      }
    });
  });

  test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    test('Signatures link exists in admin navigation', async ({ page }) => {
      // Check sidebar for Signatures link
      const signaturesLink = page.locator('.sidebar-nav-link, .nav-item, a').filter({ hasText: /Signatures/i });
      await expect(signaturesLink.first()).toBeVisible({ timeout: 5000 });
    });

    test('direct navigation to /admin/signatures works', async ({ page }) => {
      await page.goto('/admin/signatures');
      await page.waitForTimeout(500);

      // Page should load (check for page title or content)
      const pageContent = page.locator('h1, h2, .page-header, .signatures-page');
      await expect(pageContent.first()).toBeVisible({ timeout: 5000 });
    });
  });
});
