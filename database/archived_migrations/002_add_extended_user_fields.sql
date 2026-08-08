-- Migration: Add Extended User Fields for Comprehensive User Management
-- Purpose: Add all fields needed for full user profiles and platform synchronization
-- Date: 2025-10-06

-- ============================================
-- 1. EXTEND ORGANIZATION_USERS TABLE
-- ============================================

-- Profile & Organization Fields
ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS job_title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS organizational_unit VARCHAR(500), -- e.g., /Engineering/Software Development
  ADD COLUMN IF NOT EXISTS location VARCHAR(255), -- e.g., "Calgary Office", "Remote - Canada"
  ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100), -- Internal HR employee ID
  ADD COLUMN IF NOT EXISTS employee_type VARCHAR(50) DEFAULT 'Full Time', -- Full Time, Part Time, Contractor, Intern
  ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100), -- For accounting/billing
  ADD COLUMN IF NOT EXISTS start_date DATE, -- Employment start date
  ADD COLUMN IF NOT EXISTS end_date DATE, -- For contractors/temporary workers
  ADD COLUMN IF NOT EXISTS bio TEXT, -- User biography/about section

  -- Contact Information
  ADD COLUMN IF NOT EXISTS mobile_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS work_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS work_phone_extension VARCHAR(20),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'UTC', -- e.g., "America/Edmonton"
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en', -- e.g., "en", "fr", "es"

  -- Platform Integration IDs
  ADD COLUMN IF NOT EXISTS google_workspace_id VARCHAR(255), -- Google Workspace user ID
  ADD COLUMN IF NOT EXISTS microsoft_365_id VARCHAR(255), -- Microsoft 365 user ID
  ADD COLUMN IF NOT EXISTS github_username VARCHAR(255),
  ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS jumpcloud_user_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS associate_id VARCHAR(100), -- Custom associate/partner ID

  -- Sync Status Fields
  ADD COLUMN IF NOT EXISTS google_workspace_sync_status VARCHAR(50) DEFAULT 'not_synced', -- not_synced, pending, synced, failed
  ADD COLUMN IF NOT EXISTS google_workspace_last_sync TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS microsoft_365_sync_status VARCHAR(50) DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS microsoft_365_last_sync TIMESTAMP WITH TIME ZONE,

  -- Custom Fields (JSONB for flexibility)
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}',

  -- Avatar/Photo
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS photo_data TEXT; -- Base64 encoded photo for systems that need it

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_org_users_reporting_manager ON organization_users(reporting_manager_id);
CREATE INDEX IF NOT EXISTS idx_org_users_department ON organization_users(department);
CREATE INDEX IF NOT EXISTS idx_org_users_location ON organization_users(location);
CREATE INDEX IF NOT EXISTS idx_org_users_employee_id ON organization_users(employee_id);
CREATE INDEX IF NOT EXISTS idx_org_users_google_workspace_id ON organization_users(google_workspace_id);
CREATE INDEX IF NOT EXISTS idx_org_users_microsoft_365_id ON organization_users(microsoft_365_id);
CREATE INDEX IF NOT EXISTS idx_org_users_custom_fields ON organization_users USING GIN (custom_fields);

-- ============================================
-- 2. SECONDARY EMAILS TABLE (One-to-Many)
-- ============================================

CREATE TABLE IF NOT EXISTS user_secondary_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    email_type VARCHAR(50) DEFAULT 'personal', -- personal, work_alternate, recovery
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_user_secondary_emails_user_id ON user_secondary_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_user_secondary_emails_email ON user_secondary_emails(email);

-- ============================================
-- 3. USER GROUPS/TEAMS TABLE (Many-to-Many)
-- ============================================

-- First, create the groups table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    email VARCHAR(255), -- Group email address (e.g., engineering@company.com)
    group_type VARCHAR(50) DEFAULT 'security', -- security, distribution, team, department
    is_active BOOLEAN DEFAULT true,
    google_workspace_group_id VARCHAR(255), -- Synced from Google Workspace
    microsoft_365_group_id VARCHAR(255), -- Synced from Microsoft 365
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_groups_org_id ON user_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_email ON user_groups(email);

-- Junction table for user-group membership
CREATE TABLE IF NOT EXISTS user_group_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- member, manager, owner
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_user_group_memberships_user_id ON user_group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_group_memberships_group_id ON user_group_memberships(group_id);

-- ============================================
-- 4. ASSETS TABLE (if doesn't exist)
-- ============================================

CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_type VARCHAR(100) NOT NULL, -- laptop, desktop, phone, tablet, monitor, keyboard, etc.
    asset_tag VARCHAR(100), -- Physical asset tag number
    serial_number VARCHAR(255),
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    name VARCHAR(255), -- Friendly name (e.g., "John's MacBook Pro")
    description TEXT,
    purchase_date DATE,
    warranty_expiry_date DATE,
    cost DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'available', -- available, assigned, in_repair, retired, lost, stolen
    location VARCHAR(255), -- Physical location of the asset
    notes TEXT,
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_org_id ON assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_assets_asset_tag ON assets(asset_tag);
CREATE INDEX IF NOT EXISTS idx_assets_serial_number ON assets(serial_number);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_custom_fields ON assets USING GIN (custom_fields);

-- ============================================
-- 5. USER ASSETS JUNCTION TABLE (Many-to-Many)
-- ============================================

CREATE TABLE IF NOT EXISTS user_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES organization_users(id),
    return_date TIMESTAMP WITH TIME ZONE, -- When asset should be returned (for contractors)
    returned_at TIMESTAMP WITH TIME ZONE, -- When asset was actually returned
    condition_at_assignment VARCHAR(50) DEFAULT 'good', -- good, fair, poor, new
    condition_at_return VARCHAR(50),
    notes TEXT, -- Notes about the assignment
    is_primary BOOLEAN DEFAULT false, -- Is this the user's primary device?
    UNIQUE(user_id, asset_id, assigned_at) -- Allow re-assignment after return
);

CREATE INDEX IF NOT EXISTS idx_user_assets_user_id ON user_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_asset_id ON user_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_is_primary ON user_assets(is_primary);

-- View for current asset assignments (not returned yet)
CREATE OR REPLACE VIEW current_user_assets AS
SELECT
    ua.*,
    u.email as user_email,
    u.first_name,
    u.last_name,
    a.asset_type,
    a.manufacturer,
    a.model,
    a.serial_number,
    a.asset_tag
FROM user_assets ua
JOIN organization_users u ON ua.user_id = u.id
JOIN assets a ON ua.asset_id = a.id
WHERE ua.returned_at IS NULL;

-- ============================================
-- 6. USER ADDRESSES TABLE (Optional)
-- ============================================

CREATE TABLE IF NOT EXISTS user_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    address_type VARCHAR(50) DEFAULT 'work', -- work, home, shipping, billing
    street_address_1 VARCHAR(500),
    street_address_2 VARCHAR(500),
    city VARCHAR(255),
    state_province VARCHAR(255),
    postal_code VARCHAR(50),
    country VARCHAR(100),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);

-- ============================================
-- 7. UPDATE CONSTRAINTS & COMMENTS
-- ============================================

-- Add comments for documentation
COMMENT ON COLUMN organization_users.organizational_unit IS 'Hierarchical OU path, e.g., /Engineering/Software Development';
COMMENT ON COLUMN organization_users.employee_type IS 'Employment type: Full Time, Part Time, Contractor, Intern, Temporary';
COMMENT ON COLUMN organization_users.google_workspace_sync_status IS 'Sync status: not_synced, pending, synced, failed';
COMMENT ON COLUMN organization_users.custom_fields IS 'JSONB field for flexible custom attributes';

COMMENT ON TABLE user_secondary_emails IS 'Additional email addresses for a user (personal, recovery, alternate work emails)';
COMMENT ON TABLE user_groups IS 'Groups/teams that users can belong to (security groups, distribution lists, teams)';
COMMENT ON TABLE user_group_memberships IS 'Many-to-many relationship between users and groups';
COMMENT ON TABLE assets IS 'Physical and digital assets (laptops, phones, licenses, etc.)';
COMMENT ON TABLE user_assets IS 'Assignment of assets to users with tracking';
COMMENT ON TABLE user_addresses IS 'Physical addresses for users (work, home, shipping)';

-- ============================================
-- 8. SAMPLE DATA & VALIDATIONS
-- ============================================

-- Check constraint for employee_type
ALTER TABLE organization_users
DROP CONSTRAINT IF EXISTS chk_employee_type;

ALTER TABLE organization_users
ADD CONSTRAINT chk_employee_type
CHECK (employee_type IN ('Full Time', 'Part Time', 'Contractor', 'Intern', 'Temporary', 'Consultant'));

-- Check constraint for sync status
ALTER TABLE organization_users
DROP CONSTRAINT IF EXISTS chk_google_workspace_sync_status;

ALTER TABLE organization_users
ADD CONSTRAINT chk_google_workspace_sync_status
CHECK (google_workspace_sync_status IN ('not_synced', 'pending', 'synced', 'failed', 'error'));

ALTER TABLE organization_users
DROP CONSTRAINT IF EXISTS chk_microsoft_365_sync_status;

ALTER TABLE organization_users
ADD CONSTRAINT chk_microsoft_365_sync_status
CHECK (microsoft_365_sync_status IN ('not_synced', 'pending', 'synced', 'failed', 'error'));

-- ============================================
-- 9. MIGRATION COMPLETE
-- ============================================

-- Log migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 002_add_extended_user_fields.sql completed successfully';
    RAISE NOTICE 'Added comprehensive user profile fields';
    RAISE NOTICE 'Created tables: user_secondary_emails, user_groups, user_group_memberships, assets, user_assets, user_addresses';
    RAISE NOTICE 'Ready for full user management and asset tracking';
END $$;
