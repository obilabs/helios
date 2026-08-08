# Transparent Proxy Testing Strategy

**Date:** November 1, 2025
**Purpose:** Test Helios as a transparent, auditable gateway to Google Workspace APIs

---

## 🎯 Testing Philosophy (REVISED)

### Old Approach ❌:
```
Test if Helios implements every GAM feature correctly
Goal: Feature parity with GAM
Problem: Endless endpoint implementation
```

### New Approach ✅:
```
Test if Helios correctly proxies ANY Google API call
Goal: Transparent gateway with audit trail
Result: Future-proof, 100% coverage
```

---

## 🧪 Test Categories

### 1. **Proxy Correctness** (Does the proxy work?)
Test that requests are correctly forwarded to Google and responses are correctly returned.

### 2. **Audit Trail** (Is everything logged?)
Test that all proxied requests create proper audit log entries with actor attribution.

### 3. **Intelligent Sync** (Does data sync correctly?)
Test that relevant API responses automatically update Helios database.

### 4. **Actor Attribution** (Who did what?)
Test that service keys, vendor keys, and user requests are correctly attributed.

### 5. **Error Handling** (Does it fail gracefully?)
Test that Google errors are properly passed through and logged.

---

## 📋 Test Suite

### Category 1: Proxy Correctness

#### Test 1.1: Proxy User Creation
```typescript
describe('Transparent Proxy - User Creation', () => {
  test('Proxies Google user.insert() API', async () => {
    // Call Helios with Google's exact API format
    const response = await fetch(
      'http://localhost:3001/api/google/admin/directory/v1/users',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${heliosToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          primaryEmail: 'proxytest@domain.com',
          name: {
            givenName: 'Proxy',
            familyName: 'Test'
          },
          password: 'TempPassword123!'
        })
      }
    );

    const data = await response.json();

    // Verify response matches Google's API format
    expect(response.status).toBe(200);
    expect(data.id).toBeDefined(); // Google user ID
    expect(data.primaryEmail).toBe('proxytest@domain.com');
    expect(data.name.givenName).toBe('Proxy');

    // Verify in Google directly
    const googleUser = await googleAdminSDK.users.get({
      userKey: 'proxytest@domain.com'
    });

    expect(googleUser.data.id).toBe(data.id);

    // Cleanup
    await googleAdminSDK.users.delete({
      userKey: 'proxytest@domain.com'
    });
  });
});
```

#### Test 1.2: Proxy User Deletion
```typescript
test('Proxies Google user.delete() API', async () => {
  // Create test user in Google first
  const testUser = await googleAdminSDK.users.insert({
    requestBody: {
      primaryEmail: 'deletetest@domain.com',
      name: { givenName: 'Delete', familyName: 'Test' },
      password: 'TempPassword123!'
    }
  });

  // Delete via Helios proxy
  const response = await fetch(
    `http://localhost:3001/api/google/admin/directory/v1/users/${testUser.data.id}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${heliosToken}` }
    }
  );

  expect(response.status).toBe(204); // Google returns 204 for successful delete

  // Verify user is DELETED (not suspended) in Google
  await expect(
    googleAdminSDK.users.get({ userKey: testUser.data.id })
  ).rejects.toThrow(/404/); // User not found = deleted ✅
});
```

#### Test 1.3: Proxy Unknown Endpoint
```typescript
test('Proxies endpoints we never explicitly coded', async () => {
  // Call Gmail delegates API (not explicitly implemented in Helios)
  const response = await fetch(
    'http://localhost:3001/api/google/gmail/v1/users/me/settings/delegates',
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${heliosToken}` }
    }
  );

  // Should work if user has Gmail delegates
  expect(response.status).not.toBe(500); // Not a server error
  expect(response.status).not.toBe(404); // Not "endpoint not found"

  // Response should match Google's format
  const data = await response.json();
  expect(data).toHaveProperty('delegates'); // Google's response format
});
```

---

### Category 2: Audit Trail

#### Test 2.1: Audit Log Created for Every Request
```typescript
test('Creates audit log entry for proxied request', async () => {
  const beforeCount = await db.query('SELECT COUNT(*) FROM audit_logs');

  // Make proxied request
  await fetch('http://localhost:3001/api/google/admin/directory/v1/users', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${heliosToken}` }
  });

  const afterCount = await db.query('SELECT COUNT(*) FROM audit_logs');

  expect(Number(afterCount.rows[0].count)).toBe(
    Number(beforeCount.rows[0].count) + 1
  );

  // Verify audit log details
  const latestLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );

  expect(latestLog.rows[0].action).toBe('google_api_get');
  expect(latestLog.rows[0].request_path).toContain('admin/directory/v1/users');
  expect(latestLog.rows[0].status).toBe('success');
  expect(latestLog.rows[0].duration_ms).toBeGreaterThan(0);
});
```

#### Test 2.2: Audit Log Includes Request Body
```typescript
test('Logs request body for audit purposes', async () => {
  const requestBody = {
    primaryEmail: 'audit@domain.com',
    name: { givenName: 'Audit', familyName: 'Test' }
  };

  await fetch('http://localhost:3001/api/google/admin/directory/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${heliosToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const auditLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );

  const loggedBody = JSON.parse(auditLog.rows[0].request_body);
  expect(loggedBody.primaryEmail).toBe('audit@domain.com');
});
```

#### Test 2.3: Audit Log Includes Response Status
```typescript
test('Logs response status and body', async () => {
  await fetch('http://localhost:3001/api/google/admin/directory/v1/users/nonexistent@domain.com', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${heliosToken}` }
  });

  const auditLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );

  expect(auditLog.rows[0].response_status_code).toBe(404);
  expect(auditLog.rows[0].status).toBe('failure');
});
```

---

### Category 3: Intelligent Sync

#### Test 3.1: User Creation Syncs to Helios DB
```typescript
test('Auto-syncs created user to Helios database', async () => {
  // Create user via proxy
  const response = await fetch(
    'http://localhost:3001/api/google/admin/directory/v1/users',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${heliosToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        primaryEmail: 'synctest@domain.com',
        name: { givenName: 'Sync', familyName: 'Test' },
        password: 'TempPassword123!'
      })
    }
  );

  const googleUser = await response.json();

  // Verify synced to Helios DB
  const heliosUser = await db.query(
    'SELECT * FROM organization_users WHERE email = $1',
    ['synctest@domain.com']
  );

  expect(heliosUser.rows.length).toBe(1);
  expect(heliosUser.rows[0].google_workspace_id).toBe(googleUser.id);
  expect(heliosUser.rows[0].first_name).toBe('Sync');
  expect(heliosUser.rows[0].last_name).toBe('Test');
  expect(heliosUser.rows[0].platforms).toContain('google_workspace');

  // Cleanup
  await googleAdminSDK.users.delete({ userKey: googleUser.id });
});
```

#### Test 3.2: User Deletion Syncs to Helios DB
```typescript
test('Auto-syncs deleted user to Helios database', async () => {
  // Create user in Google
  const googleUser = await googleAdminSDK.users.insert({
    requestBody: {
      primaryEmail: 'deletesync@domain.com',
      name: { givenName: 'Delete', familyName: 'Sync' },
      password: 'TempPassword123!'
    }
  });

  // Create corresponding record in Helios
  await db.query(`
    INSERT INTO organization_users (organization_id, email, google_workspace_id, is_active)
    VALUES ($1, $2, $3, true)
  `, [organizationId, 'deletesync@domain.com', googleUser.data.id]);

  // Delete via proxy
  await fetch(
    `http://localhost:3001/api/google/admin/directory/v1/users/${googleUser.data.id}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${heliosToken}` }
    }
  );

  // Verify Helios DB updated
  const heliosUser = await db.query(
    'SELECT * FROM organization_users WHERE email = $1',
    ['deletesync@domain.com']
  );

  expect(heliosUser.rows[0].deleted_at).not.toBeNull();
  expect(heliosUser.rows[0].is_active).toBe(false);
  expect(heliosUser.rows[0].user_status).toBe('deleted');
});
```

#### Test 3.3: Group Creation Syncs to Helios DB
```typescript
test('Auto-syncs created group to Helios database', async () => {
  const response = await fetch(
    'http://localhost:3001/api/google/admin/directory/v1/groups',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${heliosToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'syncgroup@domain.com',
        name: 'Sync Group'
      })
    }
  );

  const googleGroup = await response.json();

  // Verify synced to Helios
  const heliosGroup = await db.query(
    'SELECT * FROM access_groups WHERE email = $1',
    ['syncgroup@domain.com']
  );

  expect(heliosGroup.rows.length).toBe(1);
  expect(heliosGroup.rows[0].google_workspace_id).toBe(googleGroup.id);

  // Cleanup
  await googleAdminSDK.groups.delete({ groupKey: googleGroup.id });
});
```

#### Test 3.4: Non-Synced Endpoints Don't Break
```typescript
test('Non-synced endpoints work without DB updates', async () => {
  // Call Calendar API (not synced to Helios DB)
  const response = await fetch(
    'http://localhost:3001/api/google/calendar/v3/users/me/calendarList',
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${heliosToken}` }
    }
  );

  // Should work
  expect(response.status).toBe(200);

  // Should be audited
  const auditLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );
  expect(auditLog.rows[0].request_path).toContain('calendar');

  // But no DB sync should happen (calendars not stored in Helios)
  // Just verify audit log exists, no other side effects
});
```

---

### Category 4: Actor Attribution

#### Test 4.1: User Requests Show User as Actor
```typescript
test('Regular user requests show user email as actor', async () => {
  // Login as user
  const userToken = await loginAsUser('jane.doe@company.com');

  await fetch('http://localhost:3001/api/google/admin/directory/v1/users', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });

  const auditLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );

  expect(auditLog.rows[0].actor_type).toBe('user');
  expect(auditLog.rows[0].actor_email).toBe('jane.doe@company.com');
});
```

#### Test 4.2: Service API Keys Show Service Name
```typescript
test('Service API key requests show service name as actor', async () => {
  // Create service API key
  const serviceKey = await createServiceApiKey({
    name: 'Terraform Automation',
    type: 'service',
    serviceConfig: {
      appName: 'Terraform',
      owner: 'devops@company.com'
    },
    permissions: ['users:write', 'groups:write']
  });

  await fetch('http://localhost:3001/api/google/admin/directory/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey.key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      primaryEmail: 'servicetest@domain.com',
      name: { givenName: 'Service', familyName: 'Test' },
      password: 'TempPassword123!'
    })
  });

  const auditLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );

  expect(auditLog.rows[0].actor_type).toBe('service');
  expect(auditLog.rows[0].actor_name).toBe('Terraform Automation');
  expect(auditLog.rows[0].service_owner).toBe('devops@company.com');

  // Cleanup
  await googleAdminSDK.users.delete({ userKey: 'servicetest@domain.com' });
});
```

#### Test 4.3: Vendor API Keys Require Actor Headers
```typescript
test('Vendor API key requests require X-Actor-Name and X-Actor-Email', async () => {
  // Create vendor API key
  const vendorKey = await createVendorApiKey({
    name: 'Acme IT Services',
    type: 'vendor',
    vendorConfig: {
      companyName: 'Acme IT',
      requireActorAttribution: true
    },
    permissions: ['users:write']
  });

  // Request WITHOUT actor headers - should fail
  const failResponse = await fetch(
    'http://localhost:3001/api/google/admin/directory/v1/users',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vendorKey.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        primaryEmail: 'vendortest@domain.com',
        name: { givenName: 'Vendor', familyName: 'Test' },
        password: 'TempPassword123!'
      })
    }
  );

  expect(failResponse.status).toBe(400);
  const failData = await failResponse.json();
  expect(failData.error).toContain('X-Actor-Name');
  expect(failData.error).toContain('X-Actor-Email');

  // Request WITH actor headers - should succeed
  const successResponse = await fetch(
    'http://localhost:3001/api/google/admin/directory/v1/users',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vendorKey.key}`,
        'X-Actor-Name': 'John Smith',
        'X-Actor-Email': 'john.smith@acmeit.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        primaryEmail: 'vendortest2@domain.com',
        name: { givenName: 'Vendor', familyName: 'Test2' },
        password: 'TempPassword123!'
      })
    }
  );

  expect(successResponse.status).toBe(200);

  // Verify audit log shows vendor AND human
  const auditLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );

  expect(auditLog.rows[0].actor_type).toBe('vendor');
  expect(auditLog.rows[0].vendor_name).toBe('Acme IT Services');
  expect(auditLog.rows[0].actor_name).toBe('John Smith');
  expect(auditLog.rows[0].actor_email).toBe('john.smith@acmeit.com');

  // Cleanup
  await googleAdminSDK.users.delete({ userKey: 'vendortest2@domain.com' });
});
```

---

### Category 5: Error Handling

#### Test 5.1: Google Errors Pass Through
```typescript
test('Returns Google error responses unchanged', async () => {
  // Try to get non-existent user
  const response = await fetch(
    'http://localhost:3001/api/google/admin/directory/v1/users/nonexistent@domain.com',
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${heliosToken}` }
    }
  );

  expect(response.status).toBe(404);

  const data = await response.json();
  expect(data.error).toBeDefined(); // Google's error format
  expect(data.error.message).toContain('not found'); // Google's error message
});
```

#### Test 5.2: Invalid Requests Are Logged
```typescript
test('Logs failed requests for debugging', async () => {
  // Send invalid request
  await fetch('http://localhost:3001/api/google/admin/directory/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${heliosToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // Missing required fields
      name: { givenName: 'Incomplete' }
    })
  });

  const auditLog = await db.query(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1'
  );

  expect(auditLog.rows[0].status).toBe('failure');
  expect(auditLog.rows[0].response_status_code).toBeGreaterThanOrEqual(400);
  expect(auditLog.rows[0].response_body).toContain('error');
});
```

---

## 🚀 Test Execution Plan

### Phase 1: Proxy Correctness (Day 1)
Run tests 1.1, 1.2, 1.3
**Goal:** Verify requests are correctly proxied to Google

### Phase 2: Audit Trail (Day 1)
Run tests 2.1, 2.2, 2.3
**Goal:** Verify all requests are logged

### Phase 3: Intelligent Sync (Day 2)
Run tests 3.1, 3.2, 3.3, 3.4
**Goal:** Verify relevant data syncs to Helios DB

### Phase 4: Actor Attribution (Day 2)
Run tests 4.1, 4.2, 4.3
**Goal:** Verify correct actor identification

### Phase 5: Error Handling (Day 3)
Run tests 5.1, 5.2
**Goal:** Verify errors are handled correctly

---

## ✅ Success Criteria

### Proxy Working:
- ✅ All known endpoints proxy correctly
- ✅ Unknown endpoints proxy correctly
- ✅ Responses match Google's format
- ✅ Google API behavior is preserved

### Audit Trail Working:
- ✅ Every request creates audit log
- ✅ Logs include request body
- ✅ Logs include response status
- ✅ Logs include actor information
- ✅ Logs include timing information

### Intelligent Sync Working:
- ✅ User create/update/delete syncs
- ✅ Group create/update/delete syncs
- ✅ OU operations sync
- ✅ Aliases sync
- ✅ Delegates sync
- ✅ Non-synced endpoints don't break

### Actor Attribution Working:
- ✅ User requests show user email
- ✅ Service keys show service name
- ✅ Vendor keys show vendor + human
- ✅ Vendor keys without actor headers are rejected

---

## 📊 Test Results Format

```json
{
  "testRun": {
    "date": "2025-11-01",
    "architecture": "transparent-proxy",
    "version": "2.0"
  },
  "summary": {
    "total": 18,
    "pass": 18,
    "fail": 0
  },
  "categories": {
    "proxyCorrectness": { "pass": 3, "fail": 0 },
    "auditTrail": { "pass": 3, "fail": 0 },
    "intelligentSync": { "pass": 4, "fail": 0 },
    "actorAttribution": { "pass": 3, "fail": 0 },
    "errorHandling": { "pass": 2, "fail": 0 }
  },
  "details": [...]
}
```

---

## 💡 Key Insights

### This Testing Strategy Validates:
1. **Future-Proofing:** Unknown endpoints work without code changes
2. **Transparency:** Users get Google's real API behavior
3. **Auditability:** Every action is logged with full context
4. **Intelligence:** Relevant data auto-syncs to Helios
5. **Attribution:** Clear visibility into WHO did WHAT

### This Is Different From Traditional Testing Because:
- We're NOT testing if we correctly implement Google's features
- We ARE testing if we correctly PROXY Google's features
- Success = Google's behavior + our audit trail + our sync logic

---

Ready to implement the transparent proxy middleware?
