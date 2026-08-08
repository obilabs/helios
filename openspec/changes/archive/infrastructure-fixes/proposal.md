# OpenSpec Proposal: Infrastructure Fixes

**ID:** infrastructure-fixes
**Status:** Draft
**Priority:** P0 (Critical - Blocking)
**Author:** Claude (Autonomous Agent)
**Created:** 2025-12-08

## Summary

Fix critical infrastructure issues blocking core functionality: MinIO credentials, missing database tables, and field visibility gaps.

## Problem Statement

Several infrastructure issues are preventing core features from working:

1. **MinIO Credentials Mismatch** - Media uploads fail with "InvalidAccessKeyId"
2. **Missing Database Tables** - Dashboard crashes due to missing tables
3. **Missing Database Columns** - Queries fail on non-existent columns
4. **Incomplete Field Visibility** - Pronouns and other fields not controllable

## Issues Detail

### INFRA-001: MinIO Credential Mismatch

**Error:**
```
InvalidAccessKeyId: The Access Key Id you provided does not exist in our records.
BucketName: helios-uploads
```

**Root Cause:**
```yaml
# docker-compose.yml has mismatched defaults:
minio:
  MINIO_ROOT_USER: ${S3_ACCESS_KEY:-heliosadmin}           # Default: heliosadmin
  MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-change-this-secure-password}

backend:
  S3_ACCESS_KEY: ${S3_ACCESS_KEY:-minioadmin}              # Default: minioadmin
  S3_SECRET_KEY: ${S3_SECRET_KEY:-minioadmin123}           # Different!
```

**Impact:** All media uploads fail (voice recordings, profile photos, video intros)

### INFRA-002: Missing Database Tables

**Errors:**
```
relation "user_dashboard_widgets" does not exist
relation "available_modules" does not exist
```

**Impact:** Dashboard fails to load, widgets not customizable

### INFRA-003: Missing Database Columns

**Error:**
```
column "status" does not exist (in modules query)
```

**Impact:** Dashboard stats fail to load

### INFRA-004: Incomplete Field Visibility

**Current visibility fields:**
- bio, email, fun_facts, interests, personal_email, phone, video_intro, voice_intro

**Missing fields that should be controllable:**
- pronouns (important for inclusion)
- mobile_phone (separate from work phone)
- location
- job_title
- work_phone
- timezone

## Technical Approach

### Fix 1: MinIO Credentials

Sync docker-compose.yml to use consistent defaults:

```yaml
minio:
  environment:
    MINIO_ROOT_USER: ${S3_ACCESS_KEY:-minioadmin}
    MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-minioadmin123}

backend:
  environment:
    S3_ACCESS_KEY: ${S3_ACCESS_KEY:-minioadmin}
    S3_SECRET_KEY: ${S3_SECRET_KEY:-minioadmin123}
```

Also ensure bucket exists on startup.

### Fix 2: Missing Tables Migration

```sql
-- user_dashboard_widgets for customizable dashboard
CREATE TABLE IF NOT EXISTS user_dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  widget_type VARCHAR(50) NOT NULL,
  position INTEGER NOT NULL,
  config JSONB DEFAULT '{}',
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, widget_type)
);

-- available_modules for module catalog
CREATE TABLE IF NOT EXISTS available_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  category VARCHAR(50),
  is_available BOOLEAN DEFAULT true,
  requires_subscription BOOLEAN DEFAULT false,
  config_schema JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Fix 3: Add Missing Columns

Check and add any missing columns to modules/organization_modules tables.

### Fix 4: Extend Field Visibility

```sql
-- Add default visibility for new fields
INSERT INTO user_field_visibility (user_id, field_name, visibility_level)
SELECT u.id, f.field_name, 'everyone'
FROM organization_users u
CROSS JOIN (
  VALUES
    ('pronouns'),
    ('mobile_phone'),
    ('location'),
    ('job_title'),
    ('work_phone'),
    ('timezone')
) AS f(field_name)
WHERE NOT EXISTS (
  SELECT 1 FROM user_field_visibility v
  WHERE v.user_id = u.id AND v.field_name = f.field_name
);
```

Update frontend Privacy settings to include new fields.

## Success Criteria

1. Media uploads work (voice recording saves successfully)
2. Dashboard loads without errors
3. Dashboard stats display correct counts
4. All visibility fields appear in Privacy settings
5. No errors in backend logs on page loads

## Files to Modify

### Backend
- `docker-compose.yml` - Fix credential defaults
- `database/migrations/039_infrastructure_fixes.sql` - Add missing tables/columns
- `backend/src/services/media-upload.service.ts` - Add better error handling
- `backend/src/routes/me.routes.ts` - Extend visibility field list

### Frontend
- `frontend/src/pages/MyProfile.tsx` - Add new visibility fields to Privacy tab

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing MinIO data | Medium | Check if bucket has data first |
| Migration conflicts | Low | Use IF NOT EXISTS |
| Visibility field changes | Low | Backward compatible additions |
