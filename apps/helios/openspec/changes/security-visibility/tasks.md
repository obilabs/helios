# Security Visibility - Implementation Tasks

## Phase 1: Database & Backend Foundation

### TASK-SEC-001: Database Schema for 2FA and OAuth Tokens
**Priority:** High | **Effort:** 2 hours

Create database migration for storing 2FA status and OAuth token data.

```sql
-- Migration: XXX_create_security_visibility_tables.sql

-- Add 2FA status to synced users
ALTER TABLE gw_synced_users ADD COLUMN IF NOT EXISTS
  is_enrolled_2sv BOOLEAN DEFAULT false;

-- OAuth apps aggregate table
CREATE TABLE oauth_apps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  scopes TEXT[],
  risk_level VARCHAR(20) DEFAULT 'unknown',
  user_count INT DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, client_id)
);

-- User-app associations
CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_email VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL REFERENCES oauth_apps(client_id),
  scopes TEXT[],
  native_app BOOLEAN DEFAULT false,
  last_time_used TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_email, client_id)
);

CREATE INDEX idx_oauth_apps_org ON oauth_apps(organization_id);
CREATE INDEX idx_user_oauth_tokens_org_user ON user_oauth_tokens(organization_id, user_email);
CREATE INDEX idx_user_oauth_tokens_client ON user_oauth_tokens(client_id);
```

**Acceptance Criteria:**
- [x] Migration runs without errors
- [x] Tables created with correct constraints
- [x] Indexes created for performance

---

### TASK-SEC-002: Update User Sync to Include 2FA Status
**Priority:** High | **Effort:** 1 hour | **Depends on:** TASK-SEC-001

Modify `google-workspace-sync.service.ts` to fetch and store `isEnrolledIn2Sv` field.

**Changes:**
- Update user sync query to include `isEnrolledIn2Sv` field
- Store in `gw_synced_users.is_enrolled_2sv` column
- Add to cached user response

**Acceptance Criteria:**
- [x] User sync includes 2FA status
- [x] Status correctly stored in database
- [x] Existing sync performance not degraded

---

### TASK-SEC-003: Create OAuth Token Sync Service
**Priority:** High | **Effort:** 4 hours | **Depends on:** TASK-SEC-001

Create new service to sync OAuth tokens from Google Workspace.

**File:** `backend/src/services/oauth-token-sync.service.ts`

```typescript
export class OAuthTokenSyncService {
  // Sync all tokens for a single user
  async syncUserTokens(organizationId: string, userEmail: string): Promise<void>;

  // Bulk sync tokens for all users (background job)
  async syncAllTokens(organizationId: string): Promise<SyncResult>;

  // Get aggregated app stats
  async getOAuthApps(organizationId: string): Promise<OAuthApp[]>;

  // Get tokens for a specific user
  async getUserTokens(organizationId: string, userEmail: string): Promise<UserToken[]>;

  // Revoke a token
  async revokeToken(organizationId: string, userEmail: string, clientId: string): Promise<void>;

  // Bulk revoke app from all users
  async revokeAppFromAll(organizationId: string, clientId: string): Promise<BulkRevokeResult>;
}
```

**Acceptance Criteria:**
- [x] Service syncs tokens via Google Admin API
- [x] Aggregates data into oauth_apps table
- [x] Handles API rate limits gracefully
- [x] Provides progress callbacks for UI

---

### TASK-SEC-004: Create Security API Routes
**Priority:** High | **Effort:** 3 hours | **Depends on:** TASK-SEC-002, TASK-SEC-003

Create REST API endpoints for security data.

**File:** `backend/src/routes/security.routes.ts`

```typescript
// 2FA Endpoints
GET  /api/v1/organization/security/2fa-status
GET  /api/v1/organization/security/2fa-status/:email

// OAuth App Endpoints
GET  /api/v1/organization/security/oauth-apps
GET  /api/v1/organization/security/oauth-apps/:clientId
GET  /api/v1/organization/security/oauth-apps/:clientId/users
DELETE /api/v1/organization/security/oauth-apps/:clientId  // Bulk revoke

// User Token Endpoints
GET  /api/v1/organization/users/:email/oauth-tokens
DELETE /api/v1/organization/users/:email/oauth-tokens/:clientId
```

**Acceptance Criteria:**
- [x] All endpoints authenticated and authorized
- [x] OpenAPI documentation added
- [x] Proper error handling
- [x] Audit logging for revoke actions

---

## Phase 2: Dashboard Widgets

### TASK-SEC-005: Add Security Widgets to Widget Registry
**Priority:** Medium | **Effort:** 1 hour | **Depends on:** TASK-SEC-004

Add new security widgets to `frontend/src/config/widgets.tsx`.

```typescript
// Security Widgets
{
  id: 'security-2fa-adoption',
  category: 'security',
  title: '2FA Adoption',
  icon: <Shield size={16} />,
  gridColumn: 3,
  enabled: true,
  platformColor: '#10b981', // green
},
{
  id: 'security-top-apps',
  category: 'security',
  title: 'Connected Apps',
  icon: <Key size={16} />,
  gridColumn: 3,
  enabled: true,
  platformColor: '#8b5cf6', // purple
},
{
  id: 'security-users-without-2fa',
  category: 'security',
  title: 'Users Without 2FA',
  icon: <AlertTriangle size={16} />,
  gridColumn: 3,
  enabled: false,
  platformColor: '#ef4444', // red
},
```

**Acceptance Criteria:**
- [x] Widgets appear in widget customizer
- [x] Default visibility set appropriately
- [x] Icons and colors match design system

---

### TASK-SEC-006: Implement 2FA Adoption Widget
**Priority:** Medium | **Effort:** 2 hours | **Depends on:** TASK-SEC-005

Create widget component showing 2FA adoption percentage.

**File:** `frontend/src/components/widgets/TwoFactorAdoptionWidget.tsx`

**Features:**
- Percentage display with progress bar
- "X of Y users enrolled" subtitle
- Click to navigate to full report
- Auto-refresh on dashboard load

**Acceptance Criteria:**
- [x] Shows accurate 2FA percentage
- [x] Progress bar animates on load
- [x] Clickable to drill down
- [x] Handles loading and error states

---

### TASK-SEC-007: Implement Connected Apps Widget
**Priority:** Medium | **Effort:** 2 hours | **Depends on:** TASK-SEC-005

Create widget showing top 5 connected OAuth apps.

**File:** `frontend/src/components/widgets/ConnectedAppsWidget.tsx`

**Features:**
- Top 5 apps by user count
- App name + user count
- "View All" link to full page
- Refreshes with dashboard

**Acceptance Criteria:**
- [x] Shows top 5 apps
- [x] User counts are accurate
- [x] Links to OAuth Apps page
- [x] Handles empty state gracefully

---

### TASK-SEC-008: Wire Widgets to Dashboard
**Priority:** Medium | **Effort:** 1 hour | **Depends on:** TASK-SEC-006, TASK-SEC-007

Update `frontend/src/utils/widget-data.tsx` to fetch security widget data.

**Acceptance Criteria:**
- [x] Security widgets render on dashboard
- [x] Data fetches efficiently (single API call)
- [x] Widgets customizable (show/hide)

---

## Phase 3: User Slideout Security Tab

### TASK-SEC-009: Add Security Tab to User Slideout
**Priority:** Medium | **Effort:** 3 hours | **Depends on:** TASK-SEC-004

Add new "Security" tab to UserSlideOut component.

**File:** `frontend/src/components/UserSlideOut.tsx`

**Tab Contents:**
1. **2FA Status Section**
   - Enrolled/Not Enrolled badge
   - Enrollment date (if available)

2. **Connected Apps Section**
   - List of OAuth apps with scopes
   - Last used timestamp
   - "Revoke" button per app
   - Confirmation dialog for revoke

**Acceptance Criteria:**
- [x] New tab appears in slideout
- [x] 2FA status displays correctly
- [x] Connected apps list loads
- [x] Revoke action works with confirmation
- [x] Audit log created on revoke

---

## Phase 4: OAuth Apps Page

### TASK-SEC-010: Create OAuth Apps Page
**Priority:** Medium | **Effort:** 4 hours | **Depends on:** TASK-SEC-004

Create dedicated page for viewing/managing OAuth apps.

**File:** `frontend/src/pages/OAuthApps.tsx`

**Features:**
- Table with columns: App Name, Users, Scopes, Risk Level, Last Seen, Actions
- Search/filter by app name
- Filter by risk level
- Sort by user count, last seen
- "View Users" action → modal with user list
- "Revoke All" action → bulk revoke with confirmation

**Acceptance Criteria:**
- [x] Page accessible at `/security/oauth-apps`
- [x] Table displays all OAuth apps
- [x] Search and filters work
- [x] Bulk revoke works with audit logging
- [x] Responsive design

---

### TASK-SEC-011: Add Navigation for Security Section
**Priority:** Low | **Effort:** 30 min | **Depends on:** TASK-SEC-010

Add Security section to admin navigation.

**Changes to:** `frontend/src/components/navigation/AdminNavigation.tsx`

```typescript
// Under existing sections
{
  name: 'Security',
  icon: Shield,
  items: [
    { name: 'OAuth Apps', path: '/security/oauth-apps' },
    { name: '2FA Status', path: '/security/2fa' },
    { name: 'Security Events', path: '/security/events' }, // existing
  ]
}
```

**Acceptance Criteria:**
- [x] Security section in nav
- [x] Links navigate correctly
- [x] Active state works

---

## Phase 5: CLI Commands

### TASK-SEC-012: Add 2FA CLI Commands
**Priority:** Medium | **Effort:** 2 hours | **Depends on:** TASK-SEC-004

Add verb-first 2FA commands to DeveloperConsole.

**Commands:**
- `list 2fa [--enrolled|--not-enrolled]`
- `get 2fa <email>`

**Implementation:**
```typescript
// In executeHeliosCommand switch
case 'list':
  if (resource === '2fa') await handleList2FA(args);
case 'get':
  if (resource === '2fa') await handleGet2FA(args);

const handleList2FA = async (args: string[]) => {
  const params = parseArgs(args);
  const filter = params.enrolled !== undefined ? 'enrolled' :
                 params['not-enrolled'] !== undefined ? 'not-enrolled' : 'all';

  const data = await apiRequest('GET', `/api/v1/organization/security/2fa-status?filter=${filter}`);
  // Format and display...
};
```

**Acceptance Criteria:**
- [x] `list 2fa` shows all users with status
- [x] `list 2fa --enrolled` filters enrolled
- [x] `list 2fa --not-enrolled` filters not enrolled
- [x] `get 2fa <email>` shows single user status
- [x] Help text updated

---

### TASK-SEC-013: Add Token CLI Commands
**Priority:** Medium | **Effort:** 2 hours | **Depends on:** TASK-SEC-004

Add verb-first token commands to DeveloperConsole.

**Commands:**
- `list tokens [--user=<email>]`
- `revoke token <email> <clientId> [--confirm]`
- `revoke tokens <email> --all [--confirm]`

**Acceptance Criteria:**
- [x] `list tokens` shows org-wide apps
- [x] `list tokens --user=x@y.com` shows user's apps
- [x] `revoke token` requires confirmation
- [x] Help text updated
- [x] Audit logged

---

### TASK-SEC-014: Update Help Documentation
**Priority:** Low | **Effort:** 1 hour | **Depends on:** TASK-SEC-012, TASK-SEC-013

Update help modal with new security commands.

**Changes to:** `frontend/src/pages/DeveloperConsole.tsx` (help modal section)

Add new "Security Commands" section:
```
Security Commands
  list 2fa [--enrolled|--not-enrolled]    List users with 2FA status
  get 2fa <email>                         Get 2FA status for user
  list tokens [--user=<email>]            List OAuth apps/tokens
  revoke token <email> <clientId>         Revoke OAuth token
```

**Acceptance Criteria:**
- [x] Help modal shows security commands
- [x] Examples are accurate
- [x] Commands work as documented

---

## Phase 6: Background Sync & Polish

### TASK-SEC-015: Add Token Sync to Scheduled Jobs
**Priority:** Medium | **Effort:** 1 hour | **Depends on:** TASK-SEC-003

Add OAuth token sync to the sync scheduler.

**Changes to:** `backend/src/services/sync-scheduler.service.ts`

**Behavior:**
- Sync tokens after user sync completes
- Run less frequently (every 6 hours by default)
- Respect rate limits

**Acceptance Criteria:**
- [x] Token sync runs on schedule
- [x] Configurable interval
- [x] Logs sync results

---

### TASK-SEC-016: Add Risk Level Classification
**Priority:** Low | **Effort:** 2 hours | **Depends on:** TASK-SEC-003

Add basic risk classification for OAuth apps.

**Heuristics:**
- **High Risk:** Apps with Gmail, Drive write access from unknown publishers
- **Medium Risk:** Apps with broad scopes
- **Low Risk:** Well-known apps (Slack, Zoom, etc.) or minimal scopes

**Acceptance Criteria:**
- [x] Risk level assigned during sync
- [x] Filterable in UI
- [x] Highlighted in widgets/tables

---

## Summary

| Phase | Tasks | Effort |
|-------|-------|--------|
| 1. Foundation | TASK-SEC-001 to 004 | ~10 hours |
| 2. Dashboard | TASK-SEC-005 to 008 | ~6 hours |
| 3. Slideout | TASK-SEC-009 | ~3 hours |
| 4. OAuth Page | TASK-SEC-010 to 011 | ~4.5 hours |
| 5. CLI | TASK-SEC-012 to 014 | ~5 hours |
| 6. Polish | TASK-SEC-015 to 016 | ~3 hours |
| **Total** | **16 tasks** | **~31.5 hours** |

## Parallelizable Work

- TASK-SEC-005, 006, 007 can run in parallel after Phase 1
- TASK-SEC-012, 013 can run in parallel
- TASK-SEC-009 and TASK-SEC-010 are independent after Phase 1

## Validation

After implementation:
- [x] All API endpoints return expected data
- [x] Dashboard widgets display correctly
- [x] User slideout shows security info
- [x] OAuth apps page is functional
- [x] CLI commands match GAM behavior
- [x] All actions are audit logged
- [x] Performance acceptable (<2s page loads)
