-- 100_feature_flag_overrides.sql
--
-- Feature flag defaults move to code (backend/src/config/feature-registry.ts),
-- resolved against HELIOS_FEATURE_PROFILE (release | development). This table
-- keeps only an organization's OVERRIDES of those defaults.
--
-- Until now the seed inserted a row per flag, so a default and an admin's choice
-- were indistinguishable and every default lived in two places (seed SQL and the
-- code that read it). `is_override` marks the rows that are real choices.
--
-- Additive only: no column is dropped and no row is deleted. Pre-existing rows
-- are treated as seeded defaults (is_override = false) and are ignored by the
-- service. The one exception is `api_relay`, an operational switch that ships
-- OFF: a row that is ON can only be an admin's deliberate choice, so it is kept.

ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS is_override BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN feature_flags.is_override IS
  'True when the row is an organization override of the code registry default. Rows with false are legacy seeded defaults and are ignored.';

UPDATE feature_flags
   SET is_override = true
 WHERE feature_key = 'api_relay'
   AND is_enabled = true;
