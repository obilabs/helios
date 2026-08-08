import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for OpenSpec automated testing
 */
export default defineConfig({
  testDir: './openspec',
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.spec.ts'],
  // Ignore auto-generated tests with ESM compatibility issues
  testIgnore: [
    '**/tests/changes-add-group-mailbox-*.test.ts',
    '**/tests/changes-add-url-routing-*.test.ts',
    '**/tests/changes-archive-*.test.ts',
    '**/tests/specs-user-directory-spec.test.ts',
    '**/tests/example-bulk-operations.test.ts',
  ],

  // Folder for test artifacts
  outputDir: './openspec/testing/reports/artifacts',

  // Maximum time one test can run
  timeout: 60 * 1000,

  // Maximum time for expect assertions
  expect: {
    timeout: 10 * 1000,
  },

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html', {
      outputFolder: './openspec/testing/reports/html',
      open: 'never'
    }],
    ['json', {
      outputFile: './openspec/testing/reports/results.json'
    }],
    ['junit', {
      outputFile: './openspec/testing/reports/junit.xml'
    }],
    ['list']
  ],

  use: {
    // Base URL for the application
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true
    },

    // Video on failure
    video: {
      mode: 'retain-on-failure',
      size: { width: 1280, height: 720 }
    },

    // Emulate a consistent viewport
    viewport: { width: 1280, height: 720 },

    // Ignore HTTPS errors
    ignoreHTTPSErrors: true,

    // Custom test attributes
    testIdAttribute: 'data-test',
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },

    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    // Test against branded browsers
    {
      name: 'Microsoft Edge',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge'
      },
    },

    {
      name: 'Google Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome'
      },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: [
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    }
  ],
});