-- Migration 012: Enhanced User Status System for UX Navigation
-- Purpose: Add user status tracking (active, pending, deleted) for new navigation structure
-- Created: 2025-10-10

-- Add deleted_at timestamp for soft deletes
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add user_status column (default to 'active' for existing users)
-- Status values: 'active', 'pending', 'deleted'
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS user_status VARCHAR(20) DEFAULT 'active';

-- Ensure platform ID columns exist (may already exist from previous migrations)
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS google_workspace_id VARCHAR(255);

ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS microsoft_365_id VARCHAR(255);

-- Create index for efficient querying by status
CREATE INDEX IF NOT EXISTS idx_org_users_status ON organization_users(user_status) WHERE deleted_at IS NULL;

-- Create index for efficient querying of deleted users
CREATE INDEX IF NOT EXISTS idx_org_users_deleted ON organization_users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Create index for Google Workspace ID lookups
CREATE INDEX IF NOT EXISTS idx_org_users_google_id ON organization_users(google_workspace_id) WHERE google_workspace_id IS NOT NULL;

-- Create index for Microsoft 365 ID lookups
CREATE INDEX IF NOT EXISTS idx_org_users_microsoft_id ON organization_users(microsoft_365_id) WHERE microsoft_365_id IS NOT NULL;

-- Update existing users:
-- - Set user_status to 'active' if is_active = true
-- - Set user_status to 'pending' if is_active = false and no last_login
UPDATE organization_users
SET user_status = CASE
    WHEN is_active = true THEN 'active'
    WHEN is_active = false AND last_login IS NULL THEN 'pending'
    ELSE 'active'
END
WHERE user_status IS NULL OR user_status = 'active';

-- Add comment to table for documentation
COMMENT ON COLUMN organization_users.user_status IS 'User status: active (can login), pending (awaiting activation), deleted (soft deleted)';
COMMENT ON COLUMN organization_users.deleted_at IS 'Timestamp when user was soft deleted. NULL = not deleted';
COMMENT ON COLUMN organization_users.google_workspace_id IS 'Google Workspace user ID for platform sync';
COMMENT ON COLUMN organization_users.microsoft_365_id IS 'Microsoft 365 user ID for platform sync';
