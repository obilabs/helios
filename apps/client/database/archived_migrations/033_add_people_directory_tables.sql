-- Migration: 033 - Add People Directory Tables
-- Description: Adds tables for user media (voice/video intros), fun facts, interests, and expertise topics
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-07

-- =====================================================
-- 1. USER MEDIA TABLE (voice/video introductions)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Media type
  media_type VARCHAR(50) NOT NULL, -- 'voice_intro', 'video_intro', 'name_pronunciation'

  -- Storage info (MinIO)
  storage_path VARCHAR(500) NOT NULL, -- Path in MinIO bucket
  storage_bucket VARCHAR(100) NOT NULL DEFAULT 'user-media',

  -- Metadata
  file_name VARCHAR(255),
  file_size INTEGER, -- in bytes
  mime_type VARCHAR(100),
  duration_seconds INTEGER, -- for audio/video

  -- Transcription (for accessibility)
  transcription TEXT,
  transcription_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'

  -- Thumbnail (for video)
  thumbnail_path VARCHAR(500),

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Only one media of each type per user
  UNIQUE(user_id, media_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_media_user_id ON user_media(user_id);
CREATE INDEX IF NOT EXISTS idx_user_media_organization_id ON user_media(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_media_type ON user_media(media_type);

-- Comments
COMMENT ON TABLE user_media IS 'Stores metadata for user voice/video introductions and name pronunciations';
COMMENT ON COLUMN user_media.media_type IS 'Type of media: voice_intro, video_intro, name_pronunciation';
COMMENT ON COLUMN user_media.storage_path IS 'Full path to file in MinIO storage bucket';

-- =====================================================
-- 2. USER FUN FACTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_fun_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Content
  emoji VARCHAR(10), -- Optional emoji to display with the fact
  content TEXT NOT NULL,

  -- Ordering
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_fun_facts_user_id ON user_fun_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_fun_facts_display_order ON user_fun_facts(user_id, display_order);

-- Comments
COMMENT ON TABLE user_fun_facts IS 'User-entered fun facts displayed on their profile';

-- =====================================================
-- 3. USER INTERESTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Interest name (normalized, lowercase)
  interest VARCHAR(100) NOT NULL,

  -- Category (optional grouping)
  category VARCHAR(50), -- 'hobbies', 'sports', 'technology', 'arts', etc.

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique per user
  UNIQUE(user_id, interest)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_interests_user_id ON user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_interest ON user_interests(interest);

-- Comments
COMMENT ON TABLE user_interests IS 'User interests and hobbies for directory discovery';

-- =====================================================
-- 4. USER EXPERTISE TOPICS TABLE (Ask Me About)
-- =====================================================

CREATE TABLE IF NOT EXISTS user_expertise_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Topic name (normalized, lowercase)
  topic VARCHAR(100) NOT NULL,

  -- Skill level (optional)
  skill_level VARCHAR(50), -- 'beginner', 'intermediate', 'advanced', 'expert'

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique per user
  UNIQUE(user_id, topic)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_expertise_topics_user_id ON user_expertise_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_expertise_topics_topic ON user_expertise_topics(topic);

-- Comments
COMMENT ON TABLE user_expertise_topics IS 'Topics users are willing to help others with (Ask Me About)';

-- =====================================================
-- 5. EXTEND ORGANIZATION_USERS TABLE
-- =====================================================

-- Add profile-related fields
ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50),
  ADD COLUMN IF NOT EXISTS current_status TEXT, -- What they are currently working on
  ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 0, -- Calculated 0-100
  ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP WITH TIME ZONE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_users_profile_completeness ON organization_users(profile_completeness);

-- Comments
COMMENT ON COLUMN organization_users.pronouns IS 'User pronouns (e.g., She/Her, He/Him, They/Them)';
COMMENT ON COLUMN organization_users.current_status IS 'Current project/status shown on profile';
COMMENT ON COLUMN organization_users.profile_completeness IS 'Calculated profile completeness percentage (0-100)';

-- =====================================================
-- 6. FIELD VISIBILITY SETTINGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_field_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Field name
  field_name VARCHAR(100) NOT NULL,

  -- Visibility level
  visibility VARCHAR(50) NOT NULL DEFAULT 'everyone', -- 'everyone', 'team', 'manager', 'none'

  -- Audit
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique per user per field
  UNIQUE(user_id, field_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_field_visibility_user_id ON user_field_visibility(user_id);

-- Comments
COMMENT ON TABLE user_field_visibility IS 'Per-user visibility settings for profile fields';
COMMENT ON COLUMN user_field_visibility.visibility IS 'Who can see this field: everyone, team, manager, none';

-- =====================================================
-- 7. INSERT DEFAULT VISIBILITY SETTINGS (Function)
-- =====================================================

-- Function to initialize default visibility settings for a user
CREATE OR REPLACE FUNCTION initialize_user_visibility_settings(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Insert default visibility settings if they don't exist
  INSERT INTO user_field_visibility (user_id, field_name, visibility)
  VALUES
    (p_user_id, 'email', 'everyone'),
    (p_user_id, 'phone', 'manager'),
    (p_user_id, 'bio', 'everyone'),
    (p_user_id, 'voice_intro', 'everyone'),
    (p_user_id, 'video_intro', 'everyone'),
    (p_user_id, 'fun_facts', 'everyone'),
    (p_user_id, 'interests', 'everyone'),
    (p_user_id, 'personal_email', 'none')
  ON CONFLICT (user_id, field_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION initialize_user_visibility_settings IS 'Creates default visibility settings when a user first accesses their profile';

-- =====================================================
-- 8. PROFILE COMPLETENESS CALCULATION (Function)
-- =====================================================

-- Function to calculate profile completeness
CREATE OR REPLACE FUNCTION calculate_profile_completeness(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_user RECORD;
  v_has_media BOOLEAN;
  v_has_facts BOOLEAN;
  v_has_interests BOOLEAN;
  v_has_expertise BOOLEAN;
BEGIN
  -- Get user record
  SELECT
    first_name IS NOT NULL AND first_name != '' AS has_first_name,
    last_name IS NOT NULL AND last_name != '' AS has_last_name,
    avatar_url IS NOT NULL AND avatar_url != '' AS has_photo,
    bio IS NOT NULL AND bio != '' AS has_bio,
    job_title IS NOT NULL AND job_title != '' AS has_title,
    pronouns IS NOT NULL AND pronouns != '' AS has_pronouns,
    current_status IS NOT NULL AND current_status != '' AS has_status
  INTO v_user
  FROM organization_users WHERE id = p_user_id;

  -- Basic fields (50 points total)
  IF v_user.has_first_name THEN v_score := v_score + 10; END IF;
  IF v_user.has_last_name THEN v_score := v_score + 10; END IF;
  IF v_user.has_photo THEN v_score := v_score + 10; END IF;
  IF v_user.has_bio THEN v_score := v_score + 10; END IF;
  IF v_user.has_title THEN v_score := v_score + 5; END IF;
  IF v_user.has_pronouns THEN v_score := v_score + 5; END IF;

  -- Optional profile content (50 points total)
  SELECT EXISTS(SELECT 1 FROM user_media WHERE user_id = p_user_id) INTO v_has_media;
  SELECT EXISTS(SELECT 1 FROM user_fun_facts WHERE user_id = p_user_id LIMIT 1) INTO v_has_facts;
  SELECT EXISTS(SELECT 1 FROM user_interests WHERE user_id = p_user_id LIMIT 1) INTO v_has_interests;
  SELECT EXISTS(SELECT 1 FROM user_expertise_topics WHERE user_id = p_user_id LIMIT 1) INTO v_has_expertise;

  IF v_has_media THEN v_score := v_score + 15; END IF;
  IF v_has_facts THEN v_score := v_score + 15; END IF;
  IF v_has_interests THEN v_score := v_score + 10; END IF;
  IF v_has_expertise THEN v_score := v_score + 10; END IF;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION calculate_profile_completeness IS 'Calculates profile completeness score (0-100) based on filled fields';

-- =====================================================
-- 9. MIGRATION COMPLETE
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 033_add_people_directory_tables.sql completed successfully';
  RAISE NOTICE 'Created tables: user_media, user_fun_facts, user_interests, user_expertise_topics, user_field_visibility';
  RAISE NOTICE 'Added columns to organization_users: pronouns, current_status, profile_completeness, profile_updated_at';
  RAISE NOTICE 'Created functions: initialize_user_visibility_settings, calculate_profile_completeness';
END $$;
