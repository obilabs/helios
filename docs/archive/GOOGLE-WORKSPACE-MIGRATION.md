# Google Workspace Migration Guide

## Overview

This document describes the database migration created for the Google Workspace integration feature in Helios Client Portal.

**Migration Number:** 015
**Created:** 2025-10-23
**Status:** ✅ Ready to run

## What This Migration Does

Creates the complete database structure for Google Workspace integration:

### Tables Created

1. **`gw_credentials`** - Service Account Storage
   - Stores encrypted Google Cloud service account credentials
   - Manages domain-wide delegation configuration
   - One record per organization

2. **`gw_synced_users`** - User Directory Cache
   - Caches users from Google Workspace directory
   - Enables fast local queries without API calls
   - Tracks sync status and timestamps

3. **`gw_groups`** - Groups Cache
   - Caches Google Workspace groups
   - Stores member counts and metadata
   - Enables group management features

4. **`gw_org_units`** - Organizational Units Cache
   - Caches OU hierarchy from Google Workspace
   - Maintains parent-child relationships
   - Supports OU-based filtering

### Additional Changes

- Adds `google_workspace_id` column to `organization_users` table
- Creates optimized indexes for common queries
- Registers "Google Workspace" module in modules table
- Sets up automatic timestamp update triggers

## Running the Migration

### Prerequisites

1. **Database running** - Ensure PostgreSQL is running
   ```bash
   # Using Docker Compose
   docker-compose up -d postgres

   # Or check if running
   docker ps | grep postgres
   ```

2. **Environment configured** - Backend `.env` file exists
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Node modules installed**
   ```bash
   cd backend
   npm install
   ```

### Run Migration

**Option 1: Using npm script (Recommended)**
```bash
cd backend
npm run db:migrate:gw
```

**Option 2: Using ts-node directly**
```bash
cd backend
npx ts-node src/scripts/run-gw-migration.ts
```

**Option 3: Using psql**
```bash
psql -U postgres -d helios_client -f database/migrations/015_create_google_workspace_tables.sql
```

### Expected Output

```
🚀 Running Google Workspace Migration 015...

✅ Migration 015 completed successfully!

Google Workspace tables created:
  ✓ gw_credentials
  ✓ gw_synced_users
  ✓ gw_groups
  ✓ gw_org_units

Column added:
  ✓ organization_users.google_workspace_id

📋 Next steps:
  1. Start the backend server (npm run dev)
  2. Go to Settings > Modules in the frontend
  3. Enable Google Workspace
  4. Upload service account credentials
  5. Test connection and complete setup
```

## Verification

Verify the migration was successful:

```sql
-- Check all Google Workspace tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'gw_%'
  AND table_schema = 'public';

-- Expected: gw_credentials, gw_synced_users, gw_groups, gw_org_units

-- Check module was registered
SELECT name, slug, version, is_available
FROM modules
WHERE slug = 'google-workspace';

-- Expected: Google Workspace | google-workspace | 1.0.0 | true

-- Check column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organization_users'
  AND column_name = 'google_workspace_id';

-- Expected: google_workspace_id | character varying
```

## Next Steps After Migration

### 1. Start the Backend Server

```bash
cd backend
npm run dev
```

The server should start on port 3001 with Google Workspace routes registered.

### 2. Configure Google Workspace (via UI)

1. Navigate to **Settings > Modules** in the frontend
2. Find **Google Workspace** in the modules list
3. Click **Enable** or **Configure**
4. The configuration wizard will open with 4 steps:

   **Step 1: Upload Service Account**
   - Upload your Google Cloud service account JSON key file
   - File is validated for required fields

   **Step 2: Configure Domain**
   - Enter your Google Workspace domain (e.g., `example.com`)
   - Enter super admin email for delegation (e.g., `admin@example.com`)

   **Step 3: Test Connection**
   - Click "Test Connection" to verify domain-wide delegation
   - Success means credentials are valid and delegation is working

   **Step 4: Complete Setup**
   - Review configuration summary
   - Click "Complete Setup" to save

### 3. Initial Sync

After configuration is complete:

1. Go to **Settings > Modules > Google Workspace**
2. Click **"Sync Now"** button
3. Wait for sync to complete (shows progress)
4. View synced data in:
   - **Users** page - Shows all Google Workspace users
   - **Groups** page - Shows all Google Workspace groups

### 4. Automatic Sync (Optional)

Enable automatic syncing to keep data up-to-date:

1. Go to **Settings > Modules > Google Workspace**
2. Toggle **"Auto Sync"** to ON
3. Set **sync interval** (default: 24 hours)

## Architecture Overview

### How It Works

```
┌─────────────────────────────────────────────────────┐
│                 Frontend (React)                    │
│                                                     │
│  Settings > Modules > Google Workspace             │
│    - GoogleWorkspaceWizard.tsx                     │
│    - Configuration UI                               │
└────────────────┬────────────────────────────────────┘
                 │
                 │ HTTPS API Calls
                 ▼
┌─────────────────────────────────────────────────────┐
│            Backend (Node.js/Express)                │
│                                                     │
│  Routes: google-workspace.routes.ts                │
│    POST /api/google-workspace/setup                │
│    POST /api/google-workspace/test-connection      │
│    POST /api/google-workspace/sync-now             │
│    GET  /api/google-workspace/users                │
│    GET  /api/google-workspace/groups               │
│                                                     │
│  Service: google-workspace.service.ts              │
│    - Domain-Wide Delegation                        │
│    - Google Admin SDK integration                  │
│    - User/Group/OU fetching                        │
│                                                     │
│  Scheduler: sync-scheduler.service.ts              │
│    - Periodic syncing                              │
│    - Cache management                              │
└────────────────┬────────────────────────────────────┘
                 │
                 │ SQL Queries
                 ▼
┌─────────────────────────────────────────────────────┐
│          PostgreSQL Database                        │
│                                                     │
│  Tables:                                            │
│    - gw_credentials (service account)              │
│    - gw_synced_users (cached users)                │
│    - gw_groups (cached groups)                     │
│    - gw_org_units (cached OUs)                     │
│    - organization_users (linked users)             │
│    - organization_modules (module config)          │
└─────────────────────────────────────────────────────┘
                 │
                 │ Domain-Wide Delegation
                 ▼
┌─────────────────────────────────────────────────────┐
│         Google Workspace Admin API                  │
│                                                     │
│  - Directory API (users, groups, OUs)              │
│  - Service Account authentication                   │
│  - Impersonates admin@domain.com                   │
└─────────────────────────────────────────────────────┘
```

### Data Flow

1. **Configuration:**
   - Admin uploads service account JSON
   - Credentials stored in `gw_credentials` (encrypted)
   - Module enabled in `organization_modules`

2. **Sync Process:**
   - Scheduler calls Google Admin API via domain-wide delegation
   - Fetches users, groups, and organizational units
   - Stores in cache tables (`gw_synced_users`, `gw_groups`, `gw_org_units`)
   - Links to `organization_users` table

3. **Usage:**
   - Frontend queries cached data for fast responses
   - Manual sync button triggers immediate refresh
   - Auto-sync runs on configured interval

## Troubleshooting

### Migration Fails

**Error: `relation "organizations" does not exist`**
- **Cause:** Base tables not created yet
- **Solution:** Run base schema first: `psql -U postgres -d helios_client -f database/schema_organization.sql`

**Error: `relation "gw_credentials" already exists`**
- **Cause:** Migration already run
- **Solution:** This is normal. The migration uses `IF NOT EXISTS` to handle this gracefully.

**Error: `Database connection refused`**
- **Cause:** PostgreSQL not running or wrong credentials
- **Solution:**
  1. Start database: `docker-compose up -d postgres`
  2. Check `.env` file has correct credentials
  3. Test connection: `psql -U postgres -d helios_client -c "SELECT 1;"`

### Connection Test Fails

**Error: `Domain-wide delegation not properly configured`**
- **Cause:** Service account doesn't have delegation enabled
- **Solution:** See `GOOGLE-WORKSPACE-SETUP-GUIDE.md` section on enabling delegation

**Error: `Admin email is not a super admin or domain is incorrect`**
- **Cause:** Email provided is not a Google Workspace super admin
- **Solution:** Use an admin account with super admin privileges

**Error: `Service account not authorized`**
- **Cause:** Required API scopes not granted in Google Admin Console
- **Solution:** Add scopes in Admin Console > Security > API Controls > Domain-wide delegation

### Sync Fails

**Error: `No credentials found for this organization`**
- **Cause:** Google Workspace not configured yet
- **Solution:** Complete setup wizard first

**Error: `Insufficient permissions`**
- **Cause:** Service account scopes insufficient
- **Solution:** Ensure all required scopes are authorized

**Check sync logs:**
```sql
-- View sync errors
SELECT
  om.sync_status,
  om.sync_error,
  om.last_sync_at
FROM organization_modules om
JOIN modules m ON m.id = om.module_id
WHERE m.slug = 'google-workspace';
```

## Rollback

If you need to rollback this migration:

```sql
-- WARNING: This will delete all Google Workspace data

BEGIN;

-- Drop tables
DROP TABLE IF EXISTS gw_org_units CASCADE;
DROP TABLE IF EXISTS gw_groups CASCADE;
DROP TABLE IF EXISTS gw_synced_users CASCADE;
DROP TABLE IF EXISTS gw_credentials CASCADE;

-- Remove column
ALTER TABLE organization_users
DROP COLUMN IF EXISTS google_workspace_id;

-- Remove module (optional)
DELETE FROM organization_modules
WHERE module_id IN (
  SELECT id FROM modules WHERE slug = 'google-workspace'
);

DELETE FROM modules
WHERE slug = 'google-workspace';

COMMIT;
```

## Files Created

This migration includes the following files:

1. **Migration SQL**
   - `database/migrations/015_create_google_workspace_tables.sql`
   - Main migration file with DDL statements

2. **Migration Runner**
   - `backend/src/scripts/run-gw-migration.ts`
   - TypeScript script to run migration programmatically

3. **Documentation**
   - `database/migrations/README-015.md`
   - Technical migration documentation
   - `GOOGLE-WORKSPACE-MIGRATION.md` (this file)
   - User-facing migration guide

4. **Updated Files**
   - `backend/package.json` - Added `db:migrate:gw` script

## Related Documentation

- **Setup Guide:** `GOOGLE-WORKSPACE-SETUP-GUIDE.md` - End-user setup instructions
- **Security:** `SECURITY-SERVICE-ACCOUNTS.md` - Critical security requirements
- **Architecture:** `CLAUDE.md` - Overall system architecture
- **Provider Guide:** `PROVIDER-SETUP-GUIDE.md` - For MSPs helping clients

## Support

For issues or questions:

1. Check this documentation
2. Review backend logs: `backend/logs/`
3. Check database for error details
4. Consult `GOOGLE-WORKSPACE-SETUP-GUIDE.md`

## Security Notes

⚠️ **CRITICAL SECURITY REQUIREMENTS**

1. **Each organization MUST use their own service account**
   - Never share service accounts between organizations
   - See `SECURITY-SERVICE-ACCOUNTS.md` for details

2. **Encrypt service account keys at rest**
   - Implement application-level encryption
   - Use `ENCRYPTION_KEY` from `.env`

3. **Limit access to credentials**
   - Only admins can configure Google Workspace
   - API routes should validate user roles

4. **Regular security audits**
   - Review who has access to service accounts
   - Rotate service account keys periodically
   - Monitor API usage in Google Cloud Console

---

**Migration Status:** ✅ Complete and ready to use
**Last Updated:** 2025-10-23
**Version:** 1.0.0
