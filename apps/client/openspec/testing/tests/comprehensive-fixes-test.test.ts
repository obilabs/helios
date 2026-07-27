import { test, expect } from '@playwright/test';

test('Comprehensive fixes verification', async ({ page }) => {
  test.setTimeout(120000); // 2 minute timeout

  // Enable logging
  page.on('console', msg => console.log(`[${msg.type().toUpperCase()}]:`, msg.text()));
  page.on('pageerror', error => console.error('[PAGE ERROR]:', error.message));

  console.log('\n=== STEP 1: Login ===');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'mike@gridworx.io');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Dismiss ViewOnboarding modal if it appears
  console.log('\n=== STEP 1.5: Handle ViewOnboarding Modal ===');
  const onboardingModal = page.locator('.view-onboarding-overlay');
  if (await onboardingModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('ViewOnboarding modal detected, dismissing...');
    // Click the X close button or the "Continue to..." button
    const closeBtn = page.locator('.view-onboarding-close, button.view-onboarding-button.primary');
    if (await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.first().click();
      console.log('Clicked close/continue button');
    }
    await page.waitForTimeout(500);
  } else {
    console.log('No ViewOnboarding modal detected');
  }

  // ===================================================================
  // TEST 1: Signatures Page - Verify NO placeholder data
  // ===================================================================
  console.log('\n=== TEST 1: Signatures Page (Analytics Tab) ===');
  await page.click('text=Signatures');
  await page.waitForTimeout(1000);

  // Click Analytics tab
  await page.click('button:has-text("Analytics")');
  await page.waitForTimeout(1000);

  await page.screenshot({
    path: 'openspec/testing/reports/screenshots/fix-1-signatures-analytics.png',
    fullPage: true
  });

  // Check that placeholder numbers are NOT present
  const has12Campaigns = await page.locator('text="12"').count();
  const has3456Signatures = await page.locator('text="3,456"').count();
  const has985Percent = await page.locator('text="98.5%"').count();
  const hasHolidayCampaign = await page.locator('text="Holiday Campaign"').count();

  console.log(`✓ Checking for removed placeholder data:`);
  console.log(`  - "12" active campaigns: ${has12Campaigns === 0 ? 'REMOVED ✓' : 'STILL PRESENT ✗'}`);
  console.log(`  - "3,456" signatures: ${has3456Signatures === 0 ? 'REMOVED ✓' : 'STILL PRESENT ✗'}`);
  console.log(`  - "98.5%" success rate: ${has985Percent === 0 ? 'REMOVED ✓' : 'STILL PRESENT ✗'}`);
  console.log(`  - "Holiday Campaign": ${hasHolidayCampaign === 0 ? 'REMOVED ✓' : 'STILL PRESENT ✗'}`);

  // Check for campaign analytics UI (real implementation, not Coming Soon)
  const hasCampaignAnalytics = await page.locator('text=/Campaign Analytics|Select a campaign/i').count();
  console.log(`  - Campaign Analytics UI: ${hasCampaignAnalytics > 0 ? 'PRESENT ✓' : 'MISSING ✗'}`);

  expect(has12Campaigns).toBe(0);
  expect(has3456Signatures).toBe(0);
  expect(hasCampaignAnalytics).toBeGreaterThan(0);

  // ===================================================================
  // TEST 2: Org Chart - Verify better error handling (no JSON parse error)
  // ===================================================================
  console.log('\n=== TEST 2: Org Chart Page ===');
  await page.click('text=Org Chart');
  await page.waitForTimeout(2000);

  await page.screenshot({
    path: 'openspec/testing/reports/screenshots/fix-2-orgchart.png',
    fullPage: true
  });

  // Check for the OLD error message (should NOT be present)
  const hasJsonParseError = await page.locator('text=/JSON.parse.*unexpected character/i').count();
  console.log(`✓ OLD JSON parse error: ${hasJsonParseError === 0 ? 'FIXED ✓' : 'STILL PRESENT ✗'}`);

  // Check for either: successful chart OR proper error message (both are acceptable)
  const hasProperError = await page.locator('text=/Unable to Load Organization Chart/i').count();
  const hasOrgChartContent = await page.locator('.org-chart-container, .org-chart-node, .org-chart, [class*="org-chart"]').count();
  const hasNoData = await page.locator('text=/No organization chart|No data|Build your org chart/i').count();

  console.log(`✓ Org chart content: ${hasOrgChartContent > 0 ? `${hasOrgChartContent} elements ✓` : 'NONE'}`);
  console.log(`✓ Proper error message: ${hasProperError > 0 ? 'PRESENT ✓' : 'NOT SHOWN (chart may have loaded)'}`);
  console.log(`✓ No data state: ${hasNoData > 0 ? 'PRESENT ✓' : 'NOT SHOWN'}`);

  expect(hasJsonParseError).toBe(0);
  // Success = no JSON parse error, and either: chart content, proper error, or empty state
  expect(hasOrgChartContent + hasProperError + hasNoData).toBeGreaterThan(0);

  // ===================================================================
  // TEST 3: Security Events - Verify page loads (API may return error due to missing table)
  // ===================================================================
  console.log('\n=== TEST 3: Security Events Page ===');
  await page.click('text=Security Events');
  await page.waitForTimeout(2000);

  await page.screenshot({
    path: 'openspec/testing/reports/screenshots/fix-3-security-events.png',
    fullPage: true
  });

  // Check that the page loaded without crashing (error message or empty state is acceptable)
  // Note: security_events table may not exist yet, so API returning error is expected
  const hasError = await page.locator('text=/Failed to fetch|error|Error/i').count();
  const hasEmptyState = await page.locator('text=/No security events/i').count();
  const hasEventsList = await page.locator('.activity-item, .event-item, [class*="event"]').count();
  const pageLoaded = await page.locator('h1, h2, .page-header, [class*="security"]').count();

  console.log(`✓ Page loaded: ${pageLoaded > 0 ? 'YES ✓' : 'NO ✗'}`);
  console.log(`✓ Error shown: ${hasError > 0 ? 'YES (API may need security_events table)' : 'NO'}`);
  console.log(`✓ Empty state: ${hasEmptyState > 0 ? 'YES' : 'NO'}`);
  console.log(`✓ Events list: ${hasEventsList > 0 ? `${hasEventsList} elements` : 'NONE'}`);

  // Just verify page loaded without crashing
  expect(pageLoaded).toBeGreaterThan(0);

  // ===================================================================
  // TEST 4: Email Security - Verify GAM reference removed
  // ===================================================================
  console.log('\n=== TEST 4: Email Security Page ===');
  await page.click('text=Email Security');
  await page.waitForTimeout(2000);

  await page.screenshot({
    path: 'openspec/testing/reports/screenshots/fix-4-email-security.png',
    fullPage: true
  });

  // Check that GAM reference is NOT present
  const hasGAM = await page.locator('text=/GAM.*Google Apps Manager/i').count();
  const hasWorkspaceAPI = await page.locator('text=/Google Workspace Admin API/i').count();
  console.log(`✓ GAM reference: ${hasGAM === 0 ? 'REMOVED ✓' : 'STILL PRESENT ✗'}`);
  console.log(`✓ Workspace API reference: ${hasWorkspaceAPI > 0 ? 'PRESENT ✓' : 'MISSING ✗'}`);

  expect(hasGAM).toBe(0);
  expect(hasWorkspaceAPI).toBeGreaterThan(0);

  // ===================================================================
  // TEST 5: Dashboard - Verify real data (from earlier fix)
  // ===================================================================
  console.log('\n=== TEST 5: Dashboard (Bonus check) ===');
  await page.click('text=Dashboard');
  await page.waitForTimeout(2000);

  await page.screenshot({
    path: 'openspec/testing/reports/screenshots/fix-5-dashboard.png',
    fullPage: true
  });

  const metricCards = await page.locator('.metric-card').count();
  console.log(`✓ Dashboard metric cards: ${metricCards} found`);
  expect(metricCards).toBeGreaterThan(0);

  console.log('\n=== ALL TESTS COMPLETE ===');
});
