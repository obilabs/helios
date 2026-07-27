-- Migration: 019 - Implement Canonical Data Model
-- Description: Separates canonical entity names from display labels, splits Groups into Workspaces and Access Groups
-- Author: Claude
-- Date: 2025-11-01

-- =====================================================
-- 1. CUSTOM LABELS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS custom_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Canonical entity name (immutable system identifier)
  canonical_name VARCHAR(100) NOT NULL,

  -- Display labels (tenant-customizable)
  label_singular VARCHAR(30) NOT NULL,
  label_plural VARCHAR(30) NOT NULL,

  -- Audit trail
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- Constraints
  UNIQUE(organization_id, canonical_name),
  CHECK (char_length(label_singular) <= 30),
  CHECK (char_length(label_plural) <= 30),
  CHECK (label_singular <> ''),
  CHECK (label_plural <> '')
);

-- Indexes for custom_labels
CREATE INDEX idx_custom_labels_org ON custom_labels(organization_id);
CREATE INDEX idx_custom_labels_canonical ON custom_labels(canonical_name);

-- Comments
COMMENT ON TABLE custom_labels IS 'Stores tenant-customizable display labels for canonical entities (e.g., "People" for entity.user)';
COMMENT ON COLUMN custom_labels.canonical_name IS 'Immutable system identifier (e.g., entity.user, entity.workspace)';
COMMENT ON COLUMN custom_labels.label_singular IS 'Singular form for UI (e.g., "Person", "Pod", "Team")';
COMMENT ON COLUMN custom_labels.label_plural IS 'Plural form for UI (e.g., "People", "Pods", "Teams")';

-- =====================================================
-- 2. WORKSPACES TABLE (Collaboration Spaces)
-- =====================================================

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  email VARCHAR(255),  -- For workspace email (e.g., team@company.com)

  -- Source platform
  platform VARCHAR(50) NOT NULL,  -- 'microsoft_teams', 'google_chat_space', 'slack_channel'
  external_id VARCHAR(255),       -- ID in source system
  external_url VARCHAR(500),      -- Link to workspace in source platform

  -- Workspace type/category
  workspace_type VARCHAR(50),     -- 'project', 'department', 'customer', 'general'

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMP,

  -- Metadata from source platform
  metadata JSONB,
  -- Example for Microsoft Team:
  -- {
  --   "teamId": "abc123",
  --   "sharepointSiteUrl": "https://...",
  --   "plannerId": "xyz789",
  --   "visibility": "private",
  --   "memberCount": 15
  -- }

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP,  -- Last sync from source platform

  UNIQUE(organization_id, platform, external_id)
);

-- Workspace members (many-to-many with roles)
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Member role in workspace
  role VARCHAR(50) NOT NULL DEFAULT 'member',  -- 'owner', 'admin', 'member', 'guest'

  -- Status
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMP DEFAULT NOW(),
  removed_at TIMESTAMP,

  -- Sync from platform
  synced_from_platform BOOLEAN DEFAULT true,

  UNIQUE(workspace_id, user_id)
);

-- Indexes for workspaces
CREATE INDEX idx_workspaces_org ON workspaces(organization_id);
CREATE INDEX idx_workspaces_platform ON workspaces(platform, external_id);
CREATE INDEX idx_workspaces_active ON workspaces(organization_id, is_active) WHERE is_active = true;
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- Comments
COMMENT ON TABLE workspaces IS 'Collaboration spaces (Microsoft Teams, Google Chat Spaces). Full environments with chat, files, tasks.';
COMMENT ON TABLE workspace_members IS 'Members of collaboration workspaces with roles (owner, admin, member, guest)';

-- =====================================================
-- 3. ACCESS GROUPS TABLE (Permission/Mailing Lists)
-- =====================================================

CREATE TABLE IF NOT EXISTS access_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  email VARCHAR(255),  -- Group email address

  -- Source platform
  platform VARCHAR(50) NOT NULL,  -- 'google_workspace', 'microsoft_365', 'manual'
  group_type VARCHAR(50) NOT NULL,  -- 'google_group', 'm365_security_group', 'm365_distribution_group', 'manual'
  external_id VARCHAR(255),         -- ID in source system
  external_url VARCHAR(500),        -- Link to group in source platform

  -- Group settings
  allow_external_members BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata from source platform
  metadata JSONB,
  -- Example for Google Group:
  -- {
  --   "groupId": "abc123@company.com",
  --   "whoCanJoin": "INVITED_CAN_JOIN",
  --   "whoCanPostMessage": "ALL_MEMBERS_CAN_POST",
  --   "memberCount": 25
  -- }

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP,  -- Last sync from source platform

  UNIQUE(organization_id, platform, external_id)
);

-- Access group members (many-to-many)
CREATE TABLE IF NOT EXISTS access_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Member type
  member_type VARCHAR(50) NOT NULL DEFAULT 'member',  -- 'owner', 'manager', 'member'

  -- Status
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMP DEFAULT NOW(),
  removed_at TIMESTAMP,

  -- Sync from platform
  synced_from_platform BOOLEAN DEFAULT true,

  UNIQUE(access_group_id, user_id)
);

-- Indexes for access_groups
CREATE INDEX idx_access_groups_org ON access_groups(organization_id);
CREATE INDEX idx_access_groups_platform ON access_groups(platform, external_id);
CREATE INDEX idx_access_groups_email ON access_groups(email);
CREATE INDEX idx_access_groups_active ON access_groups(organization_id, is_active) WHERE is_active = true;
CREATE INDEX idx_access_group_members_group ON access_group_members(access_group_id);
CREATE INDEX idx_access_group_members_user ON access_group_members(user_id);

-- Comments
COMMENT ON TABLE access_groups IS 'Permission and mailing lists (Google Groups, M365 Security/Distribution Groups). Used for access control and communications.';
COMMENT ON TABLE access_group_members IS 'Members of access groups for permission management and distribution lists';

-- =====================================================
-- 4. DATA MIGRATION: user_groups → access_groups
-- =====================================================

-- Migrate existing groups to access_groups
-- Assumes all current groups are Google Groups
INSERT INTO access_groups (
  id,
  organization_id,
  name,
  description,
  email,
  platform,
  group_type,
  external_id,
  is_active,
  created_at,
  updated_at
)
SELECT
  id,
  organization_id,
  name,
  description,
  email,
  'google_workspace',
  'google_group',
  google_group_id,
  is_active,
  created_at,
  updated_at
FROM user_groups
ON CONFLICT (organization_id, platform, external_id) DO NOTHING;

-- Migrate group membership
INSERT INTO access_group_members (
  access_group_id,
  user_id,
  member_type,
  is_active,
  synced_from_platform
)
SELECT
  group_id,
  user_id,
  'member',  -- Default all to member type
  true,
  true
FROM group_members
ON CONFLICT (access_group_id, user_id) DO NOTHING;

-- Note: We keep user_groups table for now (backward compatibility)
-- It will be deprecated and removed in a future migration

-- =====================================================
-- 5. SEED DEFAULT LABELS FOR ALL ORGANIZATIONS
-- =====================================================

-- Function to seed default labels for an organization
CREATE OR REPLACE FUNCTION seed_default_labels(org_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Insert default labels for all canonical entities
  INSERT INTO custom_labels (organization_id, canonical_name, label_singular, label_plural)
  VALUES
    (org_id, 'entity.user', 'User', 'Users'),
    (org_id, 'entity.workspace', 'Team', 'Teams'),
    (org_id, 'entity.access_group', 'Group', 'Groups'),
    (org_id, 'entity.policy_container', 'Org Unit', 'Org Units'),
    (org_id, 'entity.device', 'Device', 'Devices')
  ON CONFLICT (organization_id, canonical_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Seed labels for all existing organizations
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations
  LOOP
    PERFORM seed_default_labels(org.id);
  END LOOP;

  RAISE NOTICE 'Seeded default labels for % organizations', (SELECT COUNT(*) FROM organizations);
END $$;

-- =====================================================
-- 6. MODULE-ENTITY REGISTRY (Configuration Table)
-- =====================================================

-- This table defines which modules provide which entities
CREATE TABLE IF NOT EXISTS module_entity_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key VARCHAR(100) NOT NULL,  -- 'google_workspace', 'microsoft_365', etc.
  entity_canonical_name VARCHAR(100) NOT NULL,  -- 'entity.workspace', 'entity.access_group'
  is_primary_provider BOOLEAN DEFAULT false,  -- Primary provider for this entity

  UNIQUE(module_key, entity_canonical_name)
);

-- Seed module-entity mappings
INSERT INTO module_entity_providers (module_key, entity_canonical_name, is_primary_provider) VALUES
  -- Core (no module required - these are always available)
  ('core', 'entity.user', true),
  ('core', 'entity.policy_container', false),  -- Basic structure, enhanced by GWS

  -- Google Workspace provides
  ('google_workspace', 'entity.access_group', true),
  ('google_workspace', 'entity.policy_container', true),  -- Full GWS Org Units

  -- Microsoft 365 provides
  ('microsoft_365', 'entity.workspace', true),
  ('microsoft_365', 'entity.access_group', false),  -- Also provides groups

  -- Google Chat provides
  ('google_chat', 'entity.workspace', false),  -- Also provides workspaces

  -- Device Management provides
  ('device_management', 'entity.device', true)
ON CONFLICT (module_key, entity_canonical_name) DO NOTHING;

-- Indexes
CREATE INDEX idx_module_entity_providers_module ON module_entity_providers(module_key);
CREATE INDEX idx_module_entity_providers_entity ON module_entity_providers(entity_canonical_name);

-- Comments
COMMENT ON TABLE module_entity_providers IS 'Defines which modules provide which canonical entities';

-- =====================================================
-- 7. HELPER FUNCTION: Get Available Entities for Org
-- =====================================================

CREATE OR REPLACE FUNCTION get_available_entities(org_id UUID)
RETURNS TABLE(canonical_name VARCHAR, provided_by VARCHAR[]) AS $$
BEGIN
  RETURN QUERY
  WITH enabled_modules AS (
    SELECT am.module_key
    FROM organization_modules om
    JOIN available_modules am ON am.id = om.module_id
    WHERE om.organization_id = org_id AND om.is_enabled = true
  ),
  core_entities AS (
    -- Core entities always available
    SELECT DISTINCT
      mep.entity_canonical_name,
      ARRAY['core']::VARCHAR[] as providers
    FROM module_entity_providers mep
    WHERE mep.module_key = 'core'
  ),
  module_entities AS (
    -- Entities from enabled modules
    SELECT
      mep.entity_canonical_name,
      array_agg(mep.module_key) as providers
    FROM module_entity_providers mep
    WHERE mep.module_key IN (SELECT module_key FROM enabled_modules)
    GROUP BY mep.entity_canonical_name
  )
  SELECT
    COALESCE(c.entity_canonical_name, m.entity_canonical_name) as canonical_name,
    COALESCE(c.providers, ARRAY[]::VARCHAR[]) || COALESCE(m.providers, ARRAY[]::VARCHAR[]) as provided_by
  FROM core_entities c
  FULL OUTER JOIN module_entities m ON c.entity_canonical_name = m.entity_canonical_name;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. UPDATE ORGANIZATION CREATION TRIGGER
-- =====================================================

-- Function to initialize new organization with labels
CREATE OR REPLACE FUNCTION initialize_organization_labels()
RETURNS TRIGGER AS $$
BEGIN
  -- Seed default labels for the new organization
  PERFORM seed_default_labels(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-seed labels on organization creation
DROP TRIGGER IF EXISTS trigger_seed_labels_on_org_creation ON organizations;
DROP TRIGGER IF EXISTS trigger_seed_labels_on_org_creation ON PLACEHOLDER;
CREATE TRIGGER trigger_seed_labels_on_org_creation
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION initialize_organization_labels();

-- =====================================================
-- 9. VERIFICATION & STATISTICS
-- =====================================================

DO $$
DECLARE
  total_orgs INTEGER;
  total_labels INTEGER;
  total_workspaces INTEGER;
  total_access_groups INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_orgs FROM organizations;
  SELECT COUNT(*) INTO total_labels FROM custom_labels;
  SELECT COUNT(*) INTO total_workspaces FROM workspaces;
  SELECT COUNT(*) INTO total_access_groups FROM access_groups;

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Migration 019 completed successfully!';
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  ✓ custom_labels';
  RAISE NOTICE '  ✓ workspaces';
  RAISE NOTICE '  ✓ workspace_members';
  RAISE NOTICE '  ✓ access_groups';
  RAISE NOTICE '  ✓ access_group_members';
  RAISE NOTICE '  ✓ module_entity_providers';
  RAISE NOTICE '';
  RAISE NOTICE 'Statistics:';
  RAISE NOTICE '  - Organizations: %', total_orgs;
  RAISE NOTICE '  - Default labels seeded: %', total_labels;
  RAISE NOTICE '  - Migrated access groups: %', total_access_groups;
  RAISE NOTICE '  - Workspaces: %', total_workspaces;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Deploy Label Service API';
  RAISE NOTICE '  2. Create LabelsContext in frontend';
  RAISE NOTICE '  3. Refactor UI to use label tokens';
  RAISE NOTICE '=========================================';
END $$;
