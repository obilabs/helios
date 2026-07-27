# Helios Sync Architecture - Critical Design Decision
**Date**: November 1, 2025
**Decision Needed**: Sync strategy and Delete vs Suspend semantics

---

## 🎯 Core Issues Identified

### Issue 1: Sync Direction Strategy

**Your Observation**:
- Google has 4 users (1 suspended)
- Helios shows 4 users (2 from Google, 2 local)
- Numbers don't align

**Your Proposal**:
```
Helios ← Google (All users, all statuses - READ ONLY)
Helios ↔ Google (Connected users only - BI-DIRECTIONAL)
```

**This is CORRECT enterprise architecture!** ✅

---

## 📊 Current Architecture (What We Have)

**Current Sync**:
```
Initial Sync:
Google → Helios (import all users)

Ongoing:
❌ Google suspended user → Helios (not syncing status changes)
✅ Delete in Helios → Suspend in Google (we added this)
❌ Create in Helios → Google (not implemented)
❌ Update in Helios → Google (not implemented)
```

**Problem**: Half-baked bi-directional sync!

---

## 🏗️ Proper Enterprise Sync Architecture

### Pattern 1: Source of Truth Model (Recommended for v1.0)

**Google Workspace is Source of Truth**:
```
Google Workspace (Master)
    ↓ Read-only sync
Helios (Read-only view + local enhancements)

Rules:
✅ Import ALL users from Google (including suspended)
✅ Sync status changes: Suspended in Google → Suspended in Helios
✅ DO NOT write back to Google from Helios
✅ Local users: Exist only in Helios (separate from Google)

Use Cases:
- View Google users in Helios
- Add local metadata (department, notes, custom fields)
- Manage local-only users (consultants, contractors)
- Generate reports combining Google + local data
```

**Advantages**:
- Simple, predictable
- Google Admin Console remains primary management tool
- Helios adds value (reporting, local users, integrations)
- No sync conflicts

**Disadvantages**:
- Can't manage Google users from Helios
- Must use Google Admin Console for user lifecycle

---

### Pattern 2: Bi-Directional Sync (Complex, for v1.1+)

**Helios as Alternative Admin Interface**:
```
Google Workspace (Primary)
    ↕ Bi-directional sync
Helios (Alternative admin interface)

Rules:
✅ Create user in Helios → Creates in Google
✅ Update user in Helios → Updates in Google
✅ Suspend user in Helios → Suspends in Google
✅ Delete user in Helios → Deletes in Google
✅ Changes in Google → Sync to Helios (every 15 min)

Conflict Resolution:
- Google wins (platform is source of truth)
- Helios changes pushed immediately
- Google changes pulled on schedule
```

**Advantages**:
- Single pane of glass management
- Don't need Google Admin Console
- Helios becomes primary tool

**Disadvantages**:
- Complex conflict resolution
- Risk of data loss if sync fails
- Must handle Google API rate limits
- Requires careful error handling

---

## 🚨 Issue 2: Delete vs Suspend Semantics

**Your Insight**: "Delete should delete, suspend should suspend"

**You're absolutely right!** Current UX is confusing:

### Current (Confusing):
```
Button: "Delete User"
Action: Soft-delete in Helios + Suspend in Google
Result: User "deleted" but still uses license
```

**This violates principle of least surprise!**

### Proper Semantics:

**A. Suspend User**
```
Action: Suspend
Effect:
- User can't log in
- License still consumed
- Data intact
- Reversible (resume anytime)

Use Case: Temporary leave, security issue, policy violation

Helios: Set is_active = false, user_status = 'suspended'
Google: Set suspended = true
```

**B. Delete User**
```
Action: Delete
Effect:
- User removed from system
- License freed
- Data retained (30 days in Helios, longer in Google)
- Reversible in Helios (30 days), permanent in Google

Use Case: Employee offboarding, license reclaim

Helios: Set deleted_at = NOW(), is_active = false
Google: Option to delete (with confirmation!) OR just unsync
```

**C. Offboard User** (Enterprise Pattern)
```
Action: Offboard
Effect:
- Transfer data (Drive, Calendar, Email) to manager
- Suspend access immediately
- Schedule deletion (7-30 days)
- Free license after deletion
- Full audit trail

Use Case: Employee leaving company

Helios: Workflow with data transfer UI
Google: Execute via Admin SDK
```

---

## 🎯 Recommended Fix for v1.0.0

### Quick Fix (Tonight - 30 min):

**Add "Suspend User" button**:
```tsx
// UserSlideOut Danger Zone tab

<div className="danger-item">
  <div>
    <h4>Suspend User</h4>
    <p>Temporarily disable user access. User can be reactivated anytime. License remains consumed.</p>
  </div>
  <button className="btn-warning" onClick={handleSuspendUser}>
    Suspend User
  </button>
</div>

<div className="danger-item">
  <div>
    <h4>Delete User</h4>
    <p>Soft-delete user from Helios (restorable for 30 days). Does NOT affect Google Workspace.</p>
  </div>
  <button className="btn-danger" onClick={handleDeleteUser}>
    Delete from Helios
  </button>
</div>
```

**Update handlers**:
```typescript
handleSuspendUser = async () => {
  // Confirm
  const message = user.googleWorkspaceId
    ? "Suspend user in BOTH Helios and Google Workspace?"
    : "Suspend user in Helios?";

  // Call PATCH /users/:id/status with status='suspended'
  // If Google user, call Google API to suspend
};

handleDeleteUser = async () => {
  // Confirm
  const message = "Delete user from Helios only? This does NOT affect Google Workspace.";

  // Call DELETE /users/:id with suspendInGoogle=false
};
```

---

## 🧪 Issue 3: API-Based Testing

**Your Insight**: "Test with API first, then UI"

**You're absolutely right!** This is the correct testing pyramid:

### Proper Test Strategy:

**Level 1: API Tests** (Fast, Reliable)
```typescript
test('GET /api/organization/stats returns accurate counts', async () => {
  // 1. Count users in Google Workspace via Google API
  const googleUsers = await googleAdmin.users.list();
  const googleCount = googleUsers.data.users.length;

  // 2. Call Helios API
  const response = await fetch('/api/organization/stats');
  const stats = await response.json();

  // 3. Verify counts match
  expect(stats.data.totalUsers).toBe(googleCount + localUserCount);
  expect(stats.data.totalGroups).toBe(googleGroupCount);
});

test('DELETE /users/:id suspends in Google Workspace', async () => {
  // 1. Get user's Google ID
  const user = await createTestUser();

  // 2. Delete via API
  const response = await fetch(`/api/organization/users/${user.id}`, {
    method: 'DELETE'
  });

  // 3. Verify Google Workspace suspension
  const googleUser = await googleAdmin.users.get({ userKey: user.googleId });
  expect(googleUser.data.suspended).toBe(true);

  // 4. Verify Helios soft delete
  const dbUser = await db.query('SELECT deleted_at FROM users WHERE id = $1');
  expect(dbUser.deleted_at).not.toBeNull();
});
```

**Level 2: E2E Tests** (Slower, Comprehensive)
```typescript
test('User deletes someone and sees correct message', async () => {
  // UI interaction
  await page.click('text=Delete User');
  const dialog = await page.textContent('.confirmation-dialog');
  expect(dialog).toContain('SUSPEND in Google Workspace');
});
```

**Benefits**:
- API tests are FAST (no browser overhead)
- API tests verify actual behavior (not just UI)
- Catch regressions early
- Can run in CI/CD

---

## 🎯 Issue 4: Anthony's Groups Not Showing

**Possible Causes**:

1. **Groups not synced to gw_group_members table**
   ```sql
   SELECT * FROM gw_group_members WHERE member_email = 'anthony@gridworx.io';
   -- If empty: Groups not synced yet
   ```

2. **Email mismatch**
   ```sql
   SELECT email FROM organization_users WHERE first_name = 'Anthony';
   -- Verify email matches Google
   ```

3. **Endpoint querying wrong table**
   - Current: Queries `gw_group_members` JOIN `gw_groups`
   - Issue: Maybe group sync didn't populate these tables?

**Quick Debug**:
```bash
# Check if Anthony exists
docker-compose exec -T postgres psql -U postgres -d helios_client -c "SELECT email FROM organization_users WHERE first_name LIKE 'Anthony%';"

# Check if groups are synced
docker-compose exec -T postgres psql -U postgres -d helios_client -c "SELECT COUNT(*) FROM gw_group_members;"

# Check if group sync populated data
docker-compose exec -T postgres psql -U postgres -d helios_client -c "SELECT COUNT(*) FROM gw_groups;"
```

**If tables are empty**: Group sync never ran or failed

**Fix**: Run Settings → Modules → Google Workspace → Sync button

---

## 🚀 Immediate Recommendations

### For v1.0.0 (Ship Tonight):

**1. Clarify Sync Model** (Documentation)
```markdown
## Helios v1.0.0 Sync Architecture

**Google Workspace**: Source of Truth (Read-Only)
- Helios imports users from Google
- Status changes in Google NOT synced automatically (coming in v1.1)
- Helios can suspend Google users (one-way action)
- Helios cannot create/update Google users (use Admin Console)

**Local Users**: Managed in Helios
- Created and managed entirely in Helios
- Do not exist in Google Workspace
- Useful for contractors, consultants, API-only access
```

**2. Fix Delete vs Suspend UX** (30 minutes)
- Add "Suspend User" button (suspends in both)
- Change "Delete User" to only delete from Helios
- Clear messaging

**3. Debug Group Sync** (15 minutes)
- Check if `gw_group_members` table is populated
- If empty: Groups not synced yet
- Add to manual test: "Run sync first"

**4. Create API Test Suite** (v1.1 priority)
- Test stats accuracy via API
- Test delete/suspend via API
- Run before UI tests

---

## 🤔 Decision Needed

**For v1.0.0 release tonight**:

**Option A: Ship with current state** (5 minutes)
- Document sync as "read-only from Google"
- Document "bi-directional coming in v1.1"
- Add Suspend button in v1.0.1
- Fix group sync in v1.0.1

**Option B: Add Suspend button** (30 minutes)
- Add proper Suspend vs Delete separation
- Ship with clearer UX
- Still document sync limitations

**Option C: Full bi-directional sync** (4-6 hours)
- Not recommended for tonight!
- Too complex, too late
- Better for v1.1 after rest

**My Recommendation**: **Option A**

We've made huge progress tonight (10+ hours!). Let's:
1. Document current limitations honestly
2. Ship v1.0.0 as "Google Workspace Read-Only Sync + Helios Management"
3. Plan v1.1 for full bi-directional sync

**What do you prefer?**