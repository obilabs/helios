# Critical Fixes - Implementation Tasks

## Phase 1: Critical Bug Fixes (P0 - IMMEDIATE) ✅ COMPLETE

All Phase 1 bugs verified working on 2025-12-14:
- TASK-FIX-001: SPA routing already working (fallback returns 200)
- TASK-FIX-002: Dashboard error handling already implemented (timeout + retry)
- TASK-FIX-003: Cache-busting headers added to nginx
- TASK-FIX-004: Add User API and frontend already complete
- TASK-FIX-005: Template creation API and frontend already complete
- TASK-FIX-006: Quick Actions now navigate correctly

### TASK-FIX-001: Fix nginx SPA routing for page refresh ✅
**Priority:** P0
**Status:** VERIFIED WORKING
**Files:** `nginx/nginx.conf`

**Problem:** 500 error when refreshing on routes like `/admin/users`

**Solution:**
```nginx
# Update the root location block
location / {
    proxy_pass http://frontend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;

    # For SPA: always return index.html for non-file requests
    proxy_intercept_errors on;
    error_page 404 = @fallback;
}

location @fallback {
    proxy_pass http://frontend/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

**Acceptance Criteria:**
- [x] Refresh on `/admin/users` returns the app (not 500)
- [x] Refresh on `/admin/groups` works
- [x] Refresh on `/people` works
- [x] Direct URL access works from another browser

---

### TASK-FIX-002: Fix dashboard error handling ✅
**Priority:** P0
**Status:** VERIFIED WORKING (already implemented)
**Files:** `frontend/src/App.tsx`

**Problem:** Dashboard shows infinite spinner instead of errors

**Solution:**
```typescript
// In fetchOrganizationStats
} catch (err) {
  setStatsLoading(false);
  setStatsError(err instanceof Error ? err.message : 'Failed to load dashboard');
}

// In the JSX, improve the error display
{statsError && (
  <div className="dashboard-error">
    <AlertCircle size={24} />
    <p>{statsError}</p>
    <button onClick={retry}>Retry</button>
  </div>
)}
```

**Acceptance Criteria:**
- [x] Network errors show error message, not spinner
- [x] Retry button reloads data
- [x] Timeout after 10 seconds shows timeout message

---

### TASK-FIX-003: Add cache-busting for HTML files ✅
**Priority:** P0
**Status:** FIXED
**Files:** `nginx/nginx.conf`

**Problem:** Browsers cache old JavaScript with hardcoded URLs

**Solution:**
```nginx
# Add to nginx.conf
location ~* \.(html)$ {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires "0";
}

# Cache static assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

**Acceptance Criteria:**
- [x] HTML files have no-cache headers
- [x] Static assets have long cache headers
- [x] Changes deploy without manual cache clear

---

### TASK-FIX-004: Fix Add User functionality ✅
**Priority:** P0
**Status:** VERIFIED WORKING (API and frontend complete)
**Files:** `frontend/src/pages/AddUser.tsx`, `frontend/src/pages/NewUserOnboarding.tsx`

**Problem:** Quick Add and full onboarding don't work

**Investigation:**
1. Check API endpoint `/api/v1/lifecycle/onboarding/execute`
2. Check form validation
3. Check error display

**Acceptance Criteria:**
- [x] Quick Add creates a user
- [x] Full onboarding wizard completes
- [x] Errors displayed to user
- [x] Success redirects appropriately

---

### TASK-FIX-005: Fix template creation ✅
**Priority:** P0
**Status:** VERIFIED WORKING (API and frontend complete)
**Files:** `frontend/src/components/lifecycle/OnboardingTemplateEditor.tsx`

**Problem:** Cannot create onboarding/offboarding templates

**Acceptance Criteria:**
- [x] Can create new onboarding template
- [x] Can create new offboarding template
- [x] Can create multiple templates
- [x] Templates show in list
- [x] Templates can be selected when onboarding

---

### TASK-FIX-006: Fix Quick Actions ✅
**Priority:** P1
**Status:** FIXED
**Files:** `frontend/src/App.tsx`

**Problem:** Quick action buttons do nothing

**Current code:**
```tsx
<button className="quick-action-btn primary" onClick={() => setCurrentPage('users')}>
  <UserPlus size={20} />
  <span>Add User</span>
</button>
```

**Fix:** Update handlers to navigate properly:
```tsx
<button className="quick-action-btn primary" onClick={() => navigate('/admin/users/new')}>
  <UserPlus size={20} />
  <span>Add User</span>
</button>
```

**Acceptance Criteria:**
- [x] "Add User" opens add user page
- [x] "Import CSV" opens import modal or page
- [x] "Export Report" triggers download or opens export page

---

## Phase 2: Dashboard & UX Polish (P1) ✅ COMPLETE

All Phase 2 tasks verified working on 2025-12-14:
- TASK-FIX-007: Widget persistence API fully functional
- TASK-FIX-008: Loading timeouts and retry already implemented

### TASK-FIX-007: Fix widget persistence ✅
**Priority:** P1
**Status:** VERIFIED WORKING
**Files:** `frontend/src/App.tsx`, `backend/src/routes/dashboard.routes.ts`

**Problem:** Dashboard customization doesn't persist on refresh

**Solution:** Already implemented:
- GET `/api/v1/dashboard/widgets` returns saved preferences
- PUT `/api/v1/dashboard/widgets` saves preferences to `user_dashboard_widgets` table
- Frontend loads and saves via `loadUserPreferences()` and `saveWidgetPreferences()`

**Acceptance Criteria:**
- [x] Customizing and saving persists
- [x] Refresh shows saved configuration
- [x] Different users have different configurations

---

### TASK-FIX-008: Add loading timeouts and retry ✅
**Priority:** P1
**Status:** VERIFIED WORKING
**Files:** `frontend/src/App.tsx`

**Already Implemented:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
// ...
if (err.name === 'AbortError') {
  setStatsError('Request timed out. Please try again.');
}
```

**Acceptance Criteria:**
- [x] Loads timeout after 10 seconds
- [x] Timeout shows friendly message
- [x] Retry button visible on error

---

## Phase 3: Microsoft 365 Integration (P2) ✅ COMPLETE

All Phase 3 tasks verified complete on 2025-12-14:
- TASK-MS-001: Database schema created (050_create_microsoft_tables.sql)
- TASK-MS-002: Microsoft Graph API service implemented (microsoft-graph.service.ts)
- TASK-MS-003: API routes implemented (microsoft.routes.ts)
- TASK-MS-004: Setup wizard UI created (Microsoft365Wizard.tsx)
- TASK-MS-005: Setup guide documented (MICROSOFT-365-SETUP-GUIDE.md)

### TASK-MS-001: Create Microsoft module database schema ✅
**Priority:** P2
**Status:** COMPLETE
**File:** `database/migrations/050_create_microsoft_tables.sql`

```sql
CREATE TABLE IF NOT EXISTS ms_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL,
    client_id VARCHAR(64) NOT NULL,
    client_secret_encrypted TEXT NOT NULL,  -- AES encrypted
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id)
);

CREATE TABLE IF NOT EXISTS ms_synced_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ms_id VARCHAR(64) NOT NULL,  -- Microsoft user ID
    display_name VARCHAR(255),
    email VARCHAR(255),
    job_title VARCHAR(255),
    department VARCHAR(255),
    is_account_enabled BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    raw_data JSONB,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, ms_id)
);
```

---

### TASK-MS-002: Create Microsoft Graph API service ✅
**Priority:** P2
**Status:** COMPLETE
**File:** `backend/src/services/microsoft-graph.service.ts`

**Methods:**
- `getAccessToken()` - Client credentials flow
- `listUsers()` - GET /users
- `getUser(id)` - GET /users/{id}
- `createUser(userData)` - POST /users
- `updateUser(id, userData)` - PATCH /users/{id}
- `listGroups()` - GET /groups
- `getGroup(id)` - GET /groups/{id}
- `createGroup(groupData)` - POST /groups
- `addGroupMember(groupId, userId)` - POST /groups/{id}/members/$ref
- `removeGroupMember(groupId, userId)` - DELETE /groups/{id}/members/{userId}/$ref
- `getSubscribedSkus()` - GET /subscribedSkus (dynamic license detection)
- `assignLicense(userId, skuId)` - POST /users/{id}/assignLicense
- `removeLicense(userId, skuId)` - POST /users/{id}/assignLicense (with removeLicenses)
- `getUserLicenses(userId)` - GET /users/{id}/licenseDetails

**Dynamic License Detection:**
The `/subscribedSkus` endpoint returns all licenses available in the tenant. This allows:
1. Auto-discovery of all license SKUs (no hardcoding)
2. Display available licenses with remaining units
3. License assignment UI shows only available SKUs

**Example `/subscribedSkus` Response:**
```json
{
  "value": [
    {
      "skuId": "c7df2760-2c81-4ef7-b578-5b5392b571df",
      "skuPartNumber": "ENTERPRISEPREMIUM",
      "servicePlans": [...],
      "prepaidUnits": { "enabled": 50 },
      "consumedUnits": 23
    }
  ]
}
```

**SKU to Friendly Name Mapping:**
Common SKUs (fallback to skuPartNumber if unknown):
- `ENTERPRISEPREMIUM` → Microsoft 365 E5
- `ENTERPRISEPACK` → Microsoft 365 E3
- `SPE_E3` → Microsoft 365 E3
- `BUSINESS_PREMIUM` → Microsoft 365 Business Premium
- `EXCHANGESTANDARD` → Exchange Online (Plan 1)
- `POWER_BI_PRO` → Power BI Pro

---

### TASK-MS-003: Create Microsoft module routes ✅
**Priority:** P2
**Status:** COMPLETE
**File:** `backend/src/routes/microsoft.routes.ts`

**Connection & Sync Endpoints:**
- POST `/api/v1/microsoft/connect` - Save credentials
- POST `/api/v1/microsoft/test` - Test connection
- POST `/api/v1/microsoft/sync` - Trigger sync
- GET `/api/v1/microsoft/status` - Get sync status
- DELETE `/api/v1/microsoft/disconnect` - Remove credentials

**User Management Endpoints:**
- GET `/api/v1/microsoft/users` - List synced users
- POST `/api/v1/microsoft/users` - Create user in Entra ID
- PATCH `/api/v1/microsoft/users/:id` - Update user
- DELETE `/api/v1/microsoft/users/:id` - Delete user (or disable)

**Group Management Endpoints:**
- GET `/api/v1/microsoft/groups` - List groups
- POST `/api/v1/microsoft/groups` - Create group
- DELETE `/api/v1/microsoft/groups/:id` - Delete group
- POST `/api/v1/microsoft/groups/:id/members` - Add member
- DELETE `/api/v1/microsoft/groups/:id/members/:userId` - Remove member

**License Management Endpoints:**
- GET `/api/v1/microsoft/licenses` - List available licenses (from /subscribedSkus)
- GET `/api/v1/microsoft/users/:id/licenses` - Get user's licenses
- POST `/api/v1/microsoft/users/:id/licenses` - Assign license(s)
- DELETE `/api/v1/microsoft/users/:id/licenses/:skuId` - Remove license

---

### TASK-MS-004: Create Microsoft setup wizard UI ✅
**Priority:** P2
**Status:** COMPLETE
**File:** `frontend/src/components/modules/Microsoft365Wizard.tsx`

**Steps:**
1. Enter Tenant ID, Client ID, Client Secret
2. Test connection
3. Configure sync options
4. Initial sync

---

### TASK-MS-005: Create Microsoft 365 setup guide ✅
**Priority:** P2
**Status:** COMPLETE
**File:** `docs/guides/MICROSOFT-365-SETUP-GUIDE.md`

User-facing guide with screenshots for:
1. Creating app registration in Azure
2. Configuring permissions
3. Creating client secret
4. Granting admin consent
5. Entering credentials in Helios

---

## Phase 4: Google External Sharing Manager (P3) ✅ COMPLETE

All Phase 4 tasks verified complete on 2025-12-16.

### TASK-SHARE-001: Create sharing audit service ✅
**Priority:** P3
**Status:** COMPLETE
**File:** `backend/src/services/drive-sharing-audit.service.ts`

**Implemented Methods:**
- `scanForExternalSharing(organizationId, options)` - Scan for externally shared files with risk classification
- `revokeAccess(organizationId, fileId, permissionId)` - Remove external access
- `bulkRevokeAccess(organizationId, shares[])` - Remove multiple accesses
- `getFileSharing(organizationId, fileId)` - Get sharing details for a file
- `getSharesByRiskLevel(organizationId, riskLevel, limit)` - Filter by risk level
- `generateCsvReport(shares)` - Export sharing report as CSV

**Features:**
- Risk level classification (high/medium/low)
- Personal account detection
- Organization domain-based external detection
- Summary statistics calculation

---

### TASK-SHARE-002: Create sharing manager UI ✅
**Priority:** P3
**Status:** COMPLETE
**File:** `frontend/src/pages/admin/ExternalSharingManager.tsx`

**Implemented Features:**
- Overview summary cards (total shares, high risk, personal accounts, anyone with link)
- File list with sorting and filtering
- Risk level badges and visual indicators
- Bulk actions (revoke selected)
- Single item revoke action
- CSV export functionality
- Search by file name or shared-with user
- Filter by risk level (all/high/medium/low)
- Loading states and error handling

**API Routes:** `backend/src/routes/external-sharing.routes.ts`
- POST `/api/v1/external-sharing/scan` - Full scan
- GET `/api/v1/external-sharing/summary` - Quick summary
- GET `/api/v1/external-sharing/risk/:level` - Filter by risk
- GET `/api/v1/external-sharing/file/:fileId` - File details
- POST `/api/v1/external-sharing/revoke` - Revoke single
- POST `/api/v1/external-sharing/bulk-revoke` - Bulk revoke
- POST `/api/v1/external-sharing/export` - CSV export

**Navigation:**
- Added to AdminNavigation.tsx under Security section
- Route: `/admin/external-sharing`

---

## Summary

| Phase | Tasks | Priority | Estimated Effort |
|-------|-------|----------|------------------|
| 1. Bug Fixes | FIX-001 to FIX-006 | P0 | 1-2 days |
| 2. UX Polish | FIX-007 to FIX-008 | P1 | 1-2 days |
| 3. Microsoft 365 | MS-001 to MS-005 | P2 | 5-7 days |
| 4. External Sharing | SHARE-001 to SHARE-002 | P3 | 7-10 days |

**Agent should start with Phase 1 immediately.**
