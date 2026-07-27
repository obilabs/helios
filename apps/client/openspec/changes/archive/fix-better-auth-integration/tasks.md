# Better Auth Integration Fix - Agent Tasks

**Priority:** CRITICAL
**Status:** In Progress
**Blocking:** All frontend functionality

## Pre-Requisites

Before starting, ensure:
1. Docker containers are running: `docker-compose ps`
2. Backend is accessible: `curl http://localhost:3001/health`
3. Frontend dev server: `cd frontend && npm run dev`
4. Database is up: `docker exec helios-db psql -U postgres -d helios_client -c "SELECT 1;"`

---

## TASK 1: Research Better Auth Documentation

**Objective:** Understand exactly how better-auth works to make informed decisions.

### Steps:

1. **Read better-auth docs** using WebFetch/WebSearch:
   - Email/password auth: https://www.better-auth.com/docs/authentication/email-password
   - Session management: https://www.better-auth.com/docs/concepts/session-management
   - Database schema: https://www.better-auth.com/docs/concepts/database
   - React integration: https://www.better-auth.com/docs/client/react
   - Custom table names: https://www.better-auth.com/docs/concepts/database#custom-table-names

2. **Document findings:**
   - What endpoints does better-auth expose?
   - What is the request/response format for sign-in?
   - How does session storage work?
   - How to map to existing tables (organization_users)?

### Expected Output:
Create a file `openspec/changes/fix-better-auth-integration/research.md` with findings.

---

## TASK 2: Diagnose Current State

**Objective:** Understand exactly what's happening when frontend loads.

### Steps:

1. **Check backend logs:**
   ```bash
   docker logs helios-backend --tail=100 2>&1 | grep -i "auth\|error\|session"
   ```

2. **Test setup status endpoint:**
   ```bash
   curl -v http://localhost:3001/api/v1/organization/setup/status
   ```

3. **Test better-auth endpoints directly:**
   ```bash
   # What does better-auth expose?
   curl -v http://localhost:3001/api/auth/

   # Try sign-in
   curl -X POST http://localhost:3001/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{"email":"jack@example.com","password":"password123"}'
   ```

4. **Test legacy login endpoint:**
   ```bash
   curl -X POST http://localhost:3001/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"jack@example.com","password":"password123"}'
   ```

5. **Check database state:**
   ```bash
   # Does organization exist?
   docker exec helios-db psql -U postgres -d helios_client \
     -c "SELECT id, name, domain FROM organizations;"

   # Does test user exist?
   docker exec helios-db psql -U postgres -d helios_client \
     -c "SELECT id, email, role, is_active FROM organization_users WHERE email='jack@example.com';"

   # Check auth tables
   docker exec helios-db psql -U postgres -d helios_client \
     -c "\\dt auth_*"
   ```

6. **Run Playwright test to capture current behavior:**
   ```bash
   cd openspec/testing && npx playwright test tests/core/auth.test.ts --headed
   ```

### Expected Output:
Create diagnostic notes in `openspec/changes/fix-better-auth-integration/diagnosis.md`

---

## TASK 3: Decide Integration Approach

**Objective:** Based on research and diagnosis, decide the best path forward.

### Decision Points:

1. **Is better-auth correctly configured?**
   - Check `backend/src/lib/auth.ts` matches database schema
   - Verify `user.modelName: 'organization_users'` is correct

2. **Can we use better-auth's built-in endpoints?**
   - `/api/auth/sign-in/email` - does it work?
   - `/api/auth/get-session` - does it return session?

3. **Do we need compatibility layer?**
   - If legacy response format is required, create wrapper endpoint
   - If not, update frontend to use better-auth directly

### Options:

**Option A: Pure Better Auth (Recommended if working)**
- Remove custom auth routes from index.ts
- Update frontend to use auth-client.ts functions
- Session stored in httpOnly cookies

**Option B: Compatibility Wrapper**
- Keep `/api/v1/auth/login` but call better-auth internally
- Return legacy format for backwards compatibility
- More complex but less frontend changes

**Option C: Fix Custom Routes (If better-auth has issues)**
- Move better-auth to different path
- Keep existing custom routes working
- Add better-auth later when stable

### Make Decision:
Document decision in `openspec/changes/fix-better-auth-integration/decision.md`

---

## TASK 4: Implement Backend Fix

**Objective:** Fix the route conflict and ensure auth endpoints work.

### For Option A (Pure Better Auth):

1. **Update index.ts** - Remove or comment out custom auth routes:
   ```typescript
   // backend/src/index.ts
   // Remove this line:
   // registerRoute('/auth', authRoutes);

   // Keep better-auth handler:
   app.all('/api/v1/auth/*', authHandler);
   app.all('/api/auth/*', authHandler);
   ```

2. **Verify better-auth config** in `backend/src/lib/auth.ts`:
   - Confirm `user.modelName: 'organization_users'` is correct
   - Check field mappings match database columns
   - Verify `emailAndPassword.enabled: true`

3. **Test the fix:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/sign-in/email \
     -H "Content-Type: application/json" \
     -d '{"email":"jack@example.com","password":"password123"}'
   ```

### For Option B (Compatibility Wrapper):

1. **Create wrapper route** that calls better-auth and transforms response:
   ```typescript
   // In auth.routes.ts, modify /login to use better-auth
   router.post('/login', async (req, res) => {
     // Call better-auth internally
     // Transform response to legacy format
   });
   ```

---

## TASK 5: Implement Frontend Fix

**Objective:** Update frontend to use better-auth correctly.

### Files to Modify:

1. **Update LoginPage.tsx:**
   ```typescript
   // frontend/src/pages/LoginPage.tsx
   import { signInWithEmail } from '../lib/auth-client';

   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     setLoading(true);
     setError(null);

     try {
       const result = await signInWithEmail(formData.email, formData.password);

       if (!result.success) {
         throw new Error(result.error || 'Login failed');
       }

       // Session is now stored in httpOnly cookie
       // Get session data for local state
       onLoginSuccess({
         success: true,
         data: {
           user: result.user,
           // Tokens no longer in localStorage - session cookie handles it
         }
       });
     } catch (err: any) {
       setError(err.message);
     } finally {
       setLoading(false);
     }
   };
   ```

2. **Update App.tsx:**
   ```typescript
   // frontend/src/App.tsx
   import { getSession, signOutUser } from './lib/auth-client';

   const checkConfiguration = async () => {
     try {
       setLoading(true);

       // Check for existing session (from httpOnly cookie)
       const session = await getSession();

       if (session) {
         // User is authenticated
         setCurrentUser(session.user);
         // ... set up dashboard
         return;
       }

       // No session - check if setup is complete
       const checkResponse = await fetch('/api/v1/organization/setup/status');
       // ... rest of setup check
     } catch (err) {
       // ...
     }
   };
   ```

3. **Update logout:**
   ```typescript
   onLogout={async () => {
     try {
       await signOutUser();
     } catch (err) {
       console.warn('Logout error:', err);
     }

     // Clear any remaining local state
     localStorage.removeItem('helios_organization');

     // Reset state
     setConfig(null);
     setStats(null);
     checkConfiguration();
   }}
   ```

---

## TASK 6: Update Tests

**Objective:** Ensure Playwright tests work with new auth flow.

### Update auth.test.ts:

1. **Session-based assertions:**
   - Instead of checking localStorage for tokens, verify session cookie exists
   - Or check that authenticated API calls succeed

2. **Login flow:**
   - May need to update expected response format
   - Verify redirect to dashboard works

3. **Run tests:**
   ```bash
   cd openspec/testing && npx playwright test tests/core/auth.test.ts --headed
   ```

---

## TASK 7: Full Integration Test

**Objective:** Verify complete login/logout cycle works.

### Manual Test Checklist:

1. [ ] Clear browser data (cookies, localStorage)
2. [ ] Navigate to http://localhost:3000
3. [ ] Login page should appear (not setup screen)
4. [ ] Enter credentials: jack@example.com / password123
5. [ ] Should redirect to dashboard
6. [ ] Refresh page - should remain logged in
7. [ ] Click logout - should return to login
8. [ ] Try to access protected route - should redirect to login

### Automated Test:
```bash
cd openspec/testing && npx playwright test tests/core/auth.test.ts --headed
```

---

## Troubleshooting Guide

### Issue: "Setup screen showing instead of login"

**Possible Causes:**
1. `/api/v1/organization/setup/status` returning `isSetupComplete: false`
2. Organization doesn't exist in database
3. Network error calling setup status

**Debug:**
```bash
curl http://localhost:3001/api/v1/organization/setup/status
docker exec helios-db psql -U postgres -d helios_client -c "SELECT * FROM organizations;"
```

### Issue: "Login fails with better-auth"

**Possible Causes:**
1. User doesn't exist in organization_users with matching email
2. Password hash format incompatible
3. Better-auth config doesn't match database schema

**Debug:**
```bash
# Check user exists
docker exec helios-db psql -U postgres -d helios_client \
  -c "SELECT id, email, password_hash FROM organization_users WHERE email='jack@example.com';"

# Check better-auth logs
docker logs helios-backend --tail=50 | grep -i "auth\|better"
```

### Issue: "Session not persisting"

**Possible Causes:**
1. Cookie not being set (check httpOnly, secure flags)
2. CORS not allowing credentials
3. Session not being saved to auth_sessions table

**Debug:**
```bash
# Check sessions table
docker exec helios-db psql -U postgres -d helios_client \
  -c "SELECT * FROM auth_sessions ORDER BY created_at DESC LIMIT 5;"

# Check cookies in browser dev tools
# Network tab -> Response Headers -> Set-Cookie
```

---

## Success Metrics

1. **Login works:** Can authenticate with jack@example.com
2. **Session persists:** Refresh page stays logged in
3. **Logout works:** Clears session
4. **Tests pass:** Playwright auth tests succeed
5. **No regressions:** API key auth still works

---

## Notes for Agent

- Use `--headed` flag for Playwright to see what's happening
- Take screenshots at key steps for debugging
- If stuck, document the issue and ask for human guidance
- Prioritize getting login working over perfect architecture
- Check browser console for JavaScript errors
- Check network tab for failed API calls
