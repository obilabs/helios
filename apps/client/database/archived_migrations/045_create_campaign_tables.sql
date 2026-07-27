-- Migration: 045_create_campaign_tables.sql
-- Description: Create signature campaign tables with tracking
-- Author: Helios Autonomous Agent
-- Created: 2025-12-09

-- =====================================================
-- SIGNATURE CAMPAIGNS TABLE
-- =====================================================
-- Temporary signature overrides with scheduling and tracking

CREATE TABLE IF NOT EXISTS signature_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE RESTRICT,

    -- Campaign banner configuration
    banner_url VARCHAR(500),  -- URL to banner image (from asset proxy)
    banner_link VARCHAR(500),  -- Click-through URL
    banner_alt_text VARCHAR(255),  -- Alt text for accessibility

    -- Schedule
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(100) DEFAULT 'UTC',

    -- Tracking configuration
    tracking_enabled BOOLEAN DEFAULT true,
    tracking_options JSONB DEFAULT '{"opens": true, "unique": true, "geo": true}'::jsonb,

    -- Status management
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
        'draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'
    )),
    auto_revert BOOLEAN DEFAULT true,

    -- Metadata
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    launched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Validation
    CONSTRAINT campaign_dates_valid CHECK (end_date > start_date)
);

-- Index for organization lookups
CREATE INDEX IF NOT EXISTS idx_signature_campaigns_org
    ON signature_campaigns(organization_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_signature_campaigns_status
    ON signature_campaigns(organization_id, status);

-- Index for scheduler (find campaigns to start/end)
CREATE INDEX IF NOT EXISTS idx_signature_campaigns_schedule
    ON signature_campaigns(status, start_date, end_date)
    WHERE status IN ('scheduled', 'active');

-- Index for active campaigns
CREATE INDEX IF NOT EXISTS idx_signature_campaigns_active
    ON signature_campaigns(organization_id, start_date, end_date)
    WHERE status = 'active';


-- =====================================================
-- CAMPAIGN ASSIGNMENTS TABLE
-- =====================================================
-- Same assignment model as signature_assignments but for campaigns

CREATE TABLE IF NOT EXISTS campaign_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES signature_campaigns(id) ON DELETE CASCADE,
    assignment_type VARCHAR(30) NOT NULL CHECK (assignment_type IN (
        'user', 'group', 'dynamic_group', 'department', 'ou', 'organization'
    )),
    target_id UUID,  -- user_id, group_id, department_id (NULL for 'organization')
    target_value VARCHAR(500),  -- For OU path strings
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_assignments_unique
    ON campaign_assignments(campaign_id, assignment_type, target_id)
    WHERE target_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_assignments_unique_value
    ON campaign_assignments(campaign_id, assignment_type, target_value)
    WHERE target_value IS NOT NULL AND target_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_assignments_unique_org
    ON campaign_assignments(campaign_id, assignment_type)
    WHERE assignment_type = 'organization';

-- Index for campaign lookups
CREATE INDEX IF NOT EXISTS idx_campaign_assignments_campaign
    ON campaign_assignments(campaign_id);


-- =====================================================
-- SIGNATURE TRACKING PIXELS TABLE
-- =====================================================
-- One pixel per user per campaign for accurate tracking

CREATE TABLE IF NOT EXISTS signature_tracking_pixels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES signature_campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    pixel_token VARCHAR(255) NOT NULL,  -- Encoded token for URL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT tracking_pixels_unique UNIQUE(campaign_id, user_id),
    CONSTRAINT tracking_pixels_token_unique UNIQUE(pixel_token)
);

-- Index for token lookups (used by tracking endpoint)
CREATE INDEX IF NOT EXISTS idx_tracking_pixels_token
    ON signature_tracking_pixels(pixel_token);


-- =====================================================
-- SIGNATURE TRACKING EVENTS TABLE
-- =====================================================
-- Append-only log of pixel loads (email opens)

CREATE TABLE IF NOT EXISTS signature_tracking_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pixel_id UUID NOT NULL REFERENCES signature_tracking_pixels(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL,  -- Denormalized for faster queries
    user_id UUID NOT NULL,  -- Denormalized for faster queries
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    ip_address_hash VARCHAR(64),  -- SHA256 hash for privacy (not raw IP)
    user_agent TEXT,
    country_code VARCHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),
    is_unique BOOLEAN DEFAULT false,  -- First open from this IP hash
    device_type VARCHAR(20),  -- 'desktop', 'mobile', 'tablet', 'unknown'

    -- Denormalized campaign name for reporting
    campaign_name VARCHAR(255)
);

-- Index for campaign analytics queries
CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign
    ON signature_tracking_events(campaign_id, timestamp);

-- Index for user-level analytics
CREATE INDEX IF NOT EXISTS idx_tracking_events_user
    ON signature_tracking_events(user_id, timestamp);

-- Index for time-based aggregation
CREATE INDEX IF NOT EXISTS idx_tracking_events_time
    ON signature_tracking_events(timestamp);

-- Partial index for unique opens (for quick unique counts)
CREATE INDEX IF NOT EXISTS idx_tracking_events_unique
    ON signature_tracking_events(campaign_id, is_unique)
    WHERE is_unique = true;


-- =====================================================
-- ADD FK FROM USER_SIGNATURE_STATUS TO CAMPAIGNS
-- =====================================================

ALTER TABLE user_signature_status
    ADD CONSTRAINT fk_user_signature_status_campaign
    FOREIGN KEY (active_campaign_id) REFERENCES signature_campaigns(id)
    ON DELETE SET NULL;


-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at for signature_campaigns
DROP TRIGGER IF EXISTS trg_signature_campaigns_updated_at ON signature_campaigns;
DROP TRIGGER IF EXISTS trg_signature_campaigns_updated_at ON PLACEHOLDER;
CREATE TRIGGER trg_signature_campaigns_updated_at
    BEFORE UPDATE ON signature_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to get campaign statistics
CREATE OR REPLACE FUNCTION get_campaign_stats(p_campaign_id UUID)
RETURNS TABLE (
    total_opens BIGINT,
    unique_opens BIGINT,
    unique_recipients BIGINT,
    top_performer_user_id UUID,
    top_performer_opens BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total_opens,
        COUNT(*) FILTER (WHERE is_unique = true)::BIGINT AS unique_opens,
        COUNT(DISTINCT ip_address_hash)::BIGINT AS unique_recipients,
        (
            SELECT ste.user_id
            FROM signature_tracking_events ste
            WHERE ste.campaign_id = p_campaign_id
            GROUP BY ste.user_id
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) AS top_performer_user_id,
        (
            SELECT COUNT(*)::BIGINT
            FROM signature_tracking_events ste
            WHERE ste.campaign_id = p_campaign_id
            GROUP BY ste.user_id
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) AS top_performer_opens
    FROM signature_tracking_events
    WHERE campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql STABLE;


-- Function to get opens by day for a campaign
CREATE OR REPLACE FUNCTION get_campaign_opens_by_day(
    p_campaign_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    day DATE,
    total_opens BIGINT,
    unique_opens BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE(timestamp) AS day,
        COUNT(*)::BIGINT AS total_opens,
        COUNT(*) FILTER (WHERE is_unique = true)::BIGINT AS unique_opens
    FROM signature_tracking_events
    WHERE campaign_id = p_campaign_id
    AND (p_start_date IS NULL OR DATE(timestamp) >= p_start_date)
    AND (p_end_date IS NULL OR DATE(timestamp) <= p_end_date)
    GROUP BY DATE(timestamp)
    ORDER BY day;
END;
$$ LANGUAGE plpgsql STABLE;


-- Function to get geographic distribution for a campaign
CREATE OR REPLACE FUNCTION get_campaign_geo_distribution(p_campaign_id UUID)
RETURNS TABLE (
    country_code VARCHAR(2),
    opens BIGINT,
    percentage NUMERIC(5,2)
) AS $$
DECLARE
    total_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO total_count
    FROM signature_tracking_events
    WHERE campaign_id = p_campaign_id
    AND country_code IS NOT NULL;

    RETURN QUERY
    SELECT
        ste.country_code,
        COUNT(*)::BIGINT AS opens,
        ROUND((COUNT(*)::NUMERIC / NULLIF(total_count, 0) * 100), 2) AS percentage
    FROM signature_tracking_events ste
    WHERE ste.campaign_id = p_campaign_id
    AND ste.country_code IS NOT NULL
    GROUP BY ste.country_code
    ORDER BY opens DESC;
END;
$$ LANGUAGE plpgsql STABLE;


-- =====================================================
-- VIEWS FOR ANALYTICS
-- =====================================================

-- Campaign summary view
CREATE OR REPLACE VIEW campaign_analytics_summary AS
SELECT
    sc.id AS campaign_id,
    sc.organization_id,
    sc.name,
    sc.status,
    sc.start_date,
    sc.end_date,
    sc.tracking_enabled,
    COUNT(DISTINCT stp.user_id) AS enrolled_users,
    COUNT(ste.id) AS total_opens,
    COUNT(ste.id) FILTER (WHERE ste.is_unique = true) AS unique_opens,
    COUNT(DISTINCT ste.ip_address_hash) AS unique_recipients,
    CASE
        WHEN COUNT(DISTINCT stp.user_id) > 0
        THEN ROUND(COUNT(ste.id)::NUMERIC / COUNT(DISTINCT stp.user_id), 2)
        ELSE 0
    END AS opens_per_user
FROM signature_campaigns sc
LEFT JOIN signature_tracking_pixels stp ON stp.campaign_id = sc.id
LEFT JOIN signature_tracking_events ste ON ste.campaign_id = sc.id
GROUP BY sc.id;


-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE signature_campaigns IS 'Temporary signature campaigns with scheduling and tracking';
COMMENT ON TABLE campaign_assignments IS 'Links campaigns to users/groups/departments';
COMMENT ON TABLE signature_tracking_pixels IS 'One tracking pixel per user per campaign';
COMMENT ON TABLE signature_tracking_events IS 'Append-only log of email opens via tracking pixels';
COMMENT ON COLUMN signature_tracking_events.ip_address_hash IS 'SHA256 hash of IP address for privacy, not raw IP';
COMMENT ON COLUMN signature_tracking_events.is_unique IS 'True if first open from this IP hash for this campaign';
COMMENT ON FUNCTION get_campaign_stats IS 'Get summary statistics for a campaign';
COMMENT ON FUNCTION get_campaign_opens_by_day IS 'Get opens aggregated by day for charting';
COMMENT ON FUNCTION get_campaign_geo_distribution IS 'Get geographic distribution of opens';
