-- Add Rules Engine feature flag
-- Disabled by default since the editor UI is still placeholder

INSERT INTO feature_flags (feature_key, name, description, is_enabled, category) VALUES
    ('nav.rules_engine', 'Rules Engine', 'Show Rules Engine in navigation menu', false, 'navigation')
ON CONFLICT (feature_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = NOW();
