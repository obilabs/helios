-- Migration: Update user classification based on email domain
-- Adds email_domain column and updates user_type based on organization_domains

-- Add email_domain as a generated column for efficient querying
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255)
GENERATED ALWAYS AS (LOWER(SPLIT_PART(email, '@', 2))) STORED;

-- Create index for domain-based lookups
CREATE INDEX IF NOT EXISTS idx_org_users_email_domain
  ON organization_users(organization_id, email_domain);

-- Create index for user_type filtering
CREATE INDEX IF NOT EXISTS idx_org_users_user_type
  ON organization_users(organization_id, user_type);

-- Update existing users' user_type based on domain matching
-- Users with email domains in organization_domains -> 'user'
-- Users with email domains NOT in organization_domains -> 'guest'
UPDATE organization_users ou
SET user_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM organization_domains od
    WHERE od.organization_id = ou.organization_id
      AND od.domain = LOWER(SPLIT_PART(ou.email, '@', 2))
      AND od.is_active = true
  ) THEN 'user'
  ELSE 'guest'
END
WHERE ou.user_type IS NULL OR ou.user_type = 'local';

-- Also update is_guest flag to be consistent
UPDATE organization_users ou
SET is_guest = (user_type = 'guest')
WHERE is_guest IS NULL OR is_guest != (user_type = 'guest');

-- Add comment
COMMENT ON COLUMN organization_users.email_domain IS 'Extracted email domain for classification lookup';
COMMENT ON COLUMN organization_users.user_type IS 'user = internal staff (org domain), guest = external collaborator (external domain), synced = from Google/M365';
