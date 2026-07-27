-- Activity Tracking and Security Events System
-- Tracks all user activities, admin actions, and system events

-- ============================================
-- Security Events Table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- User/Actor Information
  user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  actor_name VARCHAR(255),

  -- Event Details
  event_type VARCHAR(100) NOT NULL, -- user.login, user.logout, user.created, sync.started, etc.
  severity VARCHAR(20) NOT NULL DEFAULT 'info', -- info, warning, error, critical
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Additional Context
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes separately
CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);

-- ============================================
-- Dashboard Widget Preferences Table
-- ============================================
CREATE TABLE IF NOT EXISTS user_dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  widget_id VARCHAR(100) NOT NULL,
  position INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, widget_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_user ON user_dashboard_widgets(user_id);

-- ============================================
-- Dynamic Group Rules Table
-- ============================================
CREATE TABLE IF NOT EXISTS dynamic_group_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,

  -- Rule Configuration
  field_name VARCHAR(100) NOT NULL, -- department, job_title, location, etc.
  operator VARCHAR(20) NOT NULL, -- equals, contains, starts_with, ends_with, in, not_in
  value TEXT NOT NULL,

  -- Rule Logic
  logic_operator VARCHAR(10) DEFAULT 'AND', -- AND, OR
  rule_order INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dynamic_rules_group ON dynamic_group_rules(access_group_id);

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE security_events IS 'Tracks all security-relevant events and user activities';
COMMENT ON TABLE user_dashboard_widgets IS 'Stores user dashboard widget preferences';
COMMENT ON TABLE dynamic_group_rules IS 'Rules for dynamic group membership based on user attributes';

COMMENT ON COLUMN security_events.event_type IS 'Type of event (user.login, sync.started, etc.)';
COMMENT ON COLUMN security_events.severity IS 'Event severity: info, warning, error, critical';
COMMENT ON COLUMN dynamic_group_rules.operator IS 'Comparison operator: equals, contains, starts_with, ends_with, in, not_in';