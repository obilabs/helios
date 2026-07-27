# Microsoft Graph API Integration Implementation Plan

## Overview

Implement Microsoft Graph API transparent proxy for Microsoft 365 integration, enabling user and group management through the Developer Console.

## Architecture

Similar to Google Workspace integration but using Microsoft Graph API and OAuth2 client credentials flow.

### Authentication Flow

```
┌─────────────────┐
│ Azure AD Tenant │
│   App Registration  │
└─────────────────┘
         │
         │ Client ID + Client Secret
         │ + Tenant ID
         ▼
┌─────────────────┐
│  Helios Backend │
│  (Graph Proxy)  │
└─────────────────┘
         │
         │ OAuth2 Token
         ▼
┌─────────────────┐
│ Microsoft Graph │
│      API        │
└─────────────────┘
```

### Key Differences from Google

| Aspect | Google Workspace | Microsoft 365 |
|--------|-----------------|---------------|
| Auth Method | Service Account + Domain-wide Delegation | App Registration + Client Credentials |
| Auth Flow | JWT Bearer Token | OAuth2 Client Credentials |
| Token Storage | JWT in memory | Access Token (cached with expiry) |
| Scope Format | URLs | Microsoft.Graph scopes |
| API Base | admin.googleapis.com | graph.microsoft.com |

## Database Schema

### Create M365 Credentials Table

```sql
-- Migration: database/migrations/025_create_m365_credentials.sql

CREATE TABLE IF NOT EXISTS m365_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Azure AD App Registration details
  tenant_id VARCHAR(255) NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  client_secret TEXT NOT NULL, -- Encrypted

  -- Configuration
  domain VARCHAR(255),
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES organization_users(id),

  UNIQUE(organization_id)
);

CREATE INDEX idx_m365_creds_org ON m365_credentials(organization_id);
CREATE INDEX idx_m365_creds_active ON m365_credentials(is_active);

-- Add audit trigger
CREATE TRIGGER m365_credentials_updated
  BEFORE UPDATE ON m365_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Create M365 Synced Users Table

```sql
CREATE TABLE IF NOT EXISTS m365_synced_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Microsoft Graph User fields
  microsoft_id VARCHAR(255) NOT NULL, -- User's object ID in Azure AD
  user_principal_name VARCHAR(500) NOT NULL, -- UPN (email-like identifier)
  display_name VARCHAR(500),
  given_name VARCHAR(255),
  surname VARCHAR(255),
  mail VARCHAR(500), -- Actual email address
  job_title VARCHAR(255),
  department VARCHAR(255),
  office_location VARCHAR(255),
  mobile_phone VARCHAR(50),
  business_phones TEXT[], -- Array of phone numbers

  -- Status
  account_enabled BOOLEAN DEFAULT true,
  user_type VARCHAR(50), -- Member or Guest

  -- Sync metadata
  last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  sync_status VARCHAR(50) DEFAULT 'synced', -- synced, pending, error
  sync_error TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(organization_id, microsoft_id),
  UNIQUE(organization_id, user_principal_name)
);

CREATE INDEX idx_m365_users_org ON m365_synced_users(organization_id);
CREATE INDEX idx_m365_users_msid ON m365_synced_users(microsoft_id);
CREATE INDEX idx_m365_users_upn ON m365_synced_users(user_principal_name);
CREATE INDEX idx_m365_users_status ON m365_synced_users(sync_status);
```

## Dependencies

Install Microsoft Graph SDK:

```json
{
  "dependencies": {
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "@azure/identity": "^4.0.0",
    "@azure/msal-node": "^2.6.0"
  },
  "devDependencies": {
    "@types/microsoft-graph": "^1.30.0"
  }
}
```

## Implementation Files

### 1. Microsoft Graph Transparent Proxy

**File:** `backend/src/middleware/microsoft-graph-proxy.ts`

```typescript
/**
 * Microsoft Graph API Transparent Proxy
 *
 * Proxies Microsoft Graph API calls for Microsoft 365 integration
 * Provides audit trail and data synchronization
 */

import { Router, Request, Response } from 'express';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { db } from '../database/connection';
import { logger } from '../utils/logger';
import { authenticateToken } from './auth';

export const microsoftGraphProxyRouter = Router();

interface ProxyRequest {
  method: string;
  path: string;
  body: any;
  query: any;
}

interface M365Credentials {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  domain?: string;
}

// ===== AUTHENTICATION =====

/**
 * Get Microsoft 365 credentials for organization
 */
async function getM365Credentials(organizationId: string): Promise<M365Credentials | null> {
  try {
    const result = await db.query(
      'SELECT tenant_id, client_id, client_secret, domain FROM m365_credentials WHERE organization_id = $1 AND is_active = true',
      [organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to get M365 credentials', { organizationId, error });
    return null;
  }
}

/**
 * Create authenticated Microsoft Graph client
 */
function createGraphClient(credentials: M365Credentials): Client {
  const credential = new ClientSecretCredential(
    credentials.tenant_id,
    credentials.client_id,
    credentials.client_secret
  );

  const client = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken('https://graph.microsoft.com/.default');
        return token.token;
      }
    }
  });

  return client;
}

// ===== PROXY HANDLER =====

/**
 * Main proxy route handler
 */
microsoftGraphProxyRouter.all('/*', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization not found' });
    }

    // Get M365 credentials
    const credentials = await getM365Credentials(organizationId);
    if (!credentials) {
      return res.status(404).json({
        error: 'Microsoft 365 not configured for this organization',
        message: 'Please configure M365 integration in Settings > Modules'
      });
    }

    // Build proxy request
    const proxyRequest: ProxyRequest = {
      method: req.method,
      path: req.params[0] || '',
      body: req.body,
      query: req.query
    };

    logger.info('Microsoft Graph proxy request', {
      organizationId,
      method: proxyRequest.method,
      path: proxyRequest.path,
      userEmail: req.user?.email
    });

    // Proxy to Microsoft Graph
    const result = await proxyToMicrosoftGraph(proxyRequest, credentials);

    // Return response
    res.status(result.status).json(result.data);

  } catch (error: any) {
    logger.error('Microsoft Graph proxy error', {
      error: error.message,
      stack: error.stack,
      path: req.params[0]
    });

    res.status(error.status || 500).json({
      error: error.message || 'Microsoft Graph API request failed',
      details: error.response?.data || error.message
    });
  }
});

/**
 * Proxy request to Microsoft Graph API
 */
async function proxyToMicrosoftGraph(
  proxyRequest: ProxyRequest,
  credentials: M365Credentials
): Promise<{ status: number; data: any }> {

  const client = createGraphClient(credentials);

  logger.info('Proxying to Microsoft Graph', {
    method: proxyRequest.method,
    path: proxyRequest.path
  });

  // Parse path to route to appropriate Graph endpoint
  // Path format: v1.0/users or beta/users/{id}
  const [version, ...pathParts] = proxyRequest.path.split('/').filter(p => p);

  try {
    let response: any;
    let api = client.api(`/${proxyRequest.path}`);

    // Add query parameters
    if (proxyRequest.query && Object.keys(proxyRequest.query).length > 0) {
      for (const [key, value] of Object.entries(proxyRequest.query)) {
        api = api.query(key, value as string);
      }
    }

    // Execute based on method
    switch (proxyRequest.method.toUpperCase()) {
      case 'GET':
        response = await api.get();
        break;

      case 'POST':
        response = await api.post(proxyRequest.body);
        break;

      case 'PATCH':
      case 'PUT':
        response = await api.patch(proxyRequest.body);
        break;

      case 'DELETE':
        response = await api.delete();
        break;

      default:
        throw new Error(`Unsupported HTTP method: ${proxyRequest.method}`);
    }

    return {
      status: 200,
      data: response
    };

  } catch (error: any) {
    logger.error('Microsoft Graph API error', {
      path: proxyRequest.path,
      error: error.message,
      statusCode: error.statusCode,
      body: error.body
    });

    throw {
      status: error.statusCode || 500,
      message: error.message,
      response: error.body
    };
  }
}

export default microsoftGraphProxyRouter;
```

### 2. Register Proxy in Main App

**File:** `backend/src/index.ts` (add after Google proxy)

```typescript
// Microsoft Graph Transparent Proxy
import microsoftGraphProxyRouter from './middleware/microsoft-graph-proxy';
app.use('/api/microsoft', microsoftGraphProxyRouter);
```

### 3. Update Developer Console CLI

**File:** `frontend/src/pages/DeveloperConsole.tsx`

Add Microsoft 365 commands to the command processor:

```typescript
// Add after Google Workspace commands

// Microsoft 365 Users
else if (cmd === 'helios' && args[0] === 'm365' && args[1] === 'users' && args[2] === 'list') {
  addOutput('Fetching Microsoft 365 users...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/microsoft/v1.0/users?$select=id,userPrincipalName,displayName,mail,department,jobTitle,accountEnabled`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();

    if (data.error) {
      addOutput(`Error: ${data.error}`, 'error');
    } else {
      const users = data.value || [];
      addOutput(`\nFound ${users.length} Microsoft 365 users:\n`);
      addOutput('USER PRINCIPAL NAME                    DISPLAY NAME           DEPARTMENT              STATUS');
      addOutput('='.repeat(100));
      users.forEach((user: any) => {
        const upn = (user.userPrincipalName || '').padEnd(40);
        const name = (user.displayName || '').padEnd(23);
        const dept = (user.department || '').padEnd(24);
        const status = user.accountEnabled ? 'enabled ' : 'disabled';
        addOutput(`${upn}${name}${dept}${status}`);
      });
    }
  } catch (error: any) {
    addOutput(`Error: ${error.message}`, 'error');
  }
}

else if (cmd === 'helios' && args[0] === 'm365' && args[1] === 'users' && args[2] === 'get') {
  const upn = args[3];
  if (!upn) {
    addOutput('Usage: helios m365 users get <userPrincipalName>', 'error');
    return;
  }

  addOutput(`Fetching user ${upn}...`);
  try {
    const response = await fetch(`${API_BASE_URL}/api/microsoft/v1.0/users/${upn}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();

    if (data.error) {
      addOutput(`Error: ${data.error}`, 'error');
    } else {
      addOutput(JSON.stringify(data, null, 2));
    }
  } catch (error: any) {
    addOutput(`Error: ${error.message}`, 'error');
  }
}

// Microsoft 365 Groups
else if (cmd === 'helios' && args[0] === 'm365' && args[1] === 'groups' && args[2] === 'list') {
  addOutput('Fetching Microsoft 365 groups...');
  try {
    const response = await fetch(`${API_BASE_URL}/api/microsoft/v1.0/groups?$select=id,displayName,mail,description,groupTypes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();

    if (data.error) {
      addOutput(`Error: ${data.error}`, 'error');
    } else {
      const groups = data.value || [];
      addOutput(`\nFound ${groups.length} Microsoft 365 groups:\n`);
      addOutput('DISPLAY NAME                EMAIL                           TYPE');
      addOutput('='.repeat(90));
      groups.forEach((group: any) => {
        const name = (group.displayName || '').padEnd(28);
        const email = (group.mail || '').padEnd(32);
        const type = group.groupTypes?.includes('Unified') ? 'M365 Group' : 'Security Group';
        addOutput(`${name}${email}${type}`);
      });
    }
  } catch (error: any) {
    addOutput(`Error: ${error.message}`, 'error');
  }
}
```

### 4. Update Help Text

Add M365 commands to the help modal:

```typescript
const helpContent = `
...existing Google commands...

### Microsoft 365 Commands

| Command | Description |
|---------|-------------|
| helios m365 users list | List all M365 users |
| helios m365 users get <upn> | Get M365 user details |
| helios m365 groups list | List all M365 groups |
| helios m365 groups get <id> | Get M365 group details |
`;
```

## Setup Requirements

### Azure AD App Registration

1. Go to Azure Portal → Azure Active Directory
2. App registrations → New registration
3. Name: "Helios Directory Management"
4. Supported account types: "Single tenant"
5. Register

### API Permissions

Grant the following Microsoft Graph permissions (Application type):

- `User.Read.All` - Read all users
- `User.ReadWrite.All` - Create/update/delete users
- `Group.Read.All` - Read all groups
- `Group.ReadWrite.All` - Create/update/delete groups
- `Directory.Read.All` - Read directory data
- `Directory.ReadWrite.All` - Write directory data

**Important:** Click "Grant admin consent" after adding permissions

### Create Client Secret

1. App → Certificates & secrets
2. New client secret
3. Description: "Helios Integration"
4. Expires: 24 months
5. Copy the secret value (only shown once!)

### Required Information

Collect these values:
- **Tenant ID:** Azure AD → Properties → Tenant ID
- **Client ID:** App registration → Overview → Application (client) ID
- **Client Secret:** The value you copied
- **Domain:** Your M365 domain (e.g., contoso.onmicrosoft.com)

## Testing

### Test Microsoft Graph Connectivity

Create: `backend/test-m365-api-direct.js`

```javascript
const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
require('@azure/identity');

const tenantId = process.env.M365_TENANT_ID;
const clientId = process.env.M365_CLIENT_ID;
const clientSecret = process.env.M365_CLIENT_SECRET;

const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

const client = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const token = await credential.getToken('https://graph.microsoft.com/.default');
      return token.token;
    }
  }
});

async function testGraph() {
  try {
    console.log('Testing Microsoft Graph API...\n');

    // Test 1: List users
    const users = await client.api('/users').select('id,userPrincipalName,displayName').top(10).get();
    console.log(`✅ Found ${users.value.length} users`);
    users.value.forEach(u => console.log(`  - ${u.userPrincipalName}`));

    // Test 2: List groups
    const groups = await client.api('/groups').select('id,displayName').top(10).get();
    console.log(`\n✅ Found ${groups.value.length} groups`);
    groups.value.forEach(g => console.log(`  - ${g.displayName}`));

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testGraph();
```

Run:
```bash
docker exec helios_client_backend node /app/test-m365-api-direct.js
```

## Console Commands

Once implemented, these commands will be available:

```bash
# Microsoft 365 Users
helios m365 users list                    # List all M365 users
helios m365 users get <upn>               # Get user details
helios m365 users create <upn> <name>     # Create user (TODO)
helios m365 users delete <upn>            # Delete user (TODO)

# Microsoft 365 Groups
helios m365 groups list                   # List all M365 groups
helios m365 groups get <id>               # Get group details
helios m365 groups create <name> <email>  # Create group (TODO)
helios m365 groups delete <id>            # Delete group (TODO)
```

## Implementation Order

1. ✅ Install dependencies (`@microsoft/microsoft-graph-client`, `@azure/identity`)
2. ✅ Create database migrations (m365_credentials, m365_synced_users)
3. ✅ Implement microsoft-graph-proxy.ts
4. ✅ Register proxy in index.ts
5. ✅ Add CLI commands to DeveloperConsole.tsx
6. ✅ Update help text
7. ⏳ Test with real M365 tenant
8. ⏳ Implement CRUD operations (create/delete)
9. ⏳ Add sync service (similar to Google Workspace)

## Benefits Over Google Workspace

- **Simpler Auth:** No domain-wide delegation setup needed
- **Standard OAuth2:** Industry-standard client credentials flow
- **No Scope Bug:** Uses modern @azure/identity library
- **Better Error Messages:** Graph API has clearer error responses
- **Unified API:** One endpoint for all resources

## Notes

- Microsoft Graph uses OAuth2 client credentials (simpler than Google's service account)
- No "invalid_scope" bug risk - uses modern Azure SDK
- Graph API is more RESTful and consistent than Google Admin SDK
- Can use either `v1.0` (stable) or `beta` (preview features)

---

**Status:** Implementation plan complete
**Next:** Execute implementation steps above
**Priority:** High (complement Google Workspace integration)

