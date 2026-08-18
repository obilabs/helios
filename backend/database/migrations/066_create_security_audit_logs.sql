-- Migration 066: create the security_audit_logs table
-- Purpose: src/services/security-audit.service.ts, src/middleware/audit.middleware.ts
-- and index.ts all INSERT into `security_audit_logs`, but the seed dump
-- (database/schema_organization.sql) never created it — the audit writer swallows
-- the "relation does not exist" error, so a fresh install logged nothing and
-- emitted noisy ERRORs on every audited action.
--
-- This is the canonical DDL, carried forward from the historical
-- database/archived_migrations/063_create_security_audit_logs.sql. The only
-- change is CREATE OR REPLACE TRIGGER (PostgreSQL 14+; we run 16) so the whole
-- file is idempotent under the tracked boot runner.
--
-- Implements tamper-evident logging with a per-record SHA-256 hash chain.
-- Records are immutable: UPDATE/DELETE are turned into no-ops by rules below.

CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timestamp (immutable)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Actor (who performed the action)
  actor_id UUID,
  actor_type VARCHAR(20) NOT NULL,        -- 'user', 'service', 'mtp', 'system', 'anonymous'
  actor_email VARCHAR(255),
  actor_ip INET,
  actor_user_agent TEXT,

  -- Action (what happened)
  action VARCHAR(100) NOT NULL,           -- e.g., 'auth.login', 'user.create', 'key.access'
  action_category VARCHAR(50) NOT NULL,   -- 'auth', 'admin', 'data', 'security', 'api', 'sync'

  -- Target (what was affected)
  target_type VARCHAR(50),
  target_id UUID,
  target_identifier VARCHAR(255),

  -- Context
  session_id UUID,
  organization_id UUID NOT NULL,
  request_id VARCHAR(64),
  ticket_reference VARCHAR(100),

  -- Outcome
  outcome VARCHAR(20) NOT NULL,           -- 'success', 'failure', 'partial', 'blocked'
  error_code VARCHAR(50),
  error_message TEXT,

  -- Changes (for data modifications)
  changes_before JSONB,
  changes_after JSONB,

  -- Security analysis
  risk_score SMALLINT,
  flagged BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,

  -- Integrity (tamper detection)
  previous_hash VARCHAR(64),
  record_hash VARCHAR(64) NOT NULL,

  CONSTRAINT valid_outcome CHECK (outcome IN ('success', 'failure', 'partial', 'blocked')),
  CONSTRAINT valid_actor_type CHECK (actor_type IN ('user', 'service', 'mtp', 'system', 'anonymous')),
  CONSTRAINT valid_action_category CHECK (action_category IN ('auth', 'admin', 'data', 'security', 'api', 'sync'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_security_audit_timestamp ON security_audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_actor     ON security_audit_logs(actor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_action    ON security_audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_category  ON security_audit_logs(action_category, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_target    ON security_audit_logs(target_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_org       ON security_audit_logs(organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_flagged   ON security_audit_logs(flagged, timestamp DESC) WHERE flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_security_audit_failures  ON security_audit_logs(outcome, timestamp DESC) WHERE outcome = 'failure';

-- Immutability: prevent modification/deletion of audit records (forensic integrity).
CREATE OR REPLACE RULE prevent_security_audit_update AS
  ON UPDATE TO security_audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_security_audit_delete AS
  ON DELETE TO security_audit_logs DO INSTEAD NOTHING;

-- Hash of a record for tamper detection; the chain lets integrity be verified.
CREATE OR REPLACE FUNCTION calculate_audit_hash(
  p_id UUID,
  p_timestamp TIMESTAMPTZ,
  p_actor_type VARCHAR,
  p_action VARCHAR,
  p_outcome VARCHAR,
  p_organization_id UUID,
  p_previous_hash VARCHAR
) RETURNS VARCHAR AS $$
DECLARE
  v_data TEXT;
BEGIN
  v_data := COALESCE(p_id::TEXT, '') || '|' ||
            COALESCE(p_timestamp::TEXT, '') || '|' ||
            COALESCE(p_actor_type, '') || '|' ||
            COALESCE(p_action, '') || '|' ||
            COALESCE(p_outcome, '') || '|' ||
            COALESCE(p_organization_id::TEXT, '') || '|' ||
            COALESCE(p_previous_hash, 'GENESIS');

  RETURN encode(sha256(v_data::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Auto-populate the hash chain on insert.
CREATE OR REPLACE FUNCTION security_audit_hash_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_previous_hash VARCHAR(64);
BEGIN
  SELECT record_hash INTO v_previous_hash
  FROM security_audit_logs
  ORDER BY timestamp DESC, id DESC
  LIMIT 1;

  NEW.previous_hash := v_previous_hash;
  NEW.record_hash := calculate_audit_hash(
    NEW.id,
    NEW.timestamp,
    NEW.actor_type,
    NEW.action,
    NEW.outcome,
    NEW.organization_id,
    v_previous_hash
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER security_audit_hash_before_insert
  BEFORE INSERT ON security_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION security_audit_hash_trigger();

COMMENT ON TABLE security_audit_logs IS 'Immutable, tamper-evident security audit log for compliance and forensics';
