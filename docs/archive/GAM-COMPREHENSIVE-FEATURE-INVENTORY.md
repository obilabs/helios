# GAM Comprehensive Feature Inventory
**Purpose:** Complete mapping of GAM commands to Helios capabilities
**Testing Strategy:** API-first verification with direct Google Admin SDK confirmation

---

## 📊 GAM Feature Categories

### 1. USER MANAGEMENT

#### 1.1 User Lifecycle
| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam create user <email> firstname <first> lastname <last> password <password>` | Create new user | 🔴 CRITICAL | ✅ YES |
| `gam create user <email> ... ou <ou-path>` | Create user in specific OU | 🔴 CRITICAL | ✅ YES |
| `gam delete user <email>` | **Permanently delete user** | 🔴 CRITICAL | ✅ YES |
| `gam update user <email> suspended true` | Suspend user account | 🔴 CRITICAL | ✅ YES |
| `gam update user <email> suspended false` | Unsuspend user account | 🔴 CRITICAL | ✅ YES |
| `gam update user <email> changepassword <newpass>` | Change user password | 🟡 HIGH | ✅ YES |
| `gam update user <email> firstname <name>` | Update first name | 🟢 MEDIUM | ✅ YES |
| `gam update user <email> lastname <name>` | Update last name | 🟢 MEDIUM | ✅ YES |
| `gam update user <email> ou <ou-path>` | Move user to different OU | 🟡 HIGH | ✅ YES |
| `gam update user <email> recoveryemail <email>` | Set recovery email | 🟢 MEDIUM | ✅ YES |
| `gam update user <email> recoveryphone <phone>` | Set recovery phone | 🟢 MEDIUM | ✅ YES |
| `gam info user <email>` | Get user details | 🟡 HIGH | ✅ YES |
| `gam print users` | List all users | 🔴 CRITICAL | ✅ YES |

#### 1.2 User Aliases
| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam create alias <alias> user <email>` | Add email alias | 🟡 HIGH | ✅ YES |
| `gam delete alias <alias>` | Remove email alias | 🟡 HIGH | ✅ YES |
| `gam info user <email> aliases` | List user aliases | 🟢 MEDIUM | ✅ YES |

#### 1.3 Admin Roles
| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam update user <email> admin on` | Grant super admin | 🔴 CRITICAL | ✅ YES |
| `gam update user <email> admin off` | Revoke super admin | 🔴 CRITICAL | ✅ YES |
| `gam print admins` | List all admins | 🟡 HIGH | ✅ YES |

---

### 2. GROUP MANAGEMENT

#### 2.1 Group Lifecycle
| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam create group <email> name <name>` | Create new group | 🔴 CRITICAL | ✅ YES |
| `gam delete group <email>` | Delete group | 🔴 CRITICAL | ✅ YES |
| `gam update group <email> name <newname>` | Rename group | 🟢 MEDIUM | ✅ YES |
| `gam update group <email> description <desc>` | Update description | 🟢 MEDIUM | ✅ YES |
| `gam info group <email>` | Get group details | 🟡 HIGH | ✅ YES |
| `gam print groups` | List all groups | 🔴 CRITICAL | ✅ YES |

#### 2.2 Group Membership
| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam update group <email> add member user <user-email>` | Add user to group | 🔴 CRITICAL | ✅ YES |
| `gam update group <email> remove member <user-email>` | Remove user from group | 🔴 CRITICAL | ✅ YES |
| `gam update group <email> add owner <user-email>` | Add group owner | 🟡 HIGH | ✅ YES |
| `gam update group <email> add manager <user-email>` | Add group manager | 🟡 HIGH | ✅ YES |
| `gam print group-members group <email>` | List group members | 🔴 CRITICAL | ✅ YES |

#### 2.3 Group Settings
| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam update group <email> who_can_join INVITED_CAN_JOIN` | Set join policy | 🟢 MEDIUM | ✅ YES |
| `gam update group <email> who_can_post ALL_IN_DOMAIN_CAN_POST` | Set post permissions | 🟢 MEDIUM | ✅ YES |
| `gam update group <email> allowexternalmembers true` | Allow external members | 🟢 MEDIUM | ✅ YES |

---

### 3. ORGANIZATIONAL UNITS

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam create org <ou-path>` | Create OU | 🟡 HIGH | ✅ YES |
| `gam delete org <ou-path>` | Delete OU | 🟡 HIGH | ✅ YES |
| `gam update org <ou-path> name <newname>` | Rename OU | 🟢 MEDIUM | ✅ YES |
| `gam info org <ou-path>` | Get OU details | 🟢 MEDIUM | ✅ YES |
| `gam print orgs` | List all OUs | 🟡 HIGH | ✅ YES |

---

### 4. EMAIL DELEGATION

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam user <email> delegate to <delegate-email>` | Add email delegate | 🟡 HIGH | ✅ YES |
| `gam user <email> delete delegate <delegate-email>` | Remove delegate | 🟡 HIGH | ✅ YES |
| `gam user <email> show delegates` | List delegates | 🟡 HIGH | ✅ YES |

---

### 5. CALENDAR RESOURCES

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam create resource <id> <name>` | Create calendar resource | 🟢 MEDIUM | ✅ YES |
| `gam delete resource <id>` | Delete resource | 🟢 MEDIUM | ✅ YES |
| `gam print resources` | List resources | 🟢 MEDIUM | ✅ YES |

---

### 6. SHARED DRIVES (Team Drives)

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam create teamdrive <name>` | Create shared drive | 🟢 MEDIUM | ⚠️ REQUIRES PAID |
| `gam delete teamdrive <id>` | Delete shared drive | 🟢 MEDIUM | ⚠️ REQUIRES PAID |
| `gam add drivefileacl <id> user <email> role writer` | Grant access | 🟢 MEDIUM | ⚠️ REQUIRES PAID |

---

### 7. MOBILE DEVICE MANAGEMENT

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam print mobile` | List mobile devices | 🟡 HIGH | ✅ YES |
| `gam update mobile <id> action wipe` | Wipe device | 🟡 HIGH | ⚠️ DESTRUCTIVE |
| `gam update mobile <id> action block` | Block device | 🟡 HIGH | ✅ YES |

---

### 8. CHROME DEVICE MANAGEMENT

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam print cros` | List Chrome devices | 🟡 HIGH | ✅ YES |
| `gam update cros <id> ou <ou-path>` | Move device to OU | 🟢 MEDIUM | ✅ YES |
| `gam update cros <id> action deprovision` | Deprovision device | 🟢 MEDIUM | ⚠️ DESTRUCTIVE |

---

### 9. LICENSE MANAGEMENT

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam print licenses` | List all licenses | 🟡 HIGH | ✅ YES |
| `gam user <email> add license <sku>` | Assign license | 🟡 HIGH | ✅ YES |
| `gam user <email> delete license <sku>` | Remove license | 🟡 HIGH | ✅ YES |
| `gam info user <email> licenses` | Show user licenses | 🟡 HIGH | ✅ YES |

---

### 10. DOMAIN SETTINGS

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam print domains` | List domains | 🟢 MEDIUM | ✅ YES |
| `gam info domain <domain>` | Get domain info | 🟢 MEDIUM | ✅ YES |

---

### 11. SECURITY & REPORTS

| GAM Command | Description | Priority | Testable |
|-------------|-------------|----------|----------|
| `gam report users` | User activity report | 🟢 MEDIUM | ✅ YES |
| `gam report logins` | Login audit log | 🟡 HIGH | ✅ YES |
| `gam report admin` | Admin activity log | 🟡 HIGH | ✅ YES |
| `gam print tokens` | OAuth tokens | 🟢 MEDIUM | ✅ YES |

---

## 🎯 PRIORITY BREAKDOWN

### 🔴 CRITICAL (Must Have - P0)
**User Lifecycle:**
- Create user (with OU)
- **Delete user (permanent deletion, not suspend!)**
- Suspend/unsuspend user
- Update admin role
- List users

**Group Management:**
- Create group
- Delete group
- Add member to group
- Remove member from group
- List groups
- List group members

**Total P0 Features:** 11

---

### 🟡 HIGH (Should Have - P1)
- User aliases (add/delete)
- Email delegation
- Mobile device list/block
- Chrome device list
- License management
- Move user to OU
- Change password
- OU management

**Total P1 Features:** 15

---

### 🟢 MEDIUM (Nice to Have - P2)
- Calendar resources
- Shared drives
- Group settings (permissions)
- Domain info
- Reports

**Total P2 Features:** 12

---

## 🧪 TESTING FRAMEWORK

### Test Execution Plan

For each feature:

```typescript
interface FeatureTest {
  feature: string;
  gamCommand: string;
  heliosEndpoint: string;

  steps: {
    // Step 1: Check if Helios API exists
    apiExists: boolean;

    // Step 2: Execute Helios API
    heliosRequest: {
      method: string;
      endpoint: string;
      body: any;
    };
    heliosResponse: any;

    // Step 3: Verify with Google Admin SDK
    googleVerification: {
      method: string; // e.g., 'admin.users.get()'
      params: any;
      result: any;
    };

    // Step 4: Result
    status: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_IMPLEMENTED';
    notes: string;
  };
}
```

### Example Test: Create User

```typescript
{
  feature: "Create User",
  gamCommand: "gam create user test@domain.com firstname Test lastname User password Secret123! ou /Engineering",
  heliosEndpoint: "POST /api/organization/users",

  steps: {
    apiExists: true,

    heliosRequest: {
      method: "POST",
      endpoint: "/api/organization/users",
      body: {
        email: "test@domain.com",
        firstName: "Test",
        lastName: "User",
        password: "Secret123!",
        orgUnitPath: "/Engineering"
      }
    },
    heliosResponse: { success: false, error: "orgUnitPath not supported" },

    googleVerification: {
      method: "admin.users.get({ userKey: 'test@domain.com' })",
      params: { userKey: "test@domain.com" },
      result: null  // User not found
    },

    status: "PARTIAL",
    notes: "Helios API exists but doesn't create in Google Workspace. Missing OU support."
  }
}
```

---

## 📝 TEST RESULTS TRACKING

Create file: `GAM-TEST-RESULTS.json`

```json
{
  "testRun": {
    "date": "2025-11-01",
    "testedBy": "Claude",
    "environment": "dev",
    "googleWorkspaceDomain": "yourdomain.com"
  },
  "summary": {
    "total": 38,
    "pass": 0,
    "fail": 0,
    "partial": 0,
    "notImplemented": 0
  },
  "results": [
    {
      "id": "USER_001",
      "feature": "Create User",
      "priority": "CRITICAL",
      "status": "PARTIAL",
      "heliosApiExists": true,
      "googleSyncWorks": false,
      "notes": "Creates local user but doesn't sync to Google"
    }
  ]
}
```

---

## 🚀 TESTING EXECUTION STRATEGY

### Phase 1: P0 Features (Critical) - 2-3 hours
Test all 11 critical features:
1. Create user
2. Delete user (**verify permanent deletion, not suspend!**)
3. Suspend/unsuspend user
4. Promote/demote admin
5. List users
6. Create group
7. Delete group
8. Add member to group
9. Remove member from group
10. List groups
11. List group members

### Phase 2: P1 Features (High) - 3-4 hours
Test 15 high-priority features

### Phase 3: P2 Features (Medium) - 2-3 hours
Test remaining features

---

## 🎯 SUCCESS CRITERIA

**P0 Complete:** All 11 critical features pass with ✅ status
- Helios API exists
- API call succeeds
- Google Admin SDK verification confirms action
- No discrepancies

**P1 Complete:** 80%+ of P1 features pass

**Ready for UI:** All P0 + P1 APIs verified working

---

## 🔧 IMPLEMENTATION PRIORITY POST-TESTING

After testing, prioritize fixes based on:

1. **Critical Bugs** (e.g., delete = suspend issue)
2. **Missing P0 Features** (e.g., create Google user)
3. **Partial Implementations** (e.g., OU support)
4. **P1 Features**
5. **P2 Features**

---

## ⚠️ CRITICAL FIX REQUIRED IMMEDIATELY

**DELETE USER BUG:**

Current code (organization.routes.ts:1095-1111):
```typescript
// If user is synced from Google Workspace, suspend them there too
if (googleWorkspaceId && req.body?.suspendInGoogle !== false) {
  const suspendResult = await googleWorkspaceService.suspendUser(organizationId, googleWorkspaceId);
}
```

**Problem:** Suspended users still count as paid licenses!

**Required fix:**
```typescript
// If user is synced from Google Workspace, handle deletion
if (googleWorkspaceId) {
  const deleteOption = req.body?.googleAction || 'suspend'; // 'suspend' | 'delete'

  if (deleteOption === 'delete') {
    // Permanently delete from Google (frees license)
    const deleteResult = await googleWorkspaceService.deleteUser(organizationId, googleWorkspaceId);
  } else {
    // Just suspend (keeps data, but STILL BILLED!)
    const suspendResult = await googleWorkspaceService.suspendUser(organizationId, googleWorkspaceId);
  }
}
```

**UI must show:**
```
⚠️ Warning: Deleting user from Google Workspace

Options:
○ Keep Google account active (recommended for offboarding)
○ Suspend Google account (keeps data, but you're still billed for this license)
○ Permanently delete from Google (frees license, removes all data - requires confirmation)

[ Cancel ] [ Confirm Delete ]
```

---

## 📋 NEXT STEPS

1. **Create test runner script** (Node.js/TypeScript)
2. **Run P0 tests** (11 critical features)
3. **Document results** in JSON format
4. **Review failures** and create OpenSpec proposals
5. **Implement fixes** for P0 failures
6. **Re-test** until all P0 pass
7. **Move to UI** integration

---

**Total Features Mapped:** 38
**Critical (P0):** 11
**High (P1):** 15
**Medium (P2):** 12

Ready to build test runner?
