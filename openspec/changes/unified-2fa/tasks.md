# Unified 2FA - Implementation Tasks

## Phase 1: Better-Auth 2FA Plugin

### TASK-2FA-001: Enable twoFactor Plugin
**Priority:** High | **Effort:** 1 hour

Enable better-auth's twoFactor plugin in the auth configuration.

**File:** `backend/src/lib/auth.ts`

```typescript
import { twoFactor } from 'better-auth/plugins';

export const auth = betterAuth({
  // ...existing config
  plugins: [
    twoFactor({
      issuer: 'Helios',
      totpOptions: {
        period: 30,
        digits: 6,
      },
    })
  ]
});
```

**File:** `frontend/src/lib/auth-client.ts`

```typescript
import { twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [twoFactorClient()]
});
```

**Acceptance Criteria:**
- [ ] twoFactor plugin added to backend auth config
- [ ] twoFactorClient plugin added to frontend auth client
- [ ] No breaking changes to existing auth flow

---

### TASK-2FA-002: Database Migration for 2FA Tables
**Priority:** High | **Effort:** 30 min | **Depends on:** TASK-2FA-001

Create migration for better-auth's twoFactor table.

**File:** `database/migrations/076_add_two_factor_table.sql`

```sql
-- Two-factor authentication table (better-auth)
CREATE TABLE IF NOT EXISTS two_factor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_two_factor_user ON two_factor(user_id);
```

**Acceptance Criteria:**
- [ ] Migration runs without errors
- [ ] Table created with correct constraints
- [ ] Index created for user lookups

---

### TASK-2FA-003: 2FA Enrollment API Routes
**Priority:** High | **Effort:** 2 hours | **Depends on:** TASK-2FA-002

Better-auth provides these automatically, but we need wrapper routes for our API structure.

**Endpoints (provided by better-auth):**
- `POST /api/auth/two-factor/enable` - Start 2FA enrollment (returns QR code)
- `POST /api/auth/two-factor/verify` - Verify TOTP and enable 2FA
- `POST /api/auth/two-factor/disable` - Disable 2FA

**Acceptance Criteria:**
- [ ] Better-auth 2FA routes accessible
- [ ] QR code generation works
- [ ] TOTP verification works
- [ ] Disable with password confirmation works

---

## Phase 2: 2FA Enrollment UI

### TASK-2FA-004: Add 2FA Section to User Settings
**Priority:** High | **Effort:** 3 hours | **Depends on:** TASK-2FA-003

Add 2FA enrollment UI to user settings page.

**File:** `frontend/src/pages/UserSettings.tsx`

**Features:**
- Show current 2FA status (enabled/disabled)
- "Enable 2FA" button → opens enrollment modal
- QR code display for authenticator app
- TOTP code input for verification
- "Disable 2FA" with password confirmation

**Acceptance Criteria:**
- [ ] 2FA status visible in user settings
- [ ] Enrollment flow works end-to-end
- [ ] QR code scannable by authenticator apps
- [ ] Disable requires password confirmation

---

### TASK-2FA-005: Update Login Flow for 2FA
**Priority:** High | **Effort:** 2 hours | **Depends on:** TASK-2FA-003

Handle 2FA challenge during login for users with 2FA enabled.

**File:** `frontend/src/pages/LoginPage.tsx`

**Flow:**
1. User enters email/password
2. If 2FA enabled, show TOTP input screen
3. Verify TOTP code
4. Complete login

**Acceptance Criteria:**
- [ ] 2FA challenge shown when required
- [ ] TOTP verification works
- [ ] Error handling for invalid codes
- [ ] "Remember this device" option (optional)

---

## Phase 3: Unified 2FA API

### TASK-2FA-006: Create Unified 2FA Status Endpoint
**Priority:** Medium | **Effort:** 3 hours | **Depends on:** TASK-2FA-002

Update security routes to aggregate 2FA status from all sources.

**File:** `backend/src/routes/security.routes.ts`

**Updated Response:**
```typescript
interface Unified2FAStatus {
  summary: {
    helios: { enrolled: number; total: number; rate: number };
    google: { enrolled: number; total: number; rate: number };
    m365: { enrolled: number; total: number; rate: number } | null;
  };
  users: Array<{
    email: string;
    source: 'helios' | 'google' | 'm365';
    is_enrolled: boolean;
    method?: string; // 'totp', 'sms', 'push', etc.
  }>;
}
```

**Query Parameters:**
- `source`: Filter by identity source (helios, google, m365)
- `enrolled`: Filter by enrollment status (true, false)

**Acceptance Criteria:**
- [ ] Endpoint returns unified data from all sources
- [ ] Filtering by source works
- [ ] Filtering by enrollment status works
- [ ] Performance acceptable (<500ms)

---

### TASK-2FA-007: Update User Security Endpoint
**Priority:** Medium | **Effort:** 1 hour | **Depends on:** TASK-2FA-006

Update per-user security endpoint to include Helios 2FA status.

**File:** `backend/src/routes/security.routes.ts`

**Updated `/api/v1/security/users/:email/security`:**
```typescript
{
  email: "user@example.com",
  twoFactor: {
    helios: { enabled: true, method: "totp" },
    google: { enrolled: true, enforced: false },
    m365: null  // Not a M365 user
  },
  oauthTokens: [...],
  lastLogin: "2024-01-15T..."
}
```

**Acceptance Criteria:**
- [ ] Returns 2FA status for all applicable sources
- [ ] Handles users with multiple identity sources

---

## Phase 4: CLI Updates

### TASK-2FA-008: Update list 2fa Command
**Priority:** Medium | **Effort:** 2 hours | **Depends on:** TASK-2FA-006

Update CLI to use unified 2FA endpoint with source filtering.

**File:** `frontend/src/pages/DeveloperConsole.tsx`

**Updated Commands:**
```
list 2fa                     # All users, all sources
list 2fa --helios            # Helios users only
list 2fa --google            # Google Workspace users only
list 2fa --m365              # Microsoft 365 users only
list 2fa --enrolled          # Only enrolled users
list 2fa --not-enrolled      # Only non-enrolled users
list 2fa --google --enrolled # Combined filters
```

**Output Format:**
```
2FA Status Summary
══════════════════════════════════════════════════════════
  Helios:     12 / 15 (80%)
  Google:     45 / 50 (90%)
══════════════════════════════════════════════════════════

Email                         Source    Status
───────────────────────────────────────────────────────────
john@example.com              Google    ✓ Enrolled
jane@example.com              Helios    ✓ TOTP
bob@example.com               Google    ✗ Not Enrolled
```

**Acceptance Criteria:**
- [ ] `list 2fa` shows source column
- [ ] `--helios`, `--google`, `--m365` filters work
- [ ] `--enrolled`, `--not-enrolled` filters work
- [ ] Filters can be combined

---

### TASK-2FA-009: Update get 2fa Command
**Priority:** Medium | **Effort:** 1 hour | **Depends on:** TASK-2FA-007

Update per-user 2FA command to show all sources.

**File:** `frontend/src/pages/DeveloperConsole.tsx`

**Commands:**
```
get 2fa user@example.com            # Show all sources
get 2fa user@example.com --helios   # Helios only
```

**Output:**
```
2FA Status for user@example.com
══════════════════════════════════════════════════════════
  Helios:           ✓ TOTP Enabled
  Google Workspace: ✓ Enrolled (Not Enforced)
  Microsoft 365:    N/A (not a M365 user)
══════════════════════════════════════════════════════════
```

**Acceptance Criteria:**
- [ ] Shows 2FA status from all applicable sources
- [ ] `--helios`, `--google`, `--m365` filters work
- [ ] Clear indication when source doesn't apply

---

### TASK-2FA-010: Update Help Documentation
**Priority:** Low | **Effort:** 30 min | **Depends on:** TASK-2FA-008, TASK-2FA-009

Update ConsoleHelpPanel with new command options.

**File:** `frontend/src/components/ConsoleHelpPanel.tsx`

**Acceptance Criteria:**
- [ ] Help shows all new filter options
- [ ] Examples are accurate

---

## Phase 5: UI Updates

### TASK-2FA-011: Update User Slideout Security Tab
**Priority:** Medium | **Effort:** 2 hours | **Depends on:** TASK-2FA-007

Update security tab to show Helios 2FA status and enrollment option.

**File:** `frontend/src/components/UserSlideOut.tsx`

**Features:**
- Show 2FA status for each source (Helios, Google, M365)
- For Helios users: "Enable 2FA" / "Disable 2FA" actions
- Visual indicators for each source

**Acceptance Criteria:**
- [ ] Shows 2FA status per source
- [ ] Admin can enable/disable 2FA for Helios users
- [ ] Clear visual distinction between sources

---

### TASK-2FA-012: Update Dashboard Widget
**Priority:** Low | **Effort:** 1 hour | **Depends on:** TASK-2FA-006

Update 2FA adoption widget to show combined stats.

**File:** `frontend/src/utils/widget-data.tsx`

**Display:**
- Combined adoption rate across all sources
- Breakdown by source on hover/click

**Acceptance Criteria:**
- [ ] Widget shows combined 2FA adoption
- [ ] Drill-down shows per-source breakdown

---

## Summary

| Phase | Tasks | Effort | Status |
|-------|-------|--------|--------|
| 1. Plugin Setup | TASK-2FA-001 to 003 | ~3.5 hours | ✅ Complete |
| 2. Enrollment UI | TASK-2FA-004 to 005 | ~5 hours | ✅ Complete |
| 3. Unified API | TASK-2FA-006 to 007 | ~4 hours | ✅ Complete |
| 4. CLI Updates | TASK-2FA-008 to 010 | ~3.5 hours | ✅ Complete |
| 5. UI Updates | TASK-2FA-011 to 012 | ~3 hours | ✅ Complete |
| **Total** | **12 tasks** | **~19 hours** | **✅ All Complete** |

## Validation

After implementation:
- [x] Helios users can enable/disable TOTP 2FA
- [x] Login flow handles 2FA challenge correctly
- [x] `list 2fa` shows unified view with source column
- [x] All filter combinations work correctly
- [x] User slideout shows 2FA for all sources
- [x] Dashboard widget shows combined adoption rate with per-source breakdown

## Files Modified

**Backend:**
- `backend/src/lib/auth.ts` - Added twoFactor plugin
- `backend/src/routes/security.routes.ts` - Added unified-2fa endpoints
- `backend/src/routes/dashboard.routes.ts` - Updated to use unified 2FA
- `backend/src/services/oauth-token-sync.service.ts` - Added getUnified2FAStatus, getUserUnified2FAStatus
- `backend/src/index.ts` - Added /two-factor to betterAuthPaths
- `backend/src/knowledge/content/commands.json` - Added security CLI commands

**Frontend:**
- `frontend/src/lib/auth-client.ts` - Added twoFactorClient plugin and helper functions
- `frontend/src/pages/UserSettings.tsx` - Added 2FA enrollment UI with QR code
- `frontend/src/pages/LoginPage.tsx` - Added 2FA challenge during login
- `frontend/src/components/UserSlideOut.tsx` - Updated security tab with per-source 2FA
- `frontend/src/utils/widget-data.tsx` - Updated 2FA widget with per-source breakdown

**Database:**
- `database/migrations/076_add_two_factor_table.sql` - Created two_factor table

## Completed: 2025-12-28
