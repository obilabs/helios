-- Migration: Add Password Setup System
-- Date: 2025-10-06
-- Description: Adds password setup tokens, email templates, and user status fields

-- Add new columns to organization_users
ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS alternate_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS password_setup_method VARCHAR(20) DEFAULT 'admin_set',
  ADD COLUMN IF NOT EXISTS scheduled_creation_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sync_to_google BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_to_microsoft365 BOOLEAN DEFAULT false;

-- Update existing users to have 'active' status
UPDATE organization_users SET status = 'active' WHERE status IS NULL;

-- Create password setup tokens table
CREATE TABLE IF NOT EXISTS password_setup_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id)
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_token ON password_setup_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_user_id ON password_setup_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_expires_at ON password_setup_tokens(expires_at);

-- Create email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  template_type VARCHAR(50) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  variables JSONB, -- Stores available variables for this template
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id)
);

-- Create index on organization_id and template_type
CREATE INDEX IF NOT EXISTS idx_email_templates_org_type ON email_templates(organization_id, template_type);

-- Insert default password setup email template
INSERT INTO email_templates (name, subject, body, template_type, is_default, variables)
VALUES (
  'Default Password Setup',
  'Set up your {organizationName} account',
  E'Hi {firstName},\n\nYour account has been created at {organizationName}. Click the link below to set your password and activate your account:\n\n{setupLink}\n\nThis link will expire in {expiryHours} hours.\n\nIf you didn\'t request this account, please ignore this email.\n\nBest regards,\n{organizationName} Team',
  'password_setup',
  true,
  '{"firstName": "User first name", "lastName": "User last name", "email": "User email", "organizationName": "Organization name", "setupLink": "Password setup link", "expiryHours": "Link expiry in hours"}'::jsonb
) ON CONFLICT DO NOTHING;

-- Create SMTP settings table (for email sending configuration)
CREATE TABLE IF NOT EXISTS smtp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL,
  secure BOOLEAN DEFAULT true,
  username VARCHAR(255) NOT NULL,
  password_encrypted TEXT NOT NULL, -- Encrypted SMTP password
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE password_setup_tokens IS 'Stores tokens for new user password setup links';
COMMENT ON TABLE email_templates IS 'Email templates for automated user communications';
COMMENT ON TABLE smtp_settings IS 'SMTP configuration for sending emails (per organization)';
COMMENT ON COLUMN organization_users.alternate_email IS 'Alternate email for password setup and recovery';
COMMENT ON COLUMN organization_users.status IS 'User status: draft, invited, active, suspended';
COMMENT ON COLUMN organization_users.password_setup_method IS 'How password was set: admin_set or email_link';
