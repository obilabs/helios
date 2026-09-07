-- 076_reconcile_user_lifecycle_logs.sql
--
-- The seed (schema_organization.sql) carries an OLDER shape of user_lifecycle_logs
-- (step_name / step_type, 11 columns) than the one the code writes
-- (lifecycle-log.service.ts inserts 25 columns from archived migration 043).
-- On a fresh install EVERY lifecycle log write failed with
--   column "user_email" of relation "user_lifecycle_logs" does not exist
-- which aborts the onboarding/offboarding orchestrators before their first step.
-- Found 2026-09-07 during the M365 fixture-capture run.
--
-- Reconcile additively: add every column the code writes, relax the two legacy
-- NOT NULL columns the code never populates. Nothing is renamed or dropped.
-- Idempotent.

ALTER TABLE user_lifecycle_logs
  ADD COLUMN IF NOT EXISTS user_email            VARCHAR(255),
  ADD COLUMN IF NOT EXISTS action_type           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS action_step           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS step_description      TEXT,
  ADD COLUMN IF NOT EXISTS step_order            INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS api_request           JSONB,
  ADD COLUMN IF NOT EXISTS api_response          JSONB,
  ADD COLUMN IF NOT EXISTS target_resource_type  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS target_resource_id    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS target_resource_name  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS error_code            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS error_details         JSONB,
  ADD COLUMN IF NOT EXISTS is_retry              BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_attempt         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS triggered_by          VARCHAR(50) DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS triggered_by_user_id  UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS executed_at           TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ip_address            INET,
  ADD COLUMN IF NOT EXISTS user_agent            TEXT;

-- Legacy seed columns the current writer never sets.
ALTER TABLE user_lifecycle_logs ALTER COLUMN step_name DROP NOT NULL;
ALTER TABLE user_lifecycle_logs ALTER COLUMN step_type DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_lifecycle_logs_user_email ON user_lifecycle_logs (organization_id, user_email);
CREATE INDEX IF NOT EXISTS idx_user_lifecycle_logs_action_type ON user_lifecycle_logs (organization_id, action_type, executed_at DESC);
