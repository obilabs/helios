-- Migration 023: Remove Legacy Status Column
-- Purpose: Remove duplicate 'status' column in favor of 'user_status'
-- Created: 2025-11-06
--
-- Background:
-- - The 'status' column is a legacy field that's no longer being updated
-- - Migration 012 added 'user_status' as the authoritative status field
-- - Backend code uses 'user_status' exclusively
-- - Having both fields causes confusion and data inconsistency

-- Step 1: First copy any non-default status values from 'status' to 'user_status' (safety measure)
-- This ensures we don't lose any data if 'status' has more recent values
UPDATE organization_users
SET user_status = status
WHERE status IS NOT NULL
  AND status != 'active'
  AND user_status = 'active'
  AND deleted_at IS NULL;

-- Step 2: Drop dependent views (they'll be recreated without the status column)
DROP VIEW IF EXISTS active_staff CASCADE;
DROP VIEW IF EXISTS active_guests CASCADE;
DROP VIEW IF EXISTS contacts CASCADE;

-- Step 3: Drop the index that uses the old 'status' column
DROP INDEX IF EXISTS idx_org_users_type_status;

-- Step 4: Drop the legacy 'status' column
ALTER TABLE organization_users
DROP COLUMN IF EXISTS status;

-- Step 5: Create a new index on (user_type, user_status) to replace the one we dropped
-- This maintains query performance for filtering by type and status
CREATE INDEX IF NOT EXISTS idx_org_users_type_user_status
ON organization_users(user_type, user_status);

-- Step 6: Recreate the views using user_status instead of status
CREATE OR REPLACE VIEW active_staff AS
SELECT *
FROM organization_users
WHERE user_type = 'staff'
  AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP)
  AND user_status IN ('active', 'staged');

CREATE OR REPLACE VIEW active_guests AS
SELECT *
FROM organization_users
WHERE user_type = 'guest'
  AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP)
  AND user_status IN ('active', 'staged');

CREATE OR REPLACE VIEW contacts AS
SELECT *
FROM organization_users
WHERE user_type = 'contact'
  AND deleted_at IS NULL;

-- Add migration tracking comment
COMMENT ON TABLE organization_users IS 'Organization users table. Status field cleaned up in migration 023 - now uses user_status exclusively.';
