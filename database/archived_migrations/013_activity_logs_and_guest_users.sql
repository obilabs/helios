-- Migration 013: Activity Logs and Guest Users
-- Description: Add activity logging system and guest user support
-- Date: October 10, 2025

-- =====================================================
-- 1. Activity Logs Table
-- =====================================================
-- Track all user actions for audit trail and compliance

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_org ON activity_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id) WHERE resource_type IS NOT NULL;

-- Composite index for user activity history
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;

COMMENT ON TABLE activity_logs IS 'Audit trail of all user and system actions';
COMMENT ON COLUMN activity_logs.user_id IS 'User being acted upon (null for system actions)';
COMMENT ON COLUMN activity_logs.actor_id IS 'User performing the action (null for automated actions)';
COMMENT ON COLUMN activity_logs.action IS 'Action type: login, logout, user_created, user_updated, status_changed, etc.';
COMMENT ON COLUMN activity_logs.resource_type IS 'Type of resource: user, group, organization, setting, etc.';
COMMENT ON COLUMN activity_logs.resource_id IS 'ID of the resource being acted upon';
COMMENT ON COLUMN activity_logs.metadata IS 'Additional context: old values, new values, error messages, etc.';

-- =====================================================
-- 2. Guest Users Field
-- =====================================================
-- Add guest user support for external collaborators

ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT false;

-- Index for filtering guest users
CREATE INDEX IF NOT EXISTS idx_org_users_guest ON organization_users(is_guest) WHERE is_guest = true;

-- Add guest-specific columns
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS guest_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS guest_invited_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS guest_invited_at TIMESTAMP;

-- Index for expired guests (for cleanup jobs)
CREATE INDEX IF NOT EXISTS idx_org_users_guest_expired ON organization_users(guest_expires_at)
    WHERE is_guest = true AND guest_expires_at IS NOT NULL;

COMMENT ON COLUMN organization_users.is_guest IS 'Whether this is a guest user (external collaborator with limited access)';
COMMENT ON COLUMN organization_users.guest_expires_at IS 'When guest access expires (null = no expiration)';
COMMENT ON COLUMN organization_users.guest_invited_by IS 'User who invited this guest';
COMMENT ON COLUMN organization_users.guest_invited_at IS 'When the guest was invited';

-- =====================================================
-- 3. Activity Log Helper Function
-- =====================================================
-- Convenience function for logging activities

CREATE OR REPLACE FUNCTION log_activity(
    p_organization_id UUID,
    p_action VARCHAR(100),
    p_user_id UUID DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL,
    p_resource_type VARCHAR(50) DEFAULT NULL,
    p_resource_id VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO activity_logs (
        organization_id,
        user_id,
        actor_id,
        action,
        resource_type,
        resource_id,
        description,
        metadata,
        ip_address,
        user_agent
    ) VALUES (
        p_organization_id,
        p_user_id,
        p_actor_id,
        p_action,
        p_resource_type,
        p_resource_id,
        p_description,
        p_metadata,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_activity IS 'Helper function to insert activity logs with consistent structure';

-- =====================================================
-- 4. Common Activity Action Types (Reference)
-- =====================================================
-- Standard action types for consistency:
--
-- Authentication:
--   - login, logout, password_changed, password_reset_requested, 2fa_enabled, 2fa_disabled
--
-- User Management:
--   - user_created, user_updated, user_deleted, user_restored, user_activated, user_suspended
--   - user_invited, user_profile_updated
--
-- Guest Management:
--   - guest_invited, guest_access_granted, guest_access_revoked, guest_expired
--
-- Group Management:
--   - group_created, group_updated, group_deleted, group_member_added, group_member_removed
--
-- Settings:
--   - settings_updated, module_enabled, module_disabled, sync_initiated, sync_completed, sync_failed
--
-- Security:
--   - permission_changed, role_changed, session_terminated
--
-- =====================================================

-- Sample activity logs for existing users (optional - for demo purposes)
-- INSERT INTO activity_logs (organization_id, user_id, action, description)
-- SELECT organization_id, id, 'user_created', 'User account created'
-- FROM organization_users
-- WHERE created_at > NOW() - INTERVAL '7 days';

-- Migration complete
