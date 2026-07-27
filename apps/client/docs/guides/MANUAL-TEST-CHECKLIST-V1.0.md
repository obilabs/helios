# Manual Testing Checklist - Helios v1.0.0
**Date**: November 1, 2025
**Purpose**: Verify all critical user stories work end-to-end
**Login**: `jack@gridwrx.io` / `password123` (or your test password)
**URL**: http://localhost:3000

---

## ✅ Pre-Flight Check

- [ ] All Docker containers running and healthy:
  ```bash
  cd helios-client && docker-compose ps
  # All should show (healthy)
  ```
- [ ] Frontend accessible at http://localhost:3000
- [ ] Backend accessible at http://localhost:3001

---

## 🧪 Critical User Stories to Test

### Story 1: View Dashboard Stats (FIXED)
**Expected**: Accurate counts

1. [ ] Login as Jack
2. [ ] Check top bar stats:
   - **Users**: Should show 5 (or actual count, excluding deleted)
   - **Groups**: Should show 4 (or actual count from Google Workspace)
3. [ ] Navigate to Users page → manually count users
4. [ ] Navigate to Groups page → manually count groups
5. [ ] **Verify stats match actual counts**

**✅ Pass Criteria**: Stats are accurate
**❌ Fail If**: Numbers don't match reality

---

### Story 2: View User Group Memberships (SHOULD WORK)
**Expected**: Anthony's groups display correctly

1. [ ] Navigate to Users
2. [ ] Find user "Anthony" (known to be in 2 groups)
3. [ ] Click Anthony → UserSlideOut opens
4. [ ] Click "Groups" tab
5. [ ] **Verify**: Should see 2 groups listed
6. [ ] **Verify**: Group names match Google Workspace

**✅ Pass Criteria**: All user's groups display
**❌ Fail If**: Shows "No groups" when user has groups

**If Fails**: The endpoint exists (line 1449 in organization.routes.ts) and queries `gw_group_members` table.
Check if:
- Groups were synced (`gw_groups` and `gw_group_members` tables have data)
- User email matches between `organization_users` and `gw_group_members`

---

### Story 3: Delete User Suspends in Google Workspace (FIXED)
**Expected**: Delete in Helios → Suspend in Google

1. [ ] Navigate to Users
2. [ ] Click a Google Workspace user (has google_workspace_id)
3. [ ] UserSlideOut → Danger Zone tab
4. [ ] Click "Delete User"
5. [ ] **Verify confirmation message mentions Google Workspace**
6. [ ] Confirm deletion
7. [ ] **Check success message**: Should say "and suspended in Google Workspace"
8. [ ] Go to Google Admin Console → Check user is suspended

**✅ Pass Criteria**: User suspended in both systems
**❌ Fail If**: User deleted in Helios but still active in Google

**Note**: If Google Workspace not configured, should only delete in Helios (no error)

---

### Story 4: API Keys End-to-End (NEW FEATURE)
**Expected**: Full API key lifecycle works

1. [ ] Navigate to Settings → Integrations tab
2. [ ] **Verify**: API Keys UI appears (not "coming soon")
3. [ ] Click "Create New Key"
4. [ ] **Step 1**: Select "Service Key"
5. [ ] **Step 2**:
   - Name: "Test Service Key"
   - System Name: "Test System"
   - Expiration: 365 days
6. [ ] **Step 3**: Select permissions:
   - ✓ Read Users
   - ✓ Read Groups
7. [ ] Click "Create API Key"
8. [ ] **Verify**: "Show Once" modal appears
9. [ ] **Verify**: Full API key displayed (starts with `helios_`)
10. [ ] Click "Copy to clipboard"
11. [ ] Check "I have saved this key" checkbox
12. [ ] Click "Done - Close Window"
13. [ ] **Verify**: Key appears in list with:
    - Name: "Test Service Key"
    - Type badge: "Service"
    - Status badge: "Active"
    - Permissions: "read:users, read:groups..."

**✅ Pass Criteria**: Full flow works, key created and listed
**❌ Fail If**: Modal doesn't appear, key not saved, or list doesn't update

**Bonus**: Test the API key works:
```bash
curl -H "X-API-Key: [your-key-here]" http://localhost:3001/api/organization/users
# Should return user list
```

---

### Story 5: UserSlideOut Shows Clean UI (FIXED)
**Expected**: No broken buttons, no Microsoft 365

1. [ ] Navigate to Users
2. [ ] Click any user → UserSlideOut opens
3. [ ] **Check Overview tab**: User info displays
4. [ ] **Check Groups tab**: Groups list (or empty state)
5. [ ] **Check Google Workspace tab**: (renamed from "Platforms")
   - [ ] **Verify**: Only shows Google Workspace (no Microsoft 365!)
   - [ ] **Verify**: No "Create in Google" button (removed!)
   - [ ] **Verify**: No "Sync Now" button (removed!)
   - [ ] Shows sync status clearly
6. [ ] **Check Activity tab**: Activity log (may be empty)
7. [ ] **Check Settings tab**: Status management
8. [ ] **Check Danger Zone tab**: Delete button

**✅ Pass Criteria**: No non-functional buttons, clean UI
**❌ Fail If**: See Microsoft 365, or buttons that don't work

---

### Story 6: Settings Navigation is Clear (FIXED)
**Expected**: No confusion between user and org settings

1. [ ] Click user dropdown (top right)
2. [ ] **Check menu items**:
   - [ ] Change Password (should open modal)
   - [ ] Administrators (may alert "coming soon" - that's ok)
   - [ ] My API Keys (may alert "coming soon" - that's ok)
   - [ ] Settings (should navigate to Org Settings)
3. [ ] Click "Settings"
4. [ ] **Verify**: Goes to Settings page (organization settings)
5. [ ] **Check Security tab**:
   - [ ] "Password Management" card (not "API Keys")
   - [ ] "Authentication Methods" card
   - [ ] "API Keys & Integrations" card with "Go to Integrations →" button
6. [ ] Click "Go to Integrations →"
7. [ ] **Verify**: Switches to Integrations tab

**✅ Pass Criteria**: Clear navigation, no duplicate buttons
**❌ Fail If**: Confusing settings, duplicate API key buttons

---

### Story 7: Google Workspace Module Status (EXISTING)
**Expected**: Module status displays correctly

1. [ ] Settings → Modules tab
2. [ ] **Check Google Workspace card**:
   - [ ] Shows "Enabled" or "Disabled" status
   - [ ] If enabled: shows user count, Test/Sync buttons
   - [ ] If disabled: shows "Enable" button
3. [ ] **Check Microsoft 365 card**:
   - [ ] Shows "Coming Soon" badge
   - [ ] NO enable button (or disabled)

**✅ Pass Criteria**: Module status clear and accurate
**❌ Fail If**: Status wrong, or M365 looks functional

---

## 🎯 What Changed vs Your Testing

### Fixed Issues:
1. ✅ **M365 UI removed** - No more Microsoft 365 in UserSlideOut
2. ✅ **Non-functional buttons removed** - No more "Create in Google", etc.
3. ✅ **Stats should be accurate** - Added group count, exclude deleted users
4. ✅ **Delete syncs to Google** - Now suspends in Google Workspace
5. ✅ **Groups endpoint exists** - Should display user's groups
6. ✅ **Security tab clarified** - No duplicate API Keys button

### Still Need to Verify:
- Group memberships actually display (endpoint exists, need to test)
- Delete → Google suspend works (code added, need to test)
- Stats are accurate (logic fixed, need to verify)

---

## 🐛 If You Find Issues

### Groups Not Showing
**Check**:
```sql
-- In database
SELECT * FROM gw_group_members WHERE member_email = 'anthony@gridworx.io';
-- Should show 2 rows for Anthony's groups
```

**If empty**: Groups not synced yet. Run sync:
1. Settings → Modules → Google Workspace → Sync

### Stats Still Wrong
**Check**:
```sql
-- Count users (excluding deleted)
SELECT COUNT(*) FROM organization_users WHERE deleted_at IS NULL;

-- Count groups
SELECT COUNT(*) FROM gw_groups;
```

### Delete Doesn't Suspend in Google
**Check backend logs**:
```bash
docker-compose logs backend | grep -i "suspend"
```

Should see: "User suspended in Google Workspace"

If error: Check Google Workspace API permissions include `admin.directory.user` (write access)

---

## ✅ Final Approval Checklist

Before tagging v1.0.0:

- [ ] All 21 E2E tests pass
- [ ] Stats show accurate counts
- [ ] Group memberships display for users who have groups
- [ ] Delete user suspends in Google Workspace (if configured)
- [ ] API Keys full flow works (create, display, list)
- [ ] No Microsoft 365 UI visible
- [ ] No non-functional buttons
- [ ] Settings navigation is clear

**If ALL checked**: Ready to ship v1.0.0 ✅
**If ANY unchecked**: Document as known issue or fix before shipping

---

## 📝 Quick Test (5 minutes)

1. Login → Check stats (should be accurate)
2. Click user → Groups tab (should show groups or empty)
3. Settings → Integrations → Create API key (should work)
4. Delete test user → Check message mentions Google

If all work: **SHIP IT!** 🚀
