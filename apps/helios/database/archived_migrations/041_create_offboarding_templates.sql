-- Migration: 041_create_offboarding_templates.sql
-- Description: Create offboarding templates table for user lifecycle management
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-09

-- Offboarding templates define how departing users should be handled
CREATE TABLE IF NOT EXISTS offboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Template identification
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- ==========================================
  -- DATA HANDLING SECTION
  -- ==========================================

  -- Drive file handling
  -- Options: 'transfer_manager' (to user's manager), 'transfer_user' (specific user),
  --          'archive' (to Shared Drive), 'keep' (leave as-is), 'delete' (after retention period)
  drive_action VARCHAR(50) DEFAULT 'transfer_manager',
  drive_transfer_to_user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  drive_archive_shared_drive_id VARCHAR(100), -- Google Shared Drive ID for archival
  drive_delete_after_days INTEGER DEFAULT 90, -- For 'delete' action

  -- Email handling
  -- Options: 'forward_manager', 'forward_user', 'auto_reply', 'archive', 'keep'
  email_action VARCHAR(50) DEFAULT 'forward_manager',
  email_forward_to_user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  email_forward_duration_days INTEGER DEFAULT 30,
  email_auto_reply_message TEXT DEFAULT 'I am no longer with the company. Please contact {{manager_email}} for assistance.',
  email_auto_reply_subject VARCHAR(500) DEFAULT 'Out of Office - {{user_name}} no longer at {{company_name}}',

  -- Calendar handling
  calendar_decline_future_meetings BOOLEAN DEFAULT true,
  calendar_transfer_meeting_ownership BOOLEAN DEFAULT true,
  calendar_transfer_to_manager BOOLEAN DEFAULT true, -- If false, use calendar_transfer_to_user_id
  calendar_transfer_to_user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- ==========================================
  -- ACCESS REVOCATION SECTION
  -- ==========================================

  -- Group membership
  remove_from_all_groups BOOLEAN DEFAULT true,

  -- Shared Drives
  remove_from_shared_drives BOOLEAN DEFAULT true,

  -- OAuth/Security
  revoke_oauth_tokens BOOLEAN DEFAULT true,
  revoke_app_passwords BOOLEAN DEFAULT true,
  sign_out_all_devices BOOLEAN DEFAULT true,
  reset_password BOOLEAN DEFAULT true,

  -- Signature
  remove_signature BOOLEAN DEFAULT true,
  set_offboarding_signature BOOLEAN DEFAULT false,
  offboarding_signature_text TEXT DEFAULT '{{user_name}} is no longer with {{company_name}}. Please contact {{manager_email}} for assistance.',

  -- Mobile devices
  wipe_mobile_devices BOOLEAN DEFAULT false, -- Careful - this is destructive!
  wipe_requires_confirmation BOOLEAN DEFAULT true,

  -- ==========================================
  -- ACCOUNT HANDLING SECTION
  -- ==========================================

  -- Account action timing
  -- Options: 'suspend_immediately', 'suspend_on_last_day', 'keep_active'
  account_action VARCHAR(50) DEFAULT 'suspend_on_last_day',

  -- Account deletion
  delete_account BOOLEAN DEFAULT false,
  delete_after_days INTEGER DEFAULT 90, -- Days after offboarding to delete

  -- License handling
  -- Options: 'remove_immediately', 'remove_on_suspension', 'keep'
  license_action VARCHAR(50) DEFAULT 'remove_on_suspension',

  -- ==========================================
  -- NOTIFICATION SECTION
  -- ==========================================

  notify_manager BOOLEAN DEFAULT true,
  notify_it_admin BOOLEAN DEFAULT true,
  notify_hr BOOLEAN DEFAULT false,
  notification_email_addresses TEXT[] DEFAULT '{}', -- Additional emails to notify
  notification_message TEXT,

  -- ==========================================
  -- METADATA
  -- ==========================================

  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Only one template can be default per org

  -- Audit fields
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_offboarding_templates_org
  ON offboarding_templates(organization_id);

CREATE INDEX IF NOT EXISTS idx_offboarding_templates_active
  ON offboarding_templates(organization_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_offboarding_templates_default
  ON offboarding_templates(organization_id)
  WHERE is_default = true;

-- Unique constraint: only one default template per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_offboarding_templates_one_default
  ON offboarding_templates(organization_id)
  WHERE is_default = true;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_offboarding_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offboarding_templates_updated_at ON offboarding_templates;
DROP TRIGGER IF EXISTS offboarding_templates_updated_at ON PLACEHOLDER;
CREATE TRIGGER offboarding_templates_updated_at
  BEFORE UPDATE ON offboarding_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_offboarding_templates_updated_at();

-- Function to ensure only one default template per organization
CREATE OR REPLACE FUNCTION ensure_single_default_offboarding_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    -- Unset any existing default for this organization
    UPDATE offboarding_templates
    SET is_default = false
    WHERE organization_id = NEW.organization_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_default_offboarding ON offboarding_templates;
DROP TRIGGER IF EXISTS ensure_single_default_offboarding ON PLACEHOLDER;
CREATE TRIGGER ensure_single_default_offboarding
  BEFORE INSERT OR UPDATE ON offboarding_templates
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_offboarding_template();

-- Comments for documentation
COMMENT ON TABLE offboarding_templates IS 'Templates for automated user offboarding with Google Workspace';
COMMENT ON COLUMN offboarding_templates.drive_action IS 'How to handle Drive files: transfer_manager, transfer_user, archive, keep, delete';
COMMENT ON COLUMN offboarding_templates.email_action IS 'How to handle email: forward_manager, forward_user, auto_reply, archive, keep';
COMMENT ON COLUMN offboarding_templates.account_action IS 'When to suspend: suspend_immediately, suspend_on_last_day, keep_active';
COMMENT ON COLUMN offboarding_templates.wipe_mobile_devices IS 'WARNING: Destructive action - wipes all data on managed mobile devices';
