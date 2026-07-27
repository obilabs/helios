#!/usr/bin/env node
/**
 * Test Generation Script
 * Automatically generates Playwright tests from OpenSpec files
 */

import * as fs from 'fs';
import * as path from 'path';
import { SpecParser } from './framework/spec-parser';
import { TestGenerator } from './framework/test-generator';

class TestGenerationRunner {
  private specParser: SpecParser;
  private testGenerator: TestGenerator;
  private testsPath: string;

  constructor() {
    this.specParser = new SpecParser();
    this.testGenerator = new TestGenerator();
    this.testsPath = path.join(__dirname, 'tests');

    // Ensure tests directory exists
    if (!fs.existsSync(this.testsPath)) {
      fs.mkdirSync(this.testsPath, { recursive: true });
    }
  }

  /**
   * Find all spec.md files in the project
   */
  private findSpecFiles(dir: string = path.join(__dirname, '..')): string[] {
    const specFiles: string[] = [];

    function walk(currentPath: string) {
      const files = fs.readdirSync(currentPath);

      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules and other non-relevant directories
          if (!file.startsWith('.') && file !== 'node_modules' && file !== 'testing') {
            walk(fullPath);
          }
        } else if (file === 'spec.md' || file.endsWith('.spec.md')) {
          specFiles.push(fullPath);
        }
      }
    }

    walk(dir);
    return specFiles;
  }

  /**
   * Generate tests for a single spec file
   */
  private async generateTestForSpec(specFile: string): Promise<void> {
    console.log(`📄 Processing: ${path.relative(process.cwd(), specFile)}`);

    try {
      // Parse the spec file
      const requirements = await this.specParser.parseSpecFile(specFile);

      if (requirements.length === 0) {
        console.log(`  ⚠️  No test requirements found`);
        return;
      }

      // Extract change name from path if in changes directory
      let changeName = path.basename(specFile, '.md');
      const pathParts = specFile.split(path.sep);
      const changesIndex = pathParts.indexOf('changes');
      if (changesIndex >= 0 && changesIndex + 1 < pathParts.length) {
        changeName = pathParts[changesIndex + 1];
      } else if (pathParts.includes('specs')) {
        changeName = pathParts[pathParts.indexOf('specs') + 1] || changeName;
      }

      // Generate test content
      const testFilePath = await this.testGenerator.generateTestFile(changeName, requirements);

      // Also copy to our tests directory
      const relativePath = path.relative(path.join(__dirname, '..'), specFile);
      const testFileName = relativePath
        .replace(/\\/g, '/')
        .replace(/\.md$/, '.test.ts')
        .replace(/spec\.md$/, 'spec.test.ts')
        .replace(/\//g, '-');

      const outputPath = path.join(this.testsPath, testFileName);

      // Read the generated test and copy to tests directory
      const testContent = fs.readFileSync(testFilePath, 'utf-8');
      fs.writeFileSync(outputPath, testContent);

      console.log(`  ✅ Generated: ${path.relative(process.cwd(), outputPath)}`);
      console.log(`     - ${requirements.length} test requirements`);

      // Count scenarios
      const scenarioCount = requirements.reduce((sum: number, req: any) => sum + req.scenarios.length, 0);
      console.log(`     - ${scenarioCount} test scenarios`);

    } catch (error: any) {
      console.error(`  ❌ Error: ${error.message || error}`);
    }
  }

  /**
   * Generate example tests to demonstrate capabilities
   */
  private async generateExampleTests(): Promise<void> {
    console.log('\n📝 Generating Example Tests...\n');

    // Example: Authentication flow test
    const authTestContent = `import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth.helper';
import { ScreenshotHelper } from '../helpers/screenshot.helper';
import { DatabaseHelper } from '../helpers/database.helper';

test.describe('Authentication Flow', () => {
  let authHelper: AuthHelper;
  let screenshotHelper: ScreenshotHelper;
  let dbHelper: DatabaseHelper;

  test.beforeAll(async () => {
    authHelper = new AuthHelper();
    screenshotHelper = new ScreenshotHelper('authentication');
    dbHelper = new DatabaseHelper();

    // Seed database with test data
    await dbHelper.seed('authentication');
  });

  test.afterAll(async () => {
    await dbHelper.cleanup();
    await dbHelper.disconnect();
  });

  test('Admin user can login successfully', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');

    // Take screenshot of login page
    await screenshotHelper.capture(page, 'login-page');

    // Login as admin
    await authHelper.loginAsAdmin(page);

    // Verify successful login
    expect(page.url()).toContain('/dashboard');

    // Take screenshot of dashboard
    await screenshotHelper.capture(page, 'admin-dashboard');

    // Verify user menu is visible
    const userMenu = page.locator('[data-test="user-menu"]');
    await expect(userMenu).toBeVisible();
  });

  test('Invalid credentials show error message', async ({ page }) => {
    await page.goto('/login');

    // Enter invalid credentials
    await page.fill('[data-test="email-input"]', 'invalid@example.com');
    await page.fill('[data-test="password-input"]', 'wrongpassword');

    // Submit form
    await page.click('[data-test="login-button"]');

    // Verify error message
    const errorMessage = page.locator('[data-test="error-message"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Invalid email or password');

    // Screenshot of error state
    await screenshotHelper.capture(page, 'login-error');
  });

  test('Password reset flow works', async ({ page }) => {
    await page.goto('/login');

    // Click forgot password
    await page.click('[data-test="forgot-password-link"]');

    // Verify redirect to reset page
    await expect(page).toHaveURL(/.*\/forgot-password/);

    // Enter email for reset
    await page.fill('[data-test="reset-email-input"]', 'admin@test.helios.local');
    await page.click('[data-test="reset-password-button"]');

    // Verify success message
    const successMessage = page.locator('[data-test="reset-email-sent"]');
    await expect(successMessage).toBeVisible();

    // Screenshot of success state
    await screenshotHelper.capture(page, 'password-reset-success');
  });

  test('Session expires after timeout', async ({ page, context }) => {
    // Login first
    await authHelper.loginAsAdmin(page);

    // Manually set expired token
    await page.evaluate(() => {
      const expiredToken = 'expired.jwt.token';
      localStorage.setItem('token', expiredToken);
    });

    // Try to access protected route
    await page.goto('/settings');

    // Should redirect to login
    await expect(page).toHaveURL(/.*\/login/);

    // Verify session expired message
    const message = page.locator('[data-test="session-expired"]');
    await expect(message).toBeVisible();
  });

  test('Logout clears session', async ({ page }) => {
    // Login first
    await authHelper.loginAsAdmin(page);

    // Verify logged in
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Logout
    await authHelper.logout(page);

    // Verify redirected to login
    await expect(page).toHaveURL(/.*\/login/);

    // Try to access protected route
    await page.goto('/dashboard');

    // Should redirect back to login
    await expect(page).toHaveURL(/.*\/login/);
  });
});`;

    fs.writeFileSync(
      path.join(this.testsPath, 'example-authentication.test.ts'),
      authTestContent
    );

    // Example: Bulk Operations CSV Upload Test
    const bulkTestContent = `import { test, expect } from '@playwright/test';
import { AuthHelper } from '../helpers/auth.helper';
import { TestDataHelper } from '../helpers/test-data.helper';
import { DatabaseHelper } from '../helpers/database.helper';
import { ScreenshotHelper } from '../helpers/screenshot.helper';

test.describe('Bulk Operations - CSV Upload', () => {
  let authHelper: AuthHelper;
  let testData: TestDataHelper;
  let dbHelper: DatabaseHelper;
  let screenshotHelper: ScreenshotHelper;

  test.beforeAll(async () => {
    authHelper = new AuthHelper();
    testData = new TestDataHelper();
    dbHelper = new DatabaseHelper();
    screenshotHelper = new ScreenshotHelper('bulk-operations');

    await dbHelper.seed('bulk-operations');
  });

  test.afterAll(async () => {
    await testData.cleanup();
    await dbHelper.cleanup();
    await dbHelper.disconnect();
  });

  test('Upload users via CSV successfully', async ({ page }) => {
    // Login as admin
    await authHelper.loginAsAdmin(page);

    // Navigate to bulk operations
    await page.goto('/bulk-operations');

    // Take screenshot of bulk operations page
    await screenshotHelper.capture(page, 'bulk-operations-page');

    // Generate test CSV with 10 users
    const users = testData.generateUsers(10);
    const csvPath = await testData.createCSVFile('test-users.csv', users);

    // Select operation type
    await page.selectOption('[data-test="operation-type"]', 'user_create');

    // Upload CSV file
    const fileInput = page.locator('[data-test="csv-upload"]');
    await fileInput.setInputFiles(csvPath);

    // Preview uploaded data
    await page.click('[data-test="preview-button"]');

    // Wait for preview table
    await page.waitForSelector('[data-test="preview-table"]');

    // Screenshot of preview
    await screenshotHelper.capture(page, 'csv-preview');

    // Verify preview shows correct number of rows
    const rows = page.locator('[data-test="preview-table"] tbody tr');
    await expect(rows).toHaveCount(10);

    // Execute bulk operation
    await page.click('[data-test="execute-button"]');

    // Wait for progress indicator
    await page.waitForSelector('[data-test="progress-bar"]');

    // Wait for completion
    await page.waitForSelector('[data-test="operation-complete"]', { timeout: 30000 });

    // Screenshot of results
    await screenshotHelper.capture(page, 'bulk-operation-results');

    // Verify all users created
    const successCount = page.locator('[data-test="success-count"]');
    await expect(successCount).toHaveText('10');

    // Verify users in database
    const userCount = await dbHelper.count('organization_users', {
      email: { \$in: users.map(u => u.email) }
    });
    expect(userCount).toBe(10);
  });

  test('Invalid CSV shows validation errors', async ({ page }) => {
    await authHelper.loginAsAdmin(page);
    await page.goto('/bulk-operations');

    // Create invalid CSV (missing required fields)
    const invalidData = [
      { email: 'test@example.com' }, // Missing firstName, lastName
      { firstName: 'John', lastName: 'Doe' } // Missing email
    ];
    const csvPath = await testData.createCSVFile('invalid-users.csv', invalidData);

    // Select operation type
    await page.selectOption('[data-test="operation-type"]', 'user_create');

    // Upload CSV
    await page.locator('[data-test="csv-upload"]').setInputFiles(csvPath);

    // Try to preview
    await page.click('[data-test="preview-button"]');

    // Should show validation errors
    const errors = page.locator('[data-test="validation-errors"]');
    await expect(errors).toBeVisible();

    // Screenshot validation errors
    await screenshotHelper.capture(page, 'csv-validation-errors');

    // Verify error messages
    const errorList = page.locator('[data-test="error-list"] li');
    await expect(errorList).toHaveCount(2);
  });

  test('Download operation results as CSV', async ({ page }) => {
    await authHelper.loginAsAdmin(page);
    await page.goto('/bulk-operations');

    // View past operations
    await page.click('[data-test="view-history-button"]');

    // Wait for history table
    await page.waitForSelector('[data-test="operations-history"]');

    // Click on first operation
    const firstOperation = page.locator('[data-test="operation-row"]').first();
    await firstOperation.click();

    // Download results
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-test="download-results-button"]')
    ]);

    // Verify download
    expect(download.suggestedFilename()).toMatch(/operation-results-.*\.csv/);
  });

  test('Cancel running bulk operation', async ({ page }) => {
    await authHelper.loginAsAdmin(page);
    await page.goto('/bulk-operations');

    // Create large CSV for long-running operation
    const users = testData.generateUsers(100);
    const csvPath = await testData.createCSVFile('large-batch.csv', users);

    // Start operation
    await page.selectOption('[data-test="operation-type"]', 'user_create');
    await page.locator('[data-test="csv-upload"]').setInputFiles(csvPath);
    await page.click('[data-test="preview-button"]');
    await page.click('[data-test="execute-button"]');

    // Wait for progress to start
    await page.waitForSelector('[data-test="progress-bar"]');

    // Cancel operation
    await page.click('[data-test="cancel-button"]');

    // Confirm cancellation
    await page.click('[data-test="confirm-cancel"]');

    // Verify operation cancelled
    const status = page.locator('[data-test="operation-status"]');
    await expect(status).toHaveText('Cancelled');

    // Screenshot cancelled state
    await screenshotHelper.capture(page, 'operation-cancelled');
  });
});`;

    fs.writeFileSync(
      path.join(this.testsPath, 'example-bulk-operations.test.ts'),
      bulkTestContent
    );

    console.log('✅ Generated example tests:');
    console.log('   - example-authentication.test.ts');
    console.log('   - example-bulk-operations.test.ts');
  }

  /**
   * Main run method
   */
  async run(): Promise<void> {
    console.log('🚀 OpenSpec Test Generator\n');
    console.log('=' . repeat(50));

    // Find all spec files
    const specFiles = this.findSpecFiles();
    console.log(`\n📁 Found ${specFiles.length} spec files\n`);

    // Generate tests for each spec
    for (const specFile of specFiles) {
      await this.generateTestForSpec(specFile);
    }

    // Generate example tests
    await this.generateExampleTests();

    console.log('\n' + '=' . repeat(50));
    console.log('\n✨ Test generation complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Spec files processed: ${specFiles.length}`);
    console.log(`   - Test files generated: ${specFiles.length + 2}`);
    console.log(`   - Output directory: ${path.relative(process.cwd(), this.testsPath)}`);

    console.log('\n🎯 Next Steps:');
    console.log('   1. Review generated tests in openspec/testing/tests/');
    console.log('   2. Create test fixtures in openspec/testing/fixtures/');
    console.log('   3. Run tests with: npm test');
    console.log('   4. View test report: npx playwright show-report');
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new TestGenerationRunner();
  runner.run().catch(error => {
    console.error('❌ Test generation failed:', error);
    process.exit(1);
  });
}

export default TestGenerationRunner;