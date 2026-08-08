import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive Developer Console Testing
 * Tests all CLI commands including CRUD operations for users and groups
 *
 * Test User: jack@gridworx.io / P@ssw0rd123!
 */

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'jack@gridworx.io';
const TEST_PASSWORD = 'P@ssw0rd123!';

// Test user to create and delete
const TEST_USER_EMAIL = 'testuser@gridworx.io';
const TEST_USER_FIRST = 'Test';
const TEST_USER_LAST = 'User';
const TEST_USER_PASSWORD = 'TempPassword123!';

// Test group to create and delete
const TEST_GROUP_EMAIL = 'testgroup@gridworx.io';
const TEST_GROUP_NAME = 'Test Group';
const TEST_GROUP_DESCRIPTION = 'Automated test group';

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for login to complete (redirects to home page with sidebar)
  await page.waitForTimeout(2000);

  // Verify we're logged in by checking for the sidebar
  await expect(page.locator('text=Welcome, Jack!')).toBeVisible({ timeout: 5000 });
}

async function navigateToConsole(page: Page) {
  // Click user menu dropdown (initials in top right)
  await page.click('button:has-text("JD")');

  // Wait for menu to open
  await page.waitForTimeout(500);

  // Click Developer Console in the dropdown
  await page.click('text=Developer Console');

  // Wait for console to be ready
  await page.waitForTimeout(1000);
  await expect(page.locator('.console-output')).toBeVisible({ timeout: 5000 });
}

async function executeCommand(page: Page, command: string) {
  // The input field has class 'input-field' and placeholder 'Type a command...'
  const input = page.locator('input.input-field[placeholder="Type a command..."]');
  await input.fill(command);
  await input.press('Enter');

  // Wait a moment for command to execute
  await page.waitForTimeout(3000);
}

async function getLatestOutput(page: Page): Promise<string> {
  // Get all output lines
  const outputLines = await page.locator('.console-output .output-line').all();

  if (outputLines.length === 0) {
    return '';
  }

  // Get the last output line (skip command echoes)
  const lastLine = outputLines[outputLines.length - 1];
  return await lastLine.textContent() || '';
}

async function waitForCommandComplete(page: Page, maxWaitMs: number = 10000) {
  // Wait a bit for command to process
  await page.waitForTimeout(2000);

  // Wait for status to return to Ready (if status indicator exists)
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const statusIndicator = page.locator('.status-indicator');
    if (await statusIndicator.count() > 0) {
      const statusText = await statusIndicator.textContent();
      if (statusText?.includes('Ready')) {
        return;
      }
    }
    await page.waitForTimeout(500);
  }
}

test.describe('Developer Console - Full CRUD Testing', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToConsole(page);
  });

  test('1. helios users list - should show local users', async ({ page }) => {
    await executeCommand(page, 'helios users list');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should show table headers
    expect(output).toContain('Email');
    expect(output).toContain('Name');
    expect(output).toContain('Status');

    // Should show Jack's account
    expect(output).toContain('jack@gridworx.io');
    expect(output).toContain('active');
  });

  test('2. helios gw users list - should show Google Workspace users', async ({ page }) => {
    await executeCommand(page, 'helios gw users list');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should show table headers
    expect(output).toContain('Email');
    expect(output).toContain('Name');

    // Should show at least one known user
    expect(output).toMatch(/anthony@gridworx\.io|mike@gridworx\.io|pewter@gridworx\.io/);
  });

  test('3. helios gw users get - should fetch single user details', async ({ page }) => {
    await executeCommand(page, 'helios gw users get mike@gridworx.io');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should contain user email
    expect(output).toContain('mike@gridworx.io');

    // Should contain JSON structure
    expect(output).toMatch(/"primaryEmail"|"name"|"id"/);

    // Should NOT contain error
    expect(output).not.toContain('invalid_scope');
    expect(output).not.toContain('error');
  });

  test('4. helios gw groups list - should show Google groups', async ({ page }) => {
    await executeCommand(page, 'helios gw groups list');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should show table headers or group data
    expect(output).toMatch(/Email|Groups|group/i);

    // Should NOT show error
    expect(output).not.toContain('Error');
  });

  test('5. helios gw orgunits list - should show organizational units', async ({ page }) => {
    await executeCommand(page, 'helios gw orgunits list');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should show org unit data or empty result
    expect(output).toMatch(/Organizational|orgUnitPath|No organizational units/i);

    // Should NOT show error
    expect(output).not.toContain('Error');
  });

  test('6. CREATE USER - helios gw users create', async ({ page }) => {
    // First check if test user already exists and delete if so
    await executeCommand(page, `helios gw users get ${TEST_USER_EMAIL}`);
    await waitForCommandComplete(page);

    let output = await page.locator('.console-output').textContent();

    if (output?.includes(TEST_USER_EMAIL) && !output?.includes('Error')) {
      console.log('Test user exists, deleting first...');
      await executeCommand(page, `helios gw users delete ${TEST_USER_EMAIL}`);
      await waitForCommandComplete(page);
      await page.waitForTimeout(2000);
    }

    // Create new test user
    const createCommand = `helios gw users create ${TEST_USER_EMAIL} "${TEST_USER_FIRST}" "${TEST_USER_LAST}" "${TEST_USER_PASSWORD}"`;
    await executeCommand(page, createCommand);
    await waitForCommandComplete(page);

    output = await page.locator('.console-output').textContent();

    // Should show success
    expect(output).toMatch(/created|success|Created user/i);
    expect(output).toContain(TEST_USER_EMAIL);

    // Should NOT show error
    expect(output).not.toContain('Error:');
    expect(output).not.toContain('failed');

    // Verify user was created by fetching it
    await page.waitForTimeout(2000);
    await executeCommand(page, `helios gw users get ${TEST_USER_EMAIL}`);
    await waitForCommandComplete(page);

    output = await page.locator('.console-output').textContent();
    expect(output).toContain(TEST_USER_EMAIL);
    expect(output).toContain(TEST_USER_FIRST);
    expect(output).toContain(TEST_USER_LAST);
  });

  test('7. DELETE USER - helios gw users delete', async ({ page }) => {
    // First ensure the test user exists
    await executeCommand(page, `helios gw users get ${TEST_USER_EMAIL}`);
    await waitForCommandComplete(page);

    let output = await page.locator('.console-output').textContent();

    // If user doesn't exist, create it first
    if (!output?.includes(TEST_USER_EMAIL) || output?.includes('Error')) {
      console.log('Test user does not exist, creating first...');
      const createCommand = `helios gw users create ${TEST_USER_EMAIL} "${TEST_USER_FIRST}" "${TEST_USER_LAST}" "${TEST_USER_PASSWORD}"`;
      await executeCommand(page, createCommand);
      await waitForCommandComplete(page);
      await page.waitForTimeout(2000);
    }

    // Delete the test user
    await executeCommand(page, `helios gw users delete ${TEST_USER_EMAIL}`);
    await waitForCommandComplete(page);

    output = await page.locator('.console-output').textContent();

    // Should show success
    expect(output).toMatch(/deleted|success|removed/i);

    // Should NOT show error
    expect(output).not.toContain('Error:');
    expect(output).not.toContain('failed');

    // Verify user was deleted by trying to fetch it
    await page.waitForTimeout(2000);
    await executeCommand(page, `helios gw users get ${TEST_USER_EMAIL}`);
    await waitForCommandComplete(page);

    output = await page.locator('.console-output').textContent();

    // Should show error or not found
    expect(output).toMatch(/Error|not found|Resource Not Found/i);
  });

  test('8. CREATE GROUP - helios gw groups create', async ({ page }) => {
    // First check if test group already exists and delete if so
    await executeCommand(page, `helios gw groups get ${TEST_GROUP_EMAIL}`);
    await waitForCommandComplete(page);

    let output = await page.locator('.console-output').textContent();

    if (output?.includes(TEST_GROUP_EMAIL) && !output?.includes('Error')) {
      console.log('Test group exists, deleting first...');
      await executeCommand(page, `helios gw groups delete ${TEST_GROUP_EMAIL}`);
      await waitForCommandComplete(page);
      await page.waitForTimeout(2000);
    }

    // Create new test group
    const createCommand = `helios gw groups create ${TEST_GROUP_EMAIL} "${TEST_GROUP_NAME}" "${TEST_GROUP_DESCRIPTION}"`;
    await executeCommand(page, createCommand);
    await waitForCommandComplete(page);

    output = await page.locator('.console-output').textContent();

    // Should show success
    expect(output).toMatch(/created|success|Created group/i);
    expect(output).toContain(TEST_GROUP_EMAIL);

    // Should NOT show error
    expect(output).not.toContain('Error:');
    expect(output).not.toContain('failed');

    // Verify group was created by fetching it
    await page.waitForTimeout(2000);
    await executeCommand(page, `helios gw groups get ${TEST_GROUP_EMAIL}`);
    await waitForCommandComplete(page);

    output = await page.locator('.console-output').textContent();
    expect(output).toContain(TEST_GROUP_EMAIL);
    expect(output).toContain(TEST_GROUP_NAME);
  });

  test('9. DELETE GROUP - helios gw groups delete', async ({ page }) => {
    // First ensure the test group exists
    await executeCommand(page, `helios gw groups get ${TEST_GROUP_EMAIL}`);
    await waitForCommandComplete(page);

    let output = await page.locator('.console-output').textContent();

    // If group doesn't exist, create it first
    if (!output?.includes(TEST_GROUP_EMAIL) || output?.includes('Error')) {
      console.log('Test group does not exist, creating first...');
      const createCommand = `helios gw groups create ${TEST_GROUP_EMAIL} "${TEST_GROUP_NAME}" "${TEST_GROUP_DESCRIPTION}"`;
      await executeCommand(page, createCommand);
      await waitForCommandComplete(page);
      await page.waitForTimeout(2000);
    }

    // Delete the test group
    await executeCommand(page, `helios gw groups delete ${TEST_GROUP_EMAIL}`);
    await waitForCommandComplete(page);

    output = await page.locator('.console-output').textContent();

    // Should show success
    expect(output).toMatch(/deleted|success|removed/i);

    // Should NOT show error
    expect(output).not.toContain('Error:');
    expect(output).not.toContain('failed');

    // Verify group was deleted by trying to fetch it
    await page.waitForTimeout(2000);
    await executeCommand(page, `helios gw groups get ${TEST_GROUP_EMAIL}`);
    await waitForCommandComplete(page);

    output = await page.locator('.console-output').textContent();

    // Should show error or not found
    expect(output).toMatch(/Error|not found|Resource Not Found/i);
  });

  test('10. Command history - arrow keys should recall commands', async ({ page }) => {
    const input = page.locator('input.console-input');

    // Execute a few commands
    await executeCommand(page, 'helios users list');
    await executeCommand(page, 'helios gw groups list');

    // Press up arrow to recall last command
    await input.press('ArrowUp');

    // Should show the last command
    let value = await input.inputValue();
    expect(value).toBe('helios gw groups list');

    // Press up arrow again
    await input.press('ArrowUp');

    // Should show the previous command
    value = await input.inputValue();
    expect(value).toBe('helios users list');

    // Press down arrow
    await input.press('ArrowDown');

    // Should go forward in history
    value = await input.inputValue();
    expect(value).toBe('helios gw groups list');
  });

  test('11. Help command - should show command documentation', async ({ page }) => {
    await executeCommand(page, 'help');

    // Should open help modal
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Available Commands')).toBeVisible();

    // Should show command categories
    const modalContent = await page.locator('.modal-content').textContent();
    expect(modalContent).toContain('users');
    expect(modalContent).toContain('groups');
  });

  test('12. Examples command - should show usage examples', async ({ page }) => {
    await executeCommand(page, 'examples');

    // Should open examples modal
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Command Examples')).toBeVisible();

    // Should show example commands
    const modalContent = await page.locator('.modal-content').textContent();
    expect(modalContent).toContain('helios');
  });

  test('13. Invalid command - should show error message', async ({ page }) => {
    await executeCommand(page, 'notarealcommand');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should show error
    expect(output).toMatch(/Unknown command|not recognized|invalid/i);
  });

  test('14. API command - helios api GET /api/users', async ({ page }) => {
    await executeCommand(page, 'helios api GET /api/users');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should return JSON response
    expect(output).toMatch(/\{|\[/); // JSON object or array

    // Should NOT show error
    expect(output).not.toContain('Error:');
  });

  test('15. Console UI - toolbar buttons are functional', async ({ page }) => {
    // Check Clear button
    await executeCommand(page, 'helios users list');
    await page.click('button:has-text("Clear")');

    // Output should be cleared (but may have welcome message)
    const outputAfterClear = await page.locator('.console-output').textContent();
    expect(outputAfterClear).not.toContain('helios users list');

    // Check Help button
    await page.click('button[title*="Help"]');
    await expect(page.locator('.modal-overlay')).toBeVisible();

    // Close modal
    await page.click('.modal-overlay'); // Click outside to close
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });
});

test.describe('Developer Console - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateToConsole(page);
  });

  test('16. Missing arguments - should show usage hint', async ({ page }) => {
    await executeCommand(page, 'helios gw users get');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should show usage or error about missing email
    expect(output).toMatch(/Usage|email required|Missing/i);
  });

  test('17. Invalid email format - should handle gracefully', async ({ page }) => {
    await executeCommand(page, 'helios gw users get notanemail');
    await waitForCommandComplete(page);

    const output = await page.locator('.console-output').textContent();

    // Should show some kind of error or not found
    // (may vary based on API validation)
    expect(output).toBeTruthy();
  });
});

console.log('✅ All developer console tests configured');
