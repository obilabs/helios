-- Add nav.licenses feature flag for license management page

INSERT INTO feature_flags (feature_key, name, description, is_enabled, category) VALUES
    ('nav.licenses', 'Licenses', 'Show Licenses in navigation menu', true, 'navigation')
ON CONFLICT (feature_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW();
