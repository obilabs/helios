-- Migration 010: Create Template Studio System
-- This migration implements the Template Studio architecture for managing templates,
-- assignments, and campaigns across different modules.

-- =====================================================
-- 1. Template Types Table
-- =====================================================
-- Defines the types of templates available based on enabled modules
CREATE TABLE IF NOT EXISTS template_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key VARCHAR(100) UNIQUE NOT NULL,
  type_label VARCHAR(255) NOT NULL,
  module_key VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  icon_name VARCHAR(100),
  supported_variables JSONB DEFAULT '[]'::jsonb,
  required_fields JSONB DEFAULT '["html_content"]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by module
CREATE INDEX IF NOT EXISTS idx_template_types_module_key ON template_types(module_key);
CREATE INDEX IF NOT EXISTS idx_template_types_category ON template_types(category);

-- Seed initial template types
INSERT INTO template_types (type_key, type_label, module_key, category, icon_name, supported_variables) VALUES
  (
    'gmail_signature',
    'Gmail Signature',
    'google_workspace',
    'email_signatures',
    'EmailIcon',
    '["user.firstName", "user.lastName", "user.email", "user.title", "user.department", "user.phone", "user.mobile", "user.officeLocation", "user.orgUnit", "organization.name", "organization.domain", "organization.phone"]'::jsonb
  ),
  (
    'outlook_signature',
    'Outlook Signature',
    'microsoft_365',
    'email_signatures',
    'EmailIcon',
    '["user.firstName", "user.lastName", "user.email", "user.title", "user.department", "user.phone", "user.mobile", "user.officeLocation", "organization.name", "organization.domain", "organization.phone"]'::jsonb
  ),
  (
    'landing_page',
    'Landing Page',
    'public_assets',
    'web_content',
    'WebIcon',
    '["organization.name", "organization.domain", "organization.logo"]'::jsonb
  ),
  (
    'email_template',
    'Email Template',
    'email_forwarding',
    'email_content',
    'MailIcon',
    '["user.firstName", "user.lastName", "user.email", "organization.name"]'::jsonb
  ),
  (
    'ooo_message',
    'Out of Office Message',
    'ooo_management',
    'email_content',
    'EventBusyIcon',
    '["user.firstName", "user.lastName", "user.department"]'::jsonb
  )
ON CONFLICT (type_key) DO NOTHING;

-- =====================================================
-- 2. Update signature_templates Table
-- =====================================================
-- Add template_type and template_category columns
ALTER TABLE signature_templates
  ADD COLUMN IF NOT EXISTS template_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS template_category VARCHAR(100) DEFAULT 'email_signatures';

-- Add foreign key constraint to template_types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'signature_templates_template_type_fkey'
  ) THEN
    ALTER TABLE signature_templates
      ADD CONSTRAINT signature_templates_template_type_fkey
      FOREIGN KEY (template_type) REFERENCES template_types(type_key) ON DELETE SET NULL;
  END IF;
END $$;

-- Migrate existing templates to use 'gmail_signature' type
UPDATE signature_templates
SET
  template_type = 'gmail_signature',
  template_category = 'email_signatures'
WHERE template_type IS NULL;

-- Add index for filtering by template type
CREATE INDEX IF NOT EXISTS idx_signature_templates_template_type ON signature_templates(template_type);

-- =====================================================
-- 3. Template Assignments Table
-- =====================================================
-- Defines permanent rules for who gets which template
CREATE TABLE IF NOT EXISTS template_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE CASCADE,
  template_type VARCHAR(100) REFERENCES template_types(type_key) ON DELETE CASCADE,

  -- Assignment target (one of these should be non-null)
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('organization', 'user', 'department', 'google_group', 'org_unit', 'microsoft_group')),
  target_user_id UUID REFERENCES organization_users(id) ON DELETE CASCADE,
  target_department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  target_group_email VARCHAR(255), -- Google/Microsoft group email
  target_org_unit_path TEXT, -- Google Org Unit path

  -- Priority system (lower number = higher priority)
  -- 1 = User-specific, 2 = Department, 3 = Group, 4 = Org Unit, 5 = Organization default
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 5),

  -- Status and scheduling
  is_active BOOLEAN DEFAULT true,
  activation_date TIMESTAMP WITH TIME ZONE,
  expiration_date TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure only one target is specified
  CONSTRAINT check_single_target CHECK (
    (target_type = 'organization' AND target_user_id IS NULL AND target_department_id IS NULL AND target_group_email IS NULL AND target_org_unit_path IS NULL) OR
    (target_type = 'user' AND target_user_id IS NOT NULL AND target_department_id IS NULL AND target_group_email IS NULL AND target_org_unit_path IS NULL) OR
    (target_type = 'department' AND target_user_id IS NULL AND target_department_id IS NOT NULL AND target_group_email IS NULL AND target_org_unit_path IS NULL) OR
    (target_type = 'google_group' AND target_user_id IS NULL AND target_department_id IS NULL AND target_group_email IS NOT NULL AND target_org_unit_path IS NULL) OR
    (target_type = 'org_unit' AND target_user_id IS NULL AND target_department_id IS NULL AND target_group_email IS NULL AND target_org_unit_path IS NOT NULL) OR
    (target_type = 'microsoft_group' AND target_user_id IS NULL AND target_department_id IS NULL AND target_group_email IS NOT NULL AND target_org_unit_path IS NULL)
  )
);

-- Indexes for assignment lookups
CREATE INDEX IF NOT EXISTS idx_template_assignments_org ON template_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_template_assignments_template ON template_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_template_assignments_user ON template_assignments(target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_template_assignments_department ON template_assignments(target_department_id) WHERE target_department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_template_assignments_group_email ON template_assignments(target_group_email) WHERE target_group_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_template_assignments_active ON template_assignments(is_active, priority);

-- =====================================================
-- 4. Template Campaigns Table
-- =====================================================
-- Defines time-based template deployments (always override assignments)
CREATE TABLE IF NOT EXISTS template_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE CASCADE,
  template_type VARCHAR(100) REFERENCES template_types(type_key) ON DELETE CASCADE,

  -- Campaign details
  campaign_name VARCHAR(255) NOT NULL,
  campaign_description TEXT,

  -- Target audience (similar to assignments)
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('organization', 'user', 'department', 'google_group', 'org_unit', 'microsoft_group', 'multiple')),
  target_user_id UUID REFERENCES organization_users(id) ON DELETE CASCADE,
  target_department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  target_group_email VARCHAR(255),
  target_org_unit_path TEXT,
  target_multiple JSONB, -- For complex targeting (multiple departments, groups, etc.)

  -- Scheduling
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  timezone VARCHAR(100) DEFAULT 'UTC',

  -- Post-campaign behavior
  revert_to_previous BOOLEAN DEFAULT true,
  previous_template_id UUID REFERENCES signature_templates(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')),

  -- Approval workflow
  requires_approval BOOLEAN DEFAULT false,
  approver_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,

  -- Analytics
  users_affected INTEGER DEFAULT 0,
  deployments_count INTEGER DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Validation
  CONSTRAINT check_dates CHECK (end_date > start_date)
);

-- Indexes for campaign queries
CREATE INDEX IF NOT EXISTS idx_template_campaigns_org ON template_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_template_campaigns_template ON template_campaigns(template_id);
CREATE INDEX IF NOT EXISTS idx_template_campaigns_status ON template_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_template_campaigns_dates ON template_campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_template_campaigns_active ON template_campaigns(organization_id, status) WHERE status = 'active';

-- =====================================================
-- 5. Campaign Target Mapping Table
-- =====================================================
-- Maps campaigns to specific users/groups for complex targeting
CREATE TABLE IF NOT EXISTS template_campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES template_campaigns(id) ON DELETE CASCADE,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(255) NOT NULL, -- Can be user_id, department_id, group_email, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign ON template_campaign_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_type_id ON template_campaign_targets(target_type, target_id);

-- =====================================================
-- 6. Template Deployment History Table
-- =====================================================
-- Tracks which templates were deployed to which users and when
CREATE TABLE IF NOT EXISTS template_deployment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE CASCADE,

  -- Deployment source
  deployment_source VARCHAR(50) NOT NULL CHECK (deployment_source IN ('assignment', 'campaign', 'manual')),
  assignment_id UUID REFERENCES template_assignments(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES template_campaigns(id) ON DELETE SET NULL,

  -- Deployment details
  deployed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deployed_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- Status
  deployment_status VARCHAR(50) DEFAULT 'success' CHECK (deployment_status IN ('success', 'failed', 'pending')),
  error_message TEXT,

  -- Platform-specific deployment IDs (for verification)
  google_deployment_id VARCHAR(255),
  microsoft_deployment_id VARCHAR(255)
);

-- Indexes for deployment history
CREATE INDEX IF NOT EXISTS idx_deployment_history_org ON template_deployment_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_deployment_history_user ON template_deployment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_deployment_history_template ON template_deployment_history(template_id);
CREATE INDEX IF NOT EXISTS idx_deployment_history_campaign ON template_deployment_history(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deployment_history_deployed_at ON template_deployment_history(deployed_at DESC);

-- =====================================================
-- 7. Update Triggers
-- =====================================================

-- Update updated_at timestamp for template_types
CREATE OR REPLACE FUNCTION update_template_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_template_types_timestamp'
  ) THEN
    CREATE TRIGGER update_template_types_timestamp
      BEFORE UPDATE ON template_types
      FOR EACH ROW
      EXECUTE FUNCTION update_template_types_updated_at();
  END IF;
END $$;

-- Update updated_at timestamp for template_assignments
CREATE OR REPLACE FUNCTION update_template_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_template_assignments_timestamp'
  ) THEN
    CREATE TRIGGER update_template_assignments_timestamp
      BEFORE UPDATE ON template_assignments
      FOR EACH ROW
      EXECUTE FUNCTION update_template_assignments_updated_at();
  END IF;
END $$;

-- Update updated_at timestamp for template_campaigns
CREATE OR REPLACE FUNCTION update_template_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_template_campaigns_timestamp'
  ) THEN
    CREATE TRIGGER update_template_campaigns_timestamp
      BEFORE UPDATE ON template_campaigns
      FOR EACH ROW
      EXECUTE FUNCTION update_template_campaigns_updated_at();
  END IF;
END $$;

-- =====================================================
-- 8. Comments for Documentation
-- =====================================================

COMMENT ON TABLE template_types IS 'Defines available template types based on enabled modules (Gmail Signature, Outlook Signature, Landing Page, etc.)';
COMMENT ON TABLE template_assignments IS 'Permanent rules defining who gets which template (priority-based)';
COMMENT ON TABLE template_campaigns IS 'Time-based template deployments that override permanent assignments';
COMMENT ON TABLE template_campaign_targets IS 'Maps campaigns to specific users/groups for complex targeting';
COMMENT ON TABLE template_deployment_history IS 'Audit trail of all template deployments to users';

COMMENT ON COLUMN template_assignments.priority IS 'Priority level: 1=User, 2=Department, 3=Group, 4=OrgUnit, 5=Organization (lower number wins)';
COMMENT ON COLUMN template_campaigns.revert_to_previous IS 'If true, revert to previous template after campaign ends';
COMMENT ON COLUMN template_campaigns.status IS 'Campaign lifecycle: draft -> scheduled -> active -> completed/cancelled';
