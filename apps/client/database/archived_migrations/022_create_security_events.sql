-- Migration 022: Create Security Events System
-- Monitors and alerts on security-relevant events (blocked user activity, external changes)

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Event classification
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),

  -- Related entities
  user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),

  -- Event details
  title VARCHAR(255),
  description TEXT,
  details JSONB DEFAULT '{}',

  -- Source information
  source VARCHAR(50) DEFAULT 'helios',  -- 'helios', 'google_workspace', 'microsoft_365', 'sync'
  ip_address INET,
  user_agent TEXT,

  -- Acknowledgment
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMP,
  acknowledged_note TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_security_events_org ON security_events(organization_id);
CREATE INDEX idx_security_events_severity ON security_events(severity, acknowledged) WHERE acknowledged = false;
CREATE INDEX idx_security_events_user ON security_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_created ON security_events(created_at DESC);
CREATE INDEX idx_security_events_unacknowledged ON security_events(organization_id, acknowledged, severity) WHERE acknowledged = false;

-- Comments
COMMENT ON TABLE security_events IS 'Security-relevant events requiring admin attention';
COMMENT ON COLUMN security_events.event_type IS 'Type of event: blocked_user_login_attempt, external_delegate_added, etc.';
COMMENT ON COLUMN security_events.severity IS 'Event severity: info (informational), warning (needs attention), critical (immediate action)';
COMMENT ON COLUMN security_events.source IS 'Where event originated: helios, google_workspace, sync, etc.';

-- Event type values (documented):
-- User Lifecycle Events:
--   'blocked_user_login_attempt' - CRITICAL - Blocked user tried to login
--   'blocked_user_app_access' - CRITICAL - Blocked user accessed app
--   'deleted_user_login_attempt' - WARNING - Deleted user tried to login
--   'user_blocked' - WARNING - User account was blocked
--   'user_unblocked' - INFO - User account was unblocked
--
-- External Change Events:
--   'delegate_added_externally' - WARNING - Email delegate added outside Helios
--   'delegate_removed_externally' - INFO - Email delegate removed outside Helios
--   'admin_promoted_externally' - CRITICAL - User promoted to admin outside Helios
--   'admin_demoted_externally' - WARNING - Admin demoted outside Helios
--   'password_changed_externally' - WARNING - Password changed outside Helios
--   'group_created_externally' - INFO - Group created outside Helios
--   'group_deleted_externally' - WARNING - Group deleted outside Helios
--
-- Suspicious Activity:
--   'multiple_failed_logins' - WARNING - Multiple failed login attempts
--   'login_from_new_location' - INFO - Login from unexpected location
--   'login_from_new_device' - INFO - Login from new device
--   'unusual_api_activity' - WARNING - Abnormal API usage pattern
