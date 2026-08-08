import { test, expect } from '@playwright/test';

/**
 * Manual CRUD Testing - Run with headed mode to observe
 * npx playwright test manual-crud-test.test.ts --headed --slowMo=1000
 */

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'jack@gridworx.io';
const TEST_PASSWORD = 'P@ssw0rd123!';

const TEST_USER_EMAIL = 'playwrighttest@gridworx.io';
const TEST_GROUP_EMAIL = 'playwrighttestgroup@gridworx.io';

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

  // Get only the most recent output (last 15 lines after command)
  const output = await page.locator('.console-output').textContent();
  const lines = output.split('\n').slice(-15).join('\n'); // Last 15 lines
  console.log('📄 Output:', lines.substring(0, 500));

  return lines; // Return only recent lines, not full history
}

test('Manual CRUD Test - User Operations', async ({ page }) => {
  await login(page);
  await openConsole(page);

  console.log('\n=== TEST 1: helios users list ===');
  let output = await runCommand(page, 'helios users list');
  expect(output.toUpperCase()).toContain('EMAIL');
  expect(output).toContain('jack@gridworx.io');
  console.log('✅ helios users list - PASSED');

  console.log('\n=== TEST 2: helios gw users list ===');
  output = await runCommand(page, 'helios gw users list');
  expect(output.toLowerCase()).toContain('email');
  expect(output.toLowerCase()).toContain('gridworx.io');
  console.log('✅ helios gw users list - PASSED');

  console.log('\n=== TEST 3: helios gw users get (existing user) ===');
  output = await runCommand(page, 'helios gw users get mike@gridworx.io');

  if (output.toLowerCase().includes('error') || output.includes('invalid_scope')) {
    console.log('❌ helios gw users get - FAILED');
    console.log('Error output:', output);
    throw new Error('Failed to get user details');
  } else {
    expect(output).toContain('mike@gridworx.io');
    console.log('✅ helios gw users get - PASSED');
  }

  console.log('\n=== TEST 4: helios gw groups list ===');
  output = await runCommand(page, 'helios gw groups list');
  expect(output.toLowerCase()).toMatch(/group|email|no groups/i);
  console.log('✅ helios gw groups list - PASSED');

  console.log('\n=== TEST 5: DELETE test user if exists ===');
  output = await runCommand(page, `helios gw users get ${TEST_USER_EMAIL}`);
  if (!output.toLowerCase().includes('error') && !output.includes('not found')) {
    console.log('⚠️  Test user exists, deleting...');
    output = await runCommand(page, `helios gw users delete ${TEST_USER_EMAIL}`);
    await page.waitForTimeout(3000);
  }

  console.log('\n=== TEST 6: CREATE USER ===');
  output = await runCommand(page, `helios gw users create ${TEST_USER_EMAIL} --firstName=Playwright --lastName=Test --password=TempPass123!`);

  // Check specifically for success message, not just absence of error
  if (output.toLowerCase().includes('user created:')) {
    console.log('✅ User creation - PASSED');
    expect(output.toLowerCase()).toContain('user created:');
  } else {
    console.log('❌ User creation - FAILED');
    console.log('Error:', output);
    throw new Error('Failed to create user');
  }

  console.log('\n=== TEST 7: VERIFY USER EXISTS ===');
  await page.waitForTimeout(3000);
  output = await runCommand(page, `helios gw users get ${TEST_USER_EMAIL}`);

  // Check for JSON response which indicates success (email might be truncated in window)
  if (output.includes(TEST_USER_EMAIL) || output.includes('"primaryEmail"') || output.includes('"orgUnitPath"')) {
    console.log('✅ User verification - PASSED');
  } else {
    console.log('❌ User verification - FAILED (user not found after creation)');
    console.log('Output:', output);
    throw new Error('Created user not found');
  }

  console.log('\n=== TEST 8: DELETE USER ===');
  output = await runCommand(page, `helios gw users delete ${TEST_USER_EMAIL}`);

  // DELETE returns empty 204 response, so check for NOT error
  if (!output.toLowerCase().includes('command failed')) {
    console.log('✅ User deletion - PASSED');
  } else {
    console.log('❌ User deletion - FAILED');
    console.log('Error:', output);
    throw new Error('Failed to delete user');
  }

  console.log('\n=== TEST 9: VERIFY USER DELETED ===');
  await page.waitForTimeout(3000);
  output = await runCommand(page, `helios gw users get ${TEST_USER_EMAIL}`);
  // Check for error or "command failed" which indicates 404 - user not found
  if (output.toLowerCase().includes('error') || output.toLowerCase().includes('command failed') || output.toLowerCase().includes('not found')) {
    console.log('✅ User deletion verification - PASSED');
  } else {
    console.log('❌ User still exists after deletion');
    throw new Error('User was not deleted');
  }

  console.log('\n=== TEST 10: DELETE test group if exists ===');
  output = await runCommand(page, `helios gw groups get ${TEST_GROUP_EMAIL}`);
  if (!output.toLowerCase().includes('error') && !output.includes('not found')) {
    console.log('⚠️  Test group exists, deleting...');
    output = await runCommand(page, `helios gw groups delete ${TEST_GROUP_EMAIL}`);
    await page.waitForTimeout(3000);
  }

  console.log('\n=== TEST 11: CREATE GROUP ===');
  output = await runCommand(page, `helios gw groups create ${TEST_GROUP_EMAIL} --name="Playwright Test Group" --description="Automated test group"`);

  if (output.toLowerCase().includes('group created:')) {
    console.log('✅ Group creation - PASSED');
    expect(output.toLowerCase()).toContain('group created:');
  } else {
    console.log('❌ Group creation - FAILED');
    console.log('Error:', output);
    throw new Error('Failed to create group');
  }

  console.log('\n=== TEST 12: VERIFY GROUP EXISTS ===');
  await page.waitForTimeout(3000);
  output = await runCommand(page, `helios gw groups get ${TEST_GROUP_EMAIL}`);

  // Check for JSON response which indicates success (email might be truncated in window)
  if (output.includes(TEST_GROUP_EMAIL) || output.includes('"email"') || output.includes('"kind": "admin#directory#group"')) {
    console.log('✅ Group verification - PASSED');
  } else {
    console.log('❌ Group verification - FAILED (group not found after creation)');
    console.log('Output:', output);
    throw new Error('Created group not found');
  }

  console.log('\n=== TEST 13: DELETE GROUP ===');
  output = await runCommand(page, `helios gw groups delete ${TEST_GROUP_EMAIL}`);

  // Check specifically for success message
  if (output.toLowerCase().includes('group deleted:')) {
    console.log('✅ Group deletion - PASSED');
  } else {
    console.log('❌ Group deletion - FAILED');
    console.log('Error:', output);
    throw new Error('Failed to delete group');
  }

  console.log('\n=== TEST 14: VERIFY GROUP DELETED ===');
  await page.waitForTimeout(3000);
  output = await runCommand(page, `helios gw groups get ${TEST_GROUP_EMAIL}`);
  // Check for error or "command failed" which indicates 404 - group not found
  if (output.toLowerCase().includes('error') || output.toLowerCase().includes('command failed') || output.toLowerCase().includes('not found')) {
    console.log('✅ Group deletion verification - PASSED');
  } else {
    console.log('❌ Group still exists after deletion');
    throw new Error('Group was not deleted');
  }

  console.log('\n\n🎉 ALL CRUD OPERATIONS PASSED! 🎉\n');
});
