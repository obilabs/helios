-- 068_login_columns_and_nullable_audit_org.sql
--
-- Two remaining drift items found only after 067 landed and the runner finally
-- worked. Both block the same thing: signing in.

-- 1. organization_users.is_external_admin / default_view
--
-- The login query SELECTs both:
--     SELECT id, email, password_hash, ..., organization_id,
--            COALESCE(is_external_admin, false) AS is_external_admin,
--            default_view
--     FROM organization_users WHERE email = $1
--
-- Neither column exists, so LOGIN ITSELF 500s with 42703 undefined_column.
-- They are defined only in database/archived_migrations/034 — same class as the
-- four tables in 067: an object the code needs that lives only in the archive.
-- Ported verbatim, including the CHECK and the partial index.
ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS is_external_admin BOOLEAN DEFAULT false;
COMMENT ON COLUMN organization_users.is_external_admin IS
  'True for external admins (MSPs, consultants) who should not access employee-facing features like People Directory';

ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS default_view VARCHAR(10) DEFAULT NULL;
COMMENT ON COLUMN organization_users.default_view IS
  'Preferred view on login: admin or user. NULL means use default based on role';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_default_view'
  ) THEN
    ALTER TABLE organization_users
      ADD CONSTRAINT chk_default_view
      CHECK (default_view IS NULL OR default_view IN ('admin', 'user'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_users_external_admin
  ON organization_users(is_external_admin)
  WHERE is_external_admin = true;

-- 2. security_audit_logs.organization_id must be NULLABLE
--
-- Some security events genuinely have no organization, and they are exactly the
-- events an audit log most needs to record:
--
--   * a failed login for an address that matches no user
--   * anything before setup completes, when no organization exists yet
--
-- With NOT NULL, those writes fail 23502, the error is swallowed so the request
-- still succeeds, and the log shows nothing. The constraint did not enforce data
-- quality — it silently discarded the security events with the least context and
-- the most reason to be kept.
--
-- The alternative, defaulting to "the one organization" because Helios is
-- single-org, was rejected: attributing a failed login for an unknown address to
-- a real organization fabricates a fact, in an audit table. NULL is the honest
-- value and is queryable.
ALTER TABLE security_audit_logs ALTER COLUMN organization_id DROP NOT NULL;

COMMENT ON COLUMN security_audit_logs.organization_id IS
  'NULL is legitimate: pre-setup events and failed logins for unknown addresses have no organization. Do not restore NOT NULL.';

-- 3. organization_users password-setup columns
--
-- The user-creation INSERT names alternate_email and password_setup_method, so
-- creating ANY user 500s with 42703. Same class as (1) and as 067's tables:
-- defined only in database/archived_migrations/001_add_password_setup_system.sql.
--
-- The whole coherent set from that migration is ported, not just the two the
-- INSERT happens to name today. Three rounds of this bug have each been "the
-- next column nobody checked"; porting the set is what stops a fourth. The three
-- tables that migration creates (email_templates, password_setup_tokens,
-- smtp_settings) already exist and are left alone.
ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS alternate_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_setup_method VARCHAR(20) DEFAULT 'admin_set',
  ADD COLUMN IF NOT EXISTS scheduled_creation_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sync_to_google BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_to_microsoft365 BOOLEAN DEFAULT false;
