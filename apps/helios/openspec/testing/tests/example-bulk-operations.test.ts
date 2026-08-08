import { test, expect } from '@playwright/test';
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
      email: { $in: users.map(u => u.email) }
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
    expect(download.suggestedFilename()).toMatch(/operation-results-.*.csv/);
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
});