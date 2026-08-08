-- Migration: 049_add_user_preferences_column.sql
-- Description: Add user_preferences JSONB column to organization_users table
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-11

-- Add user_preferences column for storing user-specific settings
-- This stores things like view preferences (admin/user), theme, locale, etc.
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{}'::jsonb;

-- Add index for faster JSON queries on preferences
CREATE INDEX IF NOT EXISTS idx_organization_users_preferences_gin
ON organization_users USING GIN (user_preferences);

-- Add comment explaining the column purpose
COMMENT ON COLUMN organization_users.user_preferences IS 'JSON object storing user-specific preferences like view mode, theme, locale, dashboard widgets, etc.';
