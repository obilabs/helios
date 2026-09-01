-- 074_onboarding_microsoft_license.sql
--
-- Onboarding templates were Google-only (google_license_sku / google_org_unit_path
-- / google_services). Add the Microsoft 365 equivalents so an onboarding template
-- can also create the new hire in Entra and assign an M365 license — parallel to
-- the route-level create-in-Microsoft that already exists.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE onboarding_templates
  ADD COLUMN IF NOT EXISTS create_in_microsoft BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS microsoft_license_sku VARCHAR(255);

COMMENT ON COLUMN onboarding_templates.create_in_microsoft IS 'Create the onboarded user in Microsoft 365 / Entra ID';
COMMENT ON COLUMN onboarding_templates.microsoft_license_sku IS 'M365 license to assign on onboarding (ms_licenses.id or raw sku_id)';
