-- Migration 024: Rename 'pending' Status to 'staged'
-- Purpose: Align database terminology with UI labels
-- Created: 2025-11-06
--
-- Background:
-- - UI displays "Staged" for users awaiting activation
-- - Database uses "pending" which requires translation
-- - Renaming to "staged" makes code more consistent

-- Update all 'pending' statuses to 'staged'
UPDATE organization_users
SET user_status = 'staged'
WHERE user_status = 'pending';

-- Update any 'invited' statuses to 'staged' (legacy status from old system)
UPDATE organization_users
SET user_status = 'staged'
WHERE user_status = 'invited';

-- Add comment documenting the valid status values
COMMENT ON COLUMN organization_users.user_status IS 'User status: active (can login), staged (awaiting activation), suspended (temporarily disabled), deleted (soft deleted), blocked (security)';
