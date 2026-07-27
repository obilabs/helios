import { test, expect } from '@playwright/test';

test('Department displays clean name without OU path', async ({ page }) => {
  const baseUrl = 'http://localhost:3000';

  // Login
  await page.goto(baseUrl);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('helios_view_onboarding_completed', 'true');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').first().fill('jack@gridworx.io');
  await page.locator('input[type="password"]').first().fill('password123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('✅ Logged in');

  // Navigate to Users page
  await page.locator('[data-testid="nav-users"]').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('✅ On Users page');

  // Get all department cells from the table
  const departmentCells = page.locator('.col-department');
  const departmentCount = await departmentCells.count();
  console.log(`Found ${departmentCount} department cells`);

  // Get all department values
  const departments: string[] = [];
  for (let i = 0; i < Math.min(departmentCount, 20); i++) {
    const text = await departmentCells.nth(i).textContent();
    if (text && text.trim() !== 'Department' && text.trim() !== 'N/A') {
      departments.push(text.trim());
    }
  }

  console.log('Department values found:', departments);

  // Take screenshot
  await page.screenshot({
    path: 'reports/screenshots/department-normalization-test.png',
    fullPage: false
  });

  // ASSERTIONS: No department should contain "/" (OU path indicator)
  for (const dept of departments) {
    console.log(`Checking department: "${dept}"`);
    expect(dept).not.toContain('/');
  }

  console.log('✅ All departments are properly normalized (no OU paths)');
});
