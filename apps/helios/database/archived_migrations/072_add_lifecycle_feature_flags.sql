-- Migration: 072_add_lifecycle_feature_flags.sql
-- Description: Add feature flags for Journeys and Insights navigation sections
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-28

-- New section flags
INSERT INTO feature_flags (feature_key, name, description, is_enabled, category) VALUES
    ('nav.section.journeys', 'Journeys Section', 'Show Journeys section in navigation', true, 'navigation'),
    ('nav.section.insights', 'Insights Section', 'Show Insights section in navigation', true, 'navigation')
ON CONFLICT (feature_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_enabled = EXCLUDED.is_enabled,
    category = EXCLUDED.category,
    updated_at = NOW();

-- Journeys items
INSERT INTO feature_flags (feature_key, name, description, is_enabled, category) VALUES
    ('nav.requests', 'Requests', 'Show Requests in navigation menu', true, 'navigation'),
    ('nav.tasks', 'My Tasks', 'Show My Tasks in navigation menu', true, 'navigation'),
    ('nav.training', 'Training', 'Show Training in navigation menu', false, 'navigation')
ON CONFLICT (feature_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = NOW();

-- Insights items
INSERT INTO feature_flags (feature_key, name, description, is_enabled, category) VALUES
    ('nav.hr_dashboard', 'HR Dashboard', 'Show HR Dashboard in navigation menu', false, 'navigation'),
    ('nav.manager_dashboard', 'Manager Dashboard', 'Show Manager Dashboard in navigation menu', false, 'navigation'),
    ('nav.lifecycle_analytics', 'Lifecycle Analytics', 'Show Analytics in navigation menu', false, 'navigation')
ON CONFLICT (feature_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = NOW();
