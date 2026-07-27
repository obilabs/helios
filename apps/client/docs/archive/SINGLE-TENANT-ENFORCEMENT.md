# 🚨 CRITICAL: Single-Tenant Architecture Enforcement

## ⛔ THIS IS A SINGLE-TENANT APPLICATION

This application is designed to serve **EXACTLY ONE ORGANIZATION**. Multiple organizations are **NOT SUPPORTED** and are **ACTIVELY PREVENTED** at multiple levels.

## 🎯 Why Single-Tenant?

1. **Complete Data Isolation**: Each client gets their own dedicated instance
2. **Security**: No risk of data leakage between organizations
3. **Compliance**: Easier to meet regulatory requirements
4. **Customization**: Each instance can be customized for the client
5. **Performance**: No resource contention between organizations

## 🔒 Enforcement Mechanisms

### 1. Database Level

#### Trigger Prevention
```sql
-- Before INSERT trigger prevents adding a second organization
CREATE TRIGGER enforce_single_org_trigger
    BEFORE INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_organization();
```

#### Unique Index Enforcement
```sql
-- Unique index on a constant ensures only one row can exist
CREATE UNIQUE INDEX single_organization_enforcer
    ON organizations ((true));
```

#### Helper Functions
```sql
-- Get THE organization (fails if none or multiple exist)
SELECT * FROM get_single_organization();

-- Verify integrity (throws exception if > 1 org)
SELECT verify_single_tenant_integrity();
```

### 2. Application Level

#### Startup Check
The backend performs a mandatory check on startup:
```typescript
// backend/src/index.ts
const integrityCheck = await db.query('SELECT verify_single_tenant_integrity()');
if (multiple organizations detected) {
    logger.error('CRITICAL: Multiple organizations detected!');
    process.exit(1); // Application refuses to start
}
```

#### Organization Service
```typescript
// backend/src/services/organization.service.ts
export class OrganizationService {
    // Always returns THE single organization
    static async getOrganization(): Promise<Organization> {
        const result = await db.query('SELECT * FROM get_single_organization()');
        return result.rows[0];
    }

    // Creation is ONLY allowed during initial setup
    static async createOrganization(data: any): Promise<Organization> {
        const existing = await this.getOrganizationCount();
        if (existing > 0) {
            throw new Error('Organization already exists. Multiple organizations not supported.');
        }
        // ... create logic
    }
}
```

### 3. API Level

#### No Organization Switching
- No `/api/organizations` endpoint to list organizations
- No organization ID in URLs (there's only one)
- No tenant/organization switching UI

#### Setup Endpoint (One-Time Only)
```typescript
// POST /api/setup/organization
// This endpoint:
// 1. Checks if organization exists
// 2. If yes, returns 403 Forbidden
// 3. If no, creates THE organization
// 4. Can never be called again
```

## ✅ What IS Supported

### Multiple Domains Per Organization
One organization CAN have multiple domains:
```sql
-- organization_domains table
organization_id | domain
----------------|-----------------
[single-org-id] | example.com
[single-org-id] | example.org
[single-org-id] | support.example.com
```

### Multiple Users Per Organization
Unlimited users within the single organization:
```sql
-- organization_users table
organization_id | email
----------------|-----------------
[single-org-id] | admin@example.com
[single-org-id] | user1@example.com
[single-org-id] | user2@example.org
```

## 🚫 Common Mistakes to Avoid

### ❌ DON'T: Try to Add Multi-Tenant Features
```typescript
// WRONG - Don't do this!
app.get('/api/organizations', async (req, res) => {
    const orgs = await db.query('SELECT * FROM organizations');
    res.json(orgs.rows); // This implies multiple orgs!
});
```

### ❌ DON'T: Add Organization Switching
```typescript
// WRONG - No switching needed!
function switchOrganization(orgId: string) {
    localStorage.setItem('currentOrgId', orgId);
}
```

### ❌ DON'T: Use Organization IDs in URLs
```typescript
// WRONG - There's only one org!
app.get('/api/:orgId/users', ...);

// RIGHT - No org ID needed
app.get('/api/users', ...);
```

### ✅ DO: Use Helper Functions
```typescript
// RIGHT - Get THE organization
const org = await getTheOrganization();

// RIGHT - Organization context is implicit
const users = await getUsersForOrganization(); // No ID needed
```

## 🔄 For Multi-Tenant Needs

If you need multi-tenant functionality:

1. **STOP** - This is the wrong application
2. Use **Helios MTP** (Multi-Tenant Platform) instead
3. MTP is specifically designed for:
   - MSPs managing multiple clients
   - SaaS providers
   - Multi-organization scenarios

## 🛠️ Testing Single-Tenant Enforcement

### Test 1: Try to Create Second Organization
```sql
-- This should FAIL with an error
INSERT INTO organizations (name, domain)
VALUES ('Second Org', 'second.com');
-- ERROR: Only one organization is allowed in this system
```

### Test 2: Verify Integrity Check
```sql
-- Should return true for 1 org, exception for > 1
SELECT verify_single_tenant_integrity();
```

### Test 3: Application Startup
```bash
# If multiple orgs exist, app should refuse to start
docker logs helios_client_backend
# Should see: "CRITICAL: Multiple organizations detected!"
# Application exits with code 1
```

## 📝 Migration Path

If somehow multiple organizations exist (shouldn't happen):

1. **Identify** the correct organization
2. **Export** data from other organizations
3. **Delete** extra organizations
4. **Verify** single-tenant integrity
5. **Restart** application

```sql
-- Emergency cleanup (USE WITH EXTREME CAUTION)
-- First, backup everything!

-- Identify organizations
SELECT id, name, domain, created_at FROM organizations;

-- Keep only the correct one (replace with actual ID)
DELETE FROM organizations WHERE id != 'correct-org-id';

-- Verify
SELECT verify_single_tenant_integrity();
```

## 🔍 Monitoring

### Health Check Endpoint
```typescript
GET /health
{
    "singleTenantIntegrity": true,
    "organizationCount": 1,
    "organizationName": "Gridworx"
}
```

### Logs to Watch
```
✅ Single-tenant integrity verified: 1 organization found
⚠️ No organization found. Setup required.
🚨 CRITICAL: Multiple organizations detected in single-tenant system!
```

## 📚 Related Documentation

- `CLAUDE.md` - AI assistant instructions emphasizing single-tenant
- `ARCHITECTURE.md` - System architecture (single-tenant design)
- `README.md` - Project overview (single organization focus)
- Database migration: `029_enforce_single_tenant.sql`

## ⚡ Quick Reference

| Question | Answer |
|----------|--------|
| How many organizations can exist? | **EXACTLY ONE** |
| Can I add organization switching? | **NO** |
| Can I create multiple organizations? | **NO** |
| Can one org have multiple domains? | **YES** |
| Can one org have multiple users? | **YES** |
| What if I need multi-tenant? | **Use Helios MTP instead** |

---

**Remember**: This is a single-tenant application by design. This is not a limitation - it's a feature that ensures complete isolation, security, and compliance for each client.