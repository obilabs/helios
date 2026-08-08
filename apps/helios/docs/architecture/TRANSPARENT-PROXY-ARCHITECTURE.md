# Transparent Proxy Gateway Architecture

## 🎯 Vision

**Helios is NOT a reimplementation of Google Workspace APIs.**
**Helios IS a transparent, auditable gateway TO Google Workspace APIs.**

### The Principle:
```
User makes real Google API call → Helios intercepts → Logs → Proxies → Syncs → Returns Google response

Result:
- User gets Google's real API behavior
- Helios gets full audit trail
- Helios DB stays in sync automatically
- Future Google API endpoints work immediately
```

---

## 🏗️ Architecture Components

### 1. Dynamic Route Matching

```typescript
// backend/src/middleware/transparent-proxy.ts

import { Router, Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

export const transparentProxyRouter = Router();

/**
 * Catch-all route for Google Workspace API proxying
 *
 * Examples:
 *   POST /api/google/admin/directory/v1/users
 *   GET  /api/google/admin/directory/v1/users
 *   POST /api/google/admin/directory/v1/users/:userKey/aliases
 *   GET  /api/google/gmail/v1/users/:userId/settings/delegates
 *   ANY  /api/google/**/* → proxied to Google
 */
transparentProxyRouter.all('/api/google/*', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Extract Google API path from Helios path
    const googleApiPath = req.path.replace('/api/google/', '');

    // Example: /api/google/admin/directory/v1/users
    //       →  admin/directory/v1/users

    const proxyRequest = {
      method: req.method,
      path: googleApiPath,
      body: req.body,
      query: req.query,
      headers: req.headers
    };

    // Pass to proxy handler
    return await handleProxyRequest(req, res, proxyRequest);

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Proxy failed',
      message: error.message
    });
  }
});
```

---

### 2. Request Interceptor (Audit + Validation)

```typescript
async function handleProxyRequest(req: Request, res: Response, proxyRequest: any) {
  const startTime = Date.now();

  // 1. EXTRACT ACTOR INFO
  const actor = extractActor(req);

  // 2. CREATE AUDIT LOG ENTRY (REQUEST STARTED)
  const auditId = await db.query(`
    INSERT INTO audit_logs (
      organization_id,
      action,
      actor_type,
      actor_id,
      actor_name,
      actor_email,
      target_type,
      target_id,
      request_method,
      request_path,
      request_body,
      status,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    RETURNING id
  `, [
    req.user.organizationId,
    `google_api_${proxyRequest.method.toLowerCase()}`,
    actor.type,  // 'user', 'service', 'vendor'
    actor.id,
    actor.name,
    actor.email,
    'google_api',
    proxyRequest.path,
    proxyRequest.method,
    proxyRequest.path,
    JSON.stringify(proxyRequest.body),
    'in_progress'
  ]);

  // 3. GET GOOGLE CREDENTIALS
  const googleCreds = await getGoogleCredentials(req.user.organizationId);

  if (!googleCreds) {
    return res.status(400).json({
      success: false,
      error: 'Google Workspace not configured'
    });
  }

  // 4. PROXY TO GOOGLE
  const googleResponse = await proxyToGoogle(
    proxyRequest,
    googleCreds
  );

  // 5. INTELLIGENT SYNC (if relevant endpoint)
  await intelligentSync(proxyRequest, googleResponse, req.user.organizationId);

  // 6. UPDATE AUDIT LOG (REQUEST COMPLETED)
  const duration = Date.now() - startTime;
  await db.query(`
    UPDATE audit_logs
    SET
      status = $1,
      response_status_code = $2,
      response_body = $3,
      duration_ms = $4,
      completed_at = NOW()
    WHERE id = $5
  `, [
    googleResponse.status >= 200 && googleResponse.status < 300 ? 'success' : 'failure',
    googleResponse.status,
    JSON.stringify(googleResponse.data),
    duration,
    auditId.rows[0].id
  ]);

  // 7. RETURN GOOGLE'S RESPONSE
  return res.status(googleResponse.status).json(googleResponse.data);
}

function extractActor(req: Request) {
  // Check if request is from service API key
  if (req.user?.keyType === 'service') {
    return {
      type: 'service',
      id: req.user.apiKeyId,
      name: req.user.serviceName,
      email: req.user.serviceEmail
    };
  }

  // Check if request is from vendor API key
  if (req.user?.keyType === 'vendor') {
    return {
      type: 'vendor',
      id: req.user.apiKeyId,
      name: req.headers['x-actor-name'],  // Required for vendor keys!
      email: req.headers['x-actor-email'] // Required for vendor keys!
    };
  }

  // Regular user
  return {
    type: 'user',
    id: req.user.userId,
    name: `${req.user.firstName} ${req.user.lastName}`,
    email: req.user.email
  };
}
```

---

### 3. Google API Proxy (The Magic)

```typescript
async function proxyToGoogle(proxyRequest: any, googleCreds: any) {
  // Create authenticated Google client
  const jwtClient = new JWT({
    email: googleCreds.client_email,
    key: googleCreds.private_key,
    scopes: [
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.group',
      'https://www.googleapis.com/auth/admin.directory.orgunit',
      'https://www.googleapis.com/auth/gmail.settings.basic',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive'
    ],
    subject: googleCreds.admin_email
  });

  // Make authenticated request to Google
  const url = `https://www.googleapis.com/${proxyRequest.path}`;

  const response = await jwtClient.request({
    method: proxyRequest.method,
    url: url,
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

---

### 4. Intelligent Sync (Auto-Update Helios DB)

```typescript
async function intelligentSync(
  proxyRequest: any,
  googleResponse: any,
  organizationId: string
) {
  // Only sync if request was successful
  if (googleResponse.status < 200 || googleResponse.status >= 300) {
    return; // Don't sync failed requests
  }

  // Parse the path to determine resource type
  const pathParts = proxyRequest.path.split('/');

  // Example paths:
  // admin/directory/v1/users → resource = 'users'
  // admin/directory/v1/users/john@company.com → resource = 'users'
  // admin/directory/v1/groups → resource = 'groups'

  const resource = identifyResource(pathParts);

  if (!resource) {
    // Not a resource we sync (e.g., calendar, drive)
    logger.info('Proxy request to non-synced resource', { path: proxyRequest.path });
    return;
  }

  // INTELLIGENT SYNC BASED ON ACTION
  switch (resource) {
    case 'users':
      await syncUserFromResponse(proxyRequest, googleResponse, organizationId);
      break;

    case 'groups':
      await syncGroupFromResponse(proxyRequest, googleResponse, organizationId);
      break;

    case 'orgunits':
      await syncOrgUnitFromResponse(proxyRequest, googleResponse, organizationId);
      break;

    case 'aliases':
      await syncAliasFromResponse(proxyRequest, googleResponse, organizationId);
      break;

    case 'delegates':
      await syncDelegateFromResponse(proxyRequest, googleResponse, organizationId);
      break;
  }
}

function identifyResource(pathParts: string[]): string | null {
  // admin/directory/v1/users → 'users'
  // admin/directory/v1/groups → 'groups'
  // admin/directory/v1/users/:userKey/aliases → 'aliases'

  if (pathParts.includes('users')) {
    if (pathParts.includes('aliases')) return 'aliases';
    if (pathParts.includes('delegates')) return 'delegates';
    return 'users';
  }

  if (pathParts.includes('groups')) return 'groups';
  if (pathParts.includes('orgunits')) return 'orgunits';

  return null; // Not a resource we sync
}

async function syncUserFromResponse(
  proxyRequest: any,
  googleResponse: any,
  organizationId: string
) {
  const method = proxyRequest.method;
  const responseData = googleResponse.data;

  // CREATE USER
  if (method === 'POST' && responseData.id) {
    await db.query(`
      INSERT INTO organization_users (
        organization_id,
        email,
        first_name,
        last_name,
        google_workspace_id,
        is_active,
        platforms,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), NOW())
      ON CONFLICT (organization_id, email)
      DO UPDATE SET
        google_workspace_id = EXCLUDED.google_workspace_id,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = NOW()
    `, [
      organizationId,
      responseData.primaryEmail,
      responseData.name?.givenName,
      responseData.name?.familyName,
      responseData.id,
      ['google_workspace']
    ]);

    logger.info('Synced user from proxy request', {
      email: responseData.primaryEmail,
      googleId: responseData.id
    });
  }

  // DELETE USER
  if (method === 'DELETE') {
    // Extract user email from path
    const userKey = extractUserKeyFromPath(proxyRequest.path);

    await db.query(`
      UPDATE organization_users
      SET
        deleted_at = NOW(),
        user_status = 'deleted',
        is_active = false,
        updated_at = NOW()
      WHERE organization_id = $1
        AND (email = $2 OR google_workspace_id = $2)
    `, [organizationId, userKey]);

    logger.info('Synced user deletion from proxy request', { userKey });
  }

  // UPDATE USER
  if (method === 'PATCH' || method === 'PUT') {
    // Similar logic for updates
    // ...
  }

  // LIST USERS (GET with no specific user)
  if (method === 'GET' && responseData.users) {
    // Batch sync all users from list
    for (const user of responseData.users) {
      await syncSingleUser(user, organizationId);
    }

    logger.info('Synced user list from proxy request', {
      count: responseData.users.length
    });
  }
}
```

---

## 💡 Key Benefits

### 1. **Future-Proof**
```
Google releases new API endpoint?
→ It works in Helios immediately
→ Zero code changes needed
```

### 2. **100% API Coverage**
```
Need Gmail delegation API?  ✅ Works
Need Calendar sharing API?  ✅ Works
Need Drive permissions API? ✅ Works
Need Admin Reports API?     ✅ Works

You don't need to build 200+ endpoints
Just proxy them all!
```

### 3. **Perfect Audit Trail**
```
Every API call = Audit log entry
- Who made it (user/service/vendor+human)
- What endpoint
- What body
- What response
- How long it took
```

### 4. **Zero Breaking Changes**
```
User: "I'm calling Google's API"
Reality: "You're calling Helios which calls Google"
User doesn't know or care!

Benefits:
- Helios gets audit trail
- Helios DB stays in sync
- User gets Google's real behavior
```

### 5. **Enable Advanced Admins**
```bash
# Admin reads Google's API docs
curl -X POST https://admin.googleapis.com/admin/directory/v1/users/:userKey/aliases \
  -d '{"alias": "newalias@domain.com"}'

# They just change the domain to Helios
curl -X POST https://helios.company.com/api/google/admin/directory/v1/users/:userKey/aliases \
  -H "Authorization: Bearer helios_token_123" \
  -d '{"alias": "newalias@domain.com"}'

# Done!
# - Helios logs it
# - Google gets the request
# - DB syncs the alias
# - No UI needed
```

---

## 🎯 Implementation Priorities

### Phase 1: Proxy Foundation (1 week)
1. **Dynamic route matching** (`/api/google/*` → proxy)
2. **Request interceptor** (auth, actor extraction, audit log start)
3. **Google proxy** (credential swap, forward request)
4. **Response interceptor** (audit log complete, return response)

### Phase 2: Intelligent Sync (1 week)
5. **Resource identification** (parse path to identify users/groups/etc)
6. **Sync users** on create/update/delete/list
7. **Sync groups** on create/update/delete/list
8. **Sync delegates, aliases, OUs**

### Phase 3: Multi-Platform (1 week)
9. **Add Microsoft 365** proxy (`/api/microsoft/*` → MS Graph)
10. **Add Okta** proxy (`/api/okta/*` → Okta API)
11. **Unified audit trail** across all platforms

### Phase 4: UI for Common Actions (1 week)
12. **Build UI for top 10 actions** (still backed by proxy!)
13. **Document API** for advanced usage

---

## 🧪 Testing Strategy (REVISED)

### Test 1: Proxy Correctness
```typescript
test('Proxies Google user creation', async () => {
  // Call Helios with Google's exact API format
  const response = await fetch('http://localhost:3001/api/google/admin/directory/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${heliosToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      primaryEmail: 'test@domain.com',
      name: { givenName: 'Test', familyName: 'User' },
      password: 'TempPass123!'
    })
  });

  // Verify response matches Google's format
  expect(response.status).toBe(200);
  expect(response.data.id).toBeDefined();
  expect(response.data.primaryEmail).toBe('test@domain.com');
});
```

### Test 2: Audit Trail
```typescript
test('Logs all proxied requests', async () => {
  await proxyRequest('POST', '/api/google/admin/directory/v1/users', userData);

  const auditLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );

  expect(auditLog.rows[0].action).toBe('google_api_post');
  expect(auditLog.rows[0].request_path).toContain('/users');
  expect(auditLog.rows[0].status).toBe('success');
});
```

### Test 3: Intelligent Sync
```typescript
test('Syncs users to Helios DB on create', async () => {
  await proxyRequest('POST', '/api/google/admin/directory/v1/users', {
    primaryEmail: 'sync-test@domain.com',
    name: { givenName: 'Sync', familyName: 'Test' }
  });

  // Verify user exists in Helios DB
  const user = await db.query(
    'SELECT * FROM organization_users WHERE email = $1',
    ['sync-test@domain.com']
  );

  expect(user.rows.length).toBe(1);
  expect(user.rows[0].google_workspace_id).toBeDefined();
});
```

### Test 4: Unknown Endpoints Work
```typescript
test('Proxies unknown endpoints without breaking', async () => {
  // Call an endpoint we never explicitly coded
  const response = await proxyRequest(
    'GET',
    '/api/google/admin/reports/v1/activity/users/all/applications/login'
  );

  // Should work if Google supports it
  expect(response.status).not.toBe(500);

  // Should be audited
  const auditLog = await getLatestAuditLog();
  expect(auditLog.request_path).toContain('reports');
});
```

---

## 🚀 Example Usage

### For Normal Users (via UI):
```
User clicks "Add Delegate" button in UI
→ UI calls: POST /api/helios/users/:id/delegates (Helios convenience endpoint)
→ Helios internally calls: POST /api/google/gmail/v1/users/:id/settings/delegates
→ Proxied to Google
→ Delegate synced to DB
→ UI shows success
```

### For Advanced Admins (via API):
```bash
# Read Google's docs, use Helios instead of Google
curl -X POST https://helios.company.com/api/google/admin/directory/v1/users \
  -H "Authorization: Bearer $HELIOS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "primaryEmail": "newuser@company.com",
    "name": {
      "givenName": "New",
      "familyName": "User"
    },
    "password": "TempPassword123!",
    "orgUnitPath": "/Engineering/Backend"
  }'

# Response is Google's real response
# But Helios logged it + synced to DB
```

### For Terraform (via Service API Key):
```hcl
# terraform.tf
resource "helios_google_user" "engineer" {
  primary_email = "engineer@company.com"
  given_name    = "Jane"
  family_name   = "Engineer"
  org_unit_path = "/Engineering"
}

# Under the hood:
# POST https://helios.company.com/api/google/admin/directory/v1/users
# Authorization: Bearer helios_service_terraform_prod_abc123
#
# Helios logs:
# - Actor: Service "Terraform Automation" (owner: devops@company.com)
# - Action: Created user engineer@company.com
# - Result: Success
```

### For MSPs (via Vendor API Key):
```bash
# MSP tech uses their vendor key
curl -X DELETE https://helios.acmecorp.com/api/google/admin/directory/v1/users/olduser@acmecorp.com \
  -H "Authorization: Bearer helios_vendor_acmeit_xyz789" \
  -H "X-Actor-Name: John Smith" \
  -H "X-Actor-Email: john.smith@acmeit.com"

# Helios logs:
# - Actor: Vendor "Acme IT Services" → Human "John Smith (john.smith@acmeit.com)"
# - Action: Deleted user olduser@acmecorp.com
# - Result: Success
#
# Client sees in audit dashboard:
# "John Smith from Acme IT Services deleted user olduser@acmecorp.com at 2:30 PM"
```

---

## ✅ Summary

**You've discovered the RIGHT architecture:**

❌ Don't: Build 200+ custom endpoints that mirror Google's API
✅ Do: Build ONE dynamic proxy that works with ANY Google API endpoint

**Benefits:**
1. Future-proof (new Google endpoints work immediately)
2. 100% API coverage (no gaps)
3. Full audit trail (every call logged)
4. Intelligent sync (relevant data auto-syncs to Helios DB)
5. Enable all skill levels (UI for basics, API for advanced)
6. Transparent (users get Google's real API behavior)

**This is what makes Helios unique.**

Not "yet another admin console"
But "auditable gateway to everything"

---

Next: Should I start implementing the transparent proxy middleware?
