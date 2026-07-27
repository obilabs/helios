-- Migration: 074_create_security_visibility_tables
-- Description: Add 2FA status tracking and OAuth apps visibility tables
-- Created: 2024

-- ============================================================================
-- TASK-SEC-001: Database Schema for 2FA and OAuth Tokens
-- ============================================================================

-- Add 2FA status columns to gw_synced_users
ALTER TABLE gw_synced_users
ADD COLUMN IF NOT EXISTS is_enrolled_2sv BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_enforced_2sv BOOLEAN DEFAULT false;

-- Create index for 2FA filtering
CREATE INDEX IF NOT EXISTS idx_gw_synced_users_2sv
ON gw_synced_users(organization_id, is_enrolled_2sv);

COMMENT ON COLUMN gw_synced_users.is_enrolled_2sv IS 'Whether user has enrolled in 2-step verification';
COMMENT ON COLUMN gw_synced_users.is_enforced_2sv IS 'Whether 2-step verification is enforced for user';

-- ============================================================================
-- OAuth Apps - Aggregated view of third-party apps connected to organization
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    scopes TEXT[],
    risk_level VARCHAR(20) DEFAULT 'unknown'
        CHECK (risk_level IN ('low', 'medium', 'high', 'unknown')),
    user_count INT DEFAULT 0,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT oauth_apps_org_client_unique
        UNIQUE (organization_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_apps_org ON oauth_apps(organization_id);
CREATE INDEX IF NOT EXISTS idx_oauth_apps_risk ON oauth_apps(organization_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_oauth_apps_user_count ON oauth_apps(organization_id, user_count DESC);

COMMENT ON TABLE oauth_apps IS 'Aggregated view of OAuth apps connected to organization users';
COMMENT ON COLUMN oauth_apps.client_id IS 'Google OAuth client ID';
COMMENT ON COLUMN oauth_apps.risk_level IS 'Assessed risk level based on scopes and app reputation';
COMMENT ON COLUMN oauth_apps.user_count IS 'Number of users who have granted access to this app';

-- ============================================================================
-- User OAuth Tokens - Per-user OAuth token grants
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_email VARCHAR(255) NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    scopes TEXT[],
    native_app BOOLEAN DEFAULT false,
    user_key VARCHAR(255),
    last_time_used TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT user_oauth_tokens_unique
        UNIQUE (organization_id, user_email, client_id)
);

CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_org_user
    ON user_oauth_tokens(organization_id, user_email);
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_org_client
    ON user_oauth_tokens(organization_id, client_id);

COMMENT ON TABLE user_oauth_tokens IS 'Per-user OAuth token grants from third-party applications';
COMMENT ON COLUMN user_oauth_tokens.native_app IS 'Whether this is a native/installed app vs web app';
COMMENT ON COLUMN user_oauth_tokens.user_key IS 'Google user key for API operations';

-- ============================================================================
-- Trigger for updated_at
-- ============================================================================

CREATE TRIGGER update_oauth_apps_updated_at
    BEFORE UPDATE ON oauth_apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Function to update oauth_apps.user_count when tokens change
-- ============================================================================

CREATE OR REPLACE FUNCTION update_oauth_app_user_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user_count for the affected oauth_app
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE oauth_apps
        SET user_count = (
            SELECT COUNT(DISTINCT user_email)
            FROM user_oauth_tokens
            WHERE organization_id = NEW.organization_id
            AND client_id = NEW.client_id
        ),
        last_seen_at = NOW()
        WHERE organization_id = NEW.organization_id
        AND client_id = NEW.client_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE oauth_apps
        SET user_count = (
            SELECT COUNT(DISTINCT user_email)
            FROM user_oauth_tokens
            WHERE organization_id = OLD.organization_id
            AND client_id = OLD.client_id
        )
        WHERE organization_id = OLD.organization_id
        AND client_id = OLD.client_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_oauth_app_user_count
    AFTER INSERT OR UPDATE OR DELETE ON user_oauth_tokens
    FOR EACH ROW EXECUTE FUNCTION update_oauth_app_user_count();

-- ============================================================================
-- View for security dashboard stats
-- ============================================================================

CREATE OR REPLACE VIEW security_2fa_summary AS
SELECT
    organization_id,
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE is_enrolled_2sv = true) AS enrolled_users,
    COUNT(*) FILTER (WHERE is_enrolled_2sv = false) AS not_enrolled_users,
    ROUND(
        (COUNT(*) FILTER (WHERE is_enrolled_2sv = true)::DECIMAL / NULLIF(COUNT(*), 0)) * 100,
        1
    ) AS enrollment_percentage
FROM gw_synced_users
WHERE is_suspended = false
GROUP BY organization_id;

COMMENT ON VIEW security_2fa_summary IS 'Aggregated 2FA enrollment statistics per organization';
