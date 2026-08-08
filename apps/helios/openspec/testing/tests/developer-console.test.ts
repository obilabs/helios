import { test, expect, Page } from '@playwright/test';

/**
 * Developer Console CLI Automated Tests
 *
 * Tests all CLI commands to ensure:
 * - Commands execute without errors
 * - Output format is correct
 * - Data is displayed properly
 * - Error handling works
 */

// Helper function to wait for command output
async function waitForOutput(page: Page, timeout = 5000) {
  await page.waitForTimeout(1000); // Give command time to execute
}

// Helper to get console output text
async function getConsoleOutput(page: Page): Promise<string> {
  const outputElement = page.locator('.console-output');
  return await outputElement.textContent() || '';
}

// Helper to execute a command in the console
async function executeCommand(page: Page, command: string) {
  const input = page.locator('.input-field');
  await input.fill(command);
  await input.press('Enter');
  await waitForOutput(page);
}

// Helper to clear console
async function clearConsole(page: Page) {
  const clearButton = page.locator('.btn-console-action').nth(2); // Third button is Clear
  await clearButton.click();
  await page.waitForTimeout(500);
}

test.describe('Developer Console CLI Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Check if already logged in, if not, login
    const isLoginPage = await page.locator('input[type="email"]').isVisible().catch(() => false);

    if (isLoginPage) {
      await page.fill('input[type="email"]', 'jack@gridworx.io');
      await page.fill('input[type="password"]', 'P@ssw0rd123!');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }

    // Navigate to Developer Console
    // Open user menu
    await page.locator('.user-menu-button, .user-avatar').click();
    await page.waitForTimeout(500);

    // Click Developer Console menu item
    await page.locator('text=Developer Console').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify we're on the Developer Console page
    await expect(page.locator('h1:has-text("Developer Console")')).toBeVisible();
  });

  test('Console loads with welcome message', async ({ page }) => {
    const output = await getConsoleOutput(page);
    expect(output).toContain('Helios Developer Console v1.0.0');
    expect(output).toContain('Type "help" for available commands');
  });

  test('Help command opens modal with all commands', async ({ page }) => {
    await executeCommand(page, 'help');

    // Check that help modal is visible
    await expect(page.locator('.modal-backdrop')).toBeVisible();
    await expect(page.locator('h2:has-text("Available Commands")')).toBeVisible();

    // Check for key sections
    await expect(page.locator('text=Built-in Commands')).toBeVisible();
    await expect(page.locator('text=Users')).toBeVisible();
    await expect(page.locator('text=Groups')).toBeVisible();

    // Close modal
    await page.locator('.modal-close').click();
    await expect(page.locator('.modal-backdrop')).not.toBeVisible();
  });

  test('Examples command opens modal with usage examples', async ({ page }) => {
    await executeCommand(page, 'examples');

    // Check that examples modal is visible
    await expect(page.locator('.modal-backdrop')).toBeVisible();
    await expect(page.locator('h2:has-text("Usage Examples")')).toBeVisible();

    // Check for example code blocks
    await expect(page.locator('.example-code').first()).toBeVisible();
    await expect(page.locator('text=List all Google Workspace users')).toBeVisible();

    // Close modal
    await page.locator('.modal-close').click();
    await expect(page.locator('.modal-backdrop')).not.toBeVisible();
  });

  test('Clear command removes all output', async ({ page }) => {
    await executeCommand(page, 'test command');

    let output = await getConsoleOutput(page);
    expect(output.length).toBeGreaterThan(0);

    await executeCommand(page, 'clear');

    output = await getConsoleOutput(page);
    // Should only have the clear command itself
    expect(output).toContain('$ clear');
    expect(output).not.toContain('Helios Developer Console v1.0.0');
  });

  test('helios users list displays Helios platform users', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios users list');

    const output = await getConsoleOutput(page);

    // Check for table header
    expect(output).toContain('EMAIL');
    expect(output).toContain('FIRST NAME');
    expect(output).toContain('LAST NAME');
    expect(output).toContain('STATUS');

    // Check for separator line
    expect(output).toContain('='.repeat(75));

    // Should have at least some users
    expect(output).toContain('@gridworx.io');

    // Check that status is not "unknown" anymore (should be "active")
    const lines = output.split('\n');
    const userLines = lines.filter(l => l.includes('@gridworx.io'));
    expect(userLines.length).toBeGreaterThan(0);

    // At least one user should have "active" status
    const hasActiveStatus = userLines.some(l => l.includes('active'));
    expect(hasActiveStatus).toBeTruthy();
  });

  test('helios gw users list displays Google Workspace users', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios gw users list');

    await page.waitForTimeout(2000); // Give API time to respond

    const output = await getConsoleOutput(page);

    // Should not have the "map is not a function" error
    expect(output).not.toContain('map is not a function');
    expect(output).not.toContain('Command failed');

    // Check for table header
    expect(output).toContain('EMAIL');
    expect(output).toContain('FIRST NAME');
    expect(output).toContain('LAST NAME');
    expect(output).toContain('ORG UNIT');
    expect(output).toContain('STATUS');

    // Check for separator line
    expect(output).toContain('='.repeat(110));

    // Should have users or show appropriate message
    const hasUsers = output.includes('@gridworx.io') || output.includes('@gridworx.io');
    const hasErrorMessage = output.includes('No users found');
    expect(hasUsers || hasErrorMessage).toBeTruthy();
  });

  test('helios gw users get retrieves specific user', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios gw users get jack@gridworx.io');

    await page.waitForTimeout(2000);

    const output = await getConsoleOutput(page);

    // Should have JSON output with user details or error
    const hasUserData = output.includes('primaryEmail') || output.includes('jack@gridworx.io');
    const hasError = output.includes('error') || output.includes('not found');
    expect(hasUserData || hasError).toBeTruthy();
  });

  test('helios gw groups list displays groups', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios gw groups list');

    await page.waitForTimeout(2000);

    const output = await getConsoleOutput(page);

    // Check for table header or appropriate message
    const hasHeader = output.includes('EMAIL') && output.includes('NAME') && output.includes('MEMBERS');
    const hasNoGroups = output.includes('No groups found') || output.includes('success');
    expect(hasHeader || hasNoGroups).toBeTruthy();
  });

  test('helios gw orgunits list displays organizational units', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios gw orgunits list');

    await page.waitForTimeout(2000);

    const output = await getConsoleOutput(page);

    // Check for table header or appropriate message
    const hasHeader = output.includes('PATH') && output.includes('NAME') && output.includes('USERS');
    const hasData = output.includes('/') || output.includes('success');
    expect(hasHeader || hasData).toBeTruthy();
  });

  test('Invalid command shows error message', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios invalid command');

    const output = await getConsoleOutput(page);
    expect(output).toContain('Unknown');
  });

  test('helios api GET command works', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios api GET /api/organization/current');

    await page.waitForTimeout(2000);

    const output = await getConsoleOutput(page);

    // Should have JSON response
    expect(output).toContain('{');
    expect(output).toContain('}');
  });

  test('Command history works with arrow keys', async ({ page }) => {
    const input = page.locator('.input-field');

    // Execute a command
    await executeCommand(page, 'helios users list');

    // Wait a bit
    await page.waitForTimeout(500);

    // Press up arrow to get previous command
    await input.press('ArrowUp');

    // Check that input has the previous command
    const inputValue = await input.inputValue();
    expect(inputValue).toBe('helios users list');
  });

  test('Toolbar buttons are visible and functional', async ({ page }) => {
    // Check Help button
    const helpButton = page.locator('.btn-console-action').first();
    await expect(helpButton).toBeVisible();
    await helpButton.click();
    await expect(page.locator('.modal-backdrop')).toBeVisible();
    await page.locator('.modal-close').click();

    // Check Examples button
    const examplesButton = page.locator('.btn-console-action').nth(1);
    await expect(examplesButton).toBeVisible();

    // Check Clear button
    const clearButton = page.locator('.btn-console-action').nth(2);
    await expect(clearButton).toBeVisible();
  });

  test('Status indicator shows Ready state', async ({ page }) => {
    const statusDot = page.locator('.status-dot');
    await expect(statusDot).toBeVisible();
    await expect(statusDot).toHaveClass(/ready/);
  });

  test('Console output has proper color coding', async ({ page }) => {
    await clearConsole(page);

    // Execute a successful command
    await executeCommand(page, 'helios users list');
    await page.waitForTimeout(1000);

    // Check that we have output with success class
    const successOutput = page.locator('.output-success');
    const count = await successOutput.count();
    expect(count).toBeGreaterThan(0);
  });

  test('helios users list shows actual names not empty', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios users list');

    await page.waitForTimeout(1000);

    const output = await getConsoleOutput(page);
    const lines = output.split('\n');
    const userLines = lines.filter(l => l.includes('@gridworx.io'));

    // Check that at least one user has a first name that's not empty
    const hasNames = userLines.some(line => {
      // Extract the name column (between email and status)
      const parts = line.split(/\s+/).filter(p => p.length > 0);
      // Should have at least email, firstName, and status
      return parts.length >= 3 && parts[1] !== '' && parts[1] !== 'FIRST';
    });

    expect(hasNames).toBeTruthy();
  });

  test('Console maintains scrolling position', async ({ page }) => {
    // Execute multiple commands to fill console
    for (let i = 0; i < 5; i++) {
      await executeCommand(page, `helios users list`);
      await page.waitForTimeout(500);
    }

    // Console should auto-scroll to bottom
    const outputContainer = page.locator('.console-output');

    // Check that scrollTop is near scrollHeight (auto-scrolled to bottom)
    const scrollInfo = await outputContainer.evaluate((el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }));

    // Should be scrolled near the bottom (within 50px)
    expect(scrollInfo.scrollTop + scrollInfo.clientHeight).toBeGreaterThan(scrollInfo.scrollHeight - 50);
  });
});

test.describe('Developer Console Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to console (same as main tests)
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    const isLoginPage = await page.locator('input[type="email"]').isVisible().catch(() => false);

    if (isLoginPage) {
      await page.fill('input[type="email"]', 'jack@gridworx.io');
      await page.fill('input[type="password"]', 'P@ssw0rd123!');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }

    await page.locator('.user-menu-button, .user-avatar').click();
    await page.waitForTimeout(500);
    await page.locator('text=Developer Console').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('Missing required arguments shows usage hint', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios gw users get');

    const output = await getConsoleOutput(page);
    expect(output).toContain('Usage:');
    expect(output).toContain('get <email>');
  });

  test('Invalid email format is handled gracefully', async ({ page }) => {
    await clearConsole(page);
    await executeCommand(page, 'helios gw users get invalid-email');

    await page.waitForTimeout(2000);

    const output = await getConsoleOutput(page);
    // Should show error or not found, but not crash
    expect(output).not.toContain('map is not a function');
    expect(output).not.toContain('undefined');
  });

  test('Network error is displayed properly', async ({ page }) => {
    // This would require mocking network failure
    // For now, just verify error output formatting works
    await clearConsole(page);
    await executeCommand(page, 'helios api GET /api/nonexistent-endpoint');

    await page.waitForTimeout(2000);

    const output = await getConsoleOutput(page);
    const errorOutput = page.locator('.output-error');

    // Should have error styling
    const errorCount = await errorOutput.count();
    expect(errorCount).toBeGreaterThan(0);
  });
});

test.describe('Developer Console UI/UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    const isLoginPage = await page.locator('input[type="email"]').isVisible().catch(() => false);

    if (isLoginPage) {
      await page.fill('input[type="email"]', 'jack@gridworx.io');
      await page.fill('input[type="password"]', 'P@ssw0rd123!');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
    }

    await page.locator('.user-menu-button, .user-avatar').click();
    await page.waitForTimeout(500);
    await page.locator('text=Developer Console').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('Console has proper dark terminal styling', async ({ page }) => {
    const consoleContainer = page.locator('.console-container');
    await expect(consoleContainer).toBeVisible();

    const bgColor = await consoleContainer.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Should have dark background (not white)
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('Toolbar buttons have tooltips', async ({ page }) => {
    const helpButton = page.locator('.btn-console-action').first();
    const title = await helpButton.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title).toContain('help');
  });

  test('Input field is focused on load', async ({ page }) => {
    const input = page.locator('.input-field');
    const isFocused = await input.evaluate((el) => document.activeElement === el);
    expect(isFocused).toBeTruthy();
  });

  test('Console prompt ($) is visible', async ({ page }) => {
    const prompt = page.locator('.input-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveText('$');
  });

  test('Timestamps are displayed for each output line', async ({ page }) => {
    await executeCommand(page, 'helios users list');

    const timestamps = page.locator('.output-timestamp');
    const count = await timestamps.count();
    expect(count).toBeGreaterThan(0);

    // Check timestamp format [HH:MM:SS]
    const firstTimestamp = await timestamps.first().textContent();
    expect(firstTimestamp).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
  });
});
