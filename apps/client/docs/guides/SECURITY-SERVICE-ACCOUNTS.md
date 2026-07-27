# 🔒 Service Account Security Guide for Helios

## Critical Security Requirement

**EVERY CLIENT MUST USE THEIR OWN SERVICE ACCOUNT FROM THEIR OWN GCP PROJECT**

This is not optional. Sharing service accounts between clients is a critical security vulnerability.

## Why Client-Owned Service Accounts Are Mandatory

### 1. Data Isolation
- Each client's Google Workspace data remains completely isolated
- No possibility of cross-client data access
- Compliance with data residency and privacy regulations

### 2. Security Breach Containment
- If one service account is compromised, only that client is affected
- No "blast radius" affecting multiple organizations
- Easier incident response and recovery

### 3. Audit Trail Integrity
- Clear separation of API calls per client
- Proper attribution of all actions
- Compliance with audit requirements (SOC2, ISO 27001, etc.)

### 4. Access Control
- Clients maintain full control over their own service accounts
- Can revoke access immediately if needed
- No dependency on provider's security practices

## Setup Process for Each Client

### Step 1: Client Creates GCP Project
```
1. Client goes to https://console.cloud.google.com
2. Creates new project: "CompanyName-Helios-Integration"
3. Enables Admin SDK API
4. Creates service account with appropriate name
```

### Step 2: Client Configures Domain-Wide Delegation
```
1. Client logs into Google Admin Console
2. Goes to Security > Access and data control > API controls
3. Manages Domain-Wide Delegation
4. Adds THEIR OWN service account's Client ID
5. Grants required OAuth scopes
```

### Step 3: Client Provides Credentials to Helios
```
1. Client downloads service account JSON key
2. Uploads to Helios during setup
3. Helios encrypts and stores in client-specific database record
4. Original JSON file should be deleted after upload
```

## Required OAuth Scopes

Each client must authorize these scopes for their service account:
```
https://www.googleapis.com/auth/admin.directory.user
https://www.googleapis.com/auth/admin.directory.group
https://www.googleapis.com/auth/admin.directory.orgunit
https://www.googleapis.com/auth/admin.directory.domain.readonly
https://www.googleapis.com/auth/admin.reports.audit.readonly
```

## Security Implementation in Helios

### Database Storage
```sql
-- Each organization has its own encrypted credentials
gw_credentials (
  id UUID PRIMARY KEY,
  organization_id UUID UNIQUE,  -- One-to-one relationship
  service_account_key TEXT,     -- AES-256 encrypted
  admin_email VARCHAR(255),     -- For impersonation
  domain VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

### Encryption at Rest
```typescript
// Service account credentials are encrypted before storage
const encrypted = await encrypt(JSON.stringify(serviceAccountJson));
await db.query(
  'INSERT INTO gw_credentials (organization_id, service_account_key, ...) VALUES ($1, $2, ...)',
  [organizationId, encrypted, ...]
);
```

### Runtime Isolation
```typescript
// Each API call uses organization-specific credentials
async syncGoogleWorkspace(organizationId: string) {
  // Retrieve THIS organization's credentials only
  const creds = await this.getOrganizationCredentials(organizationId);

  // Create JWT client with organization-specific service account
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    subject: creds.admin_email  // Organization's admin
  });

  // All API calls are isolated to this organization
  return this.fetchUsers(auth);
}
```

## What NOT to Do

### ❌ NEVER Share Service Accounts
```javascript
// WRONG - Security vulnerability
const SHARED_SERVICE_ACCOUNT = loadSharedAccount();
for (const client of clients) {
  await syncClient(client, SHARED_SERVICE_ACCOUNT);  // NO!
}
```

### ❌ NEVER Store Unencrypted
```javascript
// WRONG - Credentials exposed
await db.query(
  'INSERT INTO creds VALUES ($1, $2)',
  [orgId, JSON.stringify(serviceAccount)]  // NO!
);
```

### ❌ NEVER Allow Cross-Organization Access
```javascript
// WRONG - Data leak risk
async getUsers(requestingOrgId: string, targetOrgId: string) {
  // Should NEVER allow accessing another org's data
  const creds = await getCreds(targetOrgId);  // NO!
}
```

## Provider Setup Documentation

When service providers help clients set up Helios:

### Recommended Approach
1. **Guide** the client through creating their own service account
2. **Document** the process with screenshots
3. **Verify** the setup works with test connection
4. **Never** have access to the actual credentials

### Setup Wizard Should Display
```
⚠️ SECURITY NOTICE
Each organization must use their own Google Cloud service account.
Never share service accounts between organizations.

Ready to create your service account? We'll guide you through:
1. Creating a GCP project (5 minutes)
2. Setting up a service account (2 minutes)
3. Configuring Domain-Wide Delegation (3 minutes)
4. Testing the connection (1 minute)

[Start Secure Setup →]
```

## Compliance Benefits

Using client-owned service accounts helps with:

- **GDPR** - Clear data controller/processor boundaries
- **SOC 2** - Proper access controls and audit trails
- **ISO 27001** - Information security management
- **HIPAA** - If handling healthcare data
- **PCI DSS** - If processing payments

## Emergency Procedures

### If a Service Account is Compromised

**Client Actions:**
1. Immediately disable the service account in GCP Console
2. Remove Domain-Wide Delegation in Google Admin Console
3. Generate new service account
4. Update Helios with new credentials

**Provider Actions:**
1. Alert affected client immediately
2. Purge old credentials from database
3. Assist with new setup if requested
4. Document incident for compliance

## Best Practices Checklist

For each client setup:

- [ ] Client creates their own GCP project
- [ ] Service account created in client's project
- [ ] Domain-Wide Delegation configured by client
- [ ] Credentials encrypted in database
- [ ] Test connection verified
- [ ] Client understands they control access
- [ ] Documentation provided to client
- [ ] No credential sharing between clients

## Questions & Answers

**Q: Can we use one service account for testing multiple clients?**
A: No. Even in development, each test organization should have its own service account.

**Q: What if a client doesn't have a GCP account?**
A: They can create a free GCP account. The Admin SDK API is free for Google Workspace domains.

**Q: Can the provider create the service account for the client?**
A: The client should create it in their own GCP project. The provider can guide them through the process.

**Q: How do we handle migrations from shared service accounts?**
A: Each client must create their own service account. Schedule migrations during maintenance windows.

---

Remember: **Security is not optional**. Each client MUST have their own service account.