-- 067_reconcile_missing_seed_tables.sql
--
-- Four tables the running code queries that exist in NO seed and NO active
-- migration. They were only ever defined in database/migrations/ (the deprecated
-- 001-007 set the runner does not read) or in database/archived_migrations/, so
-- once 066 wired the runner to backend/database/migrations/ they were still
-- absent. 062/063 covered onboarding_requests and relay_*; these four were the
-- remainder, and the 065/066 README flagged them as knowingly deferred.
--
-- Symptom before this migration: 42P01 undefined_table at runtime. The
-- two_factor JOIN in the security settings query 500s on every load.
--
-- PROVENANCE MATTERS HERE. Two of these have COMPETING definitions and only one
-- of each matches the code:
--
--   organization_domains -> archived 029_enforce_single_tenant.sql, NOT root
--       004. The code runs `INSERT INTO organization_domains (organization_id,
--       domain, is_primary)`. Root 004 has no is_primary column (it has
--       domain_type), so porting 004 would have swapped a missing-table error
--       for a missing-column one.
--   public_assets        -> root 001_add_public_assets.sql, which is a strict
--       superset of archived 009c (adds has_sizes, aspect_ratio).
--   contacts             -> root 005_add_contacts_table.sql (only definition).
--   two_factor           -> archived 076_add_two_factor_table.sql (only
--       definition). uuid_generate_v4() in the original is normalised to
--       gen_random_uuid() here; both extensions are present, this just matches
--       the newer convention.
--
-- Idempotent: CREATE TABLE / CREATE INDEX IF NOT EXISTS throughout, so this is
-- safe on an existing database and on a fresh one.

BEGIN;

-- ---------------------------------------------------------------- two_factor
-- Source: database/archived_migrations/076_add_two_factor_table.sql
CREATE TABLE IF NOT EXISTS two_factor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT,
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON two_factor(user_id);

-- ------------------------------------------------------ organization_domains
-- Source: database/archived_migrations/029_enforce_single_tenant.sql
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
CREATE INDEX IF NOT EXISTS idx_org_domains_org_id ON organization_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_domains_domain ON organization_domains(domain);

-- ------------------------------------------------------------------ contacts
-- Source: database/migrations/005_add_contacts_table.sql
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
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(is_active);

-- ------------------------------------------------------------- public_assets
-- Source: database/migrations/001_add_public_assets.sql (superset of 009c)
CREATE TABLE IF NOT EXISTS public_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_key VARCHAR(255) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  module_source VARCHAR(50),
  file_name VARCHAR(255) NOT NULL,
  original_file_name VARCHAR(255),
  file_path TEXT NOT NULL,
  cdn_url TEXT,
  public_url TEXT,
  mime_type VARCHAR(100),
  file_size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  has_sizes BOOLEAN DEFAULT false,
  aspect_ratio NUMERIC(10,4),
  usage_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],
  uploaded_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_assets_org_type ON public_assets(organization_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_public_assets_org_module ON public_assets(organization_id, module_source);
CREATE INDEX IF NOT EXISTS idx_public_assets_public_url ON public_assets(public_url);

COMMIT;
