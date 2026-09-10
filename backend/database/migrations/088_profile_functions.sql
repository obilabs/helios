-- 088_profile_functions.sql
--
-- Found 2026-09-10 in the UI pass: saving My Profile stored the fields and
-- then answered 500 with  function calculate_profile_completeness(uuid) does
-- not exist ; opening the privacy tab needs initialize_user_visibility_settings
-- the same way. Both come from archived migration 033 (people directory);
-- the tables and columns they use are in the seed, the functions were not.
-- Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION initialize_user_visibility_settings(p_user_id UUID)
RETURNS void AS $$
BEGIN
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

  IF v_user.has_first_name THEN v_score := v_score + 10; END IF;
  IF v_user.has_last_name THEN v_score := v_score + 10; END IF;
  IF v_user.has_photo THEN v_score := v_score + 10; END IF;
  IF v_user.has_bio THEN v_score := v_score + 10; END IF;
  IF v_user.has_title THEN v_score := v_score + 5; END IF;
  IF v_user.has_pronouns THEN v_score := v_score + 5; END IF;

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
