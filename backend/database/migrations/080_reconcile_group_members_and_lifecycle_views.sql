-- 080_reconcile_group_members_and_lifecycle_views.sql
--
-- Found 2026-09-08 during the Google Workspace end-to-end UI run:
--   * group member sync:  column "updated_at" of relation "access_group_members" does not exist
--     (both sync paths SET updated_at in their ON CONFLICT clause)
--   * GET /lifecycle/logs: relation "lifecycle_activity_feed" does not exist
--     (views from archived migration 043 never made it into the seed; 076 added
--     the user_lifecycle_logs columns they read)
-- Additive and idempotent.

ALTER TABLE access_group_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE VIEW lifecycle_activity_feed AS
SELECT
  l.id,
  l.organization_id,
  l.action_id,
  l.user_id,
  l.user_email,
  COALESCE(u.first_name || ' ' || u.last_name, l.user_email) AS user_display_name,
  l.action_type,
  l.action_step,
  l.step_description,
  l.status,
  l.executed_at,
  l.triggered_by,
  COALESCE(t.first_name || ' ' || t.last_name, l.triggered_by) AS triggered_by_name
FROM user_lifecycle_logs l
LEFT JOIN organization_users u ON l.user_id = u.id
LEFT JOIN organization_users t ON l.triggered_by_user_id = t.id
ORDER BY l.executed_at DESC;

CREATE OR REPLACE VIEW lifecycle_action_summary AS
SELECT
  a.id AS action_id,
  a.organization_id,
  a.user_id,
  a.target_email,
  a.action_type,
  a.status AS action_status,
  a.scheduled_for,
  a.started_at,
  a.completed_at,
  COUNT(l.id) AS total_steps,
  COUNT(CASE WHEN l.status = 'success' THEN 1 END) AS successful_steps,
  COUNT(CASE WHEN l.status = 'failed' THEN 1 END) AS failed_steps,
  COUNT(CASE WHEN l.status = 'skipped' THEN 1 END) AS skipped_steps,
  SUM(l.duration_ms) AS total_duration_ms,
  MAX(l.error_message) AS last_error
FROM scheduled_user_actions a
LEFT JOIN user_lifecycle_logs l ON l.action_id = a.id
GROUP BY a.id;

COMMENT ON VIEW lifecycle_activity_feed IS 'Recent lifecycle activity with user names resolved';
COMMENT ON VIEW lifecycle_action_summary IS 'Aggregated step counts and status for scheduled actions';
