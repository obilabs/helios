-- Migration: Add contacts table for email-only entries
-- Contacts are external email addresses (vendors, clients, partners) with no login capability
-- Separate from organization_users to prevent accidental login creation

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  display_name VARCHAR(255),
  company VARCHAR(255),
  job_title VARCHAR(255),
  department VARCHAR(255),
  phone VARCHAR(50),
  mobile VARCHAR(50),
  notes TEXT,
  contact_type VARCHAR(50) DEFAULT 'external',
  source VARCHAR(50) DEFAULT 'manual',
  google_contact_id VARCHAR(255),
  custom_fields JSONB DEFAULT '{}',
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  CONSTRAINT contacts_type_check CHECK (contact_type IN ('vendor', 'client', 'partner', 'external')),
  CONSTRAINT contacts_source_check CHECK (source IN ('manual', 'import', 'google_contacts', 'csv')),
  CONSTRAINT contacts_email_unique UNIQUE(organization_id, email)
);

-- Create indexes for search and filtering
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(organization_id, company);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(organization_id, contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(organization_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts(organization_id, first_name, last_name, email, company);

-- Add updated_at trigger
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Comments
COMMENT ON TABLE contacts IS 'Email-only entries for vendors, clients, partners. No login capability.';
COMMENT ON COLUMN contacts.contact_type IS 'vendor = supplier/vendor, client = customer, partner = business partner, external = other';
COMMENT ON COLUMN contacts.source IS 'How the contact was created: manual, import, google_contacts, csv';
COMMENT ON COLUMN contacts.google_contact_id IS 'Google resource name for future Shared Contacts sync';
COMMENT ON COLUMN contacts.tags IS 'Array of tags for categorization, e.g., billing, primary, urgent';
