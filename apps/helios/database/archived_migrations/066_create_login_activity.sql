-- Login Activity Table
-- Stores login events from Google Workspace/Microsoft 365 for security monitoring
-- Includes GeoIP data for map visualization

CREATE TABLE IF NOT EXISTS login_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- User information
    user_email VARCHAR(255) NOT NULL,
    user_id VARCHAR(255), -- External ID from Google/Microsoft

    -- Login details
    login_timestamp TIMESTAMPTZ NOT NULL,
    login_type VARCHAR(50), -- 'web', 'mobile', 'pop3', 'imap', 'api', etc.
    ip_address INET NOT NULL,
    user_agent TEXT,

    -- Security flags
    is_suspicious BOOLEAN DEFAULT FALSE,
    is_successful BOOLEAN DEFAULT TRUE,
    failure_reason VARCHAR(255),

    -- GeoIP data (populated by lookup service)
    country_code VARCHAR(2),
    country_name VARCHAR(100),
    city VARCHAR(100),
    region VARCHAR(100),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    timezone VARCHAR(50),
    isp VARCHAR(255),

    -- Source tracking
    source VARCHAR(20) NOT NULL DEFAULT 'google', -- 'google', 'microsoft', 'internal'
    raw_event JSONB, -- Store original event for debugging

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes for common queries
    CONSTRAINT login_activity_valid_source CHECK (source IN ('google', 'microsoft', 'internal'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_login_activity_org_timestamp
    ON login_activity(organization_id, login_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_login_activity_user
    ON login_activity(organization_id, user_email, login_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_login_activity_ip
    ON login_activity(organization_id, ip_address);

CREATE INDEX IF NOT EXISTS idx_login_activity_country
    ON login_activity(organization_id, country_code);

CREATE INDEX IF NOT EXISTS idx_login_activity_suspicious
    ON login_activity(organization_id, is_suspicious)
    WHERE is_suspicious = TRUE;

-- Create aggregated view for dashboard widget
CREATE OR REPLACE VIEW login_activity_by_country AS
SELECT
    organization_id,
    country_code,
    country_name,
    COUNT(*) as login_count,
    COUNT(DISTINCT user_email) as unique_users,
    COUNT(*) FILTER (WHERE is_suspicious) as suspicious_count,
    MAX(login_timestamp) as last_login,
    -- Use first non-null lat/long for country center approximation
    (ARRAY_AGG(latitude ORDER BY login_timestamp DESC))[1] as latitude,
    (ARRAY_AGG(longitude ORDER BY login_timestamp DESC))[1] as longitude
FROM login_activity
WHERE country_code IS NOT NULL
GROUP BY organization_id, country_code, country_name;

-- Add comment
COMMENT ON TABLE login_activity IS 'Login events from identity providers with GeoIP data for security monitoring';
