-- Migration: 075_add_oauth_apps_feature_flag
-- Description: Add feature flag for OAuth Apps navigation item
-- Created: 2024

-- Add OAuth Apps navigation feature flag
INSERT INTO feature_flags (feature_key, name, description, is_enabled, category)
VALUES
    ('nav.oauth_apps', 'OAuth Apps', 'Show OAuth Apps in navigation menu', true, 'navigation')
ON CONFLICT (feature_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;
