-- =====================================================
-- Migration: 037_extend_visibility_fields.sql
-- Purpose: Add new visibility fields for enhanced privacy control
-- New fields: pronouns, mobile_phone, work_phone, location, job_title, timezone
-- =====================================================

-- =====================================================
-- 1. UPDATE VISIBILITY INITIALIZATION FUNCTION
-- =====================================================

-- Replace the function to include new visibility fields
CREATE OR REPLACE FUNCTION initialize_user_visibility_settings(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Insert default visibility settings if they don't exist
  -- Contact Info: mostly public or manager only
  -- Personal Info: more restrictive defaults
  INSERT INTO user_field_visibility (user_id, field_name, visibility)
  VALUES
    -- Original fields
    (p_user_id, 'email', 'everyone'),
    (p_user_id, 'phone', 'manager'),
    (p_user_id, 'bio', 'everyone'),
    (p_user_id, 'voice_intro', 'everyone'),
    (p_user_id, 'video_intro', 'everyone'),
    (p_user_id, 'fun_facts', 'everyone'),
    (p_user_id, 'interests', 'everyone'),
    (p_user_id, 'personal_email', 'none'),
    -- New fields for enhanced privacy control
    (p_user_id, 'pronouns', 'everyone'),        -- Important for inclusion, default public
    (p_user_id, 'mobile_phone', 'manager'),     -- More private, manager only
    (p_user_id, 'work_phone', 'everyone'),      -- Work phone is typically public
    (p_user_id, 'location', 'everyone'),        -- Office location is typically public
    (p_user_id, 'job_title', 'everyone'),       -- Job title is typically public
    (p_user_id, 'timezone', 'everyone')         -- Timezone helps with scheduling, public
  ON CONFLICT (user_id, field_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION initialize_user_visibility_settings IS 'Creates default visibility settings when a user first accesses their profile. Includes contact info, personal details, and professional info fields.';

-- =====================================================
-- 2. ADD NEW VISIBILITY FIELDS FOR EXISTING USERS
-- =====================================================

-- Add visibility settings for existing users who don't have the new fields
INSERT INTO user_field_visibility (user_id, field_name, visibility)
SELECT u.id, f.field_name, f.default_visibility
FROM organization_users u
CROSS JOIN (
  VALUES
    ('pronouns', 'everyone'),
    ('mobile_phone', 'manager'),
    ('work_phone', 'everyone'),
    ('location', 'everyone'),
    ('job_title', 'everyone'),
    ('timezone', 'everyone')
) AS f(field_name, default_visibility)
WHERE NOT EXISTS (
  SELECT 1 FROM user_field_visibility v
  WHERE v.user_id = u.id AND v.field_name = f.field_name
);

-- =====================================================
-- 3. MIGRATION COMPLETE
-- =====================================================

DO $$
DECLARE
  v_users_updated INTEGER;
  v_fields_added INTEGER;
BEGIN
  -- Count how many users and fields were updated
  SELECT COUNT(DISTINCT user_id), COUNT(*) INTO v_users_updated, v_fields_added
  FROM user_field_visibility
  WHERE field_name IN ('pronouns', 'mobile_phone', 'work_phone', 'location', 'job_title', 'timezone');

  RAISE NOTICE 'Migration 037_extend_visibility_fields.sql completed successfully';
  RAISE NOTICE 'Updated initialize_user_visibility_settings function with new fields';
  RAISE NOTICE 'New visibility fields: pronouns, mobile_phone, work_phone, location, job_title, timezone';
  RAISE NOTICE 'Users with new visibility settings: %, Total new field entries: %', v_users_updated, v_fields_added;
END $$;
