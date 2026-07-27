# Final Manual Test - Helios v1.0.0
**Date**: November 1, 2025
**URL**: http://localhost:3000
**Login**: `jack@gridwrx.io` / `password123`

---

## ✅ Test 1: Google Workspace Config Display

**Steps**:
1. Login
2. Settings → Modules tab
3. Find Google Workspace card

**Expected**:
- [ ] Status shows "ENABLED" badge with green dot
- [ ] Shows "4 users synced" (or your actual count)
- [ ] Green "Configuration Details:" box visible with:
  - [ ] **Project ID**: `helios-437921` (or your project ID)
  - [ ] **Service Account**: `helios@helios-437921.iam.gserviceaccount.com` (or yours)
  - [ ] **Last synced**: Recent timestamp

**✅ PASS if**: All config details visible
**❌ FAIL if**: Config box is blank or missing

---

## ✅ Test 2: Dashboard Stats Accuracy

**Steps**:
1. Look at top right header
2. Check stats displayed

**Expected**:
- [ ] Shows "5 Users" (or actual count, NOT 4)
- [ ] Shows "4 Groups" (or actual count, NOT 0)
- [ ] No more "0 Workflows" text

**Verification**:
1. Click Users → Manually count users in list
2. Click Groups → Manually count groups in list
3. Compare with header stats

**✅ PASS if**: Stats match reality
**❌ FAIL if**: Numbers don't match actual counts

---

## ✅ Test 3: Delete User → Google Workspace Warning

**Steps**:
1. Users → Click any Google Workspace user (has google_workspace_id)
   - Try "Anthony" or "Pewter" or any synced user
2. Click "Danger Zone" tab
3. Click "Delete User" button
4. Read confirmation dialog

**Expected Dialog**:
```
Delete [User Name]?

This will:
✓ Soft-delete in Helios (restorable within 30 days)
✓ SUSPEND in Google Workspace (immediate effect)

⚠️ Important:
• This does NOT delete Google Workspace data
• User's email, Drive files, Calendar remain intact
• To fully remove, delete from Google Admin Console
• Consider transferring data before deletion

Continue with suspension?
```

**Test Actions**:
- [ ] Click "Cancel" → Nothing happens (good!)
- [ ] Click "OK" → User deleted
- [ ] Check success message includes "and suspended in Google Workspace"
- [ ] Go to Google Admin Console → Verify user is SUSPENDED (not deleted)

**✅ PASS if**: Clear warning, accurate action, Google user suspended
**❌ FAIL if**: No warning, or user deleted instead of suspended

---

## ✅ Test 4: User Group Memberships

**Steps**:
1. Users → Click "Anthony" (known to be in 2 groups)
2. Click "Groups" tab in UserSlideOut

**Expected**:
- [ ] Shows 2 groups (or actual group count for Anthony)
- [ ] Group names displayed
- [ ] Group emails displayed

**If Shows "No groups"**:
- Check: Settings → Modules → Google Workspace → Click "Sync"
- Wait for sync to complete
- Re-check Anthony's groups

**✅ PASS if**: Anthony's groups display correctly
**❌ FAIL if**: Shows empty when user has groups

---

## ✅ Test 5: API Key Permission Logic

**Steps**:
1. Settings → Integrations tab
2. Click "Create New Key"
3. Step 1: Select "Service Key"
4. Step 2: Fill form (any name)
5. Step 3: Permissions screen

**Test Permission Dependencies**:

**Test A: Write Auto-Enables Read**
1. [ ] Check "Write Users"
2. [ ] Verify "Read Users" auto-checked
3. [ ] Try to uncheck "Read Users"
4. [ ] Verify "Write Users" auto-unchecks

**Test B: Delete Auto-Enables Write + Read**
1. [ ] Uncheck all
2. [ ] Check "Delete Users"
3. [ ] Verify "Write Users" and "Read Users" both auto-checked

**Test C: Removing Read Cascades**
1. [ ] Check "Delete Users" (should auto-check Write and Read)
2. [ ] Uncheck "Read Users"
3. [ ] Verify both "Write Users" and "Delete Users" auto-uncheck

**✅ PASS if**: All dependency logic works
**❌ FAIL if**: Can select Write without Read

---

## ✅ Test 6: API Key Full Flow

**Steps**:
1. Settings → Integrations → Create New Key
2. Service Key → Name: "Test Key"
3. Select permissions: Read Users, Read Groups
4. **Check expiry dropdown is visible** (Step 2)
5. Select "365 days"
6. Create key

**Expected**:
- [ ] "Show Once" modal appears
- [ ] Full API key displayed (starts with `helios_`)
- [ ] Copy button works
- [ ] Must check "I have saved" before closing
- [ ] After closing, key appears in list

**✅ PASS if**: Full flow works, key created
**❌ FAIL if**: Modal doesn't appear or key not saved

---

## ✅ Test 7: No Microsoft 365 UI

**Steps**:
1. Click any user → UserSlideOut
2. Click "Google Workspace" tab (renamed from "Platforms")

**Expected**:
- [ ] Only shows Google Workspace section
- [ ] NO Microsoft 365 section
- [ ] NO "Create in Microsoft" button
- [ ] NO "Create in Google" button
- [ ] Clear sync status only

**✅ PASS if**: Clean UI, only Google, no placeholders
**❌ FAIL if**: See M365 or non-functional buttons

---

## 🎯 Summary Checklist

Before approving v1.0.0:

- [ ] Config details visible in Modules
- [ ] Stats show correct counts (5 users, 4 groups)
- [ ] Delete warning mentions Google Workspace
- [ ] Group memberships display (or empty if user has none)
- [ ] API permission dependencies work
- [ ] API key full flow works
- [ ] No Microsoft 365 UI anywhere

**If ALL checked**: ✅ **v1.0.0 is production-ready!**

**If ANY fail**: Let me know which one and I'll fix immediately.

---

## 🐛 Quick Debug Commands (If Needed)

**Check if Google Workspace is enabled**:
```bash
docker-compose exec -T postgres psql -U postgres -d helios_client -c "SELECT is_enabled FROM organization_modules om JOIN available_modules am ON am.id = om.module_id WHERE am.module_key = 'google_workspace';"
```

**Check group count**:
```bash
docker-compose exec -T postgres psql -U postgres -d helios_client -c "SELECT COUNT(*) FROM gw_groups;"
```

**Check user count (excluding deleted)**:
```bash
docker-compose exec -T postgres psql -U postgres -d helios_client -c "SELECT COUNT(*) FROM organization_users WHERE deleted_at IS NULL;"
```

---

Ready for your testing! 🚀
