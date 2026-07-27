-- Migration: 040_create_onboarding_templates.sql
-- Description: Create onboarding templates table for user lifecycle management
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-09

-- Onboarding templates define how new users should be provisioned
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Template identification
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Department association (optional - template may apply to multiple departments)
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

  -- Google Workspace account settings
  google_license_sku VARCHAR(100), -- e.g., 'Google-Apps-For-Business', 'Google-Apps-Unlimited'
  google_org_unit_path VARCHAR(500), -- e.g., '/Sales', '/Engineering/Backend'
  google_services JSONB DEFAULT '{
    "gmail": true,
    "drive": true,
    "calendar": true,
    "meet": true,
    "chat": true,
    "docs": true,
    "sheets": true,
    "slides": true
  }'::jsonb,

  -- Group memberships - array of access_group IDs to add user to
  group_ids UUID[] DEFAULT '{}',

  -- Shared Drive access - array of {driveId, role} objects
  -- role can be: 'reader', 'commenter', 'writer', 'fileOrganizer', 'organizer'
  shared_drive_access JSONB DEFAULT '[]'::jsonb,

  -- Calendar subscriptions - array of calendar IDs to subscribe user to
  calendar_subscriptions TEXT[] DEFAULT '{}',

  -- Signature template (optional - FK to future signature_templates table)
  -- Using UUID to allow future migration when signature_templates is created
  signature_template_id UUID,

  -- Default job title for this template (can be overridden during onboarding)
  default_job_title VARCHAR(255),

  -- Manager for new hires using this template (optional default)
  default_manager_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- Welcome email settings
  send_welcome_email BOOLEAN DEFAULT true,
  welcome_email_subject VARCHAR(500) DEFAULT 'Welcome to {{company_name}}',
  welcome_email_body TEXT DEFAULT 'Hi {{first_name}},

Your account has been created:
- Email: {{work_email}}
- Temporary Password: {{temp_password}}

Please sign in at {{login_url}} and change your password immediately.

Welcome to the team!',

  -- Template status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Only one template can be default per org

  -- Audit fields
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_onboarding_templates_org
  ON onboarding_templates(organization_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_active
  ON onboarding_templates(organization_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_department
  ON onboarding_templates(department_id)
  WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_default
  ON onboarding_templates(organization_id)
  WHERE is_default = true;

-- Unique constraint: only one default template per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_templates_one_default
  ON onboarding_templates(organization_id)
  WHERE is_default = true;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_onboarding_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onboarding_templates_updated_at ON onboarding_templates;
DROP TRIGGER IF EXISTS onboarding_templates_updated_at ON PLACEHOLDER;
CREATE TRIGGER onboarding_templates_updated_at
  BEFORE UPDATE ON onboarding_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_templates_updated_at();

-- Function to ensure only one default template per organization
CREATE OR REPLACE FUNCTION ensure_single_default_onboarding_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    -- Unset any existing default for this organization
    UPDATE onboarding_templates
    SET is_default = false
    WHERE organization_id = NEW.organization_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_default_onboarding ON onboarding_templates;
DROP TRIGGER IF EXISTS ensure_single_default_onboarding ON PLACEHOLDER;
CREATE TRIGGER ensure_single_default_onboarding
  BEFORE INSERT OR UPDATE ON onboarding_templates
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_onboarding_template();

-- Comments for documentation
COMMENT ON TABLE onboarding_templates IS 'Templates for automated user onboarding with Google Workspace';
COMMENT ON COLUMN onboarding_templates.google_license_sku IS 'Google Workspace license SKU (e.g., Google-Apps-For-Business)';
COMMENT ON COLUMN onboarding_templates.google_org_unit_path IS 'Google Workspace organizational unit path (e.g., /Sales)';
COMMENT ON COLUMN onboarding_templates.google_services IS 'JSON object of enabled Google services (gmail, drive, calendar, etc.)';
COMMENT ON COLUMN onboarding_templates.group_ids IS 'Array of access_group UUIDs to add new users to';
COMMENT ON COLUMN onboarding_templates.shared_drive_access IS 'JSON array of {driveId, role} for Shared Drive permissions';
COMMENT ON COLUMN onboarding_templates.calendar_subscriptions IS 'Array of calendar IDs to subscribe new users to';
COMMENT ON COLUMN onboarding_templates.signature_template_id IS 'Reference to signature template (future feature)';
