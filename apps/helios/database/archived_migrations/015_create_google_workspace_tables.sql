-- Migration 015: Google Workspace Integration Tables
-- Date: 2025-10-23
-- Description: Create tables for Google Workspace integration including credentials, synced users, groups, and organizational units

-- =====================================================
-- 1. GOOGLE WORKSPACE CREDENTIALS TABLE
-- =====================================================
-- Stores service account credentials and domain-wide delegation configuration

CREATE TABLE IF NOT EXISTS gw_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Service account details
    service_account_key TEXT NOT NULL,              -- Encrypted JSON service account key
    admin_email VARCHAR(255) NOT NULL,               -- Admin email for domain-wide delegation
    domain VARCHAR(255) NOT NULL,                    -- Google Workspace domain

    -- API scopes (for documentation/validation)
    scopes TEXT[],

    -- Validation status
    is_valid BOOLEAN DEFAULT false,
    last_validated_at TIMESTAMP,

    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one credential set per organization
    UNIQUE(organization_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_gw_credentials_org_id
    ON gw_credentials(organization_id);

-- =====================================================
-- 2. GOOGLE WORKSPACE SYNCED USERS TABLE
-- =====================================================
-- Cache of Google Workspace users synced from the directory

CREATE TABLE IF NOT EXISTS gw_synced_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Google Workspace identifiers
    google_id VARCHAR(255) NOT NULL,                 -- Google's unique user ID
    email VARCHAR(255) NOT NULL,                     -- Primary email address

    -- User details
    given_name VARCHAR(255),                         -- First name
    family_name VARCHAR(255),                        -- Last name
    full_name VARCHAR(255),                          -- Full display name

    -- User status
    is_admin BOOLEAN DEFAULT false,                  -- Is workspace admin
    is_suspended BOOLEAN DEFAULT false,              -- Account suspended

    -- Organizational structure
    org_unit_path VARCHAR(255),                      -- Organizational unit path
    department VARCHAR(255),                         -- Department name
    job_title VARCHAR(255),                          -- Job title

    -- Activity timestamps
    last_login_time TIMESTAMP,                       -- Last login to Google Workspace
    creation_time TIMESTAMP,                         -- Account creation time in Google

    -- Raw data for debugging/auditing
    raw_data JSONB,                                  -- Full user object from Google API

    -- Sync tracking
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique users per organization
    UNIQUE(organization_id, google_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gw_synced_users_org_id
    ON gw_synced_users(organization_id);

CREATE INDEX IF NOT EXISTS idx_gw_synced_users_email
    ON gw_synced_users(organization_id, email);

CREATE INDEX IF NOT EXISTS idx_gw_synced_users_org_unit
    ON gw_synced_users(organization_id, org_unit_path);

CREATE INDEX IF NOT EXISTS idx_gw_synced_users_department
    ON gw_synced_users(organization_id, department);

CREATE INDEX IF NOT EXISTS idx_gw_synced_users_status
    ON gw_synced_users(organization_id, is_suspended);

-- =====================================================
-- 3. GOOGLE WORKSPACE GROUPS TABLE
-- =====================================================
-- Cache of Google Workspace groups

CREATE TABLE IF NOT EXISTS gw_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Google Workspace identifiers
    google_id VARCHAR(255) NOT NULL,                 -- Google's unique group ID
    email VARCHAR(255) NOT NULL,                     -- Group email address
    name VARCHAR(255),                               -- Group display name

    -- Group details
    description TEXT,                                -- Group description
    member_count INTEGER DEFAULT 0,                  -- Number of direct members

    -- Raw data for debugging/auditing
    raw_data JSONB,                                  -- Full group object from Google API

    -- Sync tracking
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique groups per organization
    UNIQUE(organization_id, google_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gw_groups_org_id
    ON gw_groups(organization_id);

CREATE INDEX IF NOT EXISTS idx_gw_groups_email
    ON gw_groups(organization_id, email);

-- =====================================================
-- 4. GOOGLE WORKSPACE ORGANIZATIONAL UNITS TABLE
-- =====================================================
-- Cache of Google Workspace organizational units (OUs)

CREATE TABLE IF NOT EXISTS gw_org_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Google Workspace identifiers
    google_id VARCHAR(255) NOT NULL,                 -- Google's unique OU ID
    name VARCHAR(255) NOT NULL,                      -- OU name
    path VARCHAR(255) NOT NULL,                      -- Full OU path (e.g., /Sales/East)

    -- Hierarchy
    parent_id VARCHAR(255),                          -- Parent OU ID (NULL for root)

    -- OU details
    description TEXT,                                -- OU description

    -- Raw data for debugging/auditing
    raw_data JSONB,                                  -- Full OU object from Google API

    -- Sync tracking
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique OUs per organization
    UNIQUE(organization_id, google_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gw_org_units_org_id
    ON gw_org_units(organization_id);

CREATE INDEX IF NOT EXISTS idx_gw_org_units_path
    ON gw_org_units(organization_id, path);

CREATE INDEX IF NOT EXISTS idx_gw_org_units_parent
    ON gw_org_units(organization_id, parent_id);

-- =====================================================
-- 5. ADD GOOGLE WORKSPACE ID TO ORGANIZATION_USERS
-- =====================================================
-- Link organization users to their Google Workspace accounts

-- Check if column exists before adding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organization_users'
        AND column_name = 'google_workspace_id'
    ) THEN
        ALTER TABLE organization_users
        ADD COLUMN google_workspace_id VARCHAR(255);

        -- Create index for lookups
        CREATE INDEX idx_org_users_google_id
            ON organization_users(google_workspace_id);

        RAISE NOTICE 'Added google_workspace_id column to organization_users';
    ELSE
        RAISE NOTICE 'Column google_workspace_id already exists in organization_users';
    END IF;
END $$;

-- =====================================================
-- 6. TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Trigger for gw_credentials
DROP TRIGGER IF EXISTS update_gw_credentials_updated_at ON gw_credentials;
DROP TRIGGER IF EXISTS update_gw_credentials_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_gw_credentials_updated_at
    BEFORE UPDATE ON gw_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Trigger for gw_synced_users
DROP TRIGGER IF EXISTS update_gw_synced_users_updated_at ON gw_synced_users;
DROP TRIGGER IF EXISTS update_gw_synced_users_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_gw_synced_users_updated_at
    BEFORE UPDATE ON gw_synced_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Trigger for gw_groups
DROP TRIGGER IF EXISTS update_gw_groups_updated_at ON gw_groups;
DROP TRIGGER IF EXISTS update_gw_groups_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_gw_groups_updated_at
    BEFORE UPDATE ON gw_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Trigger for gw_org_units
DROP TRIGGER IF EXISTS update_gw_org_units_updated_at ON gw_org_units;
DROP TRIGGER IF EXISTS update_gw_org_units_updated_at ON PLACEHOLDER;
CREATE TRIGGER update_gw_org_units_updated_at
    BEFORE UPDATE ON gw_org_units
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 7. INSERT GOOGLE WORKSPACE MODULE (IF NOT EXISTS)
-- =====================================================

-- Insert Google Workspace module into modules table
INSERT INTO modules (name, slug, description, icon, version, is_available, config_schema)
VALUES (
    'Google Workspace',
    'google-workspace',
    'Sync and manage Google Workspace users, groups, and organizational units',
    'google',
    '1.0.0',
    true,
    '{
        "type": "object",
        "required": ["service_account_key", "admin_email", "domain"],
        "properties": {
            "service_account_key": {
                "type": "string",
                "title": "Service Account JSON Key",
                "format": "textarea"
            },
            "admin_email": {
                "type": "string",
                "title": "Admin Email",
                "format": "email",
                "description": "Email of a Google Workspace super admin account"
            },
            "domain": {
                "type": "string",
                "title": "Google Workspace Domain",
                "description": "Your organization primary domain"
            },
            "auto_sync": {
                "type": "boolean",
                "title": "Enable automatic synchronization",
                "default": true
            },
            "sync_interval_hours": {
                "type": "number",
                "title": "Sync interval in hours",
                "default": 24,
                "minimum": 1
            }
        }
    }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    version = EXCLUDED.version,
    is_available = EXCLUDED.is_available,
    config_schema = EXCLUDED.config_schema,
    updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Migration 015 completed successfully!';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Created tables:';
    RAISE NOTICE '  ✓ gw_credentials';
    RAISE NOTICE '  ✓ gw_synced_users';
    RAISE NOTICE '  ✓ gw_groups';
    RAISE NOTICE '  ✓ gw_org_units';
    RAISE NOTICE '';
    RAISE NOTICE 'Added column:';
    RAISE NOTICE '  ✓ organization_users.google_workspace_id';
    RAISE NOTICE '';
    RAISE NOTICE 'Module registered:';
    RAISE NOTICE '  ✓ Google Workspace (google-workspace)';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Go to Settings > Modules';
    RAISE NOTICE '  2. Enable Google Workspace';
    RAISE NOTICE '  3. Configure with service account credentials';
    RAISE NOTICE '  4. Run initial sync';
    RAISE NOTICE '================================================';
    RAISE NOTICE '';
END $$;
