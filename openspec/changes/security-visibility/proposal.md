# Security Visibility Feature Proposal

## Summary

Add comprehensive security visibility features to achieve GAM CLI parity for security commands while providing rich UI experiences for:
- **2FA Status**: View and manage two-factor authentication enrollment across the organization
- **OAuth Apps/Tokens**: Visibility into third-party apps connected to user accounts
- **Dashboard Widgets**: Security metrics at-a-glance on the admin dashboard

## Motivation

Currently, admins have limited visibility into their organization's security posture:
- No way to see which users have 2FA enabled without checking each user individually
- No visibility into which third-party apps have access to organizational data
- No dashboard metrics for security compliance

GAM provides commands like `gam print tokens` and `gam print 2sv` that surface this data. Helios should provide both CLI parity AND superior UI experiences.

## Scope

### In Scope

1. **2FA Visibility**
   - List all users with 2FA status (enrolled/not enrolled)
   - Dashboard widget showing 2FA adoption rate
   - User slideout section showing 2FA status
   - CLI commands: `list 2fa`, `get 2fa <email>`

2. **OAuth App/Token Visibility**
   - Organization-wide view of all connected third-party apps
   - User count per app (e.g., "Slack - 145 users", "Zoom - 189 users")
   - Per-user connected apps in User Slideout
   - Ability to revoke app access (single user or bulk)
   - Dashboard widget: Top apps, risky app alerts
   - CLI commands: `list tokens`, `list tokens <email>`, `revoke token <email> <clientId>`

3. **Dashboard Security Widgets**
   - 2FA Adoption Rate widget
   - Top Connected Apps widget
   - Security Alerts widget (existing, enhance)
   - Users Without 2FA widget

4. **CLI Commands (GAM Parity)**
   - `list 2fa [--enrolled|--not-enrolled]`
   - `get 2fa <email>`
   - `list tokens [--user=<email>]`
   - `revoke token <email> <clientId> [--confirm]`
   - `revoke tokens <email> --all [--confirm]`

### Out of Scope (Future)

- 2FA enforcement/policy management
- App whitelisting/blacklisting
- Mobile device management
- Chrome OS device management
- Gmail filters/labels management

## User Stories

### As an Admin, I want to...

1. **See 2FA adoption at a glance**
   - Open dashboard → See "2FA Adoption: 78% (156/200 users)" widget
   - Click widget → Navigate to full 2FA report

2. **Identify users without 2FA**
   - Navigate to Users → Filter by "2FA: Not Enrolled"
   - OR Run `list 2fa --not-enrolled`

3. **See what apps a specific user has connected**
   - Open User Slideout → Click "Connected Apps" tab
   - See list: Slack, Zoom, Calendly, etc.
   - Click "Revoke" to remove access

4. **See all apps connected across the organization**
   - Navigate to Security → OAuth Apps
   - See table: App Name | Users | Last Used | Risk Level
   - Sort by user count to see most popular apps

5. **Revoke a risky app from all users**
   - Find app in OAuth Apps list → Click "Revoke All"
   - OR Run `revoke token --app="Suspicious App" --all --confirm`

## Technical Approach

### Data Sources

**2FA Status:**
- Google Admin SDK: `admin.users.get()` returns `isEnrolledIn2Sv` field
- Already available in user sync - just need to store and display

**OAuth Tokens:**
- Google Admin SDK: `admin.tokens.list({ userKey })` returns all OAuth apps for a user
- Need to aggregate across all users for org-wide view

### Database Changes

```sql
-- Cache 2FA status with each user sync
ALTER TABLE gw_synced_users ADD COLUMN IF NOT EXISTS
  is_enrolled_2sv BOOLEAN DEFAULT false;

-- OAuth apps table (aggregated view)
CREATE TABLE oauth_apps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  scopes TEXT[],
  risk_level VARCHAR(20) DEFAULT 'unknown', -- low, medium, high, unknown
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, client_id)
);

-- User-app associations
CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_email VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  scopes TEXT[],
  native_app BOOLEAN DEFAULT false,
  last_time_used TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_email, client_id)
);
```

### API Endpoints

```
GET  /api/v1/organization/security/2fa-status
     → { users: [...], summary: { total, enrolled, percentage } }

GET  /api/v1/organization/security/oauth-apps
     → { apps: [...], summary: { totalApps, totalGrants } }

GET  /api/v1/organization/security/oauth-apps/:clientId/users
     → { users: [...] }

GET  /api/v1/organization/users/:email/oauth-tokens
     → { tokens: [...] }

DELETE /api/v1/organization/users/:email/oauth-tokens/:clientId
       → Revoke specific token

POST /api/v1/organization/security/oauth-apps/:clientId/revoke-all
     → Bulk revoke from all users
```

### UI Components

1. **Dashboard Widgets** (add to widget registry)
   - `security-2fa-adoption`: Percentage + progress bar
   - `security-top-apps`: Top 5 connected apps
   - `security-users-without-2fa`: Count with drill-down

2. **User Slideout Tab**
   - New "Security" or "Connected Apps" tab
   - Shows 2FA status + list of connected apps

3. **Security Page**
   - New page at `/security/oauth-apps`
   - Table with filtering, sorting, bulk actions

### CLI Commands

Add to DeveloperConsole.tsx verb-first pattern:

```typescript
// 2FA Commands
case 'list':
  if (resource === '2fa') handleList2FA(args);
case 'get':
  if (resource === '2fa') handleGet2FA(args);

// Token Commands
case 'list':
  if (resource === 'tokens') handleListTokens(args);
case 'revoke':
  if (resource === 'token') handleRevokeToken(args);
```

## UI Mockups

### Dashboard Widget - 2FA Adoption
```
┌─────────────────────────────────┐
│ 🔐 2FA Adoption          78%   │
│ ████████████████░░░░░░░        │
│ 156 of 200 users enrolled      │
│                    View All →  │
└─────────────────────────────────┘
```

### Dashboard Widget - Top Apps
```
┌─────────────────────────────────┐
│ 📱 Connected Apps              │
│ ─────────────────────────────  │
│ Slack             145 users    │
│ Zoom              132 users    │
│ Calendly           89 users    │
│ Notion             67 users    │
│ Trello             45 users    │
│                    View All →  │
└─────────────────────────────────┘
```

### User Slideout - Connected Apps Tab
```
┌─────────────────────────────────────────────────────┐
│ Profile │ Groups │ Security │ Activity │            │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Two-Factor Authentication                           │
│ ┌─────────────────────────────────────────────────┐│
│ │ ✅ Enrolled                    Since: Jan 2024  ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ Connected Apps (5)                                  │
│ ┌─────────────────────────────────────────────────┐│
│ │ Slack                                  [Revoke] ││
│ │ Calendar, Email, Profile                        ││
│ │ Last used: 2 hours ago                          ││
│ ├─────────────────────────────────────────────────┤│
│ │ Zoom                                   [Revoke] ││
│ │ Calendar, Profile                               ││
│ │ Last used: 1 day ago                            ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### OAuth Apps Page
```
┌──────────────────────────────────────────────────────────────────┐
│ Security > OAuth Apps                                            │
├──────────────────────────────────────────────────────────────────┤
│ [Search apps...]           [Filter by risk ▼]  [Sync Now]        │
├──────────────────────────────────────────────────────────────────┤
│ APP NAME          │ USERS │ SCOPES        │ RISK  │ ACTIONS      │
│ ──────────────────┼───────┼───────────────┼───────┼──────────────│
│ Slack             │ 145   │ Calendar,Mail │ Low   │ [View] [Revoke]│
│ Zoom              │ 132   │ Calendar      │ Low   │ [View] [Revoke]│
│ Unknown App XYZ   │ 3     │ Drive,Gmail   │ High  │ [View] [Revoke]│
│ Calendly          │ 89    │ Calendar      │ Low   │ [View] [Revoke]│
└──────────────────────────────────────────────────────────────────┘
```

## Success Criteria

1. Admin can see 2FA adoption rate on dashboard within 2 seconds of page load
2. Admin can list all OAuth apps with user counts in under 5 seconds
3. Admin can revoke an app from a single user in 3 clicks
4. Admin can bulk revoke an app from all users with confirmation
5. CLI commands work identically to GAM equivalents
6. All actions are audit logged

## Dependencies

- Existing Google Workspace sync infrastructure
- Dashboard widget registry (already exists)
- User Slideout component (already exists)
- Transparent proxy for Google Admin API (already exists)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Token sync is slow for large orgs | Background sync with caching, incremental updates |
| Google API rate limits | Batch requests, respect quotas, queue processing |
| Stale data | Show "last synced" timestamp, allow manual refresh |

## References

- [Google Admin SDK - Users](https://developers.google.com/admin-sdk/directory/reference/rest/v1/users)
- [Google Admin SDK - Tokens](https://developers.google.com/admin-sdk/directory/reference/rest/v1/tokens)
- [GAM Commands](https://github.com/GAM-team/GAM/wiki)
