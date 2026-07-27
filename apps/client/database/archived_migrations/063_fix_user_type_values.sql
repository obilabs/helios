-- Migration 063: Fix User Type Values
-- Description: Ensure all users have a valid user_type value
-- Date: December 2025

-- =====================================================
-- 1. Update NULL user_type values to 'staff'
-- =====================================================
UPDATE organization_users
SET user_type = 'staff'
WHERE user_type IS NULL;

-- =====================================================
-- 2. Update 'local' user_type values to 'staff'
-- (schema had default 'local' but migration uses 'staff')
-- =====================================================
-- First check if user_type is VARCHAR (schema default) or enum (migration)
DO $$
BEGIN
    -- Try to update 'local' values if they exist
    UPDATE organization_users
    SET user_type = 'staff'
    WHERE user_type::text = 'local';
EXCEPTION
    WHEN others THEN
        -- Column might be enum type, ignore error
        NULL;
END $$;

-- =====================================================
-- 3. Ensure all users have valid user_type
-- =====================================================
-- Update any remaining invalid values to 'staff'
UPDATE organization_users
SET user_type = 'staff'
WHERE user_type NOT IN ('staff', 'guest', 'contact')
   OR user_type IS NULL;

-- =====================================================
-- 4. Set NOT NULL constraint if not already set
-- =====================================================
ALTER TABLE organization_users
ALTER COLUMN user_type SET NOT NULL;

-- =====================================================
-- 5. Set default to 'staff' if not already set
-- =====================================================
ALTER TABLE organization_users
ALTER COLUMN user_type SET DEFAULT 'staff';

-- =====================================================
-- Log the fix
-- =====================================================
DO $$
DECLARE
    staff_count INTEGER;
    guest_count INTEGER;
    contact_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO staff_count FROM organization_users WHERE user_type = 'staff';
    SELECT COUNT(*) INTO guest_count FROM organization_users WHERE user_type = 'guest';
    SELECT COUNT(*) INTO contact_count FROM organization_users WHERE user_type = 'contact';

    RAISE NOTICE 'User type counts after fix: staff=%, guest=%, contact=%',
        staff_count, guest_count, contact_count;
END $$;
