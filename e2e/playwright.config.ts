import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    // Use port 80 (nginx proxy) for proper API routing in E2E tests
    baseURL: 'http://localhost:80',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // E2E tests run against Docker compose stack (nginx on port 80)
    // This just checks if the stack is already running
    command: 'echo "Docker stack should be running with docker compose up"',
    url: 'http://localhost:80/health',
    reuseExistingServer: true,
    timeout: 5000,
  },
});
