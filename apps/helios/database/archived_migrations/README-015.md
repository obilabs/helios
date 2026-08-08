# Migration 015: Google Workspace Integration Tables

**Created:** 2025-10-23
**Status:** Ready to run
**Dependencies:** Requires `organizations` and `organization_users` tables

## Overview

This migration creates the database tables required for Google Workspace integration:

- `gw_credentials` - Service account credentials and domain-wide delegation config
- `gw_synced_users` - Cached user data from Google Workspace directory
- `gw_groups` - Cached Google Workspace groups
- `gw_org_units` - Cached organizational units from Google Workspace

## Tables Created

### 1. gw_credentials
Stores encrypted service account credentials for domain-wide delegation.

**Key Fields:**
- `service_account_key` - Encrypted JSON service account key
- `admin_email` - Super admin email for impersonation
- `domain` - Google Workspace domain
- `is_valid` - Connection validation status

### 2. gw_synced_users
Caches user data from Google Workspace for fast local access.

**Key Fields:**
- `google_id` - Google's unique user identifier
- `email` - Primary email address
- `full_name`, `given_name`, `family_name` - Name fields
- `is_admin`, `is_suspended` - User status
- `org_unit_path`, `department`, `job_title` - Organization structure
- `raw_data` - Full JSON response from Google API

### 3. gw_groups
Caches Google Workspace groups.

**Key Fields:**
- `google_id` - Google's unique group identifier
- `email` - Group email address
- `name`, `description` - Group details
- `member_count` - Number of direct members

### 4. gw_org_units
Caches organizational unit structure.

**Key Fields:**
- `google_id` - Google's unique OU identifier
- `path` - Full OU path (e.g., `/Sales/East`)
- `parent_id` - Parent OU for hierarchy

## Additional Changes

- Adds `google_workspace_id` column to `organization_users` table
- Creates indexes for optimal query performance
- Registers "Google Workspace" module in the `modules` table
- Sets up automatic timestamp triggers

## Running the Migration

### Option 1: Using npm script (Recommended)
```bash
cd backend
npm run db:migrate:gw
```

### Option 2: Using psql directly
```bash
psql -U postgres -d helios_client -f database/migrations/015_create_google_workspace_tables.sql
```

### Option 3: Using ts-node
```bash
cd backend
npx ts-node src/scripts/run-gw-migration.ts
```

## Verification

After running the migration, verify tables were created:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'gw_%'
  AND table_schema = 'public';

-- Should return:
-- gw_credentials
-- gw_synced_users
-- gw_groups
-- gw_org_units

-- Check module was registered
SELECT name, slug, version
FROM modules
WHERE slug = 'google-workspace';

-- Should return:
-- Google Workspace | google-workspace | 1.0.0
```

## Next Steps

After successful migration:

1. **Start Backend Server**
   ```bash
   cd backend
   npm run dev
   ```

2. **Configure Google Workspace Module**
   - Navigate to Settings > Modules in the frontend
   - Click "Enable" on Google Workspace
   - Upload service account JSON key
   - Enter admin email and domain
   - Test connection

3. **Initial Sync**
   - Click "Sync Now" to pull users, groups, and OUs
   - Verify data appears in the respective tables

## Rollback

To rollback this migration:

```sql
-- Drop Google Workspace tables
DROP TABLE IF EXISTS gw_org_units CASCADE;
DROP TABLE IF EXISTS gw_groups CASCADE;
DROP TABLE IF EXISTS gw_synced_users CASCADE;
DROP TABLE IF EXISTS gw_credentials CASCADE;

-- Remove column from organization_users
ALTER TABLE organization_users DROP COLUMN IF EXISTS google_workspace_id;

-- Remove module registration (optional)
DELETE FROM modules WHERE slug = 'google-workspace';
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Service Account Isolation**
   - Each organization MUST use their own Google Cloud service account
   - Never share service accounts between organizations
   - See `SECURITY-SERVICE-ACCOUNTS.md` for details

2. **Credential Encryption**
   - Service account keys should be encrypted at rest
   - Consider implementing encryption in the application layer

3. **Access Control**
   - Only organization admins should configure Google Workspace
   - Implement proper RBAC checks in API routes

## Troubleshooting

### Migration fails with "relation already exists"
This is normal if you've run the migration before. The migration uses `IF NOT EXISTS` clauses to handle this gracefully.

### Module not appearing in frontend
1. Check `modules` table: `SELECT * FROM modules WHERE slug = 'google-workspace';`
2. Restart backend server
3. Clear browser cache

### Connection test fails
1. Verify service account has domain-wide delegation enabled
2. Check admin email is a super admin
3. Ensure required API scopes are authorized in Google Admin Console
4. Review backend logs for detailed error messages

## Related Files

- **Migration:** `database/migrations/015_create_google_workspace_tables.sql`
- **Runner Script:** `backend/src/scripts/run-gw-migration.ts`
- **Service Layer:** `backend/src/services/google-workspace.service.ts`
- **API Routes:** `backend/src/routes/google-workspace.routes.ts`
- **Frontend Wizard:** `frontend/src/components/modules/GoogleWorkspaceWizard.tsx`

## Support

For issues or questions:
1. Check the main `CLAUDE.md` documentation
2. Review `GOOGLE-WORKSPACE-SETUP-GUIDE.md`
3. Check backend logs for error details
