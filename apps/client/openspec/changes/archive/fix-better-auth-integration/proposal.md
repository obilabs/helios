# Fix Better Auth Integration

**Status:** DEFERRED
**Decision Date:** 2025-12-19
**Reason:** Current JWT auth works perfectly. Better-auth requires password storage migration.

---

## Decision Summary

After thorough investigation, the better-auth migration has been **DEFERRED**. Key findings:

1. **Current JWT auth works perfectly** - Login, session persistence, and API auth all function correctly
2. **Architectural incompatibility** - Better-auth stores passwords in `auth_accounts` table, but Helios uses `organization_users.password_hash`
3. **Migration risk too high** - Would require moving 36+ user passwords with risk of breaking authentication

**Actions Taken:**
- [x] Added UNUSED/DEFERRED comments to better-auth files
- [x] Documented decision in `decision.md`
- [x] Fixed and updated Playwright auth tests (8/8 passing)
- [x] Kept better-auth code for future SSO work

See `decision.md` for full analysis.

---

## Original Problem Statement (No Longer Applicable)

The frontend is showing the setup screen instead of the login screen after migrating to Better Auth. The auth system is in a broken hybrid state:

1. **Route Conflict** - `authHandler` from better-auth is mounted on `/api/v1/auth/*` and `/api/auth/*` BEFORE the custom `auth.routes.ts` is registered
2. **Frontend Not Using Better Auth** - LoginPage.tsx still calls `/api/v1/auth/login` expecting the old JWT-based auth response
3. **Session vs JWT Mismatch** - Better Auth uses session cookies (httpOnly), but frontend stores JWT in localStorage
4. **Setup Check Failing** - The `/api/v1/organization/setup/status` call may be failing or returning unexpected data

## Current Architecture Analysis

### Backend State

| Component | File | Status |
|-----------|------|--------|
| better-auth config | `backend/src/lib/auth.ts` | Created - maps to organization_users |
| better-auth handler | `backend/src/lib/auth-handler.ts` | Created - exports toNodeHandler |
| Session middleware | `backend/src/middleware/session-auth.ts` | Created - validates better-auth sessions |
| JWT auth routes | `backend/src/routes/auth.routes.ts` | Still active - /login, /verify, /logout |
| Route mounting | `backend/src/index.ts` | CONFLICT: authHandler mounted BEFORE auth.routes |

### Frontend State

| Component | File | Status |
|-----------|------|--------|
| Auth client | `frontend/src/lib/auth-client.ts` | Created - uses better-auth/react |
| Login page | `frontend/src/pages/LoginPage.tsx` | NOT UPDATED - uses fetch to /api/v1/auth/login |
| App.tsx | `frontend/src/App.tsx` | NOT UPDATED - uses localStorage for JWT tokens |

### Database State

| Table | Purpose | Status |
|-------|---------|--------|
| auth_sessions | Better Auth sessions | Created in migration 059 |
| auth_accounts | SSO provider links | Created in migration 059 |
| auth_verifications | Email/password reset | Created in migration 059 |
| sso_providers | OIDC/SAML config | Created in migration 059 |

## Root Cause

The `authHandler` from better-auth intercepts ALL requests to `/api/v1/auth/*` and `/api/auth/*` BEFORE the custom routes can handle them. This means:

1. `/api/v1/auth/login` goes to better-auth's `signIn.email` endpoint (which has different response format)
2. The frontend expects `{ success: true, data: { tokens: { accessToken, refreshToken }, user: {...} } }`
3. Better-auth returns `{ session: {...}, user: {...} }` with cookies set

## Migration Strategy Options

### Option A: Full Better Auth Migration (Recommended)

Convert frontend to use better-auth client completely:
- Use `signIn.email()` from auth-client.ts
- Session stored in httpOnly cookies (more secure)
- Remove JWT from localStorage
- Update App.tsx to use `useSession()` hook

Pros:
- More secure (httpOnly cookies prevent XSS theft)
- Cleaner architecture
- SSO support built-in for future

Cons:
- More changes required
- Must verify session-auth middleware works

### Option B: Better Auth for Sessions Only

Keep existing login flow but store sessions in better-auth tables:
- Custom `/login` route creates better-auth session
- Still return JWT for API calls
- Hybrid approach

Pros:
- Fewer frontend changes
- API key auth still works with JWT

Cons:
- Complex hybrid state
- Two auth systems to maintain

### Option C: Rollback to Pure JWT (Not Recommended)

Remove better-auth integration entirely, keep existing JWT auth.

Pros:
- Quick fix
- No new learning curve

Cons:
- Loses SSO preparation
- Less secure (localStorage tokens)

## Recommended Implementation (Option A)

### Phase 1: Research & Diagnosis (Agent Task)

1. **Check better-auth documentation** - Verify correct usage of `signIn.email()`
2. **Test better-auth endpoints directly** - Use curl/Postman to test `/api/auth/sign-in/email`
3. **Verify database migration** - Ensure auth_sessions table exists and has correct schema
4. **Document better-auth response format** - What does it actually return?

### Phase 2: Backend Fixes

1. **Fix route ordering** - Either:
   - Remove custom auth routes if using better-auth fully, OR
   - Mount better-auth on different path (e.g., `/api/session/*`)

2. **Update session-auth middleware** - Ensure it correctly validates better-auth sessions
3. **Add transition endpoint** - Optional: `/api/v1/auth/login` wrapper that calls better-auth and returns compatible format

### Phase 3: Frontend Fixes

1. **Update LoginPage.tsx** - Use `signInWithEmail()` from auth-client.ts
2. **Update App.tsx** - Remove localStorage JWT handling, use `useSession()` hook
3. **Update checkConfiguration()** - Use auth-client session check
4. **Update logout** - Use `signOutUser()` from auth-client.ts

### Phase 4: Testing

1. **Automated tests** - Update Playwright tests to work with session auth
2. **Manual verification** - Full login/logout cycle
3. **Session persistence** - Verify refresh works

## Files to Modify

### Backend
- `backend/src/index.ts` - Fix route mounting order or restructure
- `backend/src/lib/auth.ts` - Verify configuration matches database schema
- `backend/src/middleware/session-auth.ts` - Ensure it works correctly

### Frontend
- `frontend/src/pages/LoginPage.tsx` - Use better-auth client
- `frontend/src/App.tsx` - Remove JWT localStorage, use session
- `frontend/src/lib/auth-client.ts` - Verify it's correctly configured

### Tests
- `openspec/testing/tests/core/auth.test.ts` - Update for session auth

## Success Criteria

- [ ] Login page loads (not setup screen)
- [ ] Can login with valid credentials
- [ ] Session persists after page refresh
- [ ] Logout clears session
- [ ] Protected routes work with session auth
- [ ] API key auth still works for external clients
- [ ] Playwright tests pass

## Testing Commands

```bash
# Run Playwright auth tests
cd openspec/testing && npx playwright test tests/core/auth.test.ts --headed

# Check if better-auth endpoints respond
curl -X POST http://localhost:3001/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"jack@example.com","password":"password123"}'

# Check setup status
curl http://localhost:3001/api/v1/organization/setup/status

# Check database tables
docker exec helios-db psql -U postgres -d helios_client -c "SELECT * FROM auth_sessions LIMIT 5;"
```

## Reference Documentation

- Better Auth Docs: https://www.better-auth.com/docs
- Better Auth Email/Password: https://www.better-auth.com/docs/authentication/email-password
- Better Auth React: https://www.better-auth.com/docs/client/react
