# Security Visibility - Technical Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                             │
├─────────────────────────────────────────────────────────────────────┤
│  Dashboard        │  User Slideout    │  OAuth Apps Page  │  CLI    │
│  ┌─────────────┐  │  ┌─────────────┐  │  ┌─────────────┐  │         │
│  │ 2FA Widget  │  │  │ Security    │  │  │ App Table   │  │ list 2fa│
│  │ Apps Widget │  │  │ Tab         │  │  │ + Filters   │  │ list tok│
│  └─────────────┘  │  └─────────────┘  │  └─────────────┘  │ revoke  │
├───────────────────┴───────────────────┴───────────────────┴─────────┤
│                         API Layer (Express)                          │
│  /api/v1/organization/security/*                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      Service Layer                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ OAuthTokenSync   │  │ GoogleWorkspace  │  │ SecurityMetrics  │   │
│  │ Service          │  │ Sync Service     │  │ Service          │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                      Database (PostgreSQL)                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ gw_synced_users  │  │ oauth_apps       │  │ user_oauth_tokens│   │
│  │ +is_enrolled_2sv │  │                  │  │                  │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                      Google Admin SDK                                │
│  admin.users.get()  │  admin.tokens.list()  │  admin.tokens.delete()│
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 2FA Status Flow

```
User Sync Job
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ For each user in Google Workspace:                                   │
│   1. Call admin.users.get(userKey, { projection: 'full' })          │
│   2. Extract isEnrolledIn2Sv, isEnforcedIn2Sv fields                │
│   3. Update gw_synced_users.is_enrolled_2sv                         │
└─────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ API Request: GET /api/v1/organization/security/2fa-status           │
│   1. Query: SELECT email, is_enrolled_2sv FROM gw_synced_users      │
│   2. Calculate: enrolled_count / total_count * 100                  │
│   3. Return: { users: [...], summary: { total, enrolled, % } }      │
└─────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Dashboard Widget / CLI Output                                        │
│   "2FA Adoption: 78% (156/200 users)"                               │
└─────────────────────────────────────────────────────────────────────┘
```

### OAuth Token Sync Flow

```
Token Sync Job (Runs after User Sync)
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ For each user in organization:                                       │
│   1. Call admin.tokens.list({ userKey: email })                     │
│   2. For each token:                                                │
│      - Upsert into oauth_apps (aggregate by client_id)              │
│      - Upsert into user_oauth_tokens (user-app association)         │
│   3. Update oauth_apps.user_count = COUNT(user_oauth_tokens)        │
└─────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ API Request: GET /api/v1/organization/security/oauth-apps           │
│   1. Query oauth_apps with user_count                               │
│   2. Apply filters (risk, search)                                   │
│   3. Return sorted by user_count DESC                               │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Schema Details

### Modified Table: gw_synced_users

```sql
-- Add column to existing table
ALTER TABLE gw_synced_users
ADD COLUMN is_enrolled_2sv BOOLEAN DEFAULT false,
ADD COLUMN is_enforced_2sv BOOLEAN DEFAULT false;

-- Index for filtering
CREATE INDEX idx_gw_synced_users_2sv
ON gw_synced_users(organization_id, is_enrolled_2sv);
```

### New Table: oauth_apps

```sql
CREATE TABLE oauth_apps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  scopes TEXT[],
  risk_level VARCHAR(20) DEFAULT 'unknown'
    CHECK (risk_level IN ('low', 'medium', 'high', 'unknown')),
  user_count INT DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT oauth_apps_org_client_unique
    UNIQUE (organization_id, client_id)
);

CREATE INDEX idx_oauth_apps_org ON oauth_apps(organization_id);
CREATE INDEX idx_oauth_apps_risk ON oauth_apps(organization_id, risk_level);

COMMENT ON TABLE oauth_apps IS 'Aggregated view of OAuth apps connected to organization users';
```

### New Table: user_oauth_tokens

```sql
CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_email VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  scopes TEXT[],
  native_app BOOLEAN DEFAULT false,
  last_time_used TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT user_oauth_tokens_unique
    UNIQUE (organization_id, user_email, client_id)
);

CREATE INDEX idx_user_oauth_tokens_org_user
  ON user_oauth_tokens(organization_id, user_email);
CREATE INDEX idx_user_oauth_tokens_org_client
  ON user_oauth_tokens(organization_id, client_id);

COMMENT ON TABLE user_oauth_tokens IS 'Per-user OAuth token grants';
```

## API Specifications

### GET /api/v1/organization/security/2fa-status

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 200,
      "enrolled": 156,
      "notEnrolled": 44,
      "percentage": 78
    },
    "users": [
      {
        "email": "john@company.com",
        "firstName": "John",
        "lastName": "Doe",
        "isEnrolled2Sv": true,
        "lastLogin": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

### GET /api/v1/organization/security/oauth-apps

**Query Parameters:**
- `search` - Filter by app name
- `riskLevel` - Filter by risk (low, medium, high)
- `sortBy` - Sort field (userCount, lastSeen, name)
- `sortOrder` - asc or desc
- `limit` - Page size
- `offset` - Page offset

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalApps": 45,
      "totalGrants": 1250
    },
    "apps": [
      {
        "clientId": "12345.apps.googleusercontent.com",
        "displayName": "Slack",
        "scopes": ["calendar", "profile"],
        "riskLevel": "low",
        "userCount": 145,
        "firstSeen": "2023-06-15T00:00:00Z",
        "lastSeen": "2024-01-20T00:00:00Z"
      }
    ]
  }
}
```

### DELETE /api/v1/organization/users/:email/oauth-tokens/:clientId

**Response:**
```json
{
  "success": true,
  "message": "Token revoked successfully",
  "data": {
    "email": "john@company.com",
    "clientId": "12345.apps.googleusercontent.com",
    "appName": "Slack"
  }
}
```

## Component Design

### Dashboard Widget: TwoFactorAdoptionWidget

```typescript
interface TwoFactorAdoptionWidgetProps {
  data?: {
    total: number;
    enrolled: number;
    percentage: number;
  };
  loading?: boolean;
  onClick?: () => void;
}

// Displays:
// - Circular or linear progress at percentage
// - "X of Y users enrolled" text
// - Click navigates to /security/2fa
```

### Dashboard Widget: ConnectedAppsWidget

```typescript
interface ConnectedAppsWidgetProps {
  data?: {
    apps: Array<{
      displayName: string;
      userCount: number;
    }>;
    totalApps: number;
  };
  loading?: boolean;
  onClick?: () => void;
}

// Displays:
// - Top 5 apps with user counts
// - "View all X apps" link
```

### User Slideout: Security Tab

```typescript
interface SecurityTabProps {
  userEmail: string;
}

// Sections:
// 1. Two-Factor Authentication
//    - Status badge (Enrolled/Not Enrolled)
//    - Enrollment date if available

// 2. Connected Apps
//    - List of OAuthTokenCard components
//    - Each card shows: app name, scopes, last used, revoke button
```

### OAuth Apps Page

```typescript
interface OAuthAppsPageState {
  apps: OAuthApp[];
  loading: boolean;
  filters: {
    search: string;
    riskLevel: string | null;
  };
  sort: {
    field: 'userCount' | 'lastSeen' | 'name';
    order: 'asc' | 'desc';
  };
  selectedApp: OAuthApp | null; // For modal
}

// Features:
// - DataTable with sortable columns
// - Search input for app name
// - Risk level filter dropdown
// - "View Users" button → opens modal with user list
// - "Revoke All" button → confirmation dialog
```

## Risk Classification Logic

```typescript
const classifyRiskLevel = (app: OAuthTokenData): 'low' | 'medium' | 'high' | 'unknown' => {
  const scopes = app.scopes || [];
  const isKnownApp = KNOWN_SAFE_APPS.includes(app.displayName?.toLowerCase());

  // High risk: Unknown app with sensitive scopes
  const sensitiveScopes = ['gmail', 'drive', 'admin'];
  const hasSensitiveScope = scopes.some(s =>
    sensitiveScopes.some(ss => s.toLowerCase().includes(ss))
  );

  if (!isKnownApp && hasSensitiveScope) {
    return 'high';
  }

  // Medium risk: Broad scopes but known app
  if (hasSensitiveScope) {
    return 'medium';
  }

  // Low risk: Known app or minimal scopes
  if (isKnownApp || scopes.length <= 2) {
    return 'low';
  }

  return 'unknown';
};

const KNOWN_SAFE_APPS = [
  'slack', 'zoom', 'microsoft', 'dropbox', 'asana',
  'trello', 'notion', 'calendly', 'hubspot', 'salesforce'
];
```

## Performance Considerations

### Token Sync Batching

```typescript
// Don't sync all users at once - batch to respect rate limits
const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES = 1000; // 1 second

async syncAllTokens(organizationId: string) {
  const users = await this.getUsers(organizationId);
  const batches = chunk(users, BATCH_SIZE);

  for (const batch of batches) {
    await Promise.all(batch.map(user =>
      this.syncUserTokens(organizationId, user.email)
    ));
    await delay(DELAY_BETWEEN_BATCHES);
  }
}
```

### Caching Strategy

- **2FA Summary**: Cache for 5 minutes (dashboard widget)
- **OAuth Apps List**: Cache for 15 minutes (page load)
- **User Tokens**: No cache (slideout loads fresh)

### Incremental Sync

For large organizations, implement delta sync:
1. Track `last_synced_at` per user
2. Only sync users who haven't been synced in X hours
3. Full sync weekly, incremental daily

## Security Considerations

### Authorization

All endpoints require:
- Valid JWT token
- User must be admin or have `security:read` permission
- Revoke actions require `security:write` permission

### Audit Logging

All revoke actions must be logged:
```typescript
await auditLog.create({
  organizationId,
  action: 'oauth_token_revoked',
  actorId: req.user.userId,
  targetEmail: userEmail,
  details: {
    clientId,
    appName,
    revokedAt: new Date()
  }
});
```

### Rate Limiting

- Token sync: Max 100 API calls per minute per organization
- Token revoke: Max 10 revokes per minute per user

## Error Handling

```typescript
// Token sync errors shouldn't fail the whole sync
try {
  await this.syncUserTokens(org, user.email);
} catch (error) {
  logger.warn('Failed to sync tokens for user', {
    email: user.email,
    error: error.message
  });
  // Continue with next user
}
```

## Testing Strategy

### Unit Tests
- OAuthTokenSyncService methods
- Risk classification logic
- API response formatting

### Integration Tests
- API endpoints with mock Google responses
- Database operations

### E2E Tests
- Dashboard widgets render with data
- User slideout security tab works
- OAuth apps page filters and sorts
- Revoke flow with confirmation

## Migration Path

1. Deploy database migration
2. Deploy backend services
3. Run initial token sync (background job)
4. Deploy frontend components
5. Enable widgets in dashboard customizer
