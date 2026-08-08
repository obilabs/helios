-- Create security_events table for tracking security-related events
-- This enables the Security Events page in the admin dashboard

CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    details JSONB,
    source VARCHAR(100) DEFAULT 'system',
    ip_address INET,
    user_agent TEXT,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_acknowledged ON security_events(acknowledged);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_security_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS security_events_updated_at ON security_events;
DROP TRIGGER IF EXISTS security_events_updated_at ON PLACEHOLDER;
CREATE TRIGGER security_events_updated_at
    BEFORE UPDATE ON security_events
    FOR EACH ROW
    EXECUTE FUNCTION update_security_events_updated_at();

-- Insert some sample security events for testing
INSERT INTO security_events (organization_id, event_type, severity, title, description, source)
SELECT
    id as organization_id,
    'login_attempt' as event_type,
    'low' as severity,
    'Successful Login' as title,
    'User logged in successfully from trusted network' as description,
    'auth' as source
FROM organizations
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO security_events (organization_id, event_type, severity, title, description, source)
SELECT
    id as organization_id,
    'password_change' as event_type,
    'medium' as severity,
    'Password Changed' as title,
    'User changed their password via settings' as description,
    'auth' as source
FROM organizations
LIMIT 1
ON CONFLICT DO NOTHING;

COMMENT ON TABLE security_events IS 'Tracks security-related events for audit and monitoring';
COMMENT ON COLUMN security_events.event_type IS 'Type of security event (login_attempt, password_change, permission_change, etc.)';
COMMENT ON COLUMN security_events.severity IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN security_events.acknowledged IS 'Whether the event has been reviewed by an admin';
