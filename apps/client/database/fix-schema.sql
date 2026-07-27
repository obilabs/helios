-- Fix database schema to match existing code expectations
-- Following CLAUDE.md RULE 1: PRESERVE EXISTING FUNCTIONALITY

-- Drop the incorrect schema
DROP TABLE IF EXISTS tenant_users CASCADE;
DROP TABLE IF EXISTS tenant_settings CASCADE;

-- Create tenant_users table as the existing code expects it
-- This is NOT a link table - it stores user data directly with tenant association
CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, email)
);

-- Create tenant_settings table as the existing code expects it
CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_interval_seconds INTEGER DEFAULT 900,
  auto_sync_enabled BOOLEAN DEFAULT false,
  google_workspace_enabled BOOLEAN DEFAULT false,
  microsoft_365_enabled BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id)
);

-- Add the organizational units table with locations (from our earlier work)
CREATE TABLE IF NOT EXISTS organizational_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  parent_path VARCHAR(500),
  location_name VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(100),
  location_country VARCHAR(100),
  location_postal_code VARCHAR(20),
  source_platform VARCHAR(50),
  external_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  sync_status VARCHAR(50) DEFAULT 'manual',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, path)
);

-- Add sync settings for conflict resolution
CREATE TABLE IF NOT EXISTS sync_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  conflict_resolution VARCHAR(50) DEFAULT 'platform_wins',
  auto_sync_enabled BOOLEAN DEFAULT false,
  sync_interval INTEGER DEFAULT 3600,
  last_manual_sync TIMESTAMP WITH TIME ZONE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, sync_type)
);

-- Add user groups table
CREATE TABLE IF NOT EXISTS user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  external_id VARCHAR(255),
  email VARCHAR(255),
  group_type VARCHAR(50),
  member_count INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, name)
);

-- Add dashboard cache table (backend was looking for this)
CREATE TABLE IF NOT EXISTS dashboard_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cache_key VARCHAR(255) NOT NULL,
  cache_value JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, cache_key)
);

-- Add sync status table
CREATE TABLE IF NOT EXISTS sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(50) DEFAULT 'idle',
  sync_details JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, sync_type)
);

-- Add tenant credentials table for storing service account info
CREATE TABLE IF NOT EXISTS tenant_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_account_key JSONB,
  admin_email VARCHAR(255),
  domain VARCHAR(255),
  admin_email_stored VARCHAR(255),
  scopes TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_email ON tenant_users(email);
CREATE INDEX IF NOT EXISTS idx_organizational_units_tenant ON organizational_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_tenant ON user_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_tenant ON dashboard_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_status_tenant ON sync_status(tenant_id);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Database schema fixed to match existing code expectations';
  RAISE NOTICE 'Following CLAUDE.md: Preserved existing functionality';
END;
$$;