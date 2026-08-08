# GAM Feature Parity Testing Guide

## 🎯 Purpose

Test Helios APIs against Google Workspace Admin SDK to verify feature parity with GAM.

**Testing Philosophy:**
1. **API-First:** Test backend endpoints before UI
2. **Verify with Source of Truth:** Confirm all actions with direct Google Admin SDK calls
3. **Fast Iteration:** Record results and move on (don't fix during testing)
4. **Evidence-Based:** Let test results drive implementation priorities

---

## 🚀 Quick Start

### Prerequisites

1. **Google Workspace Admin Access**
   - Super admin account
   - Service account with domain-wide delegation configured
   - Service account JSON key file

2. **Helios Running Locally**
   ```bash
   docker-compose up -d
   cd backend && npm run dev
   cd frontend && npm run dev
   ```

3. **Helios Admin Token**
   - Login to Helios
   - Get JWT token from browser localStorage: `helios_token`

---

### Run Tests

#### Step 1: Set Environment Variables

Create `.env.test` in project root:

```bash
# Helios API
HELIOS_API_URL=http://localhost:3001
HELIOS_AUTH_TOKEN=your_jwt_token_here

# Google Workspace
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"..."}'
GOOGLE_ADMIN_EMAIL=admin@yourdomain.com
TEST_DOMAIN=yourdomain.com
```

#### Step 2: Run Test Suite

```bash
cd backend
npx ts-node src/scripts/test-gam-parity.ts
```

---

## 📊 Test Output

### Console Output Example:

```
============================================================
🚀 GAM FEATURE PARITY TEST SUITE
============================================================

Configuration:
  Helios API: http://localhost:3001
  Test Domain: yourcompany.com
  Google Admin: admin@yourcompany.com

============================================================
🔴 PRIORITY 0 - CRITICAL FEATURES
============================================================

🧪 Testing: Create User
   Test email: test-create-1730505123456@yourcompany.com
   📡 Calling Helios API...
   🔍 Verifying in Google Workspace...
   ⚠️  PARTIAL - Not synced to Google
   🧹 Cleanup: Test user deleted

🧪 Testing: Delete User
   Creating test user: test-delete-1730505125678@yourcompany.com
   📡 Calling Helios DELETE API...
   🔍 Verifying deletion in Google...
   ❌ CRITICAL: User suspended instead of deleted

... (more tests)

============================================================
📊 TEST RESULTS SUMMARY
============================================================

Total Tests: 5
✅ Pass: 1
⚠️  Partial: 2
❌ Fail: 2
⭕ Not Implemented: 0

------------------------------------------------------------
DETAILED RESULTS:
------------------------------------------------------------

⚠️  Create User (CRITICAL)
   Status: PARTIAL
   GAM Command: gam create user test@domain.com firstname Test lastname User password Secret123!
   Notes: User created in Helios but not synced to Google Workspace

❌ Delete User (CRITICAL)
   Status: FAIL
   GAM Command: gam delete user <email>
   Notes: ⚠️  CRITICAL BUG: User was SUSPENDED, not DELETED! This means the organization is still being billed for this license!

... (more results)

📄 Full report saved to: ./gam-test-results.json
============================================================
```

---

## 📝 Test Results File

Results saved to `gam-test-results.json`:

```json
{
  "testRun": {
    "date": "2025-11-01T20:30:00.000Z",
    "environment": "dev",
    "domain": "yourcompany.com"
  },
  "summary": {
    "total": 5,
    "pass": 1,
    "partial": 2,
    "fail": 2,
    "notImplemented": 0
  },
  "results": [
    {
      "id": "USER_001",
      "feature": "Create User",
      "gamCommand": "gam create user ...",
      "priority": "CRITICAL",
      "heliosApiExists": true,
      "heliosSuccess": true,
      "googleVerified": false,
      "status": "PARTIAL",
      "notes": "User created in Helios but not synced to Google Workspace",
      "timestamp": "2025-11-01T20:30:01.234Z"
    }
  ]
}
```

---

## 🧪 Test Scenarios

### P0 Critical Tests (Currently Implemented)

1. **Create User** (`USER_001`)
   - Creates user via Helios API
   - Verifies user exists in Google Workspace
   - Checks if attributes match
   - **Expected Result:** User in both Helios and Google

2. **Delete User** (`USER_002`)
   - Creates test user in Google
   - Deletes via Helios API
   - Verifies user is **DELETED** (not suspended) in Google
   - **Expected Result:** User not found in Google (404 error)
   - **Critical Check:** Ensures license is freed

3. **Suspend User** (`USER_003`)
   - Creates test user in Google
   - Suspends via Helios API
   - Verifies user is suspended in Google
   - **Expected Result:** `user.suspended === true` in Google

4. **List Users** (`USER_004`)
   - Fetches users from Helios API
   - Fetches users from Google Admin SDK
   - Compares counts
   - **Expected Result:** Reasonable match (Helios may have local-only users)

5. **Create Group** (`GROUP_001`)
   - Creates group via Helios API
   - Verifies group exists in Google
   - **Expected Result:** Group in both Helios and Google

---

## 🔧 Adding More Tests

### Test Template:

```typescript
async testYourFeature(): Promise<TestResult> {
  const testId = 'FEATURE_001';
  const feature = 'Your Feature Name';

  console.log(`\n🧪 Testing: ${feature}`);

  const result: TestResult = {
    id: testId,
    feature,
    gamCommand: 'gam command here',
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM',
    heliosApiExists: false,
    heliosSuccess: false,
    googleVerified: false,
    status: 'FAIL',
    notes: '',
    timestamp: new Date().toISOString()
  };

  try {
    // 1. Call Helios API
    const heliosResponse = await this.callHeliosAPI('METHOD', '/endpoint', body);
    result.heliosApiExists = heliosResponse.status !== 404;
    result.heliosSuccess = heliosResponse.status === 200;

    // 2. Verify in Google
    const googleResponse = await this.adminClient.yourMethod({ ... });
    result.googleVerified = /* your condition */;

    // 3. Determine status
    if (result.heliosSuccess && result.googleVerified) {
      result.status = 'PASS';
      result.notes = 'Success message';
    } else {
      result.status = 'PARTIAL' or 'FAIL';
      result.notes = 'What went wrong';
    }

  } catch (error: any) {
    result.error = error.message;
  }

  this.results.push(result);
  return result;
}
```

### Add to `runAllTests()`:

```typescript
await this.testYourFeature();
```

---

## 📋 Next Steps After Testing

### 1. Review Results

```bash
cat gam-test-results.json | jq '.summary'
```

### 2. Prioritize Failures

**Critical Bugs** (Fix immediately):
- Delete user suspends instead of deletes
- Security vulnerabilities
- Data corruption risks

**Missing P0 Features**:
- Create Google user
- Add user to group
- Remove user from group

**Partial Implementations**:
- Features that work locally but don't sync to Google

### 3. Create OpenSpec Proposals

For each failing feature:

```bash
# Example: Fix delete user bug
npx openspec create fix-delete-user-suspend-bug
```

Document:
- Current behavior
- Expected behavior
- Google Admin SDK method to use
- Implementation plan

### 4. Implement Fixes

Priority order:
1. Critical bugs
2. P0 missing features
3. P1 features
4. P2 features

### 5. Re-test

After fixes, run tests again:

```bash
npx ts-node src/scripts/test-gam-parity.ts
```

Verify:
- Previous failures now pass
- No regressions
- Google Workspace reflects changes correctly

---

## 🐛 Known Issues

### Issue 1: Delete User Suspends Instead of Deleting

**File:** `backend/src/routes/organization.routes.ts:1095-1111`

**Problem:**
```typescript
// Current code
if (googleWorkspaceId && req.body?.suspendInGoogle !== false) {
  const suspendResult = await googleWorkspaceService.suspendUser(organizationId, googleWorkspaceId);
}
```

**Impact:**
- Users think they deleted users
- Suspended users still count as paid licenses
- Small orgs with high turnover (interns) overpay

**Fix Required:**
- Add `googleWorkspaceService.deleteUser()` method
- Call `admin.users.delete()` instead of `admin.users.update({ suspended: true })`
- Add UI confirmation: "This will permanently delete the user from Google Workspace"

**Test Verification:**
```typescript
// After delete, this should throw 404
await this.adminClient.users.get({ userKey: email });
// Error code: 404 = user deleted ✅
// User object with suspended: true = bug still exists ❌
```

---

## 🎯 Success Criteria

### Phase 1 Complete (P0 Features):
- ✅ All 11 critical features pass
- ✅ Delete user bug fixed
- ✅ Create Google user implemented
- ✅ Group membership operations work

### Phase 2 Complete (P1 Features):
- ✅ 80%+ of high-priority features pass
- ✅ OU selector works
- ✅ Aliases work

### Ready for Production:
- ✅ All P0 + P1 features pass
- ✅ Security audit passed
- ✅ E2E UI tests pass
- ✅ No critical bugs

---

## 💡 Tips

1. **Run tests in non-production Google Workspace**
   - Use test domain if possible
   - Or use dedicated OU: `/Testing/Helios`

2. **Clean up after tests**
   - Tests automatically delete created users/groups
   - Check Google Admin Console after run to verify

3. **Test incrementally**
   - Run one test at a time during development:
     ```typescript
     // Comment out in runAllTests()
     // await this.testCreateUser();
     // await this.testDeleteUser();
     await this.testYourNewFeature(); // Only test this
     ```

4. **Check Google Admin SDK quotas**
   - Default: 1,500 queries per 100 seconds
   - Tests should stay well under this
   - Add delays if hitting limits

5. **Save tokens securely**
   - Don't commit `.env.test` to git
   - Add to `.gitignore`

---

## 📚 References

- [Google Admin SDK Directory API](https://developers.google.com/admin-sdk/directory/v1/guides)
- [GAM Command Reference](https://github.com/GAM-team/GAM/wiki)
- [Google Workspace Licensing](https://support.google.com/a/answer/6178640)

---

**Questions?** See `GAM-COMPREHENSIVE-FEATURE-INVENTORY.md` for full feature list.
