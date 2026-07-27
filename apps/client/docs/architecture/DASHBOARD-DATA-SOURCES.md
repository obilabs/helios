# Dashboard Data Sources

## Overview
This document clarifies where each metric on the dashboard comes from and how to verify data accuracy.

---

## Data Source Architecture

### Two-Layer System

**Layer 1: Google Workspace (Source of Truth)**
- Live data from Google Workspace APIs
- Accessed via service account with domain-wide delegation

**Layer 2: Helios Database (Local Cache)**
- Synced copy of Google data
- Stored in PostgreSQL for fast queries
- Updated via sync process

---

## Dashboard Metrics

### 1. Total Users
**Icon:** User icon + Google Workspace badge
**Data Source:** `organization_users` table (synced from Google)
**Update Frequency:** Every sync (default: 15 minutes)
**Query:**
```sql
SELECT COUNT(*) FROM organization_users
WHERE organization_id = $1 AND deleted_at IS NULL
```

**How to Verify:**
```bash
# Google API (source of truth)
gw users list --domain=yourdomain.com | wc -l

# Database (synced copy)
SELECT COUNT(*) FROM organization_users WHERE organization_id = '<uuid>';
```

---

### 2. Active Users
**Icon:** Trending up
**Data Source:** `organization_users` table
**Criteria:** `user_status = 'active' OR is_active = true`
**Query:**
```sql
SELECT COUNT(*) FROM organization_users
WHERE (user_status = 'active' OR is_active = true)
  AND deleted_at IS NULL
```

---

### 3. Licenses
**Icon:** Shield + Google Workspace badge
**Data Source:** Google Workspace Reports API
**Update Frequency:** Once per day (Google's limitation)
**Data Delay:** 2 days (Google Reports API requirement)
**Scope:** `https://www.googleapis.com/auth/admin.reports.usage.readonly`

**API Endpoint:**
```
GET /admin/reports/v1/usage/customers/my_customer/dates/{YYYY-MM-DD}
Parameters:
  - accounts:gsuite_unlimited_total_licenses
  - accounts:gsuite_unlimited_used_licenses
  - accounts:gsuite_basic_total_licenses
  - accounts:gsuite_basic_used_licenses
  - accounts:gsuite_enterprise_total_licenses
  - accounts:gsuite_enterprise_used_licenses
```

**How to Verify:**
```bash
# Google Admin Console
1. Go to Admin Console > Billing > Subscriptions
2. Check license counts manually

# GAM (command-line tool)
gam info domain

# Shows:
# accounts:gsuite_basic_total_licenses: 250
# accounts:gsuite_basic_used_licenses: 245
```

---

### 4. Suspended Users
**Icon:** Alert circle + Google Workspace badge
**Data Source:** `organization_users` table
**Criteria:** `user_status = 'suspended'`
**Query:**
```sql
SELECT COUNT(*) FROM organization_users
WHERE user_status = 'suspended'
  AND deleted_at IS NULL
```

**How to Verify:**
```bash
# Google API
gw users list --query="isSuspended=true" | wc -l

# Database
SELECT COUNT(*) FROM organization_users
WHERE user_status = 'suspended';
```

---

### 5. Admin Users
**Icon:** Shield + Google Workspace badge
**Data Source:** `organization_users` table
**Criteria:** `role = 'admin'`
**Query:**
```sql
SELECT COUNT(*) FROM organization_users
WHERE role = 'admin'
  AND deleted_at IS NULL
```

**How to Verify:**
```bash
# Google API
gw users list --query="isAdmin=true" | wc -l

# Database
SELECT COUNT(*) FROM organization_users WHERE role = 'admin';
```

---

## Sync Process

### How Data Flows

1. **Sync Triggered** (manual or automatic)
2. **Google API Called** (`admin.users.list`)
3. **Data Stored in Two Tables:**
   - `gw_synced_users` (Google-specific cache)
   - `organization_users` (unified user table)
4. **Dashboard Queries** `organization_users`

### Sync Frequency
- **Automatic:** Every 15 minutes (configurable)
- **Manual:** Click "Sync Now" button
- **On Demand:** Via API or CLI

---

## Data Accuracy

### When Counts Might Differ

**Scenario 1: Recent Changes**
- **Issue:** User added in Google 2 minutes ago
- **Dashboard:** Won't show until next sync (up to 15 min delay)
- **Solution:** Click "Sync Now" button

**Scenario 2: License Data Delay**
- **Issue:** Licenses shows data from 2 days ago
- **Reason:** Google Reports API limitation
- **Indicated:** Date shown in UI "(as of Nov 5)"
- **Solution:** None - this is a Google limitation

**Scenario 3: Sync Failure**
- **Issue:** Dashboard shows stale data
- **Check:** Look at "Recent Activity" for sync errors
- **Solution:** Check Google Workspace credentials

---

## Verification Checklist

To verify dashboard accuracy:

### 1. Check Last Sync Time
```
Dashboard > Recent Activity > "Synced X users from Google Workspace"
```

### 2. Compare Counts

**Users:**
```bash
# Google (source of truth)
gw users list --domain=yourdomain.com --max-results=500 | grep "email:" | wc -l

# Database
psql -d helios_client -c "SELECT COUNT(*) FROM organization_users WHERE deleted_at IS NULL;"
```

**Suspended:**
```bash
# Google
gw users list --query="isSuspended=true" --max-results=500 | wc -l

# Database
psql -d helios_client -c "SELECT COUNT(*) FROM organization_users WHERE user_status = 'suspended';"
```

**Admins:**
```bash
# Google
gw users list --query="isAdmin=true" --max-results=500 | wc -l

# Database
psql -d helios_client -c "SELECT COUNT(*) FROM organization_users WHERE role = 'admin';"
```

### 3. Force Sync if Mismatch
```bash
# Via UI
Dashboard > Sync Now button

# Via API
POST /api/google-workspace/sync-now
{
  "organizationId": "<uuid>"
}

# Via CLI
helios gw sync now
```

---

## Troubleshooting

### Dashboard Shows 0 Users
**Possible Causes:**
1. No sync has run yet
2. Google Workspace not configured
3. Sync failed (check alerts)

**Solution:**
1. Check Settings > Modules > Google Workspace (enabled?)
2. Click "Sync Now"
3. Check Recent Activity for errors

---

### License Count Missing
**Possible Causes:**
1. Reports API scope not granted
2. Domain has no licenses
3. API call failed

**Solution:**
1. Check service account scopes include:
   `https://www.googleapis.com/auth/admin.reports.usage.readonly`
2. Check Google Admin Console for actual license count
3. Check backend logs for API errors

---

### Counts Don't Match Google Admin Console
**Most Common:**
- **Time delay:** Sync runs every 15 minutes, Google Admin Console is real-time
- **Deleted users:** Dashboard excludes soft-deleted users
- **Suspended users:** May be categorized differently

**Verification Steps:**
1. Click "Sync Now" to get latest data
2. Compare dashboard timestamp with current time
3. Check both "Active" and "Suspended" tabs in Google Admin
4. Exclude archived/deleted users when comparing

---

## Visual Indicators

### Google Workspace Badge
**Icon:** Small Google Admin icon (14px)
**Location:** Next to label on stat cards
**Tooltip:** "Synced from Google Workspace"
**Meaning:** This data comes from Google Workspace via sync

Cards with badge:
- ✅ Total Users
- ✅ Suspended Users
- ✅ Admin Users
- ✅ Licenses (with additional date note)

Cards WITHOUT badge:
- None currently (all data from Google if configured)

---

## API Endpoints Used

### User Sync
```
GET https://admin.googleapis.com/admin/directory/v1/users
  ?domain={domain}
  &maxResults=500
  &orderBy=email
```

### License Data
```
GET https://admin.googleapis.com/admin/reports/v1/usage/customers/my_customer/dates/{date}
  ?parameters=accounts:gsuite_*_total_licenses,accounts:gsuite_*_used_licenses
```

---

## Database Schema

### organization_users (Main Stats Source)
```sql
CREATE TABLE organization_users (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',  -- 'admin' for admins
  is_active BOOLEAN DEFAULT true,
  user_status VARCHAR(50),          -- 'active', 'suspended', 'deleted'
  deleted_at TIMESTAMP,             -- Soft delete
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### gw_synced_users (Google Cache)
```sql
CREATE TABLE gw_synced_users (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  google_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  is_suspended BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMP,
  raw_data JSONB                    -- Full Google API response
);
```

---

## Best Practices

1. **Monitor Sync Health**
   - Check "Recent Activity" daily
   - Set up alerts for sync failures

2. **Verify After Major Changes**
   - After bulk user creation in Google
   - After org unit restructuring
   - After license changes

3. **Understand Delays**
   - User sync: Up to 15 minutes
   - License data: 2 days minimum

4. **Use Manual Sync When Needed**
   - Before important reports
   - After making changes in Google Admin Console
   - When troubleshooting discrepancies

---

**Last Updated:** November 8, 2025
**Version:** 1.0.0
