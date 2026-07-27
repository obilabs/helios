# Passkey Authentication - Implementation Tasks

## Phase 1: Backend Setup

### TASK-PK-001: Add passkey plugin to better-auth
**Priority:** High | **Effort:** 30 min

Add the passkey plugin to the backend auth configuration.

**File:** `backend/src/lib/auth.ts`

```typescript
import { passkey } from 'better-auth/plugins';

plugins: [
  twoFactor({ ... }),
  passkey({
    rpName: 'Helios',
    rpID: process.env['PASSKEY_RP_ID'] || 'localhost',
    origin: process.env['PASSKEY_ORIGIN'] || 'http://localhost:3000',
  }),
]
```

**Acceptance Criteria:**
- [x] passkey plugin imported and configured
- [x] Environment variables documented in .env.example
- [x] No breaking changes to existing auth

---

### TASK-PK-002: Database migration for passkeys table
**Priority:** High | **Effort:** 30 min | **Depends on:** TASK-PK-001

Create migration for the passkeys table (better-auth schema).

**File:** `database/migrations/077_add_passkeys_table.sql`

```sql
CREATE TABLE IF NOT EXISTS passkeys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  name TEXT,
  public_key TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  counter INTEGER DEFAULT 0,
  device_type TEXT,
  backed_up BOOLEAN DEFAULT false,
  transports TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_passkeys_user_id ON passkeys(user_id);
CREATE INDEX idx_passkeys_credential_id ON passkeys(credential_id);
```

**Acceptance Criteria:**
- [x] Migration runs without errors
- [x] Table created with correct constraints
- [x] Indexes created for lookups

---

### TASK-PK-003: Add passkey routes to backend
**Priority:** High | **Effort:** 30 min | **Depends on:** TASK-PK-001

Ensure better-auth passkey routes are accessible.

**Routes provided by better-auth:**
- `POST /api/auth/passkey/register` - Start registration
- `POST /api/auth/passkey/register/verify` - Complete registration
- `POST /api/auth/passkey/authenticate` - Start authentication
- `POST /api/auth/passkey/authenticate/verify` - Complete authentication

**File:** `backend/src/index.ts`

Add `/passkey` to `betterAuthPaths` array.

**Acceptance Criteria:**
- [x] Passkey routes accessible
- [x] Registration flow works
- [x] Authentication flow works

---

## Phase 2: Frontend Setup

### TASK-PK-004: Add passkeyClient to auth client
**Priority:** High | **Effort:** 30 min | **Depends on:** TASK-PK-003

Add passkey client plugin and helper functions.

**File:** `frontend/src/lib/auth-client.ts`

```typescript
import { passkeyClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: API_BASE_URL || window.location.origin,
  plugins: [
    twoFactorClient(),
    passkeyClient(),
  ],
});

export const { passkey } = authClient;

// Helper functions
export async function registerPasskey(name: string) { ... }
export async function signInWithPasskey() { ... }
export async function listPasskeys() { ... }
export async function deletePasskey(id: string) { ... }
```

**Acceptance Criteria:**
- [x] passkeyClient plugin added
- [x] Helper functions exported
- [x] TypeScript types correct

---

## Phase 3: User Settings UI

### TASK-PK-005: Add passkey management to User Settings
**Priority:** High | **Effort:** 2 hours | **Depends on:** TASK-PK-004

Add passkey section to User Settings security tab.

**File:** `frontend/src/pages/UserSettings.tsx`

**Features:**
- List registered passkeys with name, device type, last used
- "Add Passkey" button → browser WebAuthn prompt
- Name input for passkey (e.g., "MacBook Touch ID")
- Remove button for each passkey

**UI Structure:**
```
Security
├── Two-Factor Authentication (existing)
│   └── TOTP setup/disable
└── Passkeys (NEW)
    ├── [List of registered passkeys]
    │   ├── "MacBook Touch ID" - Last used: 2 hours ago [Remove]
    │   └── "YubiKey 5" - Last used: 3 days ago [Remove]
    └── [Add Passkey] button
```

**Acceptance Criteria:**
- [x] Passkey section appears in User Settings
- [x] Can register new passkey with name
- [x] Can view list of passkeys
- [x] Can remove passkeys
- [x] Graceful handling if WebAuthn not supported

---

## Phase 4: Login Flow

### TASK-PK-006: Add passkey option to login page
**Priority:** High | **Effort:** 2 hours | **Depends on:** TASK-PK-004

Update login page to support passkey authentication.

**File:** `frontend/src/pages/LoginPage.tsx`

**Flow:**
1. User enters email
2. Show "Sign in with Passkey" button (if passkeys exist for email)
3. OR show password field + TOTP flow (existing)
4. Passkey auth bypasses both password and TOTP

**UI:**
```
Email: [user@example.com]

[Sign in with Passkey]  ← NEW
─── or ───
Password: [••••••••]
[Sign In]
```

**Note:** We need to check if user has passkeys registered before showing the button. This may require a new endpoint or client-side check.

**Acceptance Criteria:**
- [x] Passkey option shown when available
- [x] Can complete full login with passkey only
- [x] Falls back to password if passkey fails
- [x] Clear error messages

---

## Phase 5: Polish

### TASK-PK-007: Add passkey status to security overview
**Priority:** Low | **Effort:** 1 hour | **Depends on:** TASK-PK-005

Update User Slideout security tab to show passkey count.

**File:** `frontend/src/components/UserSlideOut.tsx`

Show passkey status alongside 2FA status in the security tab.

**Acceptance Criteria:**
- [x] Shows number of registered passkeys
- [x] Visual indicator (key icon)

---

### TASK-PK-008: Update environment documentation
**Priority:** Low | **Effort:** 15 min

Update .env.example with passkey configuration.

**File:** `.env.example`

```bash
# Passkey/WebAuthn Configuration
# PASSKEY_RP_ID should match your domain (e.g., "example.com")
PASSKEY_RP_ID=localhost
# PASSKEY_ORIGIN should be your frontend URL
PASSKEY_ORIGIN=http://localhost:3000
```

**Acceptance Criteria:**
- [x] Environment variables documented
- [x] Production deployment notes added

---

## Summary

| Phase | Tasks | Effort |
|-------|-------|--------|
| 1. Backend Setup | TASK-PK-001 to 003 | ~1.5 hours |
| 2. Frontend Setup | TASK-PK-004 | ~30 min |
| 3. User Settings UI | TASK-PK-005 | ~2 hours |
| 4. Login Flow | TASK-PK-006 | ~2 hours |
| 5. Polish | TASK-PK-007 to 008 | ~1.25 hours |
| **Total** | **8 tasks** | **~7 hours** |

## Validation

After implementation:
- [x] Can register passkey from User Settings
- [x] Can login with passkey (no password/TOTP needed)
- [x] Can manage (view/remove) passkeys
- [x] Works with Touch ID / Face ID / Windows Hello
- [x] Works with hardware keys (YubiKey)
- [x] Graceful degradation when WebAuthn unavailable
