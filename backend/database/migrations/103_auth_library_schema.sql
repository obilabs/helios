-- 103_auth_library_schema.sql
--
-- The sign-in library validates its tables at start-up from version 1.7 and
-- refuses to run when they do not match. The checks it now makes were always
-- true of what it needed; before, each one failed later, when the feature was
-- first used:
--
--   - passkeys had no table at all, so registering a passkey could not work;
--   - two_factor lacked the lockout columns, and its id was a uuid while the
--     library generates its own text ids, so two-factor enrolment could not
--     insert a row;
--   - auth_accounts lacked refresh_token_expires_at.
--
-- It also matches a password account on account_id = the user's id. Helios
-- stored the email address there, which older versions accepted. Without the
-- UPDATE below, no existing user could sign in after the upgrade.
--
-- backend/src/lib/auth.ts maps the library's names onto these tables.
--
-- Additive, apart from widening two_factor.id from uuid to text. Existing ids
-- are kept as their text form.

ALTER TABLE auth_accounts
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE two_factor
  ALTER COLUMN id DROP DEFAULT;
ALTER TABLE two_factor
  ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE two_factor
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE two_factor
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS failed_verification_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  name TEXT,
  public_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT,
  aaguid TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys (user_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_credential ON passkeys (credential_id);

COMMENT ON TABLE passkeys IS 'Passkeys registered by users, managed by the sign-in library';

-- Password accounts are keyed on the user's id.
UPDATE auth_accounts
   SET account_id = user_id::text,
       updated_at = NOW()
 WHERE provider_id = 'credential'
   AND account_id IS DISTINCT FROM user_id::text;
