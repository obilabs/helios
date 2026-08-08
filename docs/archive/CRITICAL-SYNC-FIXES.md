# Critical Google Workspace Sync Fixes Required

## Issues Found

1. **Wrong Database Table**: User sync is using `users` table which doesn't exist - should be `organization_users`
2. **Missing Extended Properties**: Not syncing department, job title, manager, phones from Google
3. **Group Members Not Synced**: Groups sync but not their membership
4. **Org Units Endpoint Issue**: Frontend wasn't passing organizationId (FIXED)
5. **Manager Relationships Lost**: No manager data being synced, so no org chart

## Required Fixes

### 1. Fix User Sync Table (CRITICAL)

**File**: `backend/src/services/user-sync.service.ts`

Replace all references:
- `users` → `organization_users`
- Add missing fields: `job_title`, `department`, `manager_id`, `organizational_unit`, `mobile_phone`, `work_phone`

### 2. Sync Extended User Properties

**File**: `backend/src/services/google-workspace.service.ts`

Already updated `getUsers()` to fetch:
```typescript
projection: 'full'  // Gets all fields
// Now includes:
organizations: user.organizations || [],
phones: user.phones || [],
relations: user.relations || [],
department: user.organizations?.[0]?.department || '',
jobTitle: user.organizations?.[0]?.title || '',
managerEmail: user.relations?.find(r => r.type === 'manager')?.value || ''
```

### 3. Update User Sync to Save Properties

**File**: `backend/src/services/user-sync.service.ts`

Need to:
1. Change table from `users` to `organization_users`
2. Add columns: `job_title`, `department`, `organizational_unit`, `mobile_phone`, `work_phone`
3. Add manager lookup and save `manager_id`

### 4. Sync Group Members

**File**: `backend/src/services/google-workspace.service.ts`

In `syncGroups()` method, after syncing groups:
```typescript
// For each group, sync its members
for (const group of groups) {
  const membersResult = await this.getGroupMembers(organizationId, group.id);
  if (membersResult.success) {
    // Save to access_group_members table
  }
}
```

### 5. Fix Database Schema Issues

The sync service is using tables that don't exist:
- `users` table → should be `organization_users`
- `user_platforms` table → doesn't exist in our schema

## Implementation Priority

1. **URGENT**: Fix table name from `users` to `organization_users`
2. **HIGH**: Add extended properties to user sync
3. **HIGH**: Sync group memberships
4. **MEDIUM**: Add manager relationships
5. **LOW**: Clean up unused tables/references

## Testing After Fixes

1. Run full Google sync
2. Check if users have:
   - Department and job title
   - Manager relationships
   - Phone numbers
   - Organizational unit
3. Check if groups have members
4. Verify org chart can be built
5. Test bidirectional sync still works

## Root Cause

The sync service appears to be from an older schema design that had separate `users` and `user_platforms` tables. Our current schema uses `organization_users` as the main table. This mismatch is causing sync to fail silently.