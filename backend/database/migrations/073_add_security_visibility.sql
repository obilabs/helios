-- 073_add_security_visibility.sql
--
-- Restores the security-visibility schema (2FA/2SV status + OAuth apps) that
-- powers the Dashboard "2FA adoption" and "Connected apps" cards. These objects
-- originated in the archived 074_create_security_visibility_tables.sql, which was
-- NEVER folded into the base schema (schema_organization.sql) nor the active
-- backend/database/migrations set — so every fresh install (and this live DB) was
-- missing them. Result: getUnified2FAStatus() and getOAuthApps() threw on the
-- missing gw_synced_users.is_enrolled_2sv column / oauth_apps table, the dashboard
-- swallowed the error, and BOTH cards silently showed "N/A".
--
-- Fully idempotent (the 074 original left its two CREATE TRIGGERs un-guarded);
-- safe to run against a DB that already has some of these objects.

-- ---------------------------------------------------------------------------
-- 2SV (2-step verification) status on synced Google users
-- ---------------------------------------------------------------------------
ALTER TABLE gw_synced_users
  ADD COLUMN IF NOT EXISTS is_enrolled_2sv BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_enforced_2sv BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_gw_synced_users_2sv
  ON gw_synced_users(organization_id, is_enrolled_2sv);

COMMENT ON COLUMN gw_synced_users.is_enrolled_2sv IS 'Whether user has enrolled in 2-step verification';
COMMENT ON COLUMN gw_synced_users.is_enforced_2sv IS 'Whether 2-step verification is enforced for user';

-- ---------------------------------------------------------------------------
-- OAuth Apps — aggregated third-party apps connected to organization users
-- ---------------------------------------------------------------------------
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
    CONSTRAINT oauth_apps_org_client_unique UNIQUE (organization_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_apps_org ON oauth_apps(organization_id);
CREATE INDEX IF NOT EXISTS idx_oauth_apps_risk ON oauth_apps(organization_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_oauth_apps_user_count ON oauth_apps(organization_id, user_count DESC);

COMMENT ON TABLE oauth_apps IS 'Aggregated view of OAuth apps connected to organization users';

-- ---------------------------------------------------------------------------
-- Per-user OAuth token grants (source rows aggregated into oauth_apps)
-- ---------------------------------------------------------------------------
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
    CONSTRAINT user_oauth_tokens_unique UNIQUE (organization_id, user_email, client_id)
);

CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_org_user
    ON user_oauth_tokens(organization_id, user_email);
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_org_client
    ON user_oauth_tokens(organization_id, client_id);

COMMENT ON TABLE user_oauth_tokens IS 'Per-user OAuth token grants from third-party applications';

-- ---------------------------------------------------------------------------
-- Keep oauth_apps.updated_at fresh (guarded: 074 left this CREATE TRIGGER bare)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_oauth_apps_updated_at ON oauth_apps;
CREATE TRIGGER update_oauth_apps_updated_at
    BEFORE UPDATE ON oauth_apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Maintain oauth_apps.user_count from the per-user token rows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_oauth_app_user_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE oauth_apps
        SET user_count = (
            SELECT COUNT(DISTINCT user_email)
            FROM user_oauth_tokens
            WHERE organization_id = NEW.organization_id
              AND client_id = NEW.client_id
        ), last_seen_at = NOW()
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

DROP TRIGGER IF EXISTS trigger_update_oauth_app_user_count ON user_oauth_tokens;
CREATE TRIGGER trigger_update_oauth_app_user_count
    AFTER INSERT OR UPDATE OR DELETE ON user_oauth_tokens
    FOR EACH ROW EXECUTE FUNCTION update_oauth_app_user_count();

-- ---------------------------------------------------------------------------
-- Convenience view for 2FA enrollment stats
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW security_2fa_summary AS
SELECT
    organization_id,
    COUNT(*) AS total_users,
    COUNT(*) FILTER (WHERE is_enrolled_2sv = true) AS enrolled_users,
    COUNT(*) FILTER (WHERE is_enrolled_2sv = false) AS not_enrolled_users,
    ROUND((COUNT(*) FILTER (WHERE is_enrolled_2sv = true)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 1) AS enrollment_percentage
FROM gw_synced_users
WHERE is_suspended = false
GROUP BY organization_id;

COMMENT ON VIEW security_2fa_summary IS 'Aggregated 2FA enrollment statistics per organization';
