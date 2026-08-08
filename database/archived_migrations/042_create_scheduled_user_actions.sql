-- Migration: 042_create_scheduled_user_actions.sql
-- Description: Create scheduled user actions table for user lifecycle management
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-09

-- Scheduled actions table tracks pending and completed lifecycle actions
CREATE TABLE IF NOT EXISTS scheduled_user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- ==========================================
  -- TARGET USER
  -- ==========================================

  -- For existing users (offboarding, suspend, delete, restore)
  user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,

  -- For new users (onboarding) - before user record exists
  -- These fields store the planned user info
  target_email VARCHAR(255),
  target_first_name VARCHAR(255),
  target_last_name VARCHAR(255),
  target_personal_email VARCHAR(255), -- For sending welcome email

  -- ==========================================
  -- ACTION DEFINITION
  -- ==========================================

  -- Action type
  -- Values: 'onboard', 'offboard', 'suspend', 'unsuspend', 'delete', 'restore'
  action_type VARCHAR(50) NOT NULL,

  -- Template reference (optional - can be NULL for custom actions)
  onboarding_template_id UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  offboarding_template_id UUID REFERENCES offboarding_templates(id) ON DELETE SET NULL,

  -- Action configuration - stores template settings plus any overrides
  -- This captures the full configuration at the time of scheduling
  -- so that template changes don't affect already-scheduled actions
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Custom overrides from the template (kept separate for auditing)
  config_overrides JSONB DEFAULT '{}'::jsonb,

  -- ==========================================
  -- SCHEDULING
  -- ==========================================

  -- When to execute (can be immediate if set to past/now)
  scheduled_for TIMESTAMPTZ NOT NULL,

  -- Recurrence (for things like "check every day until user logs in")
  is_recurring BOOLEAN DEFAULT false,
  recurrence_interval VARCHAR(50), -- 'daily', 'weekly', 'monthly'
  recurrence_until TIMESTAMPTZ,
  last_recurrence_at TIMESTAMPTZ,

  -- ==========================================
  -- EXECUTION STATUS
  -- ==========================================

  -- Status tracking
  -- Values: 'pending', 'in_progress', 'completed', 'failed', 'cancelled', 'skipped'
  status VARCHAR(20) DEFAULT 'pending',

  -- Execution timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Progress tracking (for multi-step actions)
  total_steps INTEGER DEFAULT 0,
  completed_steps INTEGER DEFAULT 0,
  current_step VARCHAR(100),

  -- Error handling
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- ==========================================
  -- APPROVAL (for sensitive actions)
  -- ==========================================

  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,

  -- Rejection tracking
  rejected_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- ==========================================
  -- DEPENDENCIES
  -- ==========================================

  -- Some actions must wait for others (e.g., don't delete until offboarding complete)
  depends_on_action_id UUID REFERENCES scheduled_user_actions(id) ON DELETE SET NULL,

  -- ==========================================
  -- AUDIT
  -- ==========================================

  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- For tracking who cancelled if applicable
  cancelled_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT
);

-- ==========================================
-- INDEXES
-- ==========================================

-- Main query pattern: find pending actions to execute
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_pending
  ON scheduled_user_actions(organization_id, scheduled_for, status)
  WHERE status = 'pending';

-- Find actions by user (for user profile view)
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_user
  ON scheduled_user_actions(user_id, scheduled_for DESC)
  WHERE user_id IS NOT NULL;

-- Find actions by status for dashboard
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_status
  ON scheduled_user_actions(organization_id, status, scheduled_for);

-- Find failed actions for retry
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_retry
  ON scheduled_user_actions(next_retry_at, retry_count)
  WHERE status = 'failed' AND retry_count < max_retries;

-- Find actions requiring approval
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_approval
  ON scheduled_user_actions(organization_id, requires_approval, status)
  WHERE requires_approval = true AND status = 'pending' AND approved_at IS NULL;

-- Partial index for in-progress actions (should be few)
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_in_progress
  ON scheduled_user_actions(organization_id, started_at)
  WHERE status = 'in_progress';

-- ==========================================
-- TRIGGERS
-- ==========================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scheduled_user_actions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduled_user_actions_updated_at ON scheduled_user_actions;
DROP TRIGGER IF EXISTS scheduled_user_actions_updated_at ON PLACEHOLDER;
CREATE TRIGGER scheduled_user_actions_updated_at
  BEFORE UPDATE ON scheduled_user_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_user_actions_updated_at();

-- Trigger to set started_at when status changes to in_progress
CREATE OR REPLACE FUNCTION set_action_started_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    NEW.started_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduled_user_actions_started ON scheduled_user_actions;
DROP TRIGGER IF EXISTS scheduled_user_actions_started ON PLACEHOLDER;
CREATE TRIGGER scheduled_user_actions_started
  BEFORE UPDATE ON scheduled_user_actions
  FOR EACH ROW
  EXECUTE FUNCTION set_action_started_at();

-- Trigger to set completed_at when status changes to completed
CREATE OR REPLACE FUNCTION set_action_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'cancelled', 'skipped') AND OLD.status NOT IN ('completed', 'failed', 'cancelled', 'skipped') THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduled_user_actions_completed ON scheduled_user_actions;
DROP TRIGGER IF EXISTS scheduled_user_actions_completed ON PLACEHOLDER;
CREATE TRIGGER scheduled_user_actions_completed
  BEFORE UPDATE ON scheduled_user_actions
  FOR EACH ROW
  EXECUTE FUNCTION set_action_completed_at();

-- ==========================================
-- CONSTRAINTS
-- ==========================================

-- Ensure valid action type
ALTER TABLE scheduled_user_actions
ADD CONSTRAINT check_action_type
CHECK (action_type IN ('onboard', 'offboard', 'suspend', 'unsuspend', 'delete', 'restore'));

-- Ensure valid status
ALTER TABLE scheduled_user_actions
ADD CONSTRAINT check_status
CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'skipped'));

-- Ensure recurrence interval is valid if recurring
ALTER TABLE scheduled_user_actions
ADD CONSTRAINT check_recurrence_interval
CHECK (
  (is_recurring = false) OR
  (is_recurring = true AND recurrence_interval IN ('daily', 'weekly', 'monthly'))
);

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON TABLE scheduled_user_actions IS 'Queue of scheduled user lifecycle actions (onboarding, offboarding, etc.)';
COMMENT ON COLUMN scheduled_user_actions.action_type IS 'Type of action: onboard, offboard, suspend, unsuspend, delete, restore';
COMMENT ON COLUMN scheduled_user_actions.action_config IS 'Full configuration snapshot at time of scheduling - immune to template changes';
COMMENT ON COLUMN scheduled_user_actions.config_overrides IS 'Custom overrides from the template defaults - for audit trail';
COMMENT ON COLUMN scheduled_user_actions.depends_on_action_id IS 'This action will not execute until the dependent action completes';
