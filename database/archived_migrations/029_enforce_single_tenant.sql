-- =====================================================
-- CRITICAL: ENFORCE SINGLE-TENANT ARCHITECTURE
-- =====================================================
-- This migration ensures that ONLY ONE organization can
-- exist in this database. This is a single-tenant application.
-- For multi-tenant needs, use the MTP (Multi-Tenant Platform).

-- Create a function that prevents multiple organizations
CREATE OR REPLACE FUNCTION enforce_single_organization()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM organizations) >= 1 THEN
        RAISE EXCEPTION 'SINGLE TENANT VIOLATION: Only one organization is allowed in this system. This is a single-tenant application. For multi-tenant needs, use the MTP platform.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce single organization on INSERT
DROP TRIGGER IF EXISTS enforce_single_org_trigger ON organizations;
DROP TRIGGER IF EXISTS enforce_single_org_trigger ON PLACEHOLDER;
CREATE TRIGGER enforce_single_org_trigger
    BEFORE INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_organization();

-- Add a check constraint to ensure we never have more than 1 org
-- This uses a partial unique index as a creative way to enforce the constraint
CREATE UNIQUE INDEX IF NOT EXISTS single_organization_enforcer
    ON organizations ((true));

COMMENT ON INDEX single_organization_enforcer IS
'CRITICAL: This ensures only ONE organization can exist. This is a SINGLE-TENANT application.';

-- Add comments to make the single-tenant nature crystal clear
COMMENT ON TABLE organizations IS
'SINGLE-TENANT: This table must contain exactly ONE organization. Multiple organizations are NOT supported. Use MTP for multi-tenant needs.';

COMMENT ON TRIGGER enforce_single_org_trigger ON organizations IS
'Prevents creation of multiple organizations. This is a single-tenant application.';

-- Create a function to get THE organization (since there's only one)
CREATE OR REPLACE FUNCTION get_single_organization()
RETURNS organizations AS $$
DECLARE
    org organizations;
    org_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations;

    IF org_count = 0 THEN
        RAISE EXCEPTION 'No organization found. Please complete setup first.';
    ELSIF org_count > 1 THEN
        -- This should never happen due to our constraints, but check anyway
        RAISE EXCEPTION 'CRITICAL ERROR: Multiple organizations detected in single-tenant system!';
    END IF;

    SELECT * INTO org FROM organizations LIMIT 1;
    RETURN org;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_single_organization() IS
'Returns THE single organization. Fails if none or multiple exist.';

-- Create a view that makes it clear this is single-tenant
CREATE OR REPLACE VIEW single_organization AS
    SELECT * FROM organizations
    LIMIT 1;

COMMENT ON VIEW single_organization IS
'The ONE organization in this single-tenant system. Use this view instead of querying organizations directly.';

-- Add a domains table to support multiple domains per organization
-- (One org can have multiple domains, which is fine)
CREATE TABLE IF NOT EXISTS organization_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(domain)
);

-- Ensure only one primary domain per organization using a partial unique index
CREATE UNIQUE INDEX idx_org_domains_primary
    ON organization_domains(organization_id)
    WHERE is_primary = true;

CREATE INDEX idx_org_domains_org_id ON organization_domains(organization_id);
CREATE INDEX idx_org_domains_domain ON organization_domains(domain);

COMMENT ON TABLE organization_domains IS
'Multiple domains for THE single organization. One org can have many domains.';

-- Add a startup check function that applications should call
CREATE OR REPLACE FUNCTION verify_single_tenant_integrity()
RETURNS BOOLEAN AS $$
DECLARE
    org_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations;

    IF org_count = 0 THEN
        RAISE NOTICE 'No organization found. Setup required.';
        RETURN false;
    ELSIF org_count = 1 THEN
        RAISE NOTICE 'Single-tenant integrity verified: 1 organization found.';
        RETURN true;
    ELSE
        RAISE EXCEPTION 'CRITICAL: Single-tenant violation detected! Found % organizations. This system supports exactly ONE organization.', org_count;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verify_single_tenant_integrity() IS
'Call this on application startup to ensure single-tenant integrity.';