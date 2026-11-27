-- 104_user_professional_designations.sql
--
-- GET /organization/users/:userId selects organization_users.professional_designations.
-- The column existed only on installs that had run an archived migration, so
-- on a fresh install opening a single user failed.
--
-- Additive. Safe to run twice.

ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS professional_designations TEXT;

COMMENT ON COLUMN organization_users.professional_designations IS
  'Professional designations shown after the name, e.g. CPA, P.Eng';
