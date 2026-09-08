-- 079_signature_templates_status_follows_is_active.sql
--
-- signature_templates carries two activity flags: is_active (what the UI and
-- the routes write) and status (what user_effective_signatures filters on).
-- The seed defaults status to 'draft', so every template created from the UI
-- was ACTIVE on screen and invisible to deployment ("1 skipped", 2026-09-08).
-- The routes now write both; this backfills existing rows. Idempotent.

UPDATE signature_templates
   SET status = 'active'
 WHERE is_active = true
   AND status = 'draft';
