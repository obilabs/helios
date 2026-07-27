-- Migration: 025 - Add User Preferences
-- Description: Adds user_preferences column to organization_users for dashboard customization
-- Author: Claude
-- Date: 2025-11-08

ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{}'::jsonb;

-- Add index for better performance on JSONB queries
CREATE INDEX IF NOT EXISTS idx_organization_users_preferences
ON organization_users USING gin(user_preferences);

-- Comment
COMMENT ON COLUMN organization_users.user_preferences IS 'User preferences including dashboard widget visibility, theme, etc. Example: {"dashboardWidgets": ["google-total-users", "helios-guests"]}';
