-- Migration: 067_create_lifecycle_automation.sql
-- Description: Create lifecycle automation tables for request queue, tasks, and timeline templates
-- Date: December 2025

-- =====================================================
-- 1. Create user_requests table
-- Unified queue for onboard/offboard/transfer requests
-- =====================================================
CREATE TABLE IF NOT EXISTS user_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Request Type
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('onboard', 'offboard', 'transfer')),

  -- Status Flow: pending → approved → in_progress → completed
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled')),

  -- Target User Info (for new hires, before user exists)
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  personal_email VARCHAR(255), -- For pre-start communications

  -- For existing users (offboard/transfer)
  user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- Key Dates
  start_date DATE, -- For onboarding
  end_date DATE,   -- For offboarding

  -- Template & Configuration
  template_id UUID, -- References onboarding or offboarding template
  job_title VARCHAR(255),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  location VARCHAR(255),

  -- Extended data as JSONB
  metadata JSONB DEFAULT '{}',

  -- Workflow Tracking
  requested_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Progress
  tasks_total INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user_requests
CREATE INDEX IF NOT EXISTS idx_user_requests_org ON user_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_user_requests_type ON user_requests(organization_id, request_type);
CREATE INDEX IF NOT EXISTS idx_user_requests_requested_by ON user_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_user_requests_start_date ON user_requests(start_date) WHERE start_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_requests_user_id ON user_requests(user_id) WHERE user_id IS NOT NULL;

-- =====================================================
-- 2. Create lifecycle_tasks table
-- Tasks assigned to different parties at different stages
-- =====================================================
CREATE TABLE IF NOT EXISTS lifecycle_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Link to request
  request_id UUID REFERENCES user_requests(id) ON DELETE CASCADE,

  -- Link to user (for user-facing tasks)
  user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- Task Definition
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'onboarding', 'offboarding', 'compliance', 'training'

  -- Assignment
  assignee_type VARCHAR(20) NOT NULL CHECK (assignee_type IN ('user', 'manager', 'hr', 'it', 'system')),
  assignee_id UUID REFERENCES organization_users(id) ON DELETE SET NULL, -- Specific person (optional)
  assignee_role VARCHAR(50), -- 'manager_of_user', 'hr_team', 'it_team'

  -- Timing
  trigger_type VARCHAR(30), -- 'on_approval', 'days_before_start', 'on_start', 'days_after_start'
  trigger_offset_days INTEGER DEFAULT 0, -- Negative for before, positive for after
  due_date DATE,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),

  -- Completion
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  completion_notes TEXT,

  -- For system tasks
  action_type VARCHAR(50), -- 'create_account', 'add_to_group', 'send_email', etc.
  action_config JSONB,
  scheduled_action_id UUID REFERENCES scheduled_user_actions(id) ON DELETE SET NULL,

  -- Ordering
  sequence_order INTEGER DEFAULT 0,
  depends_on_task_id UUID REFERENCES lifecycle_tasks(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lifecycle_tasks
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_org ON lifecycle_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_request ON lifecycle_tasks(request_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_user ON lifecycle_tasks(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_assignee ON lifecycle_tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_assignee_type ON lifecycle_tasks(organization_id, assignee_type, status);
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_status ON lifecycle_tasks(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_due_date ON lifecycle_tasks(due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lifecycle_tasks_overdue ON lifecycle_tasks(organization_id, due_date, status)
  WHERE status = 'pending' AND due_date < CURRENT_DATE;

-- =====================================================
-- 3. Add timeline column to onboarding_templates
-- =====================================================
ALTER TABLE onboarding_templates
ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN onboarding_templates.timeline IS 'Timeline of actions with triggers and offsets for lifecycle automation';

-- =====================================================
-- 4. Add timeline column to offboarding_templates
-- =====================================================
ALTER TABLE offboarding_templates
ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN offboarding_templates.timeline IS 'Timeline of actions with triggers and offsets for lifecycle automation';

-- =====================================================
-- 5. Update triggers for updated_at
-- =====================================================

-- user_requests updated_at trigger
CREATE OR REPLACE FUNCTION update_user_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_requests_updated_at ON user_requests;
CREATE TRIGGER user_requests_updated_at
  BEFORE UPDATE ON user_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_user_requests_updated_at();

-- lifecycle_tasks updated_at trigger
CREATE OR REPLACE FUNCTION update_lifecycle_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lifecycle_tasks_updated_at ON lifecycle_tasks;
CREATE TRIGGER lifecycle_tasks_updated_at
  BEFORE UPDATE ON lifecycle_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_lifecycle_tasks_updated_at();

-- =====================================================
-- 6. Function to update request progress
-- =====================================================
CREATE OR REPLACE FUNCTION update_request_task_counts()
RETURNS TRIGGER AS $$
DECLARE
  total_count INTEGER;
  completed_count INTEGER;
BEGIN
  -- Get the request_id from either OLD or NEW
  DECLARE
    req_id UUID;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      req_id := OLD.request_id;
    ELSE
      req_id := NEW.request_id;
    END IF;

    IF req_id IS NOT NULL THEN
      SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed')
      INTO total_count, completed_count
      FROM lifecycle_tasks
      WHERE request_id = req_id;

      UPDATE user_requests
      SET tasks_total = total_count,
          tasks_completed = completed_count,
          status = CASE
            WHEN completed_count = total_count AND total_count > 0 THEN 'completed'
            WHEN completed_count > 0 THEN 'in_progress'
            ELSE status
          END
      WHERE id = req_id;
    END IF;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lifecycle_tasks_update_counts ON lifecycle_tasks;
CREATE TRIGGER lifecycle_tasks_update_counts
  AFTER INSERT OR UPDATE OF status OR DELETE ON lifecycle_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_request_task_counts();

-- =====================================================
-- 7. Comments for documentation
-- =====================================================
COMMENT ON TABLE user_requests IS 'Unified queue for onboard/offboard/transfer lifecycle requests';
COMMENT ON TABLE lifecycle_tasks IS 'Tasks assigned to parties (user, manager, hr, it, system) during lifecycle processes';

COMMENT ON COLUMN user_requests.request_type IS 'Type of request: onboard, offboard, or transfer';
COMMENT ON COLUMN user_requests.status IS 'Request status: pending, approved, rejected, in_progress, completed, cancelled';
COMMENT ON COLUMN user_requests.personal_email IS 'Personal email for pre-start communications (before work email exists)';
COMMENT ON COLUMN user_requests.metadata IS 'Additional custom data as JSON';

COMMENT ON COLUMN lifecycle_tasks.assignee_type IS 'Type of assignee: user, manager, hr, it, or system';
COMMENT ON COLUMN lifecycle_tasks.trigger_type IS 'When task is triggered: on_approval, days_before_start, on_start, days_after_start';
COMMENT ON COLUMN lifecycle_tasks.trigger_offset_days IS 'Days offset from trigger (negative for before, positive for after)';
COMMENT ON COLUMN lifecycle_tasks.action_type IS 'For system tasks: create_account, add_to_group, send_email, etc.';
