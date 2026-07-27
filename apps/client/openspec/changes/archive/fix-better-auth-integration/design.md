# Better Auth Integration - Technical Design Document

## System Architecture

### Current State (Broken)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│ LoginPage.tsx                  │ App.tsx                        │
│ - fetch('/api/v1/auth/login')  │ - localStorage.getItem('token')│
│ - Expects JWT response         │ - Bearer token in headers      │
│ - Stores token in localStorage │ - JWT verification flow        │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Express.js)                          │
├─────────────────────────────────────────────────────────────────┤
│ index.ts Route Mounting (ORDER MATTERS):                         │
│                                                                  │
│ Line 538: app.all('/api/v1/auth/*', authHandler);  ← INTERCEPTS │
│ Line 539: app.all('/api/auth/*', authHandler);                   │
│ Line 574: registerRoute('/auth', authRoutes);      ← NEVER RUNS │
│                                                                  │
│ Result: ALL /api/v1/auth/* goes to better-auth handler          │
│         Custom auth.routes.ts is shadowed                       │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Better Auth Handler                            │
├─────────────────────────────────────────────────────────────────┤
│ Expects: POST /api/auth/sign-in/email                           │
│ Returns: { session: {...}, user: {...} } + Set-Cookie header    │
│                                                                  │
│ Frontend calls: POST /api/v1/auth/login                         │
│ Better-auth interprets as: POST /sign-in/email (404 or error)   │
└─────────────────────────────────────────────────────────────────┘
```

### Target State (Fixed)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│ LoginPage.tsx                  │ App.tsx                        │
│ - signInWithEmail() from       │ - getSession() from auth-client│
│   auth-client.ts               │ - Session in httpOnly cookie   │
│ - Session stored in cookie     │ - No localStorage tokens       │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Express.js)                          │
├─────────────────────────────────────────────────────────────────┤
│ Better Auth handles session auth:                                │
│ - /api/auth/sign-in/email → Create session                     │
│ - /api/auth/get-session → Return current session               │
│ - /api/auth/sign-out → Destroy session                         │
│                                                                  │
│ Protected routes use session-auth.ts middleware:                 │
│ - Validates session from cookie                                  │
│ - Falls back to JWT for API clients                             │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Login Flow (Target State)

```
1. User enters credentials in LoginPage.tsx
                    ↓
2. Frontend calls signInWithEmail(email, password)
   - Uses auth-client.ts createAuthClient
   - Makes POST to /api/auth/sign-in/email
                    ↓
3. Better-auth handler receives request
   - Looks up user in organization_users table
   - Verifies bcrypt password hash
   - Creates session in auth_sessions table
   - Returns { session, user } + Set-Cookie header
                    ↓
4. Browser stores httpOnly session cookie
   - Cookie: helios.session_token=xxx
   - httpOnly: true (no JS access)
   - secure: true (in production)
                    ↓
5. Frontend receives response
   - Updates local state with user data
   - Navigates to dashboard
                    ↓
6. Subsequent requests include cookie automatically
   - Browser sends cookie with every request
   - session-auth.ts middleware validates session
```

### Session Validation Flow

```
1. Request arrives at protected endpoint
                    ↓
2. session-auth.ts middleware runs
   - Extracts cookie from request
   - Calls auth.api.getSession({ headers })
                    ↓
3. Better-auth validates session
   - Checks auth_sessions table
   - Verifies not expired
   - Returns user data
                    ↓
4. Middleware sets req.user
   - User ID, email, role, organizationId
   - Calls next()
                    ↓
5. Route handler executes with user context
```

## Database Schema

### Existing Tables (Used by Better Auth)

```sql
-- Main user table (better-auth maps to this)
CREATE TABLE organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),           -- bcrypt hash
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user',
  organization_id UUID REFERENCES organizations(id),
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false, -- better-auth uses this
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- ... other fields
);

-- Sessions table (created by migration 059)
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,           -- Session token in cookie
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts table for SSO (created by migration 059)
CREATE TABLE auth_accounts (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,           -- 'azure-ad', 'google', 'okta'
  access_token TEXT,
  refresh_token TEXT,
  -- ... other OAuth fields
  UNIQUE(provider_id, account_id)
);
```

### Better Auth Configuration Mapping

```typescript
// backend/src/lib/auth.ts
export const auth = betterAuth({
  database: pool,

  // Map to existing organization_users table
  user: {
    modelName: 'organization_users',
    fields: {
      email: 'email',
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    additionalFields: {
      firstName: { type: 'string', fieldName: 'first_name' },
      lastName: { type: 'string', fieldName: 'last_name' },
      role: { type: 'string', fieldName: 'role' },
      organizationId: { type: 'string', fieldName: 'organization_id' },
      isActive: { type: 'boolean', fieldName: 'is_active' },
    },
  },

  // Session table
  sessionModel: {
    modelName: 'auth_sessions',
  },

  // Account table (for SSO)
  account: {
    modelName: 'auth_accounts',
  },
});
```

## API Endpoints

### Better Auth Endpoints (Handled by authHandler)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/sign-in/email | Email/password login |
| POST | /api/auth/sign-up/email | Email/password registration |
| GET | /api/auth/get-session | Get current session |
| POST | /api/auth/sign-out | Logout (destroy session) |
| POST | /api/auth/verify-email | Email verification |
| POST | /api/auth/forgot-password | Request password reset |
| POST | /api/auth/reset-password | Reset password with token |

### Custom Endpoints to Keep (in auth.routes.ts)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/auth/setup-password | Initial password setup for new users |
| GET | /api/v1/auth/verify-setup-token | Verify password setup token |

**Note:** These custom endpoints should NOT conflict with better-auth because they have unique paths.

## Cookie Configuration

```typescript
// better-auth cookie settings
session: {
  expiresIn: 60 * 60 * 8,        // 8 hours
  updateAge: 60 * 15,            // Update every 15 minutes
  cookieCache: {
    enabled: true,
    maxAge: 60 * 5,              // Cache for 5 minutes
  },
},

advanced: {
  useSecureCookies: process.env['NODE_ENV'] === 'production',
  cookiePrefix: 'helios',
},
```

Expected cookies:
- `helios.session_token` - The session token
- httpOnly: true
- secure: true (production)
- sameSite: lax

## Security Considerations

### Advantages of Session Auth

1. **XSS Protection:** httpOnly cookies prevent JavaScript access
2. **CSRF Protection:** sameSite=lax provides basic protection
3. **Token Theft:** Even if XSS, can't steal session token
4. **Revocation:** Sessions can be invalidated server-side

### Maintaining API Key Auth

API key authentication (for external clients/integrations) should continue working:
- `api-key-auth.ts` middleware runs before session check
- If valid `X-API-Key` header, authenticate via API key
- If no API key, fall back to session validation

## Migration Path

### Step 1: Backend - Fix Route Order

```typescript
// backend/src/index.ts

// Keep better-auth for session endpoints only
// Mount AFTER checking for non-auth routes
app.all('/api/auth/*', authHandler);
app.all('/api/v1/auth/session/*', authHandler);

// Custom auth routes for password setup (don't conflict)
registerRoute('/auth', authRoutes);
```

### Step 2: Frontend - Update Login

```typescript
// frontend/src/pages/LoginPage.tsx
import { signInWithEmail } from '../lib/auth-client';

const handleSubmit = async (e: React.FormEvent) => {
  const result = await signInWithEmail(email, password);
  if (result.success) {
    onLoginSuccess({ data: { user: result.user } });
  }
};
```

### Step 3: Frontend - Update App.tsx

```typescript
// Remove localStorage token storage
// Use getSession() for auth check
const session = await getSession();
if (session) {
  setCurrentUser(session.user);
  setStep('dashboard');
}
```

### Step 4: Update Session Middleware

```typescript
// backend/src/middleware/session-auth.ts
// Already implemented - verify it works
export const authenticateSession = async (req, res, next) => {
  const sessionData = await getSessionFromCookies(req);
  if (sessionData) {
    req.user = /* map session to user */;
    return next();
  }
  // Fall back to JWT
  const jwtUser = getUserFromJWT(req);
  // ...
};
```

## Testing Strategy

### Unit Tests

1. Better-auth configuration validation
2. Session middleware with mocked sessions
3. Cookie parsing

### Integration Tests (Playwright)

1. Full login flow with form submission
2. Session persistence after refresh
3. Logout clears session
4. Protected route access with/without session

### Manual Tests

1. Browser dev tools - verify cookie is set
2. Network tab - verify session in requests
3. Clear cookies - verify logout behavior

## Rollback Plan

If better-auth integration fails:

1. Remove `authHandler` from index.ts
2. Keep custom `auth.routes.ts` as primary auth
3. Remove references to `auth-client.ts` from frontend
4. Revert LoginPage.tsx to use fetch
5. Keep auth_sessions table for future SSO work

## References

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Better Auth Database Schema](https://www.better-auth.com/docs/concepts/database)
- [Better Auth React Integration](https://www.better-auth.com/docs/client/react)
- [Better Auth Custom Tables](https://www.better-auth.com/docs/concepts/database#custom-table-names)
