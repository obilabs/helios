import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './openspec/testing/tests',
  testMatch: ['**/investigate-onboarding-navigation.test.ts'],
  outputDir: './openspec/testing/reports/artifacts',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: './openspec/testing/reports/html', open: 'never' }]],
  use: {
    baseURL: 'http://localhost',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer - use existing running server
});
