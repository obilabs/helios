-- 096_user_field_drift.sql
--
-- Differences between Helios and a platform (Google today) for the profile fields that
-- have an owner (lib/field-ownership.ts). A row is a difference the sync found and did
-- not resolve on its own: either the field is owned by Helios, or Google's value was
-- empty and would have wiped a filled Helios value. An admin resolves it by keeping one
-- side; a later sync that finds the two agree closes it as 'converged'.
--
-- History is kept: resolved rows stay, so "who chose which value, when" is answerable.

CREATE TABLE IF NOT EXISTS user_field_drift (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  platform        varchar(16) NOT NULL,
  field           varchar(32) NOT NULL,
  helios_value    text,
  platform_value  text,
  owner           varchar(16) NOT NULL,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolution      varchar(24),
  resolved_by     uuid REFERENCES organization_users(id) ON DELETE SET NULL,
  CONSTRAINT user_field_drift_platform_check CHECK (platform IN ('google', 'microsoft')),
  CONSTRAINT user_field_drift_owner_check CHECK (owner IN ('google', 'helios')),
  CONSTRAINT user_field_drift_resolution_check
    CHECK (resolution IS NULL OR resolution IN ('kept_helios', 'kept_platform', 'converged')),
  CONSTRAINT user_field_drift_resolved_consistent
    CHECK ((resolved_at IS NULL) = (resolution IS NULL))
);

COMMENT ON TABLE user_field_drift IS
  'Profile-field differences between Helios and a platform that the sync did not resolve automatically. Resolved rows are kept as history.';

-- At most one OPEN difference per person, platform and field.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_field_drift_open
  ON user_field_drift (user_id, platform, field)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_field_drift_org_open
  ON user_field_drift (organization_id)
  WHERE resolved_at IS NULL;
