-- Migration 008: Add Group Mapping to Departments and New User Fields
-- Adds Google Workspace group mapping, professional designations, and pronouns

-- =====================================================
-- ADD GROUP MAPPING TO DEPARTMENTS
-- =====================================================
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS gw_group_id VARCHAR(255),           -- Google Workspace Group ID
  ADD COLUMN IF NOT EXISTS gw_group_email VARCHAR(255),        -- Group email for display
  ADD COLUMN IF NOT EXISTS auto_sync_to_group BOOLEAN DEFAULT false; -- Auto-sync users to group

-- Create index for group lookups
CREATE INDEX IF NOT EXISTS idx_departments_gw_group ON departments(gw_group_id);

COMMENT ON COLUMN departments.gw_group_id IS 'Optional mapping to Google Workspace group';
COMMENT ON COLUMN departments.auto_sync_to_group IS 'When true, users assigned to this department are automatically added to the mapped group';

-- =====================================================
-- ADD NEW USER FIELDS
-- =====================================================
ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS professional_designations TEXT,     -- e.g., "CPA, MBA" or "PhD Computer Science"
  ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50);               -- e.g., "she/her", "he/him", "they/them"

-- Create index for searching by designations
CREATE INDEX IF NOT EXISTS idx_users_designations ON organization_users USING gin(to_tsvector('english', professional_designations));

COMMENT ON COLUMN organization_users.professional_designations IS 'Professional designations/certifications (comma or space separated)';
COMMENT ON COLUMN organization_users.pronouns IS 'User preferred pronouns';

-- =====================================================
-- EXTENSIBLE PLATFORM IDS SYSTEM
-- =====================================================
-- Create table for custom platform integrations with user-defined labels
CREATE TABLE IF NOT EXISTS platform_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Platform Info
  platform_key VARCHAR(100) NOT NULL,           -- e.g., "custom_crm", "custom_hr_system"
  display_name VARCHAR(255) NOT NULL,           -- User-friendly name shown in UI
  icon VARCHAR(100),                            -- Icon identifier
  description TEXT,

  -- Field Configuration
  field_label VARCHAR(255) NOT NULL,            -- e.g., "Employee Number", "CRM ID"
  field_type VARCHAR(50) DEFAULT 'text',        -- text, url, email, number
  is_required BOOLEAN DEFAULT false,
  validation_regex VARCHAR(500),                -- Optional regex for validation

  -- Status
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  UNIQUE(organization_id, platform_key)
);

-- Create table to store actual user values for custom platforms
CREATE TABLE IF NOT EXISTS user_platform_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  platform_integration_id UUID NOT NULL REFERENCES platform_integrations(id) ON DELETE CASCADE,

  value VARCHAR(500) NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, platform_integration_id)
);

-- Indexes for platform integrations
CREATE INDEX IF NOT EXISTS idx_platform_integrations_org ON platform_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_platform_integrations_active ON platform_integrations(is_active);
CREATE INDEX IF NOT EXISTS idx_user_platform_ids_user ON user_platform_ids(user_id);
CREATE INDEX IF NOT EXISTS idx_user_platform_ids_platform ON user_platform_ids(platform_integration_id);

-- Insert common platform presets (inactive by default, user can activate and customize)
DO $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO platform_integrations (organization_id, platform_key, display_name, field_label, icon, is_active, display_order)
    VALUES
      (v_org_id, 'custom_hr', 'HR System', 'Employee ID', 'badge', false, 10),
      (v_org_id, 'custom_crm', 'CRM System', 'CRM ID', 'users', false, 20),
      (v_org_id, 'custom_erp', 'ERP System', 'ERP ID', 'briefcase', false, 30),
      (v_org_id, 'custom_sso', 'SSO Provider', 'SSO ID', 'key', false, 40),
      (v_org_id, 'custom_ticketing', 'Ticketing System', 'Agent ID', 'ticket', false, 50),
      (v_org_id, 'custom_vpn', 'VPN Access', 'VPN Username', 'shield', false, 60),
      (v_org_id, 'custom_other1', 'Custom Platform 1', 'Custom ID 1', 'box', false, 70),
      (v_org_id, 'custom_other2', 'Custom Platform 2', 'Custom ID 2', 'box', false, 80)
    ON CONFLICT (organization_id, platform_key) DO NOTHING;
  END IF;
END $$;

-- =====================================================
-- UPDATE TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_platform_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_integrations_updated_at ON PLACEHOLDER;
CREATE TRIGGER platform_integrations_updated_at
    BEFORE UPDATE ON platform_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_platform_integrations_updated_at();

DROP TRIGGER IF EXISTS user_platform_ids_updated_at ON PLACEHOLDER;
CREATE TRIGGER user_platform_ids_updated_at
    BEFORE UPDATE ON user_platform_ids
    FOR EACH ROW
    EXECUTE FUNCTION update_platform_integrations_updated_at();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE platform_integrations IS 'Extensible platform integrations with custom display names';
COMMENT ON TABLE user_platform_ids IS 'User values for custom platform integrations';
