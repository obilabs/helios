-- 106_scheduled_action_targets.sql
--
-- A scheduled action for an existing user used to be stored with only the user
-- id, and the Scheduled Actions list reads the stored name and address, so the
-- row showed a blank user. New actions store both (scheduled-action.service).
-- This fills the rows created before that.
--
-- Additive and re-runnable: only empty fields are filled, from the user the
-- row already points at.

UPDATE scheduled_user_actions s
   SET target_email      = COALESCE(s.target_email, u.email),
       target_first_name = COALESCE(s.target_first_name, u.first_name),
       target_last_name  = COALESCE(s.target_last_name, u.last_name)
  FROM organization_users u
 WHERE s.user_id = u.id
   AND (s.target_email IS NULL OR s.target_first_name IS NULL OR s.target_last_name IS NULL);
