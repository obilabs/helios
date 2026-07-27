import { test, expect } from '@playwright/test';

test.describe('Login Test with Error Handling', () => {
  test('Complete login flow with backend validation', async ({ page }) => {
    // Test configuration
    const baseUrl = 'http://localhost:3000';
    const apiUrl = 'http://localhost:3001';
    const testEmail = 'test@example.com';
    const testPassword = 'TestPassword123!';

    console.log('🔧 Test Configuration:');
    console.log(`   Frontend: ${baseUrl}`);
    console.log(`   Backend: ${apiUrl}`);
    console.log(`   Test User: ${testEmail}`);

    // Step 1: Check backend health
    console.log('\n📊 Step 1: Checking backend health...');
    const healthResponse = await fetch(`${apiUrl}/health`);
    const healthData = await healthResponse.json();
    console.log('   Backend Status:', healthData);
    expect(healthData.success).toBe(true);
    expect(healthData.mode).toBe('MOCK');

    // Step 2: Navigate to the application
    console.log('\n🌐 Step 2: Navigating to application...');
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');
    console.log('   Current URL:', page.url());

    // Step 3: Check for error messages on the page
    console.log('\n⚠️  Step 3: Checking for error messages...');
    const errorElements = await page.locator('.error, [class*="error"], [data-test*="error"]').all();

    if (errorElements.length > 0) {
      for (const element of errorElements) {
        const text = await element.textContent();
        if (text?.trim()) {
          console.log(`   ❌ Error found: ${text}`);
        }
      }
    } else {
      console.log('   ✅ No error messages on initial load');
    }

    // Step 4: Find and fill login form
    console.log('\n📝 Step 4: Finding login form elements...');

    // Find email input
    const emailInput = await page.locator('input[type="email"]').first();
    const emailVisible = await emailInput.isVisible();
    console.log(`   Email input found: ${emailVisible}`);

    // Find password input
    const passwordInput = await page.locator('input[type="password"]').first();
    const passwordVisible = await passwordInput.isVisible();
    console.log(`   Password input found: ${passwordVisible}`);

    // Find submit button
    const submitButton = await page.locator('button[type="submit"]').first();
    const buttonVisible = await submitButton.isVisible();
    console.log(`   Submit button found: ${buttonVisible}`);

    if (emailVisible && passwordVisible && buttonVisible) {
      // Step 5: Fill and submit form
      console.log('\n🔐 Step 5: Filling login form...');
      await emailInput.fill(testEmail);
      await passwordInput.fill(testPassword);
      console.log('   Form filled with test credentials');

      // Take screenshot before submit
      await page.screenshot({
        path: 'openspec/testing/reports/screenshots/before-login.png'
      });

      // Step 6: Submit form and monitor network
      console.log('\n📤 Step 6: Submitting login form...');

      // Set up response listener
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/auth/login'),
        { timeout: 10000 }
      ).catch(err => {
        console.log('   ⏱️  No login API call detected within 10 seconds');
        return null;
      });

      // Click submit button
      await submitButton.click();
      console.log('   Submit button clicked');

      // Wait for response or timeout
      const loginResponse = await responsePromise;

      if (loginResponse) {
        console.log('\n📥 Step 7: Login API Response:');
        console.log(`   Status: ${loginResponse.status()}`);
        console.log(`   URL: ${loginResponse.url()}`);

        try {
          const responseBody = await loginResponse.json();
          console.log('   Response:', JSON.stringify(responseBody, null, 2));

          if (loginResponse.ok() && responseBody.success) {
            console.log('   ✅ Login successful!');

            // Check for redirect
            await page.waitForLoadState('networkidle');
            const newUrl = page.url();
            console.log(`   Redirected to: ${newUrl}`);

            // Verify we're no longer on login page
            if (newUrl !== baseUrl && newUrl !== baseUrl + '/') {
              console.log('   ✅ Successfully redirected after login');
            } else {
              console.log('   ⚠️  Still on login page after successful API response');
            }
          } else {
            console.log('   ❌ Login failed:', responseBody.error || 'Unknown error');
          }
        } catch (err) {
          console.log('   ❌ Failed to parse response body:', err);
        }
      } else {
        console.log('\n⚠️  Step 7: No API response detected');
        console.log('   Checking for client-side errors...');

        // Check for any error messages that appeared
        await page.waitForTimeout(2000); // Wait for any error messages to appear
        const postSubmitErrors = await page.locator('.error, [class*="error"], [data-test*="error"]').all();

        for (const element of postSubmitErrors) {
          const text = await element.textContent();
          if (text?.trim()) {
            console.log(`   Error message: ${text}`);
          }
        }
      }

      // Step 8: Final state screenshot
      console.log('\n📸 Step 8: Capturing final state...');
      await page.screenshot({
        path: 'openspec/testing/reports/screenshots/after-login-attempt.png'
      });

      // Step 9: Check console errors
      console.log('\n🔍 Step 9: Checking browser console for errors...');
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log(`   Browser console error: ${msg.text()}`);
        }
      });

      // Give console errors time to appear
      await page.waitForTimeout(1000);

    } else {
      console.log('\n❌ Login form not found on the page');
      console.log('   Page might not be a login page or uses different selectors');
    }

    // Step 10: Summary
    console.log('\n📊 Test Summary:');
    console.log(`   - Backend is ${healthData.success ? 'running' : 'not running'}`);
    console.log(`   - Login form was ${emailVisible && passwordVisible ? 'found' : 'not found'}`);
    console.log(`   - Current URL: ${page.url()}`);
  });

  test('Test API directly', async ({ request }) => {
    console.log('\n🔌 Testing API directly...');

    const response = await request.post('http://localhost:3001/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'TestPassword123!'
      }
    });

    console.log('API Response Status:', response.status());
    const body = await response.json();
    console.log('API Response Body:', JSON.stringify(body, null, 2));

    expect(response.ok()).toBe(true);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(body.data.user.email).toBe('test@example.com');
  });
});