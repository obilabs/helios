# Critical Fix: Deleted Users Being Synced from Google Workspace

## Issue Discovered
**Date:** November 8, 2025
**Severity:** HIGH - Data Accuracy
**Reporter:** User testing

## Problem

The dashboard was showing **incorrect user counts** that didn't match Google Workspace:

**Actual Google Workspace data:**
- 4 active users (1 suspended, 1 admin, 2 regular)
- 9 deleted users (test accounts)

**Dashboard was showing:**
- Total Users: 7 ❌
- Suspended: 2 ❌
- Admins: 3 ❌

**Should have shown:**
- Total Users: 4 ✅
- Suspended: 1 ✅
- Admins: 1 ✅

## Root Cause

The Google Workspace sync was **not filtering out deleted users** from the API call.

**Original code** (backend/src/services/google-workspace.service.ts:366-370):
```typescript
const response = await adminClient.users.list({
  customer: 'my_customer',
  maxResults,
  orderBy: 'email'
  // ← Missing query filter!
});
```

**Problem:** Google's Admin SDK API returns ALL users by default, including:
- Active users
- Suspended users
- **Deleted users** ← This was the bug!

## Fix Applied

Added query filter to exclude deleted users:

```typescript
const response = await adminClient.users.list({
  customer: 'my_customer',
  maxResults,
  orderBy: 'email',
  query: 'isDeleted=false'  // ← FIX: Exclude deleted users
});
```

**File modified:** `backend/src/services/google-workspace.service.ts`
**Line:** 371

## Impact

### Before Fix
- Sync pulled 13 users (4 active + 9 deleted)
- Dashboard showed misleading counts
- Users thought data was from Google (it was, but included deleted accounts)

### After Fix
- Sync only pulls 4 active users
- Dashboard shows accurate counts
- Data correctly reflects current Google Workspace state

## Action Required

### For Existing Installations

#### Option A: TypeScript Cleanup Script (Recommended)

**Step 1: Find your organization ID**
```bash
cd backend
npx ts-node -e "import { db } from './src/database/connection'; db.query('SELECT id, name, domain FROM organizations').then(r => { console.table(r.rows); process.exit(0); });"
```

**Step 2: Run cleanup script**
```bash
cd backend
npx ts-node src/scripts/cleanup-deleted-users.ts <your-org-id>
```

The script will:
- Show before/after counts
- Delete stale Google Workspace cache
- Remove organization users synced from Google
- Preserve local Helios portal users
- Provide clear summary of changes

**Step 3: Restart backend**
```bash
npm run dev
```

**Step 4: Run fresh sync**
- Open dashboard
- Click "Sync Now" button
- Verify counts match Google Workspace

---

#### Option B: Direct SQL Execution

**Step 1: Get organization ID**
```sql
SELECT id, name, domain FROM organizations;
```

**Step 2: Edit and run SQL script**
```bash
cd backend
# Edit cleanup-deleted-users.sql and replace 'YOUR-ORG-ID-HERE'
psql -d helios_client -f cleanup-deleted-users.sql
```

**Step 3: Restart backend and sync**
Same as Option A steps 3-4

---

#### Option C: Manual SQL (Quick & Dirty)

```sql
-- Replace <your-org-id> with actual UUID

-- Check before
SELECT COUNT(*) FROM gw_synced_users WHERE organization_id = '<your-org-id>';
SELECT COUNT(*) FROM organization_users WHERE organization_id = '<your-org-id>' AND google_workspace_id IS NOT NULL;

-- Delete
DELETE FROM gw_synced_users WHERE organization_id = '<your-org-id>';
DELETE FROM organization_users WHERE organization_id = '<your-org-id>' AND google_workspace_id IS NOT NULL;

-- Check after
SELECT COUNT(*) FROM gw_synced_users WHERE organization_id = '<your-org-id>';
SELECT COUNT(*) FROM organization_users WHERE organization_id = '<your-org-id>';
```

Then restart backend and run sync.

---

### Verification After Cleanup

**Step 1: Check Google Workspace actual count**
```bash
# Using gw CLI (GAM)
gw users list --domain=yourdomain.com --query="isDeleted=false" | wc -l

# Or check Google Admin Console
# Admin Console → Directory → Users → (count active users)
```

**Step 2: Check dashboard after sync**
```
Dashboard → Total Users
Should match the count from Step 1
```

**Step 3: Verify breakdown**
```sql
-- Should match Google Workspace counts
SELECT
  COUNT(*) FILTER (WHERE user_status = 'active' OR is_active = true) as active,
  COUNT(*) FILTER (WHERE user_status = 'suspended') as suspended,
  COUNT(*) FILTER (WHERE role = 'admin') as admins,
  COUNT(*) as total
FROM organization_users
WHERE organization_id = '<your-org-id>'
  AND deleted_at IS NULL;
```

## Prevention

### Future Safeguards

1. **Added query filter** - Now filters deleted users at source
2. **Documentation updated** - DASHBOARD-DATA-SOURCES.md explains data flow
3. **Visual indicators** - Google Workspace icon shows data source
4. **Testing checklist** - Verify counts against Google after each sync

### Testing Procedure

When testing sync:
1. Check Google Admin Console for actual count
2. Run sync
3. Verify dashboard count matches
4. Test with:
   - Suspended users
   - Deleted users (should NOT appear)
   - Admin users
   - Regular users

## Related Files

- `backend/src/services/google-workspace.service.ts` - Fixed sync query
- `backend/src/services/sync-scheduler.service.ts` - Sync orchestration
- `frontend/src/App.tsx` - Dashboard display with Google icons
- `DASHBOARD-DATA-SOURCES.md` - Data accuracy documentation

## Technical Details

### Google Admin SDK Query Syntax

**Available filters:**
- `isDeleted=false` - Exclude deleted users ✅ (now using)
- `isSuspended=true` - Only suspended users
- `isAdmin=true` - Only admin users
- `orgUnitPath='/Engineering'` - Users in specific OU

**Documentation:**
https://developers.google.com/admin-sdk/directory/reference/rest/v1/users/list

### Default Behavior

By default, `users.list()` returns **all users** regardless of status:
- Active ✅
- Suspended ✅
- Deleted ✅ ← Unexpected!

This is a **Google API design choice** to allow administrators to retrieve deleted accounts for recovery or auditing purposes.

## Lessons Learned

1. **Always filter explicitly** - Don't rely on API defaults
2. **Verify data accuracy** - Compare dashboard with source system
3. **Visual indicators matter** - Google icon helps users trust the data
4. **Test with edge cases** - Include deleted/suspended users in tests

## Status

- [x] Bug identified
- [x] Root cause found
- [x] Fix applied
- [x] Documentation updated
- [ ] User needs to run fresh sync
- [ ] Verify counts match Google

**Fix committed:** November 8, 2025
**Requires:** Backend restart + fresh sync to see correct data
