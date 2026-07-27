-- Migration: 048_create_user_tracking.sql
-- Description: Add hybrid email tracking support (user tracking alongside campaign tracking)
-- Author: AI Agent
-- Date: 2025-12-11

-- ============================================================================
-- TASK-TRK-001: Create signature_user_tracking table
-- Stores permanent tracking tokens for each user (always-on tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS signature_user_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES organization_users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pixel_token VARCHAR(64) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for organization-level queries
CREATE INDEX IF NOT EXISTS idx_user_tracking_org ON signature_user_tracking(organization_id);

-- Index for token lookup (used by tracking pixel endpoint)
CREATE INDEX IF NOT EXISTS idx_user_tracking_token ON signature_user_tracking(pixel_token);

-- Partial index for active tracking only
CREATE INDEX IF NOT EXISTS idx_user_tracking_active ON signature_user_tracking(organization_id) WHERE is_active = true;

COMMENT ON TABLE signature_user_tracking IS 'Permanent tracking tokens for user-level email engagement tracking';
COMMENT ON COLUMN signature_user_tracking.pixel_token IS 'URL-safe token used in tracking pixel URL /api/t/u/:token.gif';
COMMENT ON COLUMN signature_user_tracking.is_active IS 'Can be disabled by admin to stop tracking for specific users';

-- ============================================================================
-- TASK-TRK-002: Modify signature_tracking_events for hybrid tracking
-- Add tracking_type column and user_tracking_id reference
-- ============================================================================

-- Add tracking_type column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'signature_tracking_events'
        AND column_name = 'tracking_type'
    ) THEN
        ALTER TABLE signature_tracking_events
            ADD COLUMN tracking_type VARCHAR(20) DEFAULT 'campaign'
            CHECK (tracking_type IN ('user', 'campaign'));
    END IF;
END $$;

-- Add user_tracking_id reference if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'signature_tracking_events'
        AND column_name = 'user_tracking_id'
    ) THEN
        ALTER TABLE signature_tracking_events
            ADD COLUMN user_tracking_id UUID REFERENCES signature_user_tracking(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Make pixel_id nullable (not required for user tracking)
ALTER TABLE signature_tracking_events
    ALTER COLUMN pixel_id DROP NOT NULL;

-- Make campaign_id nullable (not required for user tracking)
ALTER TABLE signature_tracking_events
    ALTER COLUMN campaign_id DROP NOT NULL;

-- Index for user tracking queries
CREATE INDEX IF NOT EXISTS idx_tracking_events_user_tracking
    ON signature_tracking_events(user_tracking_id, timestamp)
    WHERE tracking_type = 'user';

-- Note: Skipping date-based index as DATE() function is not IMMUTABLE
-- The user_tracking_id + timestamp index covers most use cases

COMMENT ON COLUMN signature_tracking_events.tracking_type IS 'Type of tracking: user (always-on) or campaign (time-limited)';
COMMENT ON COLUMN signature_tracking_events.user_tracking_id IS 'Reference to signature_user_tracking for user-level tracking';

-- ============================================================================
-- TASK-TRK-003: Organization tracking settings
-- Settings are stored in organization_settings table as key-value pairs
-- ============================================================================

-- Insert default tracking settings for existing organizations
INSERT INTO organization_settings (organization_id, key, value)
SELECT id, 'tracking_user_enabled', 'true'
FROM organizations
WHERE NOT EXISTS (
    SELECT 1 FROM organization_settings os
    WHERE os.organization_id = organizations.id
    AND os.key = 'tracking_user_enabled'
)
ON CONFLICT (organization_id, key) DO NOTHING;

INSERT INTO organization_settings (organization_id, key, value)
SELECT id, 'tracking_campaign_enabled', 'true'
FROM organizations
WHERE NOT EXISTS (
    SELECT 1 FROM organization_settings os
    WHERE os.organization_id = organizations.id
    AND os.key = 'tracking_campaign_enabled'
)
ON CONFLICT (organization_id, key) DO NOTHING;

INSERT INTO organization_settings (organization_id, key, value)
SELECT id, 'tracking_retention_days', '90'
FROM organizations
WHERE NOT EXISTS (
    SELECT 1 FROM organization_settings os
    WHERE os.organization_id = organizations.id
    AND os.key = 'tracking_retention_days'
)
ON CONFLICT (organization_id, key) DO NOTHING;

INSERT INTO organization_settings (organization_id, key, value)
SELECT id, 'tracking_show_user_dashboard', 'true'
FROM organizations
WHERE NOT EXISTS (
    SELECT 1 FROM organization_settings os
    WHERE os.organization_id = organizations.id
    AND os.key = 'tracking_show_user_dashboard'
)
ON CONFLICT (organization_id, key) DO NOTHING;

INSERT INTO organization_settings (organization_id, key, value)
SELECT id, 'tracking_exclude_bots', 'true'
FROM organizations
WHERE NOT EXISTS (
    SELECT 1 FROM organization_settings os
    WHERE os.organization_id = organizations.id
    AND os.key = 'tracking_exclude_bots'
)
ON CONFLICT (organization_id, key) DO NOTHING;

-- ============================================================================
-- TASK-TRK-005: Generate tokens for existing users
-- Create tracking tokens for all existing organization users
-- ============================================================================

-- Generate tokens for all existing users who don't have one
INSERT INTO signature_user_tracking (user_id, organization_id, pixel_token)
SELECT
    ou.id,
    ou.organization_id,
    encode(gen_random_bytes(24), 'base64')
FROM organization_users ou
WHERE ou.deleted_at IS NULL
AND ou.is_active = true
AND NOT EXISTS (
    SELECT 1 FROM signature_user_tracking sut WHERE sut.user_id = ou.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- Helper function to generate URL-safe token
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_url_safe_token(length INTEGER DEFAULT 24)
RETURNS VARCHAR AS $$
DECLARE
    raw_bytes BYTEA;
    encoded TEXT;
BEGIN
    raw_bytes := gen_random_bytes(length);
    -- Use base64url encoding (URL-safe)
    encoded := translate(encode(raw_bytes, 'base64'), '+/=', '-_ ');
    -- Remove any trailing spaces from padding removal
    encoded := trim(encoded);
    RETURN encoded;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger to auto-generate tracking token for new users
-- ============================================================================

CREATE OR REPLACE FUNCTION create_user_tracking_token()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create for active, non-deleted users
    IF NEW.deleted_at IS NULL AND NEW.is_active = true THEN
        INSERT INTO signature_user_tracking (user_id, organization_id, pixel_token)
        VALUES (NEW.id, NEW.organization_id, generate_url_safe_token(24))
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on organization_users table
DROP TRIGGER IF EXISTS trigger_create_user_tracking ON organization_users;
DROP TRIGGER IF EXISTS trigger_create_user_tracking ON PLACEHOLDER;
CREATE TRIGGER trigger_create_user_tracking
    AFTER INSERT ON organization_users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_tracking_token();

-- ============================================================================
-- Views for analytics queries
-- ============================================================================

-- Daily stats view for user tracking
CREATE OR REPLACE VIEW user_tracking_daily_stats AS
SELECT
    sut.user_id,
    sut.organization_id,
    DATE(ste.timestamp) as day,
    COUNT(*) as total_opens,
    COUNT(DISTINCT ste.ip_address_hash) as unique_opens,
    COUNT(CASE WHEN ste.device_type = 'desktop' THEN 1 END) as desktop_opens,
    COUNT(CASE WHEN ste.device_type = 'mobile' THEN 1 END) as mobile_opens,
    COUNT(CASE WHEN ste.device_type = 'tablet' THEN 1 END) as tablet_opens
FROM signature_user_tracking sut
LEFT JOIN signature_tracking_events ste ON ste.user_tracking_id = sut.id
    AND ste.tracking_type = 'user'
GROUP BY sut.user_id, sut.organization_id, DATE(ste.timestamp);

COMMENT ON VIEW user_tracking_daily_stats IS 'Pre-aggregated daily stats for user email engagement';

-- User tracking summary view
CREATE OR REPLACE VIEW user_tracking_summary AS
SELECT
    sut.id as tracking_id,
    sut.user_id,
    sut.organization_id,
    sut.is_active,
    sut.created_at,
    COUNT(ste.id) as total_opens,
    COUNT(DISTINCT DATE(ste.timestamp)) as active_days,
    COUNT(DISTINCT ste.ip_address_hash) as unique_recipients,
    MAX(ste.timestamp) as last_open_at,
    COUNT(CASE WHEN ste.timestamp > NOW() - INTERVAL '7 days' THEN 1 END) as opens_last_7_days,
    COUNT(CASE WHEN ste.timestamp > NOW() - INTERVAL '30 days' THEN 1 END) as opens_last_30_days
FROM signature_user_tracking sut
LEFT JOIN signature_tracking_events ste ON ste.user_tracking_id = sut.id
    AND ste.tracking_type = 'user'
GROUP BY sut.id, sut.user_id, sut.organization_id, sut.is_active, sut.created_at;

COMMENT ON VIEW user_tracking_summary IS 'Summary statistics for each user''s email engagement tracking';

-- Organization-wide tracking summary
CREATE OR REPLACE VIEW organization_tracking_summary AS
SELECT
    sut.organization_id,
    COUNT(DISTINCT sut.user_id) as tracked_users,
    COUNT(DISTINCT CASE WHEN sut.is_active THEN sut.user_id END) as active_tracked_users,
    COUNT(ste.id) as total_opens,
    COUNT(DISTINCT ste.ip_address_hash) as unique_recipients,
    COUNT(CASE WHEN ste.timestamp > NOW() - INTERVAL '7 days' THEN 1 END) as opens_last_7_days,
    COUNT(CASE WHEN ste.timestamp > NOW() - INTERVAL '30 days' THEN 1 END) as opens_last_30_days
FROM signature_user_tracking sut
LEFT JOIN signature_tracking_events ste ON ste.user_tracking_id = sut.id
    AND ste.tracking_type = 'user'
GROUP BY sut.organization_id;

COMMENT ON VIEW organization_tracking_summary IS 'Organization-wide email engagement statistics';

-- ============================================================================
-- Verify migration
-- ============================================================================

DO $$
BEGIN
    -- Verify table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'signature_user_tracking') THEN
        RAISE EXCEPTION 'Migration failed: signature_user_tracking table not created';
    END IF;

    -- Verify tracking_type column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'signature_tracking_events'
        AND column_name = 'tracking_type'
    ) THEN
        RAISE EXCEPTION 'Migration failed: tracking_type column not added';
    END IF;

    RAISE NOTICE 'Migration 048_create_user_tracking.sql completed successfully';
END $$;
