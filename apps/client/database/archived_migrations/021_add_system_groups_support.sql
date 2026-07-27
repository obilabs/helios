-- Migration 021: Add System Groups Support
-- Enables hidden email forwarding groups and other system-managed groups

-- Add group type and system flag to access_groups
ALTER TABLE access_groups
ADD COLUMN IF NOT EXISTS group_type VARCHAR(50) DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Add index for system groups
CREATE INDEX IF NOT EXISTS idx_groups_system
ON access_groups(organization_id, is_system)
WHERE is_system = true;

-- Add index for group type
CREATE INDEX IF NOT EXISTS idx_groups_type
ON access_groups(group_type);

-- Comment on columns
COMMENT ON COLUMN access_groups.group_type IS 'Type of group: standard, system_email_forward, system_automation';
COMMENT ON COLUMN access_groups.is_system IS 'True if group is system-managed (hidden from normal UI)';

-- Valid group_type values:
-- 'standard' - Regular user-created group
-- 'system_email_forward' - Email forwarding group (hidden from directory)
-- 'system_automation' - System automation group
-- 'system_distribution' - Distribution list only
