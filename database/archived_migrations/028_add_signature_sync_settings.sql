-- Migration: Add signature sync settings to organization_settings
-- Purpose: Store configuration for automatic 24-hour signature sync

-- Add columns to organization_settings
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS signature_sync_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS signature_sync_hour INTEGER DEFAULT 2 CHECK (signature_sync_hour >= 0 AND signature_sync_hour < 24);

-- Add comment
COMMENT ON COLUMN organization_settings.signature_sync_enabled IS 'Whether automatic signature sync is enabled';
COMMENT ON COLUMN organization_settings.signature_sync_hour IS 'Hour of day (0-23) to run signature sync';