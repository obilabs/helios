# Admin Platform Enhancements Proposal

## Summary

Comprehensive enhancements to the Helios admin platform covering Developer Console UX improvements, Users page fixes, Microsoft 365 relay implementation, admin workflow commands based on GAM/PSGSuite patterns, and unified user synchronization across platforms.

## Problem Statement

### 1. Developer Console UX Issues

The current Developer Console has functional command execution but poor UX for daily use:

- **Help/Examples are modal-only**: Users must close the help to use the console, breaking the learning workflow
- **No persistent command reference**: Power users have to repeatedly open/close help as they learn
- **No quick command insertion**: Users must manually type commands from examples
- **No pop-out capability**: Cannot reference the console while working in other pages
- **Console commands not audited**: Google API calls via proxy are logged, but direct console commands are not

### 2. Users Page Critical Issues

Multiple UI/UX problems identified:

- **Stats bar (2x2 grid)**: Floating on the right side of the table, looks out of place and confusing
- **User initials avatars**: Inconsistent, ugly, and adds visual clutter without value
- **Non-functional buttons**: Export and Actions dropdown buttons do nothing when clicked
- **Filter doesn't work**: Can't filter by platform (local vs Google vs Microsoft)
- **Table column overflow**: Content doesn't fit in columns, especially with long emails/names
- **Search is hidden**: `.search-box { display: none }` in CSS
- **No user delete functionality**: Missing DELETE route and UI for user removal
- **No data transfer workflow**: When offboarding, no way to transfer Drive/email/calendar data

### 3. Missing Admin Workflow Commands

Based on research of GAM (Google Apps Manager) and PSGSuite (PowerShell), the following high-value commands are missing or incomplete:

**User Lifecycle:**
- `helios gw users create` - Create user in Google Workspace
- `helios gw users delete` - Delete user from Google Workspace
- `helios gw users suspend/unsuspend` - Suspend/restore user
- `helios gw users transfer` - Transfer Drive/docs/calendar ownership
- `helios gw users update` - Update user attributes
- `helios gw users password` - Reset/change password
- `helios gw users aliases` - Manage email aliases

**Delegation & Forwarding:**
- `helios gw delegates add/remove` - Manage email delegates
- `helios gw forwarding set/remove` - Configure email forwarding
- `helios gw vacation set/remove` - Set out-of-office responder

**Bulk Operations:**
- `helios gw users export` - Export users to CSV
- `helios gw users import` - Import users from CSV
- `helios gw users bulk-update` - Update multiple users

### 4. Microsoft 365 Relay

Currently only Google Workspace has a transparent proxy/relay for API calls. The same pattern should be applied to Microsoft 365 via Microsoft Graph API.

### 5. User Synchronization Gap

When creating/deleting users in Google Workspace or Microsoft 365, they should also exist in the Helios organization_users table for unified management.

---

## Research Findings

### Top Admin Tasks (from industry research)

**Source:** [Spin.AI](https://spin.ai/blog/tasks-for-efficient-google-workspace-admin/), [GAM Documentation](https://github.com/GAM-team/GAM)

| Rank | Task | GAM Command | Helios Console Equivalent |
|------|------|-------------|---------------------------|
| 1 | List all users | `gam print users` | `helios gw users list` |
| 2 | Create user | `gam create user` | `helios gw users create` (MISSING) |
| 3 | Reset password | `gam update user password` | `helios gw users password` (MISSING) |
| 4 | Suspend user | `gam update user suspended on` | `helios gw users suspend` (PARTIAL) |
| 5 | Delete user | `gam delete user` | `helios gw users delete` (MISSING) |
| 6 | Add to group | `gam update group add member` | `helios gw groups members add` |
| 7 | Remove from group | `gam update group remove member` | `helios gw groups members remove` |
| 8 | Transfer ownership | `gam create datatransfer` | MISSING |
| 9 | Set forwarding | `gam user forward` | MISSING |
| 10 | Set vacation | `gam user vacation` | MISSING |

### PSGSuite Top Commands

**Source:** [PSGSuite.io](https://psgsuite.io/)

```powershell
# User Management
Get-GSUserList                    # helios gw users list
Get-GSUser <email>                # helios gw users get <email>
New-GSUser                        # helios gw users create (MISSING)
Update-GSUser                     # helios gw users update (MISSING)
Remove-GSUser                     # helios gw users delete (MISSING)

# Group Management
Get-GSGroup                       # helios gw groups list
New-GSGroup                       # helios gw groups create (MISSING)
Get-GSGroupMember                 # helios gw groups members list
Add-GSGroupMember                 # helios gw groups members add

# Delegation & Settings
Add-GSGmailDelegate               # MISSING
Add-GSGmailForwardingAddress      # MISSING
```

### Microsoft Graph API Relay Feasibility

**Source:** [Microsoft Learn](https://learn.microsoft.com/en-us/graph/api/resources/azure-ad-auditlog-overview)

**Verdict: Fully feasible - same pattern as Google.**

Microsoft Graph API provides:
- `/users` - User management (CRUD, password reset, license assignment)
- `/groups` - Group management
- `/me/mailFolders` - Email access
- `/me/drive` - OneDrive access
- Activity logs via `/auditLogs/directoryAudits`

Implementation pattern:
```typescript
// backend/src/middleware/microsoft-transparent-proxy.ts
// Same architecture as transparent-proxy.ts for Google

app.use('/api/microsoft/*', async (req, res) => {
  // 1. Authenticate with Graph API using tenant credentials
  // 2. Forward request to https://graph.microsoft.com/v1.0/*
  // 3. Log to api_key_usage_logs / activity_logs
  // 4. Return response
});
```

---

## Proposed Solutions

### 1. Developer Console UX Enhancements

#### 1.1 Pinnable Help Panel

Replace modal-based help with a dockable side panel:

```
┌──────────────────────────────────────────────────────────────────┐
│ [Commands ▼] [Examples ▼]  [📌 Dock Left] [📌 Dock Right] [✕]   │
├──────────────────────────────────────────────────────────────────┤
│                              │                                    │
│ ┌─ Commands ───────────────┐ │  Console Output                   │
│ │                          │ │                                    │
│ │ helios gw users list     │ │  $ helios gw users list           │
│ │   List all GW users      │ │  > Loading...                      │
│ │   [Insert]               │ │  > Found 142 users                 │
│ │                          │ │  ┌──────────────────────────┐      │
│ │ helios gw users get      │ │  │ Email          │ Name   │      │
│ │   Get user details       │ │  ├──────────────────────────┤      │
│ │   [Insert]               │ │  │ alice@...      │ Alice  │      │
│ │                          │ │  └──────────────────────────┘      │
│ │ helios gw users create   │ │                                    │
│ │   Create new user        │ │  $ _                               │
│ │   [Insert]               │ │                                    │
│ └──────────────────────────┘ │                                    │
│                              │                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- Dock to left or right side of console
- Collapse/expand without closing
- Search within commands
- `[Insert]` button pastes command template into input
- Persistent state (remembers dock preference)

#### 1.2 Pop-out Console Window

Enable console to run in a separate window:

```typescript
const popOutConsole = () => {
  const popup = window.open(
    '/console?mode=popup',
    'heliosConsole',
    'width=1000,height=700,menubar=no,toolbar=no,location=no'
  );
  // Maintain session/auth state
};
```

**Features:**
- Floating window that persists across page navigation
- Shares authentication with main app
- Minimal chrome (no duplicate headers)
- Can be moved to secondary monitor

#### 1.3 Console Command Audit Logging

Add audit logging for all console commands:

```typescript
// After command execution in DeveloperConsole.tsx
await fetch('/api/v1/organization/audit-logs', {
  method: 'POST',
  body: JSON.stringify({
    action: 'console_command_executed',
    resource_type: 'developer_console',
    description: command,
    metadata: {
      duration_ms: executionTime,
      result_status: success ? 'success' : 'error',
      result_count: data?.length || 0
    }
  })
});
```

### 2. Users Page Critical Fixes

#### 2.1 Remove User Initials Avatar

The gray initials circles add no value and make the table look cluttered:

```diff
- <div className="user-avatar" style={{ backgroundColor: "#e5e7eb", color: "#6b7280" }}>
-   {initials}
- </div>
+ {/* Avatar removed - name is sufficient */}
```

Or use a proven library like [react-avatar](https://www.npmjs.com/package/react-avatar) with Gravatar fallback if avatars are needed.

#### 2.2 Fix Stats Bar Layout

Current 2x2 floating stat cards don't make sense. Options:

**Option A: Remove entirely** (recommended for clean table focus)
```diff
- <div className="users-stats-bar">
-   ...
- </div>
```

**Option B: Move to horizontal bar above tabs** (like JumpCloud)
```
┌─────────────────────────────────────────────────────────────┐
│ Total: 142  │  Active: 138  │  Pending: 3  │  Suspended: 1  │
└─────────────────────────────────────────────────────────────┘
```

#### 2.3 Fix Table Column Grid

Current grid doesn't accommodate content:
```css
/* Current - doesn't work well */
grid-template-columns: 36px 180px 200px 120px 90px 100px 90px 100px 48px 36px;

/* Proposed - use flex with min-widths */
.table-row {
  display: flex;
  align-items: center;
}
.col-checkbox { width: 36px; flex-shrink: 0; }
.col-user { min-width: 160px; flex: 1; }
.col-email { min-width: 200px; flex: 1.5; }
.col-department { min-width: 100px; flex: 0.8; }
.col-role { width: 80px; flex-shrink: 0; }
.col-platforms { width: 60px; flex-shrink: 0; }
.col-status { width: 90px; flex-shrink: 0; }
.col-last-login { width: 100px; flex-shrink: 0; }
.col-actions { width: 48px; flex-shrink: 0; }
```

#### 2.4 Implement Export Functionality

```typescript
// Add to UserList.tsx
const handleExport = async (format: 'csv' | 'json') => {
  const token = localStorage.getItem('helios_token');
  const response = await fetch(`/api/v1/organization/users/export?format=${format}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `users-${new Date().toISOString().split('T')[0]}.${format}`;
  a.click();
};
```

#### 2.5 Implement Actions Dropdown

```typescript
const actions = [
  { label: 'Bulk Suspend', action: handleBulkSuspend, requiresSelection: true },
  { label: 'Bulk Activate', action: handleBulkActivate, requiresSelection: true },
  { label: 'Bulk Delete', action: handleBulkDelete, requiresSelection: true },
  { divider: true },
  { label: 'Sync from Google', action: triggerGoogleSync },
  { label: 'Import from CSV', action: () => onNavigate?.('import-users') }
];
```

#### 2.6 Add Platform Filter

Enable filtering by source platform:

```typescript
const platformFilters = [
  { value: 'all', label: 'All Platforms' },
  { value: 'local', label: 'Local Only' },
  { value: 'google_workspace', label: 'Google Workspace' },
  { value: 'microsoft_365', label: 'Microsoft 365' }
];

// In fetchUsers, add filter
if (platformFilter && platformFilter !== 'all') {
  queryParams.append('platform', platformFilter);
}
```

### 3. Microsoft 365 Transparent Proxy

Create `/api/microsoft/*` relay matching Google pattern:

```typescript
// backend/src/middleware/microsoft-transparent-proxy.ts
import { Client } from '@microsoft/microsoft-graph-client';

export async function microsoftTransparentProxy(req, res) {
  const graphPath = req.path.replace('/api/microsoft/', '');

  // Get org's MS365 credentials
  const credentials = await getMicrosoft365Credentials(req.organizationId);

  // Create authenticated Graph client
  const client = Client.initWithMiddleware({
    authProvider: new MicrosoftAuthProvider(credentials)
  });

  // Forward request
  const startTime = Date.now();
  try {
    const result = await client.api(`/${graphPath}`)[req.method.toLowerCase()](req.body);

    // Log to audit
    await logAuditEntry({
      action: `microsoft_api_${req.method.toLowerCase()}`,
      resource_type: 'microsoft_365',
      resource_id: graphPath,
      actor: req.user || req.apiKey,
      duration_ms: Date.now() - startTime
    });

    res.json(result);
  } catch (error) {
    // Log error and respond
  }
}
```

### 4. Admin Workflow Commands

Add missing commands to Developer Console:

#### User Management
```typescript
// helios gw users create
{
  command: 'helios gw users create',
  handler: async (args) => {
    const userData = parseUserArgs(args); // --email, --firstName, --lastName, --orgUnit
    return await fetch('/api/google/admin/directory/v1/users', {
      method: 'POST',
      body: JSON.stringify({
        primaryEmail: userData.email,
        name: { givenName: userData.firstName, familyName: userData.lastName },
        password: generateSecurePassword(),
        changePasswordAtNextLogin: true,
        orgUnitPath: userData.orgUnit || '/'
      })
    });
  }
}

// helios gw users delete
{
  command: 'helios gw users delete',
  handler: async (args) => {
    const { email, transferTo } = parseArgs(args);
    if (transferTo) {
      // First transfer data
      await initiateDataTransfer(email, transferTo);
    }
    return await fetch(`/api/google/admin/directory/v1/users/${email}`, {
      method: 'DELETE'
    });
  }
}

// helios gw users password
{
  command: 'helios gw users password',
  handler: async (args) => {
    const { email, password, notify } = parseArgs(args);
    await fetch(`/api/google/admin/directory/v1/users/${email}`, {
      method: 'PATCH',
      body: JSON.stringify({
        password: password || generateSecurePassword(),
        changePasswordAtNextLogin: true
      })
    });
    if (notify) {
      // Send password to alternate email
    }
  }
}
```

#### Data Transfer
```typescript
// helios gw transfer
{
  command: 'helios gw transfer',
  handler: async (args) => {
    const { from, to, applications } = parseArgs(args);
    // applications: drive, calendar, all
    return await fetch('/api/google/admin/datatransfer/v1/transfers', {
      method: 'POST',
      body: JSON.stringify({
        oldOwnerUserId: await getUserId(from),
        newOwnerUserId: await getUserId(to),
        applicationDataTransfers: applications.map(app => ({
          applicationId: getApplicationId(app),
          applicationTransferParams: []
        }))
      })
    });
  }
}
```

### 5. User Synchronization

When creating/modifying users in Google/Microsoft, also update Helios:

```typescript
// In transparent-proxy.ts POST handler for user creation
if (isUserCreation) {
  const googleUser = response.data;

  // Also create in Helios organization_users
  await db.query(`
    INSERT INTO organization_users (
      id, organization_id, email, first_name, last_name,
      google_workspace_id, source, user_status
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, 'google_workspace', 'active'
    )
    ON CONFLICT (organization_id, email)
    DO UPDATE SET
      google_workspace_id = EXCLUDED.google_workspace_id,
      updated_at = NOW()
  `, [orgId, googleUser.primaryEmail, googleUser.name.givenName,
      googleUser.name.familyName, googleUser.id]);
}
```

---

## Implementation Priority

### P0 - Critical (Blocks Daily Use)
1. Fix Users page table layout and column widths
2. Implement Export functionality
3. Implement Actions dropdown
4. Add platform filter
5. Console command audit logging

### P1 - High (Power User Features)
6. Pinnable help panel for Developer Console
7. Insert command button
8. Add `users create/delete/password` commands
9. Add data transfer command
10. User sync between platforms

### P2 - Medium (Nice to Have)
11. Pop-out console window
12. Microsoft 365 transparent proxy
13. Bulk import/export via CSV
14. Delegation and forwarding commands

### P3 - Low (Future)
15. Remove user initials (or implement proper avatars)
16. Vacation responder commands
17. Advanced filtering and saved filters

---

## Success Criteria

1. Users page loads without visual glitches, columns fit content
2. Export button downloads CSV/JSON of current filtered users
3. Actions dropdown enables bulk operations
4. Platform filter shows only Google/MS/Local users
5. Console commands are logged to `activity_logs` table
6. Help panel can be pinned and doesn't block console
7. `helios gw users create/delete/password` commands work
8. Creating a user in Google also creates them in Helios
9. Data transfer initiates properly for offboarding

---

## Technical Dependencies

- Database migrations for any new columns
- Microsoft Graph SDK: `@microsoft/microsoft-graph-client`
- React portals for pop-out window communication
- LocalStorage for panel dock preferences

---

## References

- [GAM Command Reference](https://github.com/GAM-team/GAM)
- [PSGSuite Documentation](https://psgsuite.io/)
- [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/overview)
- [Google Admin SDK](https://developers.google.com/admin-sdk)
- [EnterpriseReady Audit Logging](https://www.enterpriseready.io/features/audit-log/)
- [CLI UX Best Practices](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays)
