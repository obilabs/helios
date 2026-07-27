# Autonomous Agent Development Rules

This document contains critical rules and constraints for autonomous development on Helios.

## CRITICAL: Database Schema Rules

### Use Correct Table Names

The database uses these tables - DO NOT invent new table names:

| Correct Table | Description |
|---------------|-------------|
| `modules` | Available module definitions |
| `organization_modules` | Modules enabled for an organization |
| `organizations` | Single organization record |
| `organization_users` | Users in the organization |
| `gw_credentials` | Google Workspace service account credentials |
| `gw_synced_users` | Synced users from Google Workspace |
| `gw_groups` | Synced groups from Google Workspace |

**NEVER use these non-existent table names:**
- ~~`available_modules`~~ - Use `modules`
- ~~`tenants`~~ - Use `organizations`
- ~~`tenant_modules`~~ - Use `organization_modules`

### Module Table Column Names

The `modules` table has these columns:
- `id` (UUID)
- `name` (VARCHAR) - e.g., "Google Workspace"
- `slug` (VARCHAR) - e.g., "google_workspace"
- `description` (TEXT)
- `icon` (VARCHAR)
- `version` (VARCHAR)
- `is_available` (BOOLEAN)
- `config_schema` (JSONB)

**NEVER use:**
- ~~`module_key`~~ - Use `slug`
- ~~`module_name`~~ - Use `name`

## CRITICAL: Google Workspace API Scopes

### Use Full Access Scopes (Not Readonly)

When requesting OAuth scopes for Domain-Wide Delegation, use the **full access** versions, not readonly:

**CORRECT:**
```typescript
scopes: [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.group',
  'https://www.googleapis.com/auth/admin.directory.orgunit'
]
```

**INCORRECT:**
```typescript
scopes: [
  'https://www.googleapis.com/auth/admin.directory.user.readonly',  // Wrong!
  'https://www.googleapis.com/auth/admin.directory.group.readonly'   // Wrong!
]
```

**Why:** Google's Domain-Wide Delegation requires exact scope matching. If the admin configured `admin.directory.user` but the code requests `admin.directory.user.readonly`, it will fail with `unauthorized_client`.

### Required Scopes for Helios

The minimum scopes needed for full functionality:
```
https://www.googleapis.com/auth/admin.directory.user
https://www.googleapis.com/auth/admin.directory.group
https://www.googleapis.com/auth/admin.directory.orgunit
https://www.googleapis.com/auth/admin.directory.domain
https://www.googleapis.com/auth/admin.reports.audit.readonly
https://www.googleapis.com/auth/admin.reports.usage.readonly
```

## Test Environment

### Test Google Workspace Credentials

A test service account is available at:
```
backend/.secrets/test-service-account.json
```

**Test domain:** `gridworx.io`
**Test admin:** `mike@gridworx.io`

### Testing Google Workspace Integration

To verify the Google Workspace integration works:

```bash
cd /var/www/helios-client/backend
npx ts-node -e "
const { google } = require('googleapis');
const fs = require('fs');

const sa = JSON.parse(fs.readFileSync('.secrets/test-service-account.json', 'utf8'));
const auth = new google.auth.JWT({
  email: sa.client_email,
  key: sa.private_key,
  scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
  subject: 'mike@gridworx.io'
});

(async () => {
  await auth.authorize();
  const admin = google.admin({ version: 'directory_v1', auth });
  const res = await admin.users.list({ domain: 'gridworx.io', maxResults: 5 });
  console.log('Users:', res.data.users.map(u => u.primaryEmail));
})();
"
```

Expected output: List of users including mike@gridworx.io

## Module Enable Flow

When a module is enabled, the following MUST happen:

1. Insert/update `organization_modules` with `is_enabled = true`
2. For Google Workspace: also save credentials to `gw_credentials`
3. Trigger initial sync immediately after first enable
4. Update `last_sync_at` and `sync_status` after sync

### Auto-Sync on First Enable

When Google Workspace is first configured, an immediate sync MUST be triggered:

```typescript
// After saving credentials successfully
await googleWorkspaceSync.syncAll(organizationId);
```

Do NOT rely on the scheduler for the first sync - users expect immediate results.

## Before Committing

1. **Verify TypeScript compiles:** `npm run build`
2. **Test database queries:** Ensure all table/column names are correct
3. **Test Google Workspace:** Run the test script above
4. **Check for regressions:** Run existing E2E tests

## Common Mistakes to Avoid

1. **Creating new tables** without a migration
2. **Renaming tables/columns** in code without updating the database
3. **Using readonly scopes** when full access is configured
4. **Forgetting initial sync** when enabling integrations
5. **Not persisting module state** to `organization_modules`
