# Database Cleanup Scripts

## Quick Start

After applying the deleted users fix, run one of these cleanup options:

### Option 1: TypeScript Script (Recommended)
```bash
cd backend
npx ts-node src/scripts/cleanup-deleted-users.ts <your-org-id>
```

### Option 2: SQL Script
```bash
cd backend
# Edit cleanup-deleted-users.sql first
psql -d helios_client -f cleanup-deleted-users.sql
```

### Option 3: Direct SQL
```bash
psql -d helios_client
DELETE FROM gw_synced_users WHERE organization_id = '<your-org-id>';
DELETE FROM organization_users WHERE organization_id = '<your-org-id>' AND google_workspace_id IS NOT NULL;
```

## After Cleanup

1. **Restart backend:** `npm run dev`
2. **Open dashboard:** http://localhost:3000
3. **Click "Sync Now"** button
4. **Verify counts** match Google Workspace

## Files

- `src/scripts/cleanup-deleted-users.ts` - TypeScript cleanup script
- `cleanup-deleted-users.sql` - SQL cleanup script
- `../CRITICAL-FIX-DELETED-USERS.md` - Full documentation

## Expected Results

After cleanup and fresh sync:
- **Total Users:** Only active Google users (no deleted accounts)
- **Suspended:** Accurate count from Google
- **Admins:** Accurate admin count from Google

Dashboard should match Google Workspace Admin Console exactly.
