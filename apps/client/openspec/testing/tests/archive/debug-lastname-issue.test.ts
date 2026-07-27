import { test, expect } from '@playwright/test';

/**
 * Debug test to investigate last name display issue
 */

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'jack@gridworx.io';
const TEST_PASSWORD = 'P@ssw0rd123!';

async function login(page) {
  await page.goto(BASE_URL);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await expect(page.locator('text=Welcome, Jack!')).toBeVisible({ timeout: 5000 });
}

async function openConsole(page) {
  await page.click('button:has-text("JD")');
  await page.waitForTimeout(500);
  await page.click('text=Developer Console');
  await page.waitForTimeout(1500);
  await expect(page.locator('.console-output')).toBeVisible({ timeout: 5000 });
}

async function runCommand(page, command) {
  console.log(`\n🔹 Running: ${command}`);
  const input = page.locator('input.input-field[placeholder="Type a command..."]');
  await input.clear();
  await input.fill(command);
  await input.press('Enter');
  await page.waitForTimeout(4000); // Give time for API call

  // Get the full console output
  const output = await page.locator('.console-output').textContent();
  return output;
}

test('Debug Last Name Issue', async ({ page }) => {
  await login(page);
  await openConsole(page);

  console.log('\n=== RUNNING DEBUG COMMAND ===\n');
  const output = await runCommand(page, 'helios users debug');

  console.log('\n=== FULL CONSOLE OUTPUT ===\n');
  console.log(output);
  console.log('\n=== END OUTPUT ===\n');

  // Also run the regular list command to compare
  console.log('\n=== RUNNING LIST COMMAND ===\n');
  const listOutput = await runCommand(page, 'helios users list');

  console.log('\n=== LIST CONSOLE OUTPUT ===\n');
  console.log(listOutput);
  console.log('\n=== END LIST OUTPUT ===\n');
});
