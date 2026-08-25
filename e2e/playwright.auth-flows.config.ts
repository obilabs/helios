import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated Playwright config for the first-run auth-flow suite
 * (setup wizard + login form).
 *
 * This is SEPARATE from playwright.config.ts on purpose: these tests reset the
 * database to a fresh-install state, which would wipe the seeded admin the other
 * e2e specs rely on. Keeping them in their own config (and testIgnore'd from the
 * main one) prevents cross-contamination.
 *
 * BASE_URL points at the isolated e2e stack (nginx) that run-auth-flows.sh
 * brings up. Default matches e2e/.env.e2e (HTTP_PORT=8083).
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:8083';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/setup-and-login.spec.ts'],

  // Resets the DB to "no organization" and verifies the app agrees, before any
  // test runs.
  globalSetup: require.resolve('./global-setup.auth-flows.ts'),

  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,

  // These tests are state-ordered (wizard creates the org that login then uses).
  // A retry would re-run the wizard test against a DB that ALREADY has the org,
  // so it would (correctly) no longer find the wizard. Never retry — a failure
  // is a real failure.
  retries: 0,

  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report-auth-flows', open: 'never' }]]
    : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // The full docker stack is expected to already be running (run-auth-flows.sh /
  // `npm run e2e:up`). This entry only *waits* for it — the command is a no-op.
  webServer: {
    command: 'echo auth-flows-stack-should-already-be-running',
    url: `${BASE_URL}/health`,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
