-- Migration: Add Helpdesk System
-- Description: Tables for group mailbox/helpdesk functionality with real-time presence
-- Date: 2025-10-31

-- Ticket metadata (augments Google Groups emails)
CREATE TABLE IF NOT EXISTS helpdesk_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  google_message_id VARCHAR(255) UNIQUE NOT NULL,
  google_thread_id VARCHAR(255) NOT NULL,
  group_email VARCHAR(255) NOT NULL,
  subject TEXT,
  sender_email VARCHAR(255),
  sender_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'pending', 'resolved', 'reopened')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE,
  assigned_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  first_response_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  reopened_at TIMESTAMP WITH TIME ZONE,
  sla_deadline TIMESTAMP WITH TIME ZONE,
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time presence tracking (ephemeral data)
CREATE TABLE IF NOT EXISTS helpdesk_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES helpdesk_tickets(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('viewing', 'typing', 'composing')),
  socket_id VARCHAR(255),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, ticket_id, action)
);

-- Internal notes (not sent via email)
CREATE TABLE IF NOT EXISTS helpdesk_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES helpdesk_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  mentioned_users UUID[] DEFAULT ARRAY[]::UUID[],
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Assignment history for audit trail
CREATE TABLE IF NOT EXISTS helpdesk_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES helpdesk_tickets(id) ON DELETE CASCADE,
  assigned_from UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  assigned_by UUID NOT NULL REFERENCES organization_users(id) ON DELETE SET NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Response templates for common replies
CREATE TABLE IF NOT EXISTS helpdesk_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  content TEXT NOT NULL,
  category VARCHAR(100),
  shortcuts VARCHAR(50), -- keyboard shortcut like '/welcome'
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, shortcuts)
);

-- SLA rules configuration
CREATE TABLE IF NOT EXISTS helpdesk_sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  conditions JSONB NOT NULL, -- e.g., {"priority": "high", "tags": ["vip"]}
  response_time_minutes INTEGER NOT NULL,
  resolution_time_minutes INTEGER NOT NULL,
  business_hours_only BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics aggregation table (updated periodically)
CREATE TABLE IF NOT EXISTS helpdesk_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  agent_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  tickets_created INTEGER DEFAULT 0,
  tickets_resolved INTEGER DEFAULT 0,
  tickets_reopened INTEGER DEFAULT 0,
  first_responses INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER,
  avg_resolution_time_seconds INTEGER,
  sla_met_count INTEGER DEFAULT 0,
  sla_breach_count INTEGER DEFAULT 0,
  internal_notes_count INTEGER DEFAULT 0,
  UNIQUE(organization_id, date, agent_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_org_status ON helpdesk_tickets(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON helpdesk_tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_google_msg ON helpdesk_tickets(google_message_id);
CREATE INDEX IF NOT EXISTS idx_tickets_google_thread ON helpdesk_tickets(google_thread_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON helpdesk_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_sla ON helpdesk_tickets(sla_deadline) WHERE status NOT IN ('resolved', 'closed');

CREATE INDEX IF NOT EXISTS idx_presence_ticket ON helpdesk_presence(ticket_id);
CREATE INDEX IF NOT EXISTS idx_presence_user ON helpdesk_presence(user_id);
CREATE INDEX IF NOT EXISTS idx_presence_last_ping ON helpdesk_presence(last_ping);

CREATE INDEX IF NOT EXISTS idx_notes_ticket ON helpdesk_notes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notes_author ON helpdesk_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_notes_mentions ON helpdesk_notes USING GIN(mentioned_users);

CREATE INDEX IF NOT EXISTS idx_assignment_ticket ON helpdesk_assignment_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_assignment_date ON helpdesk_assignment_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_templates_org ON helpdesk_templates(organization_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_templates_shortcut ON helpdesk_templates(shortcuts) WHERE shortcuts IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_org_date ON helpdesk_analytics_daily(organization_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_agent_date ON helpdesk_analytics_daily(agent_id, date DESC) WHERE agent_id IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE helpdesk_tickets IS 'Support ticket metadata synchronized with Google Groups emails';
COMMENT ON TABLE helpdesk_presence IS 'Real-time agent presence tracking for collision prevention';
COMMENT ON TABLE helpdesk_notes IS 'Internal team notes not sent to customers';
COMMENT ON TABLE helpdesk_assignment_history IS 'Audit trail of ticket assignments';
COMMENT ON TABLE helpdesk_templates IS 'Reusable response templates for common replies';
COMMENT ON TABLE helpdesk_sla_rules IS 'Service level agreement rules and deadlines';
COMMENT ON TABLE helpdesk_analytics_daily IS 'Pre-aggregated daily metrics for performance';

-- Function to clean up stale presence (older than 1 minute)
CREATE OR REPLACE FUNCTION cleanup_stale_presence() RETURNS void AS $$
BEGIN
  DELETE FROM helpdesk_presence
  WHERE last_ping < NOW() - INTERVAL '1 minute';
END;
$$ LANGUAGE plpgsql;

-- Function to update ticket timestamps
CREATE OR REPLACE FUNCTION update_ticket_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamps
DROP TRIGGER IF EXISTS update_helpdesk_tickets_timestamp ON PLACEHOLDER;
CREATE TRIGGER update_helpdesk_tickets_timestamp
  BEFORE UPDATE ON helpdesk_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

DROP TRIGGER IF EXISTS update_helpdesk_templates_timestamp ON PLACEHOLDER;
CREATE TRIGGER update_helpdesk_templates_timestamp
  BEFORE UPDATE ON helpdesk_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

DROP TRIGGER IF EXISTS update_helpdesk_sla_rules_timestamp ON PLACEHOLDER;
CREATE TRIGGER update_helpdesk_sla_rules_timestamp
  BEFORE UPDATE ON helpdesk_sla_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();