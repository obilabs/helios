-- ============================================================================
-- HELIOS - Cleanup Deleted Users from Google Workspace Sync
-- ============================================================================
--
-- PURPOSE: Remove stale user records that included deleted Google users
-- WHEN TO RUN: After applying the deleted users fix, before running fresh sync
-- CAUTION: This will delete synced user data. Local Helios users are preserved.
--
-- ============================================================================

-- STEP 1: Find your organization ID
-- Run this query first to get your organization ID:
-- SELECT id, name, domain FROM organizations;

-- STEP 2: Set your organization ID here
-- Replace 'YOUR-ORG-ID-HERE' with the actual UUID from step 1
\set org_id 'YOUR-ORG-ID-HERE'

-- ============================================================================
-- BEFORE CLEANUP - Check current counts
-- ============================================================================

SELECT
    'BEFORE CLEANUP' as status,
    (SELECT COUNT(*) FROM gw_synced_users WHERE organization_id = :'org_id') as gw_synced_users,
    (SELECT COUNT(*) FROM organization_users WHERE organization_id = :'org_id' AND google_workspace_id IS NOT NULL) as org_users_from_google,
    (SELECT COUNT(*) FROM organization_users WHERE organization_id = :'org_id' AND google_workspace_id IS NULL) as org_users_local_only;

-- ============================================================================
-- CLEANUP STEP 1: Clear Google Workspace cache
-- This table is just a cache - will be repopulated on next sync
-- ============================================================================

DELETE FROM gw_synced_users
WHERE organization_id = :'org_id';

-- Show how many were deleted
SELECT
    'Deleted from gw_synced_users' as action,
    COUNT(*) as count
FROM gw_synced_users
WHERE organization_id = :'org_id';

-- ============================================================================
-- CLEANUP STEP 2: Remove organization users synced from Google
-- This removes users that came from Google Workspace sync
-- Local Helios portal users (google_workspace_id IS NULL) are preserved
-- ============================================================================

DELETE FROM organization_users
WHERE organization_id = :'org_id'
  AND google_workspace_id IS NOT NULL;

-- ============================================================================
-- AFTER CLEANUP - Verify results
-- ============================================================================

SELECT
    'AFTER CLEANUP' as status,
    (SELECT COUNT(*) FROM gw_synced_users WHERE organization_id = :'org_id') as gw_synced_users,
    (SELECT COUNT(*) FROM organization_users WHERE organization_id = :'org_id' AND google_workspace_id IS NOT NULL) as org_users_from_google,
    (SELECT COUNT(*) FROM organization_users WHERE organization_id = :'org_id' AND google_workspace_id IS NULL) as org_users_local_only;

-- ============================================================================
-- NEXT STEPS:
-- ============================================================================
-- 1. Restart backend server to pick up the code fix
-- 2. Click "Sync Now" in dashboard to pull fresh data from Google
-- 3. Verify counts match Google Workspace Admin Console
--
-- Expected results after sync:
-- - Only active (non-deleted) Google users will be synced
-- - Dashboard counts should match Google Workspace exactly
-- - Deleted users will NOT be included
-- ============================================================================
