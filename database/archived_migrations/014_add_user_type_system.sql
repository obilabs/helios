-- Migration 014: Add User Type System for Staff/Guests/Contacts
-- Description: Adds user_type column to differentiate between staff, guests, and contacts
-- Date: October 10, 2025

-- =====================================================
-- 1. Add User Type Enum
-- =====================================================

-- Create user type enum
DO $$ BEGIN
    CREATE TYPE user_type_enum AS ENUM ('staff', 'guest', 'contact');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- 2. Add user_type Column
-- =====================================================

-- Add user_type column with default 'staff' for existing users
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS user_type user_type_enum DEFAULT 'staff';

-- =====================================================
-- 3. Migrate Existing Data
-- =====================================================

-- Update existing guest users to have user_type = 'guest'
UPDATE organization_users
SET user_type = 'guest'
WHERE is_guest = true AND user_type = 'staff';

-- =====================================================
-- 4. Add Contact-Specific Columns
-- =====================================================

-- Contacts are external people without system access
-- They're stored for reference (org charts, signatures, etc.)

ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS company VARCHAR(255),
ADD COLUMN IF NOT EXISTS contact_tags TEXT[], -- Array of tags like 'vendor', 'partner', 'customer'
ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- =====================================================
-- 5. Add Indexes
-- =====================================================

-- Index for filtering by user type
CREATE INDEX IF NOT EXISTS idx_org_users_type ON organization_users(user_type);

-- Composite index for type + status queries
CREATE INDEX IF NOT EXISTS idx_org_users_type_status ON organization_users(user_type, status);

-- Index for company (for contacts)
CREATE INDEX IF NOT EXISTS idx_org_users_company ON organization_users(company) WHERE company IS NOT NULL;

-- =====================================================
-- 6. Add Comments
-- =====================================================

COMMENT ON COLUMN organization_users.user_type IS 'User classification: staff (employees), guest (external with access), contact (external without access)';
COMMENT ON COLUMN organization_users.company IS 'Company name (primarily for contacts and guests)';
COMMENT ON COLUMN organization_users.contact_tags IS 'Tags for categorizing contacts: vendor, partner, customer, etc.';
COMMENT ON COLUMN organization_users.added_by IS 'User who added this contact (for contacts and guests)';
COMMENT ON COLUMN organization_users.added_at IS 'When this user/contact was added to the system';

-- =====================================================
-- 7. Validation Constraints
-- =====================================================

-- Contacts should not have passwords or login capability
ALTER TABLE organization_users
ADD CONSTRAINT check_contact_no_password CHECK (
    (user_type = 'contact' AND password_hash IS NULL AND is_active = false) OR
    (user_type != 'contact')
);

-- Staff should not have guest fields populated
ALTER TABLE organization_users
ADD CONSTRAINT check_staff_no_guest_fields CHECK (
    (user_type = 'staff' AND guest_expires_at IS NULL AND guest_invited_by IS NULL) OR
    (user_type != 'staff')
);

-- =====================================================
-- 8. Update is_guest to match user_type
-- =====================================================

-- Ensure is_guest is consistent with user_type
UPDATE organization_users
SET is_guest = (user_type = 'guest');

-- Create trigger to keep is_guest in sync with user_type
CREATE OR REPLACE FUNCTION sync_is_guest()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_guest := (NEW.user_type = 'guest');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_is_guest ON PLACEHOLDER;
CREATE TRIGGER trigger_sync_is_guest
    BEFORE INSERT OR UPDATE OF user_type ON organization_users
    FOR EACH ROW
    EXECUTE FUNCTION sync_is_guest();

-- =====================================================
-- 9. Helper Views
-- =====================================================

-- View for active staff members
CREATE OR REPLACE VIEW active_staff AS
SELECT *
FROM organization_users
WHERE user_type = 'staff'
  AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP)
  AND status IN ('active', 'pending');

-- View for active guests
CREATE OR REPLACE VIEW active_guests AS
SELECT *
FROM organization_users
WHERE user_type = 'guest'
  AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP)
  AND (guest_expires_at IS NULL OR guest_expires_at > CURRENT_TIMESTAMP)
  AND status IN ('active', 'pending');

-- View for contacts
CREATE OR REPLACE VIEW contacts AS
SELECT *
FROM organization_users
WHERE user_type = 'contact'
  AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP);

-- =====================================================
-- 10. Sample Data Comments
-- =====================================================

-- User Types:
--
-- STAFF (user_type = 'staff'):
--   - Internal employees
--   - Can log in to portal
--   - Have roles: admin, manager, user
--   - Synced from Google Workspace, Microsoft 365, or created locally
--   - Have password_hash
--   - is_active = true
--
-- GUEST (user_type = 'guest'):
--   - External collaborators with limited access
--   - Can log in but with restrictions
--   - Have password_hash
--   - Have guest_expires_at (optional)
--   - Examples: contractors, consultants, vendors
--   - is_active = true
--   - is_guest = true
--
-- CONTACT (user_type = 'contact'):
--   - External people in directory without system access
--   - Cannot log in (password_hash = NULL, is_active = false)
--   - Used for: org charts, email signatures, reference
--   - Examples: customers, suppliers, emergency contacts
--   - May have company, contact_tags

-- Migration complete
