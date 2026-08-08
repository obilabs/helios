-- Migration: 043_create_user_lifecycle_logs.sql
-- Description: Create user lifecycle logs table for detailed action tracking
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-09

-- Lifecycle logs provide detailed step-by-step audit trail for all actions
CREATE TABLE IF NOT EXISTS user_lifecycle_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- ==========================================
  -- REFERENCES
  -- ==========================================

  -- Link to the scheduled action (if part of a scheduled workflow)
  action_id UUID REFERENCES scheduled_user_actions(id) ON DELETE SET NULL,

  -- Target user (may be NULL for onboarding before user created)
  user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- For onboarding before user record exists
  user_email VARCHAR(255),

  -- ==========================================
  -- ACTION DETAILS
  -- ==========================================

  -- High-level action type (same as scheduled_user_actions)
  action_type VARCHAR(50) NOT NULL,

  -- Specific step within the action
  -- Examples: 'create_google_account', 'add_to_group', 'set_signature',
  --           'transfer_drive_files', 'revoke_oauth_tokens', etc.
  action_step VARCHAR(100) NOT NULL,

  -- Human-readable description of what was done
  step_description TEXT,

  -- Execution order within the parent action
  step_order INTEGER DEFAULT 0,

  -- ==========================================
  -- STATUS
  -- ==========================================

  -- Outcome of this step
  -- Values: 'success', 'failed', 'skipped', 'warning', 'pending'
  status VARCHAR(20) NOT NULL,

  -- Duration in milliseconds
  duration_ms INTEGER,

  -- ==========================================
  -- DETAILS & CONTEXT
  -- ==========================================

  -- Structured details about what was done
  details JSONB DEFAULT '{}'::jsonb,

  -- For API calls, store request/response info (sanitized - no passwords!)
  api_request JSONB, -- {method, endpoint, body (sanitized)}
  api_response JSONB, -- {status, body (sanitized)}

  -- Target resource info
  target_resource_type VARCHAR(50), -- 'google_user', 'google_group', 'shared_drive', etc.
  target_resource_id VARCHAR(255),
  target_resource_name VARCHAR(255),

  -- ==========================================
  -- ERROR HANDLING
  -- ==========================================

  error_message TEXT,
  error_code VARCHAR(100),
  error_details JSONB,

  -- Was this a retry?
  is_retry BOOLEAN DEFAULT false,
  retry_attempt INTEGER DEFAULT 0,

  -- ==========================================
  -- AUDIT
  -- ==========================================

  -- Who/what triggered this (system for scheduled, user for manual)
  triggered_by VARCHAR(50) DEFAULT 'system', -- 'system', 'user', 'api'
  triggered_by_user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- Timestamp
  executed_at TIMESTAMPTZ DEFAULT NOW(),

  -- IP address if triggered by user/API
  ip_address INET,
  user_agent TEXT
);

-- ==========================================
-- INDEXES
-- ==========================================

-- Main query: get all logs for a specific action
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_action
  ON user_lifecycle_logs(action_id, step_order, executed_at);

-- Query by user (for user audit trail)
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_user
  ON user_lifecycle_logs(user_id, executed_at DESC)
  WHERE user_id IS NOT NULL;

-- Query by organization and time (for activity feed)
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_org_time
  ON user_lifecycle_logs(organization_id, executed_at DESC);

-- Query for failed steps (for debugging/retry)
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_failed
  ON user_lifecycle_logs(organization_id, status, executed_at DESC)
  WHERE status = 'failed';

-- Query by action type (for analytics)
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_type
  ON user_lifecycle_logs(organization_id, action_type, executed_at DESC);

-- Query by step name (for debugging specific steps)
CREATE INDEX IF NOT EXISTS idx_lifecycle_logs_step
  ON user_lifecycle_logs(action_step, status);

-- ==========================================
-- CONSTRAINTS
-- ==========================================

-- Ensure valid action type
ALTER TABLE user_lifecycle_logs
ADD CONSTRAINT check_log_action_type
CHECK (action_type IN ('onboard', 'offboard', 'suspend', 'unsuspend', 'delete', 'restore', 'manual'));

-- Ensure valid status
ALTER TABLE user_lifecycle_logs
ADD CONSTRAINT check_log_status
CHECK (status IN ('success', 'failed', 'skipped', 'warning', 'pending'));

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON TABLE user_lifecycle_logs IS 'Detailed audit trail for all user lifecycle operations';
COMMENT ON COLUMN user_lifecycle_logs.action_step IS 'Specific step: create_google_account, add_to_group, set_signature, etc.';
COMMENT ON COLUMN user_lifecycle_logs.details IS 'Structured data about the operation (group name, drive id, etc.)';
COMMENT ON COLUMN user_lifecycle_logs.api_request IS 'Sanitized API request info for debugging (no secrets)';
COMMENT ON COLUMN user_lifecycle_logs.api_response IS 'Sanitized API response for debugging';

-- ==========================================
-- HELPER VIEWS
-- ==========================================

-- View for recent activity feed
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

-- View for action summary (aggregated logs per action)
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
