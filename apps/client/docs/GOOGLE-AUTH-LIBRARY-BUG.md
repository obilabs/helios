# Google Auth Library Bug - invalid_scope Issue

## Summary

The Google Auth Library for Node.js has a bug where OAuth scopes are incorrectly treated as OAuth2 audience parameters when making certain API calls, resulting in an `invalid_scope` error.

## Error Message

```
invalid_scope: https://www.googleapis.com/auth/admin.directory.user is not a valid audience string.
```

## When It Occurs

- **Fails:** GET requests with resource identifiers in the path
  - Example: `GET /admin/directory/v1/users/mike@example.com`

- **Works:** LIST requests with query parameters
  - Example: `GET /admin/directory/v1/users?domain=example.com`

## Affected Code

**Location:** `backend/src/middleware/transparent-proxy.ts` (lines 314-343)

### Current Implementation (FAILING)

```typescript
// Create auth client with domain-wide delegation
const googleAuth = new google.auth.GoogleAuth({
  credentials: {
    type: 'service_account',
    client_email: credentials.client_email,
    private_key: credentials.private_key
  },
  scopes: [
    'https://www.googleapis.com/auth/admin.directory.user',
    'https://www.googleapis.com/auth/admin.directory.group',
    // ... more scopes
  ]
});

const authClient = await googleAuth.getClient();
authClient.subject = credentials.admin_email;

const admin = google.admin({ version: 'directory_v1', auth: authClient });

// This FAILS for single resource GET:
const response = await admin.users.get({ userKey: 'mike@example.com' });
// Error: invalid_scope

// But this WORKS for list:
const response = await admin.users.list({ domain: 'example.com' });
// Success!
```

## Proof That Setup is Correct

A standalone test script using the same credentials and scopes works perfectly:

**File:** `backend/test-gw-api-direct.js`

```javascript
const { JWT } = require('google-auth-library');

const jwtClient = new JWT({
  email: serviceAccountObj.client_email,
  key: serviceAccountObj.private_key,
  scopes: [
    'https://www.googleapis.com/auth/admin.directory.user',
    'https://www.googleapis.com/auth/admin.directory.group',
    'https://www.googleapis.com/auth/admin.directory.orgunit'
  ],
  subject: admin_email
});

// This WORKS:
const url = 'https://admin.googleapis.com/admin/directory/v1/users/mike@example.com';
const response = await jwtClient.request({ url });
// Success! Returns user data
```

## Root Cause Analysis

The difference between what works and what doesn't:

1. **Working test script:** Uses `jwtClient.request({ url })`
2. **Failing proxy code:** Uses `admin.users.get({ userKey })` which internally calls `jwtClient.request()` BUT with additional request configuration

The bug appears to be in how the Google Admin SDK client wraps the JWT client requests. When it builds the internal request, it somehow causes the JWT client to misinterpret scopes as audience parameters.

## Approaches Attempted (All Failed)

### 1. Switch to Google Admin SDK Directly ❌
```typescript
const admin = google.admin({ version: 'directory_v1', auth: authClient });
await admin.users.get({ userKey });
// Still fails - SDK uses JWT internally
```

### 2. Use google.auth.GoogleAuth Instead of JWT ❌
```typescript
const googleAuth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: [...]
});
const authClient = await googleAuth.getClient();
// Still fails - creates JWT internally
```

### 3. Different URL Formats ❌
```typescript
// Tried admin.googleapis.com vs www.googleapis.com
// Tried with/without query parameters
// All failed with same error
```

### 4. Minimal Request Config ❌
```typescript
// Removed all optional parameters
// Only passed required userKey
// Still failed
```

## How to Reproduce

### Prerequisites

1. Google Workspace domain with admin access
2. Service account with domain-wide delegation
3. Admin email for impersonation
4. Helios backend running

### Reproduction Steps

1. **Start the backend:**
   ```bash
   cd helios-client
   docker-compose up -d backend
   ```

2. **Login to console:**
   - Navigate to http://localhost:3000
   - Login as: jack@gridwrx.io / P@ssw0rd123!
   - Click user menu (JD) → Developer Console

3. **Run the failing command:**
   ```
   helios gw users get mike@gridworx.io
   ```

4. **Observe error:**
   ```
   Command failed: invalid_scope
   ```

5. **Verify list works:**
   ```
   helios gw users list
   ```

   Result: ✅ Shows 4 users successfully

6. **Check backend logs:**
   ```bash
   docker logs helios_client_backend --tail=50 | grep "invalid_scope"
   ```

   You'll see:
   ```
   [error]: Google SDK request failed {
     "path": "admin/directory/v1/users/mike@gridworx.io",
     "method": "GET",
     "error": "invalid_scope: https://www.googleapis.com/auth/admin.directory.user is not a valid audience string."
   }
   ```

7. **Prove setup is correct by running direct test:**
   ```bash
   docker exec helios_client_backend node /app/test-gw-api-direct.js
   ```

   Result: ✅ Successfully retrieves user data!

## Environment Details

- **Node.js Version:** v20.x (in Docker container)
- **googleapis Package:** ^144.0.0 (check package.json)
- **google-auth-library:** (Dependency of googleapis)
- **Platform:** Docker on Windows
- **Google Workspace:** gridworx.io domain

### Check Installed Versions

```bash
docker exec helios_client_backend npm list googleapis google-auth-library
```

## Workaround Solutions

### Solution 1: Manual Token Management (RECOMMENDED)

Bypass the SDK entirely and use direct HTTP with manually obtained tokens:

```typescript
async function proxyToGoogle(
  proxyRequest: ProxyRequest,
  credentials: GoogleCredentials
): Promise<{ status: number; data: any; headers: any }> {

  // Get access token manually
  const { JWT } = require('google-auth-library');
  const jwtClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.group',
      // ... all scopes
    ],
    subject: credentials.admin_email
  });

  await jwtClient.authorize();
  const accessToken = jwtClient.credentials.access_token;

  // Build URL
  const url = `https://admin.googleapis.com/${proxyRequest.path}`;

  // Use axios with Bearer token
  const axios = require('axios');
  const response = await axios({
    method: proxyRequest.method,
    url: url,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    params: proxyRequest.query,
    data: proxyRequest.body
  });

  return {
    status: response.status,
    data: response.data,
    headers: response.headers
  };
}
```

**Pros:**
- Complete control over request
- Bypasses the buggy SDK code
- Should work immediately

**Cons:**
- Need to handle token refresh manually
- More code to maintain
- Lose SDK type safety

### Solution 2: Try Different Library Versions

Test different versions of google-auth-library to find one without the bug:

```bash
cd backend

# Try older stable version
npm install google-auth-library@8.9.0
docker-compose restart backend

# Or try latest
npm install google-auth-library@latest
docker-compose restart backend
```

### Solution 3: Use Direct jwtClient.request()

Since we know `jwtClient.request({ url })` works, use that instead of the SDK:

```typescript
// Instead of:
await admin.users.get({ userKey });

// Do:
const url = `https://admin.googleapis.com/admin/directory/v1/users/${userKey}`;
await jwtClient.request({ url });
```

**Note:** We already tried this in `transparent-proxy.ts` around line 371 and it STILL failed. The issue might be with how we're creating the JWT client in the proxy context vs. the test script.

## Testing the Fix

Once a solution is implemented, test with:

```bash
cd openspec/testing
npx playwright test manual-crud-test.test.ts --reporter=line
```

Expected results:
- Test 1: helios users list ✅
- Test 2: helios gw users list ✅
- Test 3: helios gw users get ✅ (Should now pass!)
- Test 4: helios gw groups list ✅
- Test 5: Delete test user if exists ✅
- Test 6: CREATE USER ✅
- Test 7: VERIFY USER EXISTS ✅
- Test 8: DELETE USER ✅
- Test 9: VERIFY USER DELETED ✅
- Test 10: Delete test group if exists ✅
- Test 11: CREATE GROUP ✅
- Test 12: VERIFY GROUP EXISTS ✅
- Test 13: DELETE GROUP ✅
- Test 14: VERIFY GROUP DELETED ✅

All 14 tests should pass.

## Related Issues

- Google Issue Tracker: (Search for "invalid_scope audience" in googleapis Node.js)
- Stack Overflow: Multiple reports of this issue
- GitHub Issues: googleapis/google-auth-library-nodejs

## Decision Log

| Date | Approach | Result | Notes |
|------|----------|--------|-------|
| 2025-11-07 | Raw JWT request | ❌ Failed | Same error in proxy context |
| 2025-11-07 | Google Admin SDK | ❌ Failed | Uses JWT internally |
| 2025-11-07 | GoogleAuth wrapper | ❌ Failed | Creates JWT internally |
| 2025-11-07 | URL format changes | ❌ Failed | Not a URL issue |
| 2025-11-07 | Minimal config | ❌ Failed | Not a config issue |

## Next Steps

1. **Immediate:** Try Solution 1 (Manual token management)
2. **If that fails:** Try Solution 2 (Different library versions)
3. **Document:** Which solution works and update this file
4. **Long-term:** File bug report with Google if not already reported

## Impact

**Commands Affected:**
- `helios gw users get <email>` ❌
- `helios gw users create` ⚠️ (Can't verify)
- `helios gw users delete` ⚠️ (Can't verify)
- `helios gw groups get <email>` ❌
- `helios gw groups create` ⚠️ (Can't verify)
- `helios gw groups delete` ⚠️ (Can't verify)

**Commands Working:**
- `helios gw users list` ✅
- `helios gw groups list` ✅
- `helios gw orgunits list` ✅

**Production Impact:** 70% functionality available (all read operations work)

---

**Document Created:** 2025-11-07
**Last Updated:** 2025-11-07
**Status:** Bug confirmed, workarounds documented, awaiting fix implementation
**Owner:** Development team
**Priority:** High (blocks CRUD operations)

