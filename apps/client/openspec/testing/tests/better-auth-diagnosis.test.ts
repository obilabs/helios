import { test, expect } from '@playwright/test'
import { TEST_CONFIG } from '../helpers/test-helpers'

/**
 * Better Auth Diagnosis Test Suite
 *
 * These tests help diagnose the current state of the Better Auth integration.
 * Run with: npx playwright test tests/better-auth-diagnosis.test.ts --headed
 */
test.describe('Better Auth Integration Diagnosis', () => {

  test.describe('1. Environment Check', () => {

    test('Backend is accessible', async ({ request }) => {
      const response = await request.get(`${TEST_CONFIG.apiUrl}/health`)
      expect(response.ok()).toBe(true)

      const body = await response.json()
      console.log('Health check response:', JSON.stringify(body, null, 2))

      expect(body.status).toBe('healthy')
      expect(body.database).toBe('connected')
    })

    test('Setup status endpoint responds', async ({ request }) => {
      const response = await request.get(`${TEST_CONFIG.apiUrl}/api/v1/organization/setup/status`)

      console.log('Setup status response code:', response.status())

      const body = await response.json()
      console.log('Setup status response:', JSON.stringify(body, null, 2))

      // Document what we find
      if (body.data?.isSetupComplete) {
        console.log('✅ Organization is set up - should show LOGIN screen')
      } else {
        console.log('❌ Organization NOT set up - will show SETUP screen')
      }
    })
  })

  test.describe('2. Better Auth Endpoints', () => {

    test('Better Auth base path responds', async ({ request }) => {
      const response = await request.get(`${TEST_CONFIG.apiUrl}/api/auth/`)

      console.log('Better Auth base response code:', response.status())
      console.log('Response headers:', Object.fromEntries(response.headers()))

      // Better-auth may return 404 for base path, that's OK
      // We're just checking if it's handling the route
    })

    test('Better Auth sign-in endpoint exists', async ({ request }) => {
      // Send a malformed request to see if endpoint exists
      const response = await request.post(`${TEST_CONFIG.apiUrl}/api/auth/sign-in/email`, {
        data: {}
      })

      console.log('Sign-in endpoint response code:', response.status())

      try {
        const body = await response.json()
        console.log('Sign-in response:', JSON.stringify(body, null, 2))
      } catch (e) {
        const text = await response.text()
        console.log('Sign-in response text:', text.substring(0, 500))
      }
    })

    test('Better Auth sign-in with valid credentials', async ({ request }) => {
      const response = await request.post(`${TEST_CONFIG.apiUrl}/api/auth/sign-in/email`, {
        data: {
          email: TEST_CONFIG.testEmail,
          password: TEST_CONFIG.testPassword
        }
      })

      console.log('Sign-in with creds response code:', response.status())
      console.log('Set-Cookie header:', response.headers()['set-cookie'])

      try {
        const body = await response.json()
        console.log('Sign-in with creds response:', JSON.stringify(body, null, 2))

        if (body.session && body.user) {
          console.log('✅ Better Auth sign-in WORKS!')
          console.log('  Session ID:', body.session.id)
          console.log('  User email:', body.user.email)
        } else if (body.error) {
          console.log('❌ Better Auth sign-in FAILED:', body.error)
        }
      } catch (e) {
        const text = await response.text()
        console.log('Response text:', text.substring(0, 500))
      }
    })

    test('Get session endpoint', async ({ request }) => {
      const response = await request.get(`${TEST_CONFIG.apiUrl}/api/auth/get-session`)

      console.log('Get session response code:', response.status())

      try {
        const body = await response.json()
        console.log('Get session response:', JSON.stringify(body, null, 2))
      } catch (e) {
        const text = await response.text()
        console.log('Get session response text:', text.substring(0, 500))
      }
    })
  })

  test.describe('3. Legacy Auth Endpoints', () => {

    test('Legacy /api/v1/auth/login endpoint', async ({ request }) => {
      const response = await request.post(`${TEST_CONFIG.apiUrl}/api/v1/auth/login`, {
        data: {
          email: TEST_CONFIG.testEmail,
          password: TEST_CONFIG.testPassword
        }
      })

      console.log('Legacy login response code:', response.status())

      try {
        const body = await response.json()
        console.log('Legacy login response:', JSON.stringify(body, null, 2))

        if (body.data?.tokens?.accessToken) {
          console.log('✅ Legacy JWT login WORKS!')
        } else if (body.session) {
          console.log('⚠️ Legacy endpoint returns Better Auth format - CONFLICT!')
        } else {
          console.log('❌ Legacy login returned unexpected format')
        }
      } catch (e) {
        const text = await response.text()
        console.log('Response text:', text.substring(0, 500))
      }
    })

    test('Token verify endpoint', async ({ request }) => {
      // First get a token
      const loginResponse = await request.post(`${TEST_CONFIG.apiUrl}/api/v1/auth/login`, {
        data: {
          email: TEST_CONFIG.testEmail,
          password: TEST_CONFIG.testPassword
        }
      })

      const loginBody = await loginResponse.json()
      const token = loginBody.data?.tokens?.accessToken

      if (!token) {
        console.log('⚠️ No token from login, skipping verify test')
        return
      }

      const verifyResponse = await request.get(`${TEST_CONFIG.apiUrl}/api/v1/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      console.log('Verify response code:', verifyResponse.status())

      const body = await verifyResponse.json()
      console.log('Verify response:', JSON.stringify(body, null, 2))
    })
  })

  test.describe('4. Frontend Behavior', () => {

    test('Frontend initial load', async ({ page }) => {
      // Clear any existing auth state
      await page.goto(TEST_CONFIG.baseUrl)
      await page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
      })
      await page.reload()

      // Wait for page to settle
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      // Take screenshot of what we see
      await page.screenshot({
        path: 'openspec/testing/reports/screenshots/better-auth-diagnosis-initial.png',
        fullPage: true
      })

      // Check what page we're on
      const url = page.url()
      console.log('Current URL:', url)

      // Check for login form
      const hasEmailInput = await page.locator('input[type="email"]').count() > 0
      const hasPasswordInput = await page.locator('input[type="password"]').count() > 0
      const hasSetupForm = await page.locator('text=/Set up your organization/i').count() > 0

      console.log('Has email input:', hasEmailInput)
      console.log('Has password input:', hasPasswordInput)
      console.log('Has setup form:', hasSetupForm)

      if (hasSetupForm) {
        console.log('❌ SHOWING SETUP SCREEN - This is the bug!')
      } else if (hasEmailInput && hasPasswordInput) {
        console.log('✅ SHOWING LOGIN SCREEN - This is correct')
      } else {
        console.log('⚠️ Unknown state - check screenshot')
      }

      // Check page title/header
      const pageContent = await page.content()
      if (pageContent.includes('Welcome to Helios Admin Portal')) {
        console.log('Found: Welcome to Helios Admin Portal')
      }
      if (pageContent.includes('Set up your organization')) {
        console.log('Found: Set up your organization')
      }
    })

    test('Network requests on page load', async ({ page }) => {
      const requests: string[] = []

      // Listen to network requests
      page.on('request', request => {
        if (request.url().includes('/api/')) {
          requests.push(`${request.method()} ${request.url()}`)
        }
      })

      page.on('response', async response => {
        if (response.url().includes('/api/')) {
          console.log(`Response: ${response.status()} ${response.url()}`)
        }
      })

      await page.goto(TEST_CONFIG.baseUrl)
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      console.log('\nAPI requests made on page load:')
      requests.forEach(r => console.log(`  ${r}`))
    })
  })

  test.describe('5. Database State', () => {

    test('Log database check commands', async () => {
      console.log('\n=== Run these commands to check database state ===\n')

      console.log('# Check if organization exists:')
      console.log('docker exec helios-db psql -U postgres -d helios_client -c "SELECT id, name, domain FROM organizations;"')

      console.log('\n# Check test user exists:')
      console.log(`docker exec helios-db psql -U postgres -d helios_client -c "SELECT id, email, role, is_active, password_hash IS NOT NULL as has_password FROM organization_users WHERE email='${TEST_CONFIG.testEmail}';"`)

      console.log('\n# Check auth tables exist:')
      console.log('docker exec helios-db psql -U postgres -d helios_client -c "\\dt auth_*"')

      console.log('\n# Check for any sessions:')
      console.log('docker exec helios-db psql -U postgres -d helios_client -c "SELECT id, user_id, expires_at FROM auth_sessions ORDER BY created_at DESC LIMIT 5;"')

      console.log('\n=== End database commands ===\n')
    })
  })
})
