-- Migration: 076_add_two_factor_table
-- Description: Add two-factor authentication table for better-auth
-- Created: 2024

-- Two-factor authentication table (better-auth twoFactor plugin)
-- Stores TOTP secrets and backup codes for users
CREATE TABLE IF NOT EXISTS two_factor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT,  -- JSON array of hashed backup codes
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON two_factor(user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_two_factor_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_two_factor_updated_at ON two_factor;
CREATE TRIGGER trigger_two_factor_updated_at
  BEFORE UPDATE ON two_factor
  FOR EACH ROW
  EXECUTE FUNCTION update_two_factor_updated_at();

-- Add column to track if user has completed 2FA setup
-- (separate from enabled - enabled means they started setup, this means verified)
ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

COMMENT ON TABLE two_factor IS 'Stores TOTP 2FA secrets and backup codes for better-auth';
COMMENT ON COLUMN two_factor.secret IS 'Encrypted TOTP secret for authenticator apps';
COMMENT ON COLUMN two_factor.backup_codes IS 'JSON array of hashed one-time backup codes';
COMMENT ON COLUMN two_factor.enabled IS 'Whether 2FA is actively enabled for this user';
COMMENT ON COLUMN organization_users.two_factor_enabled IS 'Quick flag to check if user has 2FA enabled';
