-- 086_offboarding_release_address.sql
--
-- Offboarding option "release the address" (asked for 2026-09-10): rename the
-- departing account to <prefix>.<user>@domain, drop the alias Google keeps on
-- the old address, and create a group on the old address that delivers to
-- the forwarding target. Gmail forwarding dies with the account; the group
-- survives it, so mail to the old address keeps arriving after deletion.
-- Additive and idempotent.

ALTER TABLE offboarding_templates
  ADD COLUMN IF NOT EXISTS email_release_address BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_release_prefix VARCHAR(40) NOT NULL DEFAULT 'deprovisioned',
  ADD COLUMN IF NOT EXISTS email_release_group_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN offboarding_templates.email_release_address IS 'Rename the account to <prefix>.<user>@domain and free the old address';
COMMENT ON COLUMN offboarding_templates.email_release_group_enabled IS 'Create a group on the freed address delivering to the forwarding target';
