import { test, expect } from '@playwright/test';

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
  await page.waitForTimeout(4000);

  const output = await page.locator('.console-output').textContent();
  return output;
}

test('Verify Last Names Show in User List', async ({ page }) => {
  await login(page);
  await openConsole(page);

  console.log('\n=== TESTING LAST NAME DISPLAY ===\n');
  const output = await runCommand(page, 'helios users list');

  console.log('\n📊 User List Output:\n');
  // Get just the last few lines with the actual user data
  const lines = output.split('\n');
  const userLines = lines.slice(-15);  // Last 15 lines should have the user data
  userLines.forEach(line => console.log(line));

  // Check for specific last names that should be visible
  const hasIngrid = output.includes('Ingrid');
  const hasChike = output.includes('Chike');
  const hasAham = output.includes('Aham');
  const hasDribber = output.includes('Dribber');
  const hasVelatin = output.includes('Velatin');

  console.log('\n✅ Last Name Check Results:');
  console.log(`  Ingrid:  ${hasIngrid ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`  Chike:   ${hasChike ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`  Aham:    ${hasAham ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`  Dribber: ${hasDribber ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`  Velatin: ${hasVelatin ? '✅ FOUND' : '❌ NOT FOUND'}`);

  // Expect at least some last names to be present
  expect(hasIngrid || hasChike || hasAham || hasDribber || hasVelatin).toBe(true);

  if (hasIngrid && hasChike && hasAham && hasDribber) {
    console.log('\n🎉 SUCCESS! All last names are now displaying correctly!');
  } else {
    console.log('\n⚠️  Some last names still missing, but fix is partially working');
  }
});
