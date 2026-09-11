-- 097_account_purpose.sql
--
-- What an account is FOR, separately from where it comes from.
--
-- user_type answers "inside or outside the organization" (staff, local, guest,
-- contact). It cannot say that an internal Google account is a shared mailbox
-- (info@, billing@) rather than a person. Google has no such flag: a shared inbox
-- in Google is an ordinary licensed user whose password nobody uses. Helios showed
-- those accounts as people everywhere: on the org chart, in the manager picker, and
-- as "no manager assigned" on the dashboard.
--
-- The admin sets the purpose. Helios stores it here and mirrors it to a Google
-- custom attribute (schema Helios, field AccountPurpose) when the connection is
-- allowed to, so a purpose set in the Google console reaches Helios on the next sync.
--
-- Values:
--   person          a human being (the default)
--   shared_mailbox  a mailbox several people read (info@, support@)
--   service         an account a system signs in with (scanner@, backups@)
--   resource        an account that stands for a thing, not a person
--
-- Every account still counts toward licences: Google bills each one.

ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS account_purpose VARCHAR(20) NOT NULL DEFAULT 'person';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_users_account_purpose_check'
  ) THEN
    ALTER TABLE organization_users
      ADD CONSTRAINT organization_users_account_purpose_check
      CHECK (account_purpose IN ('person', 'shared_mailbox', 'service', 'resource'));
  END IF;
END $$;

COMMENT ON COLUMN organization_users.account_purpose IS
  'What the account is for: person, shared_mailbox, service or resource. Admin-set; mirrored to the Google custom attribute Helios.AccountPurpose. Only people appear on the org chart and in the manager picker.';

-- The org chart holds people. Same definition as 094, plus the purpose.
CREATE OR REPLACE VIEW org_chart_members AS
SELECT *
  FROM organization_users
 WHERE is_active = true
   AND deleted_at IS NULL
   AND user_type IN ('staff', 'local')
   AND account_purpose = 'person';

COMMENT ON VIEW org_chart_members IS
  'Who appears on the org chart: active, not deleted, staff or local, and a person (not a shared mailbox, service or resource account). The single definition; do not re-state it in queries.';
