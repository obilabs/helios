# Tenant vs Organization Cleanup Analysis

**Date:** 2025-11-06
**Status:** Investigation Complete - Action Plan Required

## Problem Summary

The codebase has confusing mixed terminology between "tenant" (multi-tenant SaaS pattern) and "organization" (single-org client portal pattern). This causes:

1. **Confusion for developers** - unclear what the architecture actually is
2. **Dead code** - unused route files that reference non-existent tables
3. **Incorrect documentation** - schema.sql doesn't match actual database
4. **Future risk** - developers might try to use broken tenant routes

## Current Reality vs Documentation

### ✅ What Actually Works (Database Reality)

The **actual running database** uses single-organization pattern correctly:

```sql
-- Main table (single record expected)
organizations (id, name, domain, logo, ...)

-- All related tables properly reference organization_id
organization_users (id, organization_id, email, ...)
organization_settings (id, organization_id, ...)
organization_modules (id, organization_id, ...)
gw_credentials (id, organization_id, ...)
-- ... 40+ other tables with organization_id FK
```

**NO `tenants` table exists** - confirmed via `\d tenants` returns "Did not find any relation"

### ❌ What's Broken/Confusing

#### 1. **Incorrect Schema File**
**File:** `database/schema.sql`
**Problem:** Contains multi-tenant design with `tenants` table that doesn't match actual database

```sql
-- This is in schema.sql but DOES NOT EXIST in database
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    domain VARCHAR(255),
    ...
);
```

**Impact:** Developers reading schema.sql will be confused about the actual structure

#### 2. **Dead Route Files**
**Files:**
- `backend/src/routes/tenant-setup.routes.ts`
- `backend/src/routes/tenant-auth.routes.ts`

**Problem:** These files try to INSERT/SELECT from `tenants` table that doesn't exist

```typescript
// tenant-setup.routes.ts line 48
await client.query(`
  INSERT INTO tenants (id, domain, name, is_active, created_at, updated_at)
  VALUES ($1, $2, $3, true, NOW(), NOW())
`, [tenantId, domain, organizationName]);
```

**Status:** Currently commented out in `index.ts` (line 23), but still confusing

#### 3. **Variable Names Use "tenant" Throughout Backend**

**Files with tenant variable names:**
- `backend/src/routes/organization.routes.ts` - uses `tenantId` variable
- `backend/src/services/sync-scheduler.service.ts` - references tenants
- `backend/src/middleware/auth.ts` - uses tenant terminology
- `backend/src/services/user-sync.service.ts` - tenant comments
- `backend/src/routes/platform.routes.ts` - platform/tenant split

**Example from organization.routes.ts:**
```typescript
const tenantId = randomUUID(); // Should be organizationId
await client.query(`
  INSERT INTO tenants (id, domain, name, is_active, ...)  // Wrong table!
  VALUES ($1, $2, $3, true, NOW(), NOW())
`, [tenantId, domain, organizationName]);
```

## Architecture Decision: Single Organization

According to `CLAUDE.md`:

> **IMPORTANT:** This is the CLIENT PORTAL for single organizations.
> - ❌ NO tenant switching
> - ❌ NO multi-tenant features
> - ❌ NO platform owner roles
> - ✅ ONE organization per installation

This is **correct** and matches the actual database structure.

## Recommended Cleanup Actions

### Priority 1: Delete Dead Code (Safe, No Risk)

These files reference non-existent `tenants` table and are already commented out:

```bash
# Delete these files
rm backend/src/routes/tenant-setup.routes.ts
rm backend/src/routes/tenant-auth.routes.ts
rm backend/src/routes/platform.routes.ts  # Multi-tenant admin features
rm backend/src/core/plugins/PluginManager.ts  # Multi-tenant plugin system
```

### Priority 2: Fix Schema Documentation (Safe, Clarifies)

Replace `database/schema.sql` with actual current schema:

```bash
# Export actual schema from running database
docker exec helios_client_postgres pg_dump -U postgres -d helios_client --schema-only > database/schema-actual.sql

# Replace old schema file
mv database/schema.sql database/schema-OLD-MULTITENANT.sql  # Archive for reference
mv database/schema-actual.sql database/schema.sql
```

### Priority 3: Rename Variables (Moderate Risk, High Value)

Systematically rename `tenant` → `organization` in code:

**High-impact files to fix:**
1. `backend/src/routes/organization.routes.ts` - Uses `tenantId` var that inserts into wrong table
2. `backend/src/middleware/auth.ts` - Auth middleware uses tenant terminology
3. `backend/src/services/sync-scheduler.service.ts` - Scheduler uses tenant references

**Approach:**
- Search for `tenantId` → replace with `organizationId`
- Search for `tenant_` → replace with `organization_`
- Update comments mentioning "tenant"

### Priority 4: Update CLAUDE.md (Safe, Important)

Current CLAUDE.md correctly states this is single-org, but should add:

```markdown
## ⚠️ Common Pitfall: "Tenant" Terminology

You may see references to "tenant" in some older code. **Ignore these.**

- ✅ Use: `organization`, `organizationId`, `organization_id`
- ❌ Avoid: `tenant`, `tenantId`, `tenant_id`

The database uses `organizations` table (singular installation per org).
Any references to "tenants" are legacy artifacts from early multi-tenant prototype.
```

## Files to Audit

### Backend Routes
```
✅ backend/src/routes/auth.routes.ts - Check for tenant refs
✅ backend/src/routes/organization.routes.ts - Uses tenantId variable
✅ backend/src/routes/modules.routes.ts - Check org references
⚠️  backend/src/routes/tenant-setup.routes.ts - DELETE (references tenants table)
⚠️  backend/src/routes/tenant-auth.routes.ts - DELETE (references tenants table)
⚠️  backend/src/routes/platform.routes.ts - DELETE (multi-tenant admin)
```

### Backend Services
```
✅ backend/src/services/sync-scheduler.service.ts - Uses tenant terminology
✅ backend/src/services/user-sync.service.ts - Check comments
⚠️  backend/src/core/plugins/PluginManager.ts - DELETE (multi-tenant plugin system)
```

### Backend Middleware
```
✅ backend/src/middleware/auth.ts - Uses tenant variable names
```

### Database Files
```
⚠️  database/schema.sql - REPLACE with actual schema export
✅ database/migrations/*.sql - All use organization_* (correct!)
```

## Risk Assessment

### Low Risk Changes (Do Immediately)
- ✅ Delete unused route files (already commented out)
- ✅ Delete plugin manager (not referenced)
- ✅ Update schema.sql documentation
- ✅ Update CLAUDE.md warnings

### Medium Risk Changes (Need Testing)
- ⚠️  Rename variables in auth.ts
- ⚠️  Rename variables in organization.routes.ts
- ⚠️  Rename variables in services

**Testing Required:**
1. Run full test suite
2. Test login flow
3. Test organization creation
4. Test module configuration
5. Test user management

## Next Steps

**Immediate (This Session):**
1. Delete dead route files
2. Update CLAUDE.md with tenant warning
3. Replace schema.sql with actual export

**Soon (Next Session):**
4. Create migration guide for variable renaming
5. Systematically rename tenant → organization in code
6. Add automated checks to prevent "tenant" in new code

## Questions for User

1. **Delete dead files now?** (tenant-setup.routes.ts, tenant-auth.routes.ts, platform.routes.ts, PluginManager.ts)
2. **Update schema.sql now?** (Replace with actual DB export)
3. **Start variable renaming now?** (More risky, needs testing)

## References

- CLAUDE.md: "This is the CLIENT portal for single organizations"
- Actual DB: `organizations` table exists, `tenants` table does NOT exist
- Migrations: All 24 migrations use `organization_*` naming (correct)
