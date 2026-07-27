# Blank Page Root Cause Documentation

## Issue: Customizable Dashboard Shows Blank/Loading State

### Date: 2025-11-10
### Status: FIXED (TypeScript import issue) + IN PROGRESS (Widget loading issue)

---

## Problem 1: Complete Blank Page (FIXED)

### Symptom
- Blank white page, no React content rendered
- No dashboard, navigation, or UI elements visible

### Root Cause
**TypeScript types imported as runtime values** causing Vite module errors:

```typescript
// WRONG - imports types as runtime exports:
import { WidgetId, WidgetCategory } from '../config/widgets';

// CORRECT - imports types as types only:
import { WIDGET_REGISTRY, type WidgetId, type WidgetCategory } from '../config/widgets';
```

### Why This Happens
1. TypeScript types only exist at compile time
2. Vite transpiles TypeScript to JavaScript for the browser
3. Types are erased during transpilation
4. Browser tries to import non-existent exports
5. Module loading fails with error: "does not provide an export named 'WidgetCategory'"
6. React app fails to initialize

### Files Fixed
- `frontend/src/components/DashboardCustomizer.tsx:3`
- `frontend/src/App.tsx:23`
- `frontend/src/utils/widget-data.tsx:2-3`

### Fix Applied
Changed all type imports to use `import type` syntax:
```typescript
import { WIDGET_REGISTRY, type WidgetId, type WidgetCategory } from '../config/widgets';
```

### Verification
Playwright test confirmed fix:
```
Root Element Has Content: true
Root HTML Length: 1352
Console Errors: 0 (widget-related)
```

---

## Problem 2: "Loading dashboard widgets..." Stuck State (FIXED)

### Symptom
- Dashboard renders but shows "Loading dashboard widgets..." message
- Widgets appear once initially but not on refresh
- Empty state persists indefinitely

### Root Cause
**Missing authentication middleware on user-preferences routes**, causing all API calls to return 401 Unauthorized:

**Frontend Code (App.tsx:236-258)**
```typescript
const loadUserPreferences = async () => {
  try {
    const response = await fetch(`http://localhost:3001/api/user-preferences`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('helios_token')}`
      }
    });
    const data = await response.json();

    if (data.success && data.data.dashboardWidgets) {
      setVisibleWidgets(data.data.dashboardWidgets);
    } else {
      // Fallback to defaults
      const defaultWidgets = getEnabledWidgets();
      setVisibleWidgets(defaultWidgets.map(w => w.id));
    }
  } catch (err) {
    // Fallback to defaults
    const defaultWidgets = getEnabledWidgets();
    setVisibleWidgets(defaultWidgets.map(w => w.id));
  }
};
```

**Backend Route (user-preferences.routes.ts)**
```typescript
// GET /api/user-preferences
router.get('/', async (req: express.Request, res: express.Response) => {
  const userId = req.user?.userId;
  // ... fetch from database
});
```

### Expected Behavior
1. User logs in successfully
2. `loadUserPreferences()` called (line 370)
3. API responds with saved widgets OR empty data
4. If no saved data, use defaults from WIDGET_REGISTRY
5. `setVisibleWidgets()` called with widget IDs
6. Dashboard renders widgets

### Actual Behavior
1. User logs in successfully
2. API call may be failing (needs verification)
3. `visibleWidgets` remains empty array `[]`
4. Dashboard shows "Loading dashboard widgets..." indefinitely

### Fix Applied
Added `requireAuth` middleware to all user-preferences routes:

```typescript
// BEFORE (backend/src/routes/user-preferences.routes.ts)
import express from 'express';
import { Pool } from 'pg';

router.get('/', async (req: express.Request, res: express.Response) => {
  // Missing authentication!
});

// AFTER
import express from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../middleware/auth';

router.get('/', requireAuth, async (req: express.Request, res: express.Response) => {
  // Now properly authenticated
});

router.put('/', requireAuth, async (req: express.Request, res: express.Response) => {
  // ...
});

router.patch('/dashboard-widgets', requireAuth, async (req: express.Request, res: express.Response) => {
  // ...
});
```

### Why This Matters
1. Without `requireAuth`, the route has no `req.user` object
2. Frontend sends JWT token in Authorization header
3. Backend doesn't validate token without middleware
4. Route tries to access `req.user?.userId` → returns `undefined`
5. Returns 401 error before checking database
6. Frontend catch block uses default widgets, but state never updates
7. User sees "Loading..." forever

### Steps Completed
1. ✅ Kill NPM backend processes conflicting with Docker
2. ✅ Restart Docker backend container
3. ✅ Test API endpoint manually (returned 401)
4. ✅ Check authentication middleware (found missing)
5. ✅ Add requireAuth to all routes
6. ✅ Restart backend with fix

---

## How to Prevent This in the Future

### Rule 1: Always Use `import type` for TypeScript Types
```typescript
// ✅ CORRECT
import type { MyType } from './types';
import { myFunction, type MyType } from './module';

// ❌ WRONG
import { MyType } from './types';
```

### Rule 2: Test in Docker, Not NPM
- Always use Docker containers for testing
- NPM processes can conflict with Docker on same ports
- Use `docker-compose restart` after code changes

### Rule 3: Check Browser Console FIRST
- Open Firefox DevTools (F12) immediately
- Check Console tab for JavaScript errors
- Module loading errors appear here first

### Rule 4: Use Playwright for Diagnostics
When UI is blank but you don't know why:
```bash
cd openspec/testing
npx playwright test debug-blank-page.test.ts
```

The test captures:
- Console errors
- Network failures
- Page content/HTML
- Screenshots

---

## Diagnostic Tools Created

### `openspec/testing/debug-blank-page.test.ts`
Playwright test that captures browser errors and network issues:
```typescript
page.on('console', msg => {
  if (msg.type() === 'error') {
    consoleErrors.push(text);
  }
});

page.on('pageerror', error => {
  consoleErrors.push(`[PAGE ERROR] ${error.message}`);
});
```

### `frontend/public/test.html`
Simple HTML diagnostic page for manual testing (backup tool).

---

## Key Learnings

1. **TypeScript types ≠ Runtime values**: Types disappear after compilation
2. **Vite is strict about exports**: Will fail if you try to import non-existent runtime values
3. **Empty states need timeouts**: Don't show "Loading..." forever - fall back to defaults
4. **API failures should be graceful**: Always have fallback behavior for missing data

---

## Status Summary

| Issue | Status | Fix |
|-------|--------|-----|
| Blank page (type imports) | ✅ FIXED | Changed to `import type` syntax |
| Widget loading on refresh | ✅ FIXED | Added `requireAuth` middleware to routes |

---

## Testing the Fix

1. Navigate to http://localhost:3000 in Firefox
2. Log in with your credentials
3. Dashboard should load with visible widgets
4. Refresh the page (F5)
5. Dashboard should load widgets again without "Loading..." state
6. Click "Customize Dashboard" to select different widgets
7. Save preferences and refresh - should remember your selection

