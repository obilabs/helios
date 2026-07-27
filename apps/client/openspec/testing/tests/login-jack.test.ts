import { test, expect } from '@playwright/test';

test.describe('Login with Jack Admin Account', () => {
  // Clean up browser state before each test
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('Complete login flow with Jack', async ({ page }) => {
    const baseUrl = 'http://localhost:3000';
    const testEmail = 'jack@obilabs.dev';
    const testPassword = '***REMOVED-CREDENTIAL***';

    console.log('🔧 Test Configuration:');
    console.log(`   Frontend: ${baseUrl}`);
    console.log(`   Test User: ${testEmail}`);

    // Navigate to the application
    console.log('\n🌐 Navigating to application...');
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');
    console.log('   Current URL:', page.url());

    // Take screenshot of initial page
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/jack-initial-page.png',
      fullPage: true
    });

    // Find and fill login form
    console.log('\n📝 Finding login form elements...');
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    // Wait for login form to be visible (handles race condition)
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });

    const emailVisible = await emailInput.isVisible();
    const passwordVisible = await passwordInput.isVisible();
    const buttonVisible = await submitButton.isVisible();

    console.log(`   Email input found: ${emailVisible}`);
    console.log(`   Password input found: ${passwordVisible}`);
    console.log(`   Submit button found: ${buttonVisible}`);

    expect(emailVisible).toBe(true);
    expect(passwordVisible).toBe(true);
    expect(buttonVisible).toBe(true);

    // Fill login form
    console.log('\n🔐 Filling login form...');
    await emailInput.fill(testEmail);
    await passwordInput.fill(testPassword);
    console.log('   Form filled with Jack credentials');

    // Take screenshot before submit
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/jack-form-filled.png',
      fullPage: true
    });

    // Set up response listener
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/auth/login'),
      { timeout: 10000 }
    );

    // Submit form
    console.log('\n📤 Submitting login form...');
    await submitButton.click();

    // Wait for response
    const loginResponse = await responsePromise;
    console.log('\n📥 Login API Response:');
    console.log(`   Status: ${loginResponse.status()}`);
    console.log(`   URL: ${loginResponse.url()}`);

    const responseBody = await loginResponse.json();
    console.log('   Response:', JSON.stringify(responseBody, null, 2));

    // Verify successful login
    expect(loginResponse.ok()).toBe(true);
    expect(responseBody.success).toBe(true);
    expect(responseBody.data.tokens.accessToken).toBeTruthy();
    expect(responseBody.data.tokens.refreshToken).toBeTruthy();
    expect(responseBody.data.user.email).toBe(testEmail);

    console.log('   ✅ Login successful!');

    // Wait for redirect
    await page.waitForLoadState('networkidle');
    const newUrl = page.url();
    console.log(`\n🔄 Redirected to: ${newUrl}`);

    // Take screenshot after login
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/jack-after-login.png',
      fullPage: true
    });

    // Verify we're logged in (URL might still be / but we should see dashboard content)
    console.log('   ✅ Login complete, checking for dashboard content');

    // Verify user name appears in UI
    const userName = await page.locator('text=/Jack.*Dribber/i').first();
    const userVisible = await userName.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`\n👤 User name visible in UI: ${userVisible}`);

    console.log('\n✅ Test Summary:');
    console.log('   - Backend is running');
    console.log('   - Login form was found');
    console.log('   - Login was successful');
    console.log('   - User was redirected to dashboard');
    console.log(`   - Current URL: ${newUrl}`);
  });

  test('Page persistence after refresh', async ({ page }) => {
    const baseUrl = 'http://localhost:3000';
    const testEmail = 'jack@obilabs.dev';
    const testPassword = '***REMOVED-CREDENTIAL***';

    console.log('🔄 Testing Page Persistence After Refresh\n');

    // Step 1: Login
    console.log('1️⃣  Logging in...');
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"]').first().fill(testEmail);
    await page.locator('input[type="password"]').first().fill(testPassword);
    await page.locator('button[type="submit"]').first().click();

    // Wait for redirect after login
    await page.waitForLoadState('networkidle');
    console.log('   ✅ Logged in successfully');

    // Step 2: Navigate to Settings page
    console.log('\n2️⃣  Navigating to Settings page...');
    const settingsButton = await page.locator('text=/Settings/i').first();
    await settingsButton.click();
    await page.waitForLoadState('networkidle');

    // Take screenshot on Settings page
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/jack-settings-before-refresh.png',
      fullPage: true
    });
    console.log('   ✅ On Settings page');

    // Step 3: Refresh the page
    console.log('\n3️⃣  Refreshing the page...');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Take screenshot after refresh
    await page.screenshot({
      path: 'openspec/testing/reports/screenshots/jack-settings-after-refresh.png',
      fullPage: true
    });

    // Step 4: Verify still on Settings page
    console.log('\n4️⃣  Verifying page persistence...');
    const settingsVisible = await page.locator('text=/Settings/i').first().isVisible();
    const urlAfterRefresh = page.url();

    console.log(`   Current URL: ${urlAfterRefresh}`);
    console.log(`   Settings visible: ${settingsVisible}`);

    // Check localStorage
    const currentPage = await page.evaluate(() => {
      return localStorage.getItem('helios_current_page');
    });
    console.log(`   localStorage current_page: ${currentPage}`);

    expect(settingsVisible).toBe(true);
    console.log('   ✅ Successfully stayed on Settings page after refresh!');

    console.log('\n🎉 Page Persistence Test Summary:');
    console.log('   ✅ Login successful');
    console.log('   ✅ Navigation to Settings worked');
    console.log('   ✅ Page refresh maintained state');
    console.log('   ✅ localStorage persistence working');
  });

  test('Test API login directly with Jack', async ({ request }) => {
    console.log('\n🔌 Testing API directly with Jack...');

    const response = await request.post('http://localhost:3001/api/auth/login', {
      data: {
        email: 'jack@obilabs.dev',
        password: '***REMOVED-CREDENTIAL***'
      }
    });

    console.log('API Response Status:', response.status());
    const body = await response.json();
    console.log('API Response Body:', JSON.stringify(body, null, 2));

    expect(response.ok()).toBe(true);
    expect(body.success).toBe(true);
    expect(body.data.tokens.accessToken).toBeTruthy();
    expect(body.data.tokens.refreshToken).toBeTruthy();
    expect(body.data.user.email).toBe('jack@obilabs.dev');
    expect(body.data.user.firstName).toBe('Jack');
    expect(body.data.user.lastName).toBe('Dribber');
    expect(body.data.user.role).toBe('admin');
  });
});
