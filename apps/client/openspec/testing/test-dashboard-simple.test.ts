import { test, expect } from '@playwright/test';

test.describe('Simple Dashboard Test', () => {
  test('Check dashboard elements after login', async ({ page }) => {
    // Navigate and login
    await page.goto('http://localhost:3000');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    await page.fill('input[type="email"]', 'jack@gridworx.io');
    await page.fill('input[type="password"]', 'P@ssw0rd123!');
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: './openspec/testing/reports/screenshots/dashboard-simple.png', fullPage: true });

    // Check for specific dashboard elements
    const dashboardTitle = await page.locator('h1, h2, .dashboard-title').allTextContents();
    console.log('Dashboard titles found:', dashboardTitle);

    const customizeButton = await page.locator('button:has-text("Customize"), button:has-text("customize")').count();
    console.log('Customize buttons found:', customizeButton);

    const metricCards = await page.locator('.metric-card').count();
    console.log('Metric cards (.metric-card):', metricCards);

    const dashboardWidgets = await page.locator('.dashboard-widget').count();
    console.log('Dashboard widgets (.dashboard-widget):', dashboardWidgets);

    const loadingText = await page.locator('text=Loading dashboard').count();
    console.log('Loading text found:', loadingText);

    // Check page HTML for dashboard-related classes
    const pageContent = await page.content();
    const hasDashboardGrid = pageContent.includes('dashboard-widget-grid') || pageContent.includes('dashboard-grid');
    const hasMetricCard = pageContent.includes('metric-card');
    const hasCustomizer = pageContent.includes('dashboard-customizer');

    console.log('Has dashboard-widget-grid class:', hasDashboardGrid);
    console.log('Has metric-card class:', hasMetricCard);
    console.log('Has dashboard-customizer:', hasCustomizer);

    // Print a section of HTML containing "dashboard" or "widget"
    const dashboardSection = pageContent.match(/<div[^>]*dashboard[^>]*>[\s\S]{0,500}/i);
    if (dashboardSection) {
      console.log('\nDashboard HTML section:', dashboardSection[0].substring(0, 300));
    }
  });
});
