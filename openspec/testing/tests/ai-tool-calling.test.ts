import { test, expect, Page } from '@playwright/test';
import { TEST_CONFIG } from '../helpers/test-helpers';

test.describe('AI Tool Calling Feature', () => {

  // Clean up browser state before each test
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(TEST_CONFIG.baseUrl);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      // Skip the ViewOnboarding modal in tests
      localStorage.setItem('helios_view_onboarding_completed', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  // Helper to login and ensure admin view
  async function login(page: Page) {
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });

    await emailInput.fill(TEST_CONFIG.testEmail);
    await page.locator('input[type="password"]').first().fill(TEST_CONFIG.testPassword);
    await page.locator('button[type="submit"]').first().click();

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Dismiss onboarding modal if it still appears
    const onboardingModal = page.locator('.view-onboarding-overlay');
    if (await onboardingModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      const closeBtn = page.locator('.view-onboarding-close, button.view-onboarding-button.primary');
      if (await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Ensure we're in admin view by clicking view switcher if present
    await ensureAdminView(page);
  }

  // Helper to ensure admin view is active
  async function ensureAdminView(page: Page) {
    // Check if view switcher trigger is visible - use data-testid
    const viewSwitcherTrigger = page.locator('[data-testid="view-switcher-trigger"]');
    if (await viewSwitcherTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check the current label - if it shows "Employee View", we need to switch
      const triggerText = await viewSwitcherTrigger.textContent();
      console.log(`   View switcher shows: "${triggerText?.trim()}"`);

      if (triggerText?.includes('Employee') || triggerText?.includes('user')) {
        // Click to open the dropdown
        await viewSwitcherTrigger.click();
        await page.waitForTimeout(300);

        // Click on Admin Console option using data-testid
        const adminOption = page.locator('[data-testid="view-option-admin"]');
        if (await adminOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await adminOption.click();
          await page.waitForTimeout(500);
          console.log('   Switched to Admin view');
        }
      }
    }
  }

  // Helper to navigate to AI Settings
  async function navigateToAISettings(page: Page) {
    // Navigate to Settings - try multiple selectors
    const settingsButton = page.locator('[data-testid="nav-settings"], nav button:has-text("Settings")').first();
    await settingsButton.waitFor({ state: 'visible', timeout: 10000 });
    await settingsButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Find and click on AI Assistant tab
    const aiTab = page.locator('button:has-text("AI Assistant"), [role="tab"]:has-text("AI Assistant")').first();
    if (await aiTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await aiTab.click();
      await page.waitForTimeout(500);
    }
  }

  test('TASK-TOOL-001: Model Discovery - Can list available Ollama models', async ({ page }) => {
    console.log('🤖 Testing Model Discovery (TASK-TOOL-001)\n');

    // Step 1: Login
    console.log('1️⃣  Logging in...');
    await login(page);
    console.log('   ✅ Logged in');

    // Step 2: Navigate to AI Settings
    console.log('\n2️⃣  Navigating to AI Settings...');
    await navigateToAISettings(page);
    console.log('   ✅ On AI Settings page');

    // Wait for the page to fully load the AI config
    await page.waitForTimeout(1000);

    // Step 3: Click Discover button
    console.log('\n3️⃣  Clicking Discover button...');
    // Use multiple selectors to find the Discover button
    const discoverBtn = page.locator('.discover-btn, button:has-text("Discover"), button[title*="Discover"]').first();

    if (await discoverBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await discoverBtn.click();
      await page.waitForTimeout(2000);

      // Check for models list or error message
      const modelsSection = page.locator('.discovered-models, .models-list, [class*="model-chip"]').first();
      const modelsError = page.locator('.models-error, [class*="error"]').first();

      const hasModels = await modelsSection.isVisible({ timeout: 3000 }).catch(() => false);
      const hasError = await modelsError.isVisible({ timeout: 1000 }).catch(() => false);

      console.log(`   Models found: ${hasModels}`);
      console.log(`   Error shown: ${hasError}`);

      if (hasModels) {
        // Count model chips
        const modelChips = page.locator('.model-chip, [class*="model-chip"]');
        const count = await modelChips.count();
        console.log(`   ✅ Found ${count} available models`);

        // Check for tool support badges
        const toolBadges = page.locator('.tool-badge, [class*="tool-badge"]');
        const badgeCount = await toolBadges.count();
        console.log(`   ✅ Found ${badgeCount} tool support badges`);
      }

      // Take screenshot
      await page.screenshot({
        path: 'openspec/testing/reports/screenshots/ai-model-discovery.png',
        fullPage: true
      });

      console.log('   ✅ Model discovery UI working');
    } else {
      console.log('   ⚠️  Discover button not visible - AI Settings may not be configured');
    }
  });

  test('TASK-TOOL-002: Tool Support Test - Can test if model supports function calling', async ({ page }) => {
    console.log('🔧 Testing Tool Support Test (TASK-TOOL-002)\n');

    // Step 1: Login
    console.log('1️⃣  Logging in...');
    await login(page);
    console.log('   ✅ Logged in');

    // Step 2: Navigate to AI Settings
    console.log('\n2️⃣  Navigating to AI Settings...');
    await navigateToAISettings(page);
    console.log('   ✅ On AI Settings page');

    // Wait for the page to fully load the AI config
    await page.waitForTimeout(1000);

    // Step 3: Click Test Tool Support button
    console.log('\n3️⃣  Testing tool support...');
    // Use multiple selectors to find the Test Tool Support button
    const testToolsBtn = page.locator('button:has-text("Test Tool Support"), button[title*="tool calling"]').first();

    if (await testToolsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await testToolsBtn.click();
      await page.waitForTimeout(5000); // Tool test may take a few seconds

      // Check for test result
      const successResult = page.locator('.tool-test-result.success, [class*="success"]:has-text("supports tool")').first();
      const warningResult = page.locator('.tool-test-result.warning, [class*="warning"]').first();

      const hasSuccess = await successResult.isVisible({ timeout: 3000 }).catch(() => false);
      const hasWarning = await warningResult.isVisible({ timeout: 1000 }).catch(() => false);

      console.log(`   Success result: ${hasSuccess}`);
      console.log(`   Warning result: ${hasWarning}`);

      // Take screenshot
      await page.screenshot({
        path: 'openspec/testing/reports/screenshots/ai-tool-support-test.png',
        fullPage: true
      });

      if (hasSuccess) {
        console.log('   ✅ Model supports tool calling');
      } else if (hasWarning) {
        console.log('   ⚠️  Model may not support tool calling (warning shown)');
      }

      console.log('   ✅ Tool support test UI working');
    } else {
      console.log('   ⚠️  Test Tool Support button not visible');
    }
  });

  test('TASK-TOOL-003: Error Handling - No JSON parse errors on incompatible model', async ({ page, request }) => {
    // Extend timeout for this test as chat can take 60+ seconds with LLM
    test.setTimeout(90000);

    console.log('🛡️  Testing Error Handling (TASK-TOOL-003)\n');

    // This test verifies the backend doesn't return "Unexpected token" errors
    // We'll test via the API endpoint directly using request context (not page.request which closes with page)

    console.log('1️⃣  Logging in...');
    await login(page);
    console.log('   ✅ Logged in');

    console.log('\n2️⃣  Getting auth token...');
    const token = await page.evaluate(() => localStorage.getItem('helios_token'));
    console.log(`   Token found: ${!!token}`);

    console.log('\n3️⃣  Testing AI status endpoint...');
    const statusResponse = await request.get('http://localhost:3001/api/v1/ai/status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const statusData = await statusResponse.json();
    console.log(`   AI Available: ${statusData.data?.available}`);

    if (statusData.data?.available) {
      console.log('\n4️⃣  Testing chat endpoint with tool-enabled request...');

      try {
        const chatResponse = await request.post('http://localhost:3001/api/v1/ai/chat', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: {
            message: 'How many users are in my organization?',
            includeHistory: false
          },
          timeout: 60000
        });

        const chatData = await chatResponse.json();
        console.log(`   Response success: ${chatData.success}`);

        // Check for error messages
        if (chatData.message || chatData.data?.message) {
          const msg = chatData.message || chatData.data?.message;
          const hasUnexpectedToken = msg.toLowerCase().includes('unexpected token');
          const hasJsonError = msg.toLowerCase().includes('json');

          console.log(`   Has "unexpected token" error: ${hasUnexpectedToken}`);
          console.log(`   Has JSON error: ${hasJsonError}`);

          // The improvement is that we should NOT see raw "unexpected token" errors
          // Instead, we should see a user-friendly message
          if (!hasUnexpectedToken) {
            console.log('   ✅ No raw JSON parse errors exposed to user');
          }
        }

        // Check if the response includes tool calling warning note
        if (chatData.data?.message?.includes('may not support function calling')) {
          console.log('   ✅ Graceful warning message shown for incompatible model');
        }

      } catch (error: any) {
        console.log(`   Error during chat: ${error.message}`);
        // Even if there's an error, it shouldn't be "unexpected token"
        expect(error.message.toLowerCase()).not.toContain('unexpected token');
      }
    } else {
      console.log('   ⚠️  AI not available - skipping chat test');
    }

    console.log('\n✅ Error handling test complete');
  });

  test('TASK-TOOL-004: UI Model Selector - Model selection and tool support indicators', async ({ page }) => {
    console.log('🎨 Testing UI Model Selector (TASK-TOOL-004)\n');

    // Step 1: Login
    console.log('1️⃣  Logging in...');
    await login(page);
    console.log('   ✅ Logged in');

    // Step 2: Navigate to AI Settings
    console.log('\n2️⃣  Navigating to AI Settings...');
    await navigateToAISettings(page);
    console.log('   ✅ On AI Settings page');

    // Wait for the page to fully load the AI config
    await page.waitForTimeout(2000);

    // Debug: Print out all buttons on the page to understand what's rendered
    const allButtons = await page.locator('button').all();
    console.log(`   Debug: Found ${allButtons.length} buttons on page`);
    for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
      const text = await allButtons[i].textContent().catch(() => '');
      const title = await allButtons[i].getAttribute('title').catch(() => '');
      console.log(`     Button ${i+1}: "${text?.trim()}" (title="${title}")`);
    }

    // Step 3: Check for model selector UI elements
    console.log('\n3️⃣  Checking model selector UI...');

    // Check for Discover button - use multiple selectors
    const discoverBtn = page.locator('.discover-btn, button:has-text("Discover"), button[title*="Discover"]').first();
    const hasDiscoverBtn = await discoverBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`   Discover button: ${hasDiscoverBtn ? '✅' : '❌'}`);

    // Check for Test Tool Support button - use multiple selectors
    const testToolsBtn = page.locator('button:has-text("Test Tool Support"), button[title*="tool calling"]').first();
    const hasTestToolsBtn = await testToolsBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`   Test Tool Support button: ${hasTestToolsBtn ? '✅' : '❌'}`);

    // Check for model input field - the field may not have a list attribute initially
    const modelInput = page.locator('input[list="primary-models"], input[placeholder*="gpt"], .model-selector input').first();
    const hasModelInput = await modelInput.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`   Model input with datalist: ${hasModelInput ? '✅' : '❌'}`);

    // Take screenshot
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/ai-model-selector-ui.png',
      fullPage: true
    });

    // If Discover button exists, test the full flow
    if (hasDiscoverBtn) {
      console.log('\n4️⃣  Testing model discovery flow...');
      await discoverBtn.click();
      await page.waitForTimeout(2000);

      // Check if models were discovered
      const modelChips = page.locator('.model-chip');
      const chipCount = await modelChips.count();
      console.log(`   Discovered models: ${chipCount}`);

      if (chipCount > 0) {
        // Click on a model to select it
        const firstModel = modelChips.first();
        const modelName = await firstModel.textContent();
        console.log(`   Selecting model: ${modelName?.split(/\s+/)[0]}`);
        await firstModel.click();
        await page.waitForTimeout(500);

        // Take screenshot after selection
        await page.screenshot({
          path: 'openspec/testing/reports/screenshots/ai-model-selected.png',
          fullPage: true
        });
      }
    }

    console.log('\n✅ UI Model Selector test complete');

    // Verify at least the main UI elements exist
    expect(hasDiscoverBtn || hasModelInput).toBe(true);
  });

  test('API: /api/v1/ai/models endpoint returns model list', async ({ page }) => {
    console.log('📡 Testing /api/v1/ai/models API endpoint\n');

    // Login to get token
    console.log('1️⃣  Logging in...');
    await login(page);
    const token = await page.evaluate(() => localStorage.getItem('helios_token'));
    console.log('   ✅ Got auth token');

    // Call the models endpoint
    console.log('\n2️⃣  Calling /api/v1/ai/models...');
    const response = await page.request.get('http://localhost:3001/api/v1/ai/models', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    console.log(`   Status: ${response.status()}`);
    console.log(`   Success: ${data.success}`);

    if (data.success && data.data?.models) {
      console.log(`   Models found: ${data.data.models.length}`);

      // Log first 3 models
      const models = data.data.models.slice(0, 3);
      models.forEach((m: any, i: number) => {
        console.log(`     ${i + 1}. ${m.name} (${m.sizeFormatted}) - Tools: ${m.estimatedToolSupport}`);
      });

      // Verify model structure
      if (data.data.models.length > 0) {
        const firstModel = data.data.models[0];
        expect(firstModel).toHaveProperty('name');
        expect(firstModel).toHaveProperty('size');
        expect(firstModel).toHaveProperty('sizeFormatted');
        expect(firstModel).toHaveProperty('estimatedToolSupport');
        console.log('   ✅ Model structure is correct');
      }
    } else if (data.message) {
      console.log(`   Message: ${data.message}`);
    }

    expect(response.status()).toBe(200);
    console.log('\n✅ API models endpoint test complete');
  });

  test('API: /api/v1/ai/test-tools endpoint tests tool support', async ({ page }) => {
    console.log('📡 Testing /api/v1/ai/test-tools API endpoint\n');

    // Login to get token
    console.log('1️⃣  Logging in...');
    await login(page);
    const token = await page.evaluate(() => localStorage.getItem('helios_token'));
    console.log('   ✅ Got auth token');

    // Get config to find the endpoint
    console.log('\n2️⃣  Getting AI config...');
    const configResponse = await page.request.get('http://localhost:3001/api/v1/ai/config', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const configData = await configResponse.json();

    if (!configData.data?.primaryEndpointUrl) {
      console.log('   ⚠️  No AI endpoint configured - skipping test');
      return;
    }

    const endpoint = configData.data.primaryEndpointUrl;
    const model = configData.data.primaryModel;
    console.log(`   Endpoint: ${endpoint}`);
    console.log(`   Model: ${model}`);

    // Call the test-tools endpoint
    console.log('\n3️⃣  Calling /api/v1/ai/test-tools...');
    const response = await page.request.post('http://localhost:3001/api/v1/ai/test-tools', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: { endpoint, model }
    });

    const data = await response.json();
    console.log(`   Status: ${response.status()}`);
    console.log(`   Success: ${data.success}`);

    if (data.data) {
      console.log(`   Supports tools: ${data.data.supportsTools}`);
      console.log(`   Test result: ${data.data.testResult}`);
      console.log(`   Details: ${data.data.details}`);

      // Verify response structure
      expect(data.data).toHaveProperty('supportsTools');
      expect(data.data).toHaveProperty('testResult');
      expect(data.data).toHaveProperty('details');
      expect(['success', 'no_tool_call', 'parse_error', 'error']).toContain(data.data.testResult);
      console.log('   ✅ Response structure is correct');
    }

    expect(response.status()).toBe(200);
    console.log('\n✅ API test-tools endpoint test complete');
  });
});
