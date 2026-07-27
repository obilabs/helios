-- Migration: 077_add_passkeys_table
-- Description: Add passkeys table for WebAuthn/FIDO2 authentication
-- Created: 2024

-- Passkeys table (better-auth passkey plugin)
-- Stores WebAuthn credentials for passwordless authentication
CREATE TABLE IF NOT EXISTS passkeys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  name TEXT,                          -- User-friendly name (e.g., "MacBook Touch ID")
  public_key TEXT NOT NULL,           -- WebAuthn public key
  credential_id TEXT NOT NULL UNIQUE, -- WebAuthn credential ID
  counter INTEGER DEFAULT 0,          -- Signature counter for replay protection
  device_type TEXT,                   -- 'singleDevice' or 'multiDevice'
  backed_up BOOLEAN DEFAULT false,    -- Whether credential is backed up (synced)
  transports TEXT,                    -- JSON array of transports (usb, nfc, ble, internal)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);

-- Index for credential lookups during authentication
CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_passkeys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_passkeys_updated_at ON passkeys;
CREATE TRIGGER trigger_passkeys_updated_at
  BEFORE UPDATE ON passkeys
  FOR EACH ROW
  EXECUTE FUNCTION update_passkeys_updated_at();

COMMENT ON TABLE passkeys IS 'Stores WebAuthn passkey credentials for passwordless authentication';
COMMENT ON COLUMN passkeys.name IS 'User-friendly name for the passkey (e.g., "MacBook Touch ID")';
COMMENT ON COLUMN passkeys.public_key IS 'WebAuthn public key in COSE format';
COMMENT ON COLUMN passkeys.credential_id IS 'Unique WebAuthn credential identifier';
COMMENT ON COLUMN passkeys.counter IS 'Signature counter to prevent replay attacks';
COMMENT ON COLUMN passkeys.device_type IS 'Whether passkey is single-device or multi-device (synced)';
COMMENT ON COLUMN passkeys.backed_up IS 'Whether the passkey is synced across devices (iCloud, Google, etc.)';
COMMENT ON COLUMN passkeys.transports IS 'JSON array of supported transports (usb, nfc, ble, internal)';
