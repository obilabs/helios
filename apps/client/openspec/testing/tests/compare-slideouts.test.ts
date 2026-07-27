import { test, expect } from '@playwright/test';

test.describe('Slideout Visual Comparison', () => {
  const baseUrl = 'http://localhost:3000';
  const testEmail = 'jack@gridworx.io';
  const testPassword = 'password123';

  test('Compare Quick Add vs User View slideouts', async ({ page }) => {
    test.setTimeout(90000);
    
    // Login
    await page.goto(baseUrl);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('helios_view_onboarding_completed', 'true');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.fill(testEmail);
    await page.locator('input[type="password"]').first().fill(testPassword);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    console.log('✅ Logged in successfully');

    // Navigate to Users page
    await page.locator('[data-testid="nav-users"]').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('✅ On Users page');

    // Take a screenshot of the users page to see the structure
    await page.screenshot({
      path: 'reports/screenshots/compare-0-users-page.png',
      fullPage: false
    });
    console.log('✅ Users page screenshot saved');

    // ========== Quick Add User Slideout ==========
    console.log('\n📸 Capturing Quick Add User slideout...');
    
    const addDropdownBtn = page.locator('.btn-add-user-primary, button:has-text("Add User")').first();
    await addDropdownBtn.click();
    await page.waitForTimeout(500);
    
    const quickAddOption = page.locator('.dropdown-item:has-text("Quick Add")').first();
    await quickAddOption.click();
    await page.waitForTimeout(500);
    
    // Expand advanced options to see all fields
    const advancedToggle = page.locator('.advanced-toggle');
    if (await advancedToggle.isVisible()) {
      await advancedToggle.click();
      await page.waitForTimeout(300);
    }
    
    await page.screenshot({
      path: 'reports/screenshots/compare-1-quick-add-slideout.png',
      fullPage: false
    });
    console.log('✅ Quick Add slideout screenshot saved');
    
    // Get Quick Add styling details
    const quickAddStyles = await page.evaluate(() => {
      const panel = document.querySelector('.quick-add-panel');
      const header = document.querySelector('.quick-add-header');
      const label = document.querySelector('.quick-add-panel .form-group label');
      const input = document.querySelector('.quick-add-panel .form-group input');
      const sectionH3 = document.querySelector('.quick-add-panel .form-section h3');
      
      return {
        panelWidth: panel ? window.getComputedStyle(panel).width : 'N/A',
        headerPadding: header ? window.getComputedStyle(header).padding : 'N/A',
        labelFontSize: label ? window.getComputedStyle(label).fontSize : 'N/A',
        labelTextTransform: label ? window.getComputedStyle(label).textTransform : 'N/A',
        labelColor: label ? window.getComputedStyle(label).color : 'N/A',
        labelFontWeight: label ? window.getComputedStyle(label).fontWeight : 'N/A',
        inputPadding: input ? window.getComputedStyle(input).padding : 'N/A',
        inputBorderRadius: input ? window.getComputedStyle(input).borderRadius : 'N/A',
        inputFontSize: input ? window.getComputedStyle(input).fontSize : 'N/A',
        sectionH3FontSize: sectionH3 ? window.getComputedStyle(sectionH3).fontSize : 'N/A',
      };
    });
    
    console.log('\n📊 Quick Add User Slideout Styles:');
    console.log(JSON.stringify(quickAddStyles, null, 2));
    
    // Close Quick Add slideout by clicking close button
    await page.locator('.quick-add-header .close-btn').click();
    await page.waitForTimeout(500);

    // ========== User View/Edit Slideout ==========
    console.log('\n📸 Capturing User View slideout...');
    
    // Debug: log available elements
    const pageHTML = await page.evaluate(() => {
      const userList = document.querySelector('.user-list, .users-table, table');
      if (userList) {
        return userList.outerHTML.substring(0, 2000);
      }
      return document.body.innerHTML.substring(0, 2000);
    });
    console.log('Page structure:', pageHTML.substring(0, 500));
    
    // Try multiple selectors
    const selectors = [
      'text=Amanda White',
      'text=amy.thompson@gridworx.io',
      '.user-name',
      '.user-row',
      '[data-testid="user-row"]',
      'tbody tr',
    ];
    
    let clicked = false;
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`Found element with selector: ${sel}`);
        await el.click();
        clicked = true;
        break;
      }
    }
    
    if (!clicked) {
      console.log('⚠️ Could not find user to click, taking debug screenshot');
      await page.screenshot({
        path: 'reports/screenshots/compare-debug-users-page.png',
        fullPage: true
      });
    }
    
    await page.waitForTimeout(1500);
    
    // Check if slideout opened
    const slideoutVisible = await page.locator('.slideout-panel, .user-slideout, [class*="slideout"]').isVisible({ timeout: 3000 }).catch(() => false);
    
    if (slideoutVisible) {
      await page.screenshot({
        path: 'reports/screenshots/compare-2-user-view-slideout.png',
        fullPage: false
      });
      console.log('✅ User View slideout screenshot saved');
      
      // Get User View styling details
      const userViewStyles = await page.evaluate(() => {
        const panel = document.querySelector('.slideout-panel, .user-slideout-panel, [class*="slideout-panel"]');
        const header = document.querySelector('.slideout-header, .user-slideout-header, [class*="slideout-header"]');
        const label = document.querySelector('.info-item label, .info-label, [class*="info"] label');
        const sectionH3 = document.querySelector('.slideout-panel h3, .tab-content h3, [class*="slideout"] h3');
        
        return {
          panelWidth: panel ? window.getComputedStyle(panel).width : 'N/A',
          headerPadding: header ? window.getComputedStyle(header).padding : 'N/A',
          labelFontSize: label ? window.getComputedStyle(label).fontSize : 'N/A',
          labelTextTransform: label ? window.getComputedStyle(label).textTransform : 'N/A',
          labelColor: label ? window.getComputedStyle(label).color : 'N/A',
          labelFontWeight: label ? window.getComputedStyle(label).fontWeight : 'N/A',
          sectionH3FontSize: sectionH3 ? window.getComputedStyle(sectionH3).fontSize : 'N/A',
        };
      });
      
      console.log('\n📊 User View Slideout Styles:');
      console.log(JSON.stringify(userViewStyles, null, 2));
      
      // Now click Edit to see the edit mode styling
      console.log('\n📸 Capturing User Edit mode...');
      const editBtn = page.locator('button:has-text("Edit")').first();
      if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(500);
        
        await page.screenshot({
          path: 'reports/screenshots/compare-3-user-edit-slideout.png',
          fullPage: false
        });
        console.log('✅ User Edit slideout screenshot saved');
        
        // Get edit mode input styles
        const editModeStyles = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"])');
          const selects = document.querySelectorAll('select');
          
          let inputStyle = null;
          inputs.forEach(inp => {
            if (inp instanceof HTMLInputElement && inp.offsetParent !== null) {
              inputStyle = {
                padding: window.getComputedStyle(inp).padding,
                borderRadius: window.getComputedStyle(inp).borderRadius,
                fontSize: window.getComputedStyle(inp).fontSize,
                border: window.getComputedStyle(inp).border,
              };
            }
          });
          
          let selectStyle = null;
          selects.forEach(sel => {
            if (sel instanceof HTMLSelectElement && sel.offsetParent !== null) {
              selectStyle = {
                padding: window.getComputedStyle(sel).padding,
                borderRadius: window.getComputedStyle(sel).borderRadius,
              };
            }
          });
          
          return { inputStyle, selectStyle };
        });
        
        console.log('\n📊 User Edit Mode Input Styles:');
        console.log(JSON.stringify(editModeStyles, null, 2));
      } else {
        console.log('⚠️ Edit button not found');
      }
    } else {
      console.log('⚠️ User slideout did not open');
    }
    
    console.log('\n✅ Comparison test complete - check screenshots in reports/screenshots/');
  });
});
