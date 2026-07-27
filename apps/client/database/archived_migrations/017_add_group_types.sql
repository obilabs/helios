-- Migration: Add Group Types
-- Description: Separate Helios-native groups from integration-synced groups
-- Date: 2025-10-31

-- Add group type to organization_groups table
ALTER TABLE organization_groups
ADD COLUMN IF NOT EXISTS group_type VARCHAR(50) DEFAULT 'native'
  CHECK (group_type IN ('native', 'google_workspace', 'microsoft_365', 'okta', 'slack'));

ALTER TABLE organization_groups
ADD COLUMN IF NOT EXISTS source_id VARCHAR(255); -- ID from the source system

ALTER TABLE organization_groups
ADD COLUMN IF NOT EXISTS sync_metadata JSONB DEFAULT '{}'::jsonb; -- Additional sync data

ALTER TABLE organization_groups
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Create index for group types
CREATE INDEX IF NOT EXISTS idx_org_groups_type ON organization_groups(group_type);
CREATE INDEX IF NOT EXISTS idx_org_groups_source ON organization_groups(source_id) WHERE source_id IS NOT NULL;

-- Update existing groups to be 'native' type if not set
UPDATE organization_groups
SET group_type = 'native'
WHERE group_type IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN organization_groups.group_type IS 'Type of group: native (Helios-created) or synced from integration';
COMMENT ON COLUMN organization_groups.source_id IS 'Original ID from the source system (e.g., Google group ID)';
COMMENT ON COLUMN organization_groups.sync_metadata IS 'Additional metadata from the source system';
COMMENT ON COLUMN organization_groups.last_synced_at IS 'Last time this group was synced from the source';