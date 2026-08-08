-- Migration: 063_create_security_audit_logs.sql
-- Purpose: Create comprehensive security audit logging infrastructure
-- Critical for: Security compliance, breach detection, forensic analysis
--
-- This implements tamper-evident logging with hash chains for integrity verification.
-- Records are immutable - updates and deletes are prevented via database rules.

-- =============================================================================
-- Security Audit Logs Table
-- =============================================================================
-- Stores all security-relevant events with full context for investigation.
-- Hash chain provides tamper detection - each record includes hash of previous.

CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timestamp (immutable)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Actor (who performed the action)
  actor_id UUID,                          -- User ID if known
  actor_type VARCHAR(20) NOT NULL,        -- 'user', 'service', 'mtp', 'system', 'anonymous'
  actor_email VARCHAR(255),               -- Email for identification
  actor_ip INET,                          -- IP address
  actor_user_agent TEXT,                  -- Browser/client info

  -- Action (what happened)
  action VARCHAR(100) NOT NULL,           -- e.g., 'auth.login', 'user.create', 'key.access'
  action_category VARCHAR(50) NOT NULL,   -- 'auth', 'admin', 'data', 'security', 'api'

  -- Target (what was affected)
  target_type VARCHAR(50),                -- e.g., 'user', 'group', 'service_account', 'session'
  target_id UUID,                         -- ID of affected entity
  target_identifier VARCHAR(255),         -- Email/name for easy identification

  -- Context
  session_id UUID,                        -- Session that performed action
  organization_id UUID NOT NULL,          -- Organization context
  request_id VARCHAR(64),                 -- For request tracing
  ticket_reference VARCHAR(100),          -- For MTP-initiated actions

  -- Outcome
  outcome VARCHAR(20) NOT NULL,           -- 'success', 'failure', 'partial', 'blocked'
  error_code VARCHAR(50),                 -- Error code if failed
  error_message TEXT,                     -- Error details

  -- Changes (for data modifications)
  changes_before JSONB,                   -- State before change
  changes_after JSONB,                    -- State after change

  -- Security analysis
  risk_score SMALLINT,                    -- 0-100, anomaly detection score
  flagged BOOLEAN DEFAULT FALSE,          -- Manual or automatic flag for review
  reviewed_at TIMESTAMPTZ,                -- When reviewed
  reviewed_by UUID,                       -- Who reviewed

  -- Integrity (tamper detection)
  previous_hash VARCHAR(64),              -- SHA-256 of previous record
  record_hash VARCHAR(64) NOT NULL,       -- SHA-256 of this record

  -- No updated_at - records are immutable
  CONSTRAINT valid_outcome CHECK (outcome IN ('success', 'failure', 'partial', 'blocked')),
  CONSTRAINT valid_actor_type CHECK (actor_type IN ('user', 'service', 'mtp', 'system', 'anonymous')),
  CONSTRAINT valid_action_category CHECK (action_category IN ('auth', 'admin', 'data', 'security', 'api', 'sync'))
);

-- =============================================================================
-- Indexes for Efficient Querying
-- =============================================================================

-- Time-based queries (most common)
CREATE INDEX IF NOT EXISTS idx_security_audit_timestamp
  ON security_audit_logs(timestamp DESC);

-- Actor queries (who did what)
CREATE INDEX IF NOT EXISTS idx_security_audit_actor
  ON security_audit_logs(actor_id, timestamp DESC);

-- Action queries (what happened)
CREATE INDEX IF NOT EXISTS idx_security_audit_action
  ON security_audit_logs(action, timestamp DESC);

-- Category queries (filter by type)
CREATE INDEX IF NOT EXISTS idx_security_audit_category
  ON security_audit_logs(action_category, timestamp DESC);

-- Target queries (what was affected)
CREATE INDEX IF NOT EXISTS idx_security_audit_target
  ON security_audit_logs(target_id, timestamp DESC);

-- Organization queries (tenant isolation)
CREATE INDEX IF NOT EXISTS idx_security_audit_org
  ON security_audit_logs(organization_id, timestamp DESC);

-- Flagged items for review
CREATE INDEX IF NOT EXISTS idx_security_audit_flagged
  ON security_audit_logs(flagged, timestamp DESC) WHERE flagged = TRUE;

-- Failed actions for security analysis
CREATE INDEX IF NOT EXISTS idx_security_audit_failures
  ON security_audit_logs(outcome, timestamp DESC) WHERE outcome = 'failure';

-- =============================================================================
-- Immutability Rules
-- =============================================================================
-- These rules prevent modification or deletion of audit records.
-- This is critical for forensic integrity and compliance.

-- Prevent updates
CREATE OR REPLACE RULE prevent_security_audit_update AS
  ON UPDATE TO security_audit_logs DO INSTEAD NOTHING;

-- Prevent deletes (except for retention policy - handled by separate job)
CREATE OR REPLACE RULE prevent_security_audit_delete AS
  ON DELETE TO security_audit_logs DO INSTEAD NOTHING;

-- =============================================================================
-- Hash Calculation Function
-- =============================================================================
-- Creates a hash of the record for tamper detection.
-- The hash chain allows verification of log integrity.

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
  -- Concatenate key fields that should not be modified
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

-- =============================================================================
-- Auto-populate Hash on Insert
-- =============================================================================

CREATE OR REPLACE FUNCTION security_audit_hash_trigger() RETURNS TRIGGER AS $$
DECLARE
  v_previous_hash VARCHAR(64);
BEGIN
  -- Get the hash of the previous record
  SELECT record_hash INTO v_previous_hash
  FROM security_audit_logs
  ORDER BY timestamp DESC, id DESC
  LIMIT 1;

  -- Set the previous hash reference
  NEW.previous_hash := v_previous_hash;

  -- Calculate and set this record's hash
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

CREATE TRIGGER security_audit_hash_before_insert
  BEFORE INSERT ON security_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION security_audit_hash_trigger();

-- =============================================================================
-- Common Actions Reference
-- =============================================================================
-- This comment documents the standard action names for consistency.
--
-- Authentication:
--   auth.login.success, auth.login.failure, auth.logout
--   auth.password.change, auth.password.reset
--   auth.mfa.setup, auth.mfa.verify, auth.mfa.disable
--   auth.session.create, auth.session.revoke
--
-- User Management:
--   user.create, user.update, user.delete, user.suspend
--   user.role.change, user.password.set
--
-- API & Service Accounts:
--   api.key.create, api.key.revoke, api.key.use
--   service.account.access, service.account.key.decrypt
--
-- Data Operations:
--   data.export, data.import, data.bulk.operation
--   sync.google.start, sync.google.complete, sync.google.error
--
-- Security Events:
--   security.rate.limit, security.ip.block
--   security.suspicious.activity, security.anomaly.detected

COMMENT ON TABLE security_audit_logs IS 'Immutable, tamper-evident security audit log for compliance and forensics';
