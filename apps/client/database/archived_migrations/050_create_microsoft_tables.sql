-- Migration 050: Microsoft 365 Integration Tables
-- Date: 2025-12-14
-- Description: Tables for Microsoft 365/Entra ID integration

-- =====================================================
-- 1. MICROSOFT CREDENTIALS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ms_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Azure AD App Registration Details
    tenant_id VARCHAR(64) NOT NULL,
    client_id VARCHAR(64) NOT NULL,
    client_secret_encrypted TEXT NOT NULL,  -- AES-256 encrypted

    -- Connection status
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    sync_status VARCHAR(50) DEFAULT 'pending',  -- pending, syncing, completed, failed
    sync_error TEXT,

    -- Token caching
    access_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES organization_users(id),

    UNIQUE(organization_id)
);

-- =====================================================
-- 2. MICROSOFT SYNCED USERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ms_synced_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Microsoft user identifiers
    ms_id VARCHAR(64) NOT NULL,          -- Microsoft user ID (immutable)
    upn VARCHAR(255),                     -- User Principal Name (email-like)

    -- Basic profile
    display_name VARCHAR(255),
    given_name VARCHAR(255),
    surname VARCHAR(255),
    email VARCHAR(255),

    -- Employment info
    job_title VARCHAR(255),
    department VARCHAR(255),
    office_location VARCHAR(255),
    company_name VARCHAR(255),

    -- Contact info
    mobile_phone VARCHAR(50),
    business_phones JSONB,

    -- Account status
    is_account_enabled BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,

    -- Manager relationship
    manager_id VARCHAR(64),               -- Microsoft ID of manager

    -- License information (cached from assignedLicenses)
    assigned_licenses JSONB,              -- Array of SKU IDs

    -- Raw Microsoft Graph API response
    raw_data JSONB,

    -- Sync metadata
    last_sync_at TIMESTAMPTZ,
    sync_hash VARCHAR(64),                -- Hash to detect changes

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, ms_id)
);

-- =====================================================
-- 3. MICROSOFT SYNCED GROUPS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ms_synced_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Microsoft group identifiers
    ms_id VARCHAR(64) NOT NULL,           -- Microsoft group ID

    -- Group info
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    mail VARCHAR(255),
    mail_enabled BOOLEAN DEFAULT false,
    security_enabled BOOLEAN DEFAULT true,
    group_types JSONB,                    -- ['Unified', 'DynamicMembership']

    -- Member count
    member_count INTEGER DEFAULT 0,

    -- Raw Microsoft Graph API response
    raw_data JSONB,

    -- Sync metadata
    last_sync_at TIMESTAMPTZ,
    sync_hash VARCHAR(64),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, ms_id)
);

-- =====================================================
-- 4. MICROSOFT GROUP MEMBERSHIPS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ms_group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    group_id UUID NOT NULL REFERENCES ms_synced_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES ms_synced_users(id) ON DELETE CASCADE,

    -- Membership type
    membership_type VARCHAR(50) DEFAULT 'member',  -- member, owner

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(group_id, user_id)
);

-- =====================================================
-- 5. MICROSOFT LICENSES TABLE (Available SKUs)
-- =====================================================

CREATE TABLE IF NOT EXISTS ms_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- License SKU info
    sku_id VARCHAR(64) NOT NULL,          -- Microsoft SKU ID
    sku_part_number VARCHAR(255),         -- e.g., 'ENTERPRISEPREMIUM'
    display_name VARCHAR(255),            -- Friendly name: 'Microsoft 365 E5'

    -- Units
    total_units INTEGER DEFAULT 0,        -- prepaidUnits.enabled
    consumed_units INTEGER DEFAULT 0,     -- consumedUnits
    available_units INTEGER DEFAULT 0,    -- calculated: total - consumed

    -- Service plans (features included)
    service_plans JSONB,

    -- Raw data
    raw_data JSONB,

    -- Sync metadata
    last_sync_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id, sku_id)
);

-- =====================================================
-- 6. INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_ms_credentials_org ON ms_credentials(organization_id);
CREATE INDEX IF NOT EXISTS idx_ms_synced_users_org ON ms_synced_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_ms_synced_users_email ON ms_synced_users(email);
CREATE INDEX IF NOT EXISTS idx_ms_synced_users_upn ON ms_synced_users(upn);
CREATE INDEX IF NOT EXISTS idx_ms_synced_groups_org ON ms_synced_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_ms_group_memberships_group ON ms_group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_ms_group_memberships_user ON ms_group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_ms_licenses_org ON ms_licenses(organization_id);

-- =====================================================
-- 7. TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_ms_credentials_updated_at ON ms_credentials;
DROP TRIGGER IF EXISTS update_ms_credentials_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_ms_credentials_updated_at
    BEFORE UPDATE ON ms_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ms_synced_users_updated_at ON ms_synced_users;
DROP TRIGGER IF EXISTS update_ms_synced_users_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_ms_synced_users_updated_at
    BEFORE UPDATE ON ms_synced_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ms_synced_groups_updated_at ON ms_synced_groups;
DROP TRIGGER IF EXISTS update_ms_synced_groups_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_ms_synced_groups_updated_at
    BEFORE UPDATE ON ms_synced_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ms_licenses_updated_at ON ms_licenses;
DROP TRIGGER IF EXISTS update_ms_licenses_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_ms_licenses_updated_at
    BEFORE UPDATE ON ms_licenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. ADD MS COLUMNS TO ORGANIZATION_USERS (for linking)
-- =====================================================

-- Add Microsoft 365 ID to organization_users for linking
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS microsoft_365_id VARCHAR(64),
ADD COLUMN IF NOT EXISTS microsoft_365_upn VARCHAR(255);

-- Index for Microsoft lookups
CREATE INDEX IF NOT EXISTS idx_org_users_ms_id ON organization_users(microsoft_365_id) WHERE microsoft_365_id IS NOT NULL;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
