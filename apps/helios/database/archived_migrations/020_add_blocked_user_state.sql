-- Migration 020: Add Blocked User State
-- Adds support for blocking users (security lockout while maintaining delegation)

-- Add blocked state columns to organization_users
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Add index for blocked users
CREATE INDEX IF NOT EXISTS idx_users_blocked
ON organization_users(organization_id, blocked_at)
WHERE blocked_at IS NOT NULL;

-- Add index for blocked status
CREATE INDEX IF NOT EXISTS idx_users_blocked_status
ON organization_users(user_status)
WHERE user_status = 'blocked';

-- Comment on columns
COMMENT ON COLUMN organization_users.blocked_at IS 'Timestamp when user account was blocked (security lockout)';
COMMENT ON COLUMN organization_users.blocked_by IS 'User ID of admin who blocked this account';
COMMENT ON COLUMN organization_users.blocked_reason IS 'Reason for blocking account (security incident, termination, etc.)';

-- Update user_status to support 'blocked' state
-- Note: If using ENUM, you'd need to ALTER TYPE. Since we're using VARCHAR, this is a comment.
-- Valid user_status values: 'active', 'pending', 'suspended', 'blocked', 'deleted'
