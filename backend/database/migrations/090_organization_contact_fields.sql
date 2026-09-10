-- 090_organization_contact_fields.sql
--
-- Same class as 089, found in the same test: the signature engine offers
-- {{company_website}}, {{company_address}} and {{company_phone}} and reads them
-- from organizations.website_url / .address / .phone, none of which exist.
-- Every signature that used them rendered a blank line with no warning.
-- These are the ordinary contact details a business signature carries.
-- Additive and idempotent.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS website_url VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

COMMENT ON COLUMN organizations.website_url IS 'Company website shown in email signatures';
COMMENT ON COLUMN organizations.address IS 'Company address shown in email signatures';
COMMENT ON COLUMN organizations.phone IS 'Company switchboard shown in email signatures';
