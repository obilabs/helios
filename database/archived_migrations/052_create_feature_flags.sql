-- Feature Flags Table
-- Single-tenant system - no org_id needed since this is a client portal (one org per instance)
-- These flags control which features/UI elements are visible to users

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT false,
    category VARCHAR(50) DEFAULT 'general',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by key
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(feature_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_category ON feature_flags(category);

-- Insert default feature flags for all incomplete/optional features
INSERT INTO feature_flags (feature_key, name, description, is_enabled, category) VALUES
    -- Automation features
    ('automation.offboarding_templates', 'Offboarding Templates', 'Create and manage offboarding templates', true, 'automation'),
    ('automation.offboarding_execution', 'Offboarding Execution', 'Execute offboarding workflows (data transfer, account deletion)', false, 'automation'),
    ('automation.onboarding_templates', 'Onboarding Templates', 'Create and manage onboarding templates', true, 'automation'),
    ('automation.onboarding_execution', 'Onboarding Execution', 'Execute onboarding workflows (user creation, group assignment)', true, 'automation'),
    ('automation.scheduled_actions', 'Scheduled Actions', 'View and manage scheduled automation tasks', true, 'automation'),
    ('automation.workflows', 'Workflows', 'Custom workflow builder (advanced automation)', false, 'automation'),

    -- Insights features
    ('insights.reports', 'Reports', 'Generate and view reports', false, 'insights'),
    ('insights.team_analytics', 'Team Analytics', 'View team analytics and metrics', true, 'insights'),

    -- Developer Console features
    ('console.pop_out', 'Pop-out Console', 'Open console in separate window', false, 'console'),
    ('console.pinnable_help', 'Pinnable Help Panel', 'Dock help panel to side of console', false, 'console'),
    ('console.command_audit', 'Command Audit Logging', 'Log console commands to audit trail', false, 'console'),

    -- User management features
    ('users.export', 'User Export', 'Export users to CSV/JSON', false, 'users'),
    ('users.platform_filter', 'Platform Filter', 'Filter users by platform (Google/Microsoft/Local)', false, 'users'),
    ('users.delete', 'User Deletion', 'Delete users from the system', true, 'users'),

    -- Integration features
    ('integrations.email_archive', 'Email Archive', 'Archive departed user emails', false, 'integrations'),
    ('integrations.microsoft_365_relay', 'Microsoft 365 Relay', 'Transparent proxy for Microsoft Graph API', false, 'integrations'),
    ('integrations.google_workspace', 'Google Workspace', 'Google Workspace integration', true, 'integrations'),
    ('integrations.microsoft_365', 'Microsoft 365', 'Microsoft 365 integration', true, 'integrations'),

    -- Signature features
    ('signatures.templates', 'Signature Templates', 'Create and manage email signature templates', true, 'signatures'),
    ('signatures.campaigns', 'Signature Campaigns', 'Time-limited signature campaigns with tracking', true, 'signatures'),
    ('signatures.tracking', 'Signature Tracking', 'Track signature views with pixels', true, 'signatures'),

    -- Navigation sections (used to hide/show entire sections)
    ('nav.section.automation', 'Automation Section', 'Show entire Automation section in navigation', true, 'navigation'),
    ('nav.section.assets', 'Assets Section', 'Show entire Assets section in navigation', true, 'navigation'),
    ('nav.section.security', 'Security Section', 'Show entire Security section in navigation', true, 'navigation'),

    -- Navigation items (used to hide incomplete menu items)
    ('nav.onboarding', 'Onboarding', 'Show Onboarding in navigation menu', true, 'navigation'),
    ('nav.offboarding', 'Offboarding', 'Show Offboarding in navigation menu', true, 'navigation'),
    ('nav.scheduled_actions', 'Scheduled Actions', 'Show Scheduled Actions in navigation menu', true, 'navigation'),
    ('nav.workflows', 'Workflows Navigation', 'Show Workflows in navigation menu', false, 'navigation'),
    ('nav.signatures', 'Signatures', 'Show Signatures in navigation menu', true, 'navigation'),
    ('nav.it_assets', 'IT Assets', 'Show IT Assets in navigation menu', true, 'navigation'),
    ('nav.media_files', 'Media Files', 'Show Media Files in navigation menu', true, 'navigation'),
    ('nav.mail_search', 'Mail Search', 'Show Mail Search in navigation menu', true, 'navigation'),
    ('nav.security_events', 'Security Events', 'Show Security Events in navigation menu', true, 'navigation'),
    ('nav.audit_logs', 'Audit Logs', 'Show Audit Logs in navigation menu', true, 'navigation'),
    ('nav.external_sharing', 'External Sharing', 'Show External Sharing in navigation menu', true, 'navigation'),
    ('nav.reports', 'Reports Navigation', 'Show Reports in navigation menu', false, 'navigation'),
    ('nav.email_archive', 'Email Archive Navigation', 'Show Email Archive in navigation menu', false, 'navigation')
ON CONFLICT (feature_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = NOW();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_feature_flags_updated_at ON feature_flags;
DROP TRIGGER IF EXISTS trigger_update_feature_flags_updated_at ON PLACEHOLDER;
CREATE TRIGGER trigger_update_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_feature_flags_updated_at();

COMMENT ON TABLE feature_flags IS 'Feature flags to control feature visibility and rollout';
COMMENT ON COLUMN feature_flags.feature_key IS 'Unique identifier for the feature (e.g., automation.workflows)';
COMMENT ON COLUMN feature_flags.is_enabled IS 'Whether the feature is currently enabled';
COMMENT ON COLUMN feature_flags.category IS 'Feature category for grouping (automation, insights, console, etc.)';
