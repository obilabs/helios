-- Migration 007: Create Departments System
-- This adds local department management with optional Google Workspace OU mapping

-- =====================================================
-- DEPARTMENTS TABLE
-- =====================================================
-- Core departments table for local management
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Basic Info
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Hierarchy
    parent_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

    -- Google Workspace Integration
    org_unit_id VARCHAR(255), -- Maps to Google Workspace OU ID (from gw_synced_org_units)
    org_unit_path VARCHAR(500), -- Cached OU path for display (e.g., "/Staff/Sales")
    auto_sync_to_ou BOOLEAN DEFAULT false, -- Auto-sync users to OU when assigned to this dept

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Constraints
    UNIQUE(organization_id, name),
    CHECK (parent_department_id != id) -- Prevent self-reference
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_departments_organization ON departments(organization_id);
CREATE INDEX idx_departments_parent ON departments(parent_department_id);
CREATE INDEX idx_departments_org_unit ON departments(org_unit_id);
CREATE INDEX idx_departments_active ON departments(is_active);

-- =====================================================
-- UPDATE ORGANIZATION_USERS TABLE
-- =====================================================
-- Add department_id column to organization_users
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_department ON organization_users(department_id);

-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_departments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW
    EXECUTE FUNCTION update_departments_updated_at();

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE departments IS 'Local department management with optional Google Workspace OU mapping';
COMMENT ON COLUMN departments.org_unit_id IS 'Optional mapping to Google Workspace organizational unit';
COMMENT ON COLUMN departments.auto_sync_to_ou IS 'When true, users assigned to this department are automatically synced to the mapped OU';
COMMENT ON COLUMN departments.parent_department_id IS 'Allows hierarchical department structure';

-- =====================================================
-- SAMPLE DATA (Optional - for testing)
-- =====================================================
-- Insert a few default departments for the organization
-- This will run only if the organization exists

DO $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get the first organization ID
    SELECT id INTO v_org_id FROM organizations LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        -- Insert default departments only if none exist
        INSERT INTO departments (organization_id, name, description, is_active)
        SELECT
            v_org_id,
            dept.name,
            dept.description,
            true
        FROM (VALUES
            ('General', 'General staff and employees'),
            ('Engineering', 'Software development and engineering'),
            ('Sales', 'Sales and business development'),
            ('Marketing', 'Marketing and communications'),
            ('Support', 'Customer support and success'),
            ('Operations', 'Business operations and administration'),
            ('Human Resources', 'HR and people operations'),
            ('Finance', 'Finance and accounting')
        ) AS dept(name, description)
        WHERE NOT EXISTS (
            SELECT 1 FROM departments WHERE organization_id = v_org_id
        );
    END IF;
END $$;
