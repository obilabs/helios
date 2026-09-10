-- 089_signature_identity_fields.sql
--
-- Found 2026-09-10 while testing a full signature end to end: the signature
-- engine offers the merge fields {{preferred_name}}, {{linkedin_url}} and
-- {{twitter_url}}, but organization_users has no such columns, so
-- `SELECT ou.*` returns undefined and every one of them renders blank with no
-- warning. {{professional_designation}} (CPA, P.Eng, PMP...) was asked for and
-- did not exist at all.
--
-- Google keeps the designation in the user's job title or a custom schema, so
-- this column stays Helios-side until the custom-schema mapping bone lands.
-- Additive and idempotent.

ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS professional_designation VARCHAR(60),
  ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(255),
  ADD COLUMN IF NOT EXISTS twitter_url VARCHAR(255);

COMMENT ON COLUMN organization_users.preferred_name IS 'Name the person goes by; falls back to first_name in signatures';
COMMENT ON COLUMN organization_users.professional_designation IS 'Post-nominal letters shown after the name (CPA, P.Eng, PMP)';
