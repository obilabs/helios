-- Migration: Add organization_domains table for domain-based user classification
-- This table stores verified domains owned by the organization
-- Users with matching domains are classified as 'user', others as 'guest'

-- Create organization_domains table
CREATE TABLE IF NOT EXISTS organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  domain_type VARCHAR(20) NOT NULL DEFAULT 'primary',
  verification_status VARCHAR(20) DEFAULT 'verified',
  verification_method VARCHAR(50),
  verified_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  CONSTRAINT org_domains_type_check CHECK (domain_type IN ('primary', 'alias')),
  CONSTRAINT org_domains_status_check CHECK (verification_status IN ('pending', 'verified', 'failed')),
  CONSTRAINT org_domains_unique UNIQUE(organization_id, domain)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_domains_org_id ON organization_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_domains_domain ON organization_domains(domain);
CREATE INDEX IF NOT EXISTS idx_org_domains_active ON organization_domains(organization_id) WHERE is_active = true;

-- Add updated_at trigger
CREATE TRIGGER update_org_domains_updated_at
  BEFORE UPDATE ON organization_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed initial domains from existing users
-- Extract unique domains from organization_users and create domain records
INSERT INTO organization_domains (organization_id, domain, domain_type, verification_status, verified_at)
SELECT DISTINCT
  ou.organization_id,
  LOWER(SPLIT_PART(ou.email, '@', 2)) as domain,
  CASE
    WHEN ROW_NUMBER() OVER (PARTITION BY ou.organization_id ORDER BY COUNT(*) DESC, MIN(ou.created_at)) = 1
    THEN 'primary'
    ELSE 'alias'
  END as domain_type,
  'verified',
  NOW()
FROM organization_users ou
WHERE ou.email IS NOT NULL
  AND ou.email LIKE '%@%'
  AND ou.organization_id IS NOT NULL
GROUP BY ou.organization_id, LOWER(SPLIT_PART(ou.email, '@', 2))
ON CONFLICT (organization_id, domain) DO NOTHING;

-- Comment on table
COMMENT ON TABLE organization_domains IS 'Stores verified email domains owned by the organization for user classification';
COMMENT ON COLUMN organization_domains.domain_type IS 'primary = main domain, alias = additional domains';
COMMENT ON COLUMN organization_domains.verification_status IS 'pending = not yet verified, verified = confirmed ownership, failed = verification failed';
