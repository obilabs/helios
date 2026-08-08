-- Migration: 032 - Add Locations and Cost Centers Master Data
-- Description: Creates master data tables for locations and cost centers with hierarchical support
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-07

-- =====================================================
-- 1. LOCATIONS TABLE (Hierarchical)
-- =====================================================

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Basic Info
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),  -- Short code like "SF-HQ", "NYC", "REMOTE-US"
    type VARCHAR(50) DEFAULT 'office'
        CHECK (type IN ('headquarters', 'office', 'remote', 'region', 'warehouse', 'datacenter')),
    description TEXT,

    -- Hierarchy
    parent_id UUID REFERENCES locations(id) ON DELETE SET NULL,

    -- Address
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),

    -- Geographic
    timezone VARCHAR(50),  -- e.g., "America/New_York"
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Constraints
    UNIQUE(organization_id, name, parent_id),
    CHECK (parent_id != id)  -- Prevent self-reference
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_locations_organization ON locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(is_active);
CREATE INDEX IF NOT EXISTS idx_locations_country ON locations(country);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_locations_updated_at ON locations;
DROP TRIGGER IF EXISTS trigger_locations_updated_at ON PLACEHOLDER;
CREATE TRIGGER trigger_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_locations_updated_at();

-- Comments
COMMENT ON TABLE locations IS 'Master data for office locations with hierarchical support (regions > offices)';
COMMENT ON COLUMN locations.type IS 'Location type: headquarters, office, remote, region, warehouse, datacenter';
COMMENT ON COLUMN locations.parent_id IS 'Parent location for hierarchy (e.g., region containing offices)';
COMMENT ON COLUMN locations.code IS 'Short code for the location (e.g., SF-HQ, NYC-OFF)';

-- =====================================================
-- 2. COST CENTERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS cost_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Basic Info
    code VARCHAR(50) NOT NULL,  -- e.g., "CC-1001", "ENG-001"
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Optional Links
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

    -- Budget (optional)
    budget_amount DECIMAL(15, 2),
    budget_currency VARCHAR(3) DEFAULT 'USD',
    fiscal_year INTEGER,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Constraints
    UNIQUE(organization_id, code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_centers_organization ON cost_centers(organization_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_department ON cost_centers(department_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_active ON cost_centers(is_active);
CREATE INDEX IF NOT EXISTS idx_cost_centers_code ON cost_centers(code);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_cost_centers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cost_centers_updated_at ON cost_centers;
DROP TRIGGER IF EXISTS trigger_cost_centers_updated_at ON PLACEHOLDER;
CREATE TRIGGER trigger_cost_centers_updated_at
    BEFORE UPDATE ON cost_centers
    FOR EACH ROW
    EXECUTE FUNCTION update_cost_centers_updated_at();

-- Comments
COMMENT ON TABLE cost_centers IS 'Master data for cost centers used for financial grouping';
COMMENT ON COLUMN cost_centers.code IS 'Unique cost center code (e.g., CC-1001)';
COMMENT ON COLUMN cost_centers.department_id IS 'Optional link to department';

-- =====================================================
-- 3. ADD FK COLUMNS TO ORGANIZATION_USERS
-- =====================================================

-- Add location_id FK column (keeping existing text 'location' column for backward compatibility)
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

-- Add cost_center_id FK column (keeping existing text 'cost_center' column for backward compatibility)
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- Indexes for the new FK columns
CREATE INDEX IF NOT EXISTS idx_org_users_location_id ON organization_users(location_id);
CREATE INDEX IF NOT EXISTS idx_org_users_cost_center_id ON organization_users(cost_center_id);

-- Comments
COMMENT ON COLUMN organization_users.location_id IS 'FK to master data locations table (replaces text location field)';
COMMENT ON COLUMN organization_users.cost_center_id IS 'FK to master data cost_centers table (replaces text cost_center field)';

-- =====================================================
-- 4. MASTER DATA SETTINGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS master_data_settings (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

    -- Enforcement flags
    enforce_departments BOOLEAN DEFAULT false,
    enforce_locations BOOLEAN DEFAULT false,
    enforce_cost_centers BOOLEAN DEFAULT false,
    enforce_job_titles BOOLEAN DEFAULT false,

    -- Migration status
    departments_migrated BOOLEAN DEFAULT false,
    locations_migrated BOOLEAN DEFAULT false,
    cost_centers_migrated BOOLEAN DEFAULT false,

    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES organization_users(id) ON DELETE SET NULL
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_master_data_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_master_data_settings_updated_at ON master_data_settings;
DROP TRIGGER IF EXISTS trigger_master_data_settings_updated_at ON PLACEHOLDER;
CREATE TRIGGER trigger_master_data_settings_updated_at
    BEFORE UPDATE ON master_data_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_master_data_settings_updated_at();

-- Comments
COMMENT ON TABLE master_data_settings IS 'Settings for master data enforcement per organization';
COMMENT ON COLUMN master_data_settings.enforce_departments IS 'If true, users must select from department master data';
COMMENT ON COLUMN master_data_settings.enforce_locations IS 'If true, users must select from location master data';

-- =====================================================
-- 5. SEED DEFAULT LOCATIONS FOR EXISTING ORGS
-- =====================================================

DO $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get the first organization ID
    SELECT id INTO v_org_id FROM organizations LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        -- Insert default locations only if none exist
        INSERT INTO locations (organization_id, name, type, description, is_active)
        SELECT
            v_org_id,
            loc.name,
            loc.type,
            loc.description,
            true
        FROM (VALUES
            ('Headquarters', 'headquarters', 'Main office location'),
            ('Remote', 'remote', 'Remote workers')
        ) AS loc(name, type, description)
        WHERE NOT EXISTS (
            SELECT 1 FROM locations WHERE organization_id = v_org_id
        );

        -- Initialize master data settings for the organization
        INSERT INTO master_data_settings (organization_id)
        VALUES (v_org_id)
        ON CONFLICT (organization_id) DO NOTHING;
    END IF;
END $$;

-- =====================================================
-- 6. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'Migration 032 completed successfully!';
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'Created tables:';
    RAISE NOTICE '  - locations (hierarchical office locations)';
    RAISE NOTICE '  - cost_centers (financial grouping)';
    RAISE NOTICE '  - master_data_settings';
    RAISE NOTICE '';
    RAISE NOTICE 'Added to organization_users:';
    RAISE NOTICE '  - location_id (FK to locations)';
    RAISE NOTICE '  - cost_center_id (FK to cost_centers)';
    RAISE NOTICE '=========================================';
END $$;
