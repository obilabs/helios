-- Migration: Add password column to auth_accounts for credential auth
-- Date: 2025-12-26
-- Description: Enables better-auth email/password authentication by adding
--              password storage to the auth_accounts table and migrating
--              existing passwords from organization_users.

-- ============================================
-- ADD PASSWORD COLUMN
-- ============================================
-- Better-auth stores credentials (email/password) as accounts with
-- provider_id = 'credential' and the password hash in this column
ALTER TABLE auth_accounts
ADD COLUMN IF NOT EXISTS password TEXT;

COMMENT ON COLUMN auth_accounts.password IS 'Password hash for credential provider (bcrypt)';

-- ============================================
-- MIGRATE EXISTING PASSWORDS
-- ============================================
-- Create credential accounts for all users who have passwords in organization_users
-- This is a one-time migration to move from the old auth system to better-auth

INSERT INTO auth_accounts (
    id,
    user_id,
    account_id,
    provider_id,
    password,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid()::text,  -- Generate unique ID
    ou.id,                     -- Reference to organization_users
    ou.email,                  -- Use email as account_id for credential provider
    'credential',              -- Provider ID for email/password auth
    ou.password_hash,          -- Copy the existing password hash
    COALESCE(ou.created_at, NOW()),
    NOW()
FROM organization_users ou
WHERE ou.password_hash IS NOT NULL
  AND ou.password_hash != ''
  AND NOT EXISTS (
      -- Don't create duplicate credential accounts
      SELECT 1 FROM auth_accounts aa
      WHERE aa.user_id = ou.id
      AND aa.provider_id = 'credential'
  );

-- ============================================
-- VERIFICATION
-- ============================================
-- This should output the number of credential accounts created
DO $$
DECLARE
    account_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO account_count
    FROM auth_accounts
    WHERE provider_id = 'credential';

    RAISE NOTICE 'Credential accounts created: %', account_count;
END $$;
