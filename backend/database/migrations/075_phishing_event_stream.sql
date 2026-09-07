-- 075_phishing_event_stream.sql
--
-- BONES (Build Window 2026, Phase 02): the per-recipient phishing EVENT STREAM shared by
-- Detection (real reports) and Simulation (injected campaigns), plus the tracking model.
-- Designed from openspec/changes/add-phishing-reports-module/research/tracking-decision-v0.1.md.
--
-- Freeze rules this file encodes (see openspec/changes/freeze-phishing-bones/):
--   * phish_event is APPEND-ONLY, IMMUTABLE evidence. A trigger rejects DELETE and any
--     UPDATE other than the one sanctioned exception: redacting request_meta under the
--     retention policy. Identity / type / timing never change.
--   * Verdicts are DERIVED and VERSIONED in phish_event_classification - never a column on
--     the event. Dashboards and the Aegis trigger read the latest classification.
--   * event_type / source / verdict / status are TEXT with an app-level allowlist
--     (backend/src/lib/phishing/contract.ts) - adding a kind is a code change, zero DDL.
--   * jsonb escape hatches (request_meta / metadata / signals) absorb new attributes.
--   * schema_ver on rows; the wire contracts (token URL, Aegis payload, ingest) are versioned.
--   * A REAL report and a SIMULATED interaction write to the SAME stream (phish_event), so
--     real-reporter rate is visible next to simulation report rate.
--   * Credential VALUES are never stored anywhere (enforced by test, see evidence.ts).
--   * Everything additively extensible: new nullable columns only, never renames/drops.
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / WHERE NOT EXISTS).

-- ---------------------------------------------------------------------------
-- Campaign (simulation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phish_campaign (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  kind             text NOT NULL DEFAULT 'simulation',   -- allowlist: contract.ts CAMPAIGN_KINDS
  status           text NOT NULL DEFAULT 'draft',        -- allowlist: CAMPAIGN_STATUSES
  difficulty       text,                                 -- iterable taxonomy
  template_ref     text,
  delivery_mode    text,                                 -- 'insert' | 'import' (DELIVERY_MODES)
  window_start     timestamptz,
  window_end       timestamptz,
  created_by       uuid REFERENCES organization_users(id) ON DELETE SET NULL, -- who ran it (audit)
  schema_ver       smallint NOT NULL DEFAULT 1,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phish_campaign_org ON phish_campaign (organization_id, status);
DROP TRIGGER IF EXISTS trg_phish_campaign_updated_at ON phish_campaign;
CREATE TRIGGER trg_phish_campaign_updated_at BEFORE UPDATE ON phish_campaign
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE phish_campaign IS 'Phishing simulation campaign. Bound to the org''s own tenant; every run is attributable (created_by).';

-- ---------------------------------------------------------------------------
-- Campaign membership: one row per (campaign, recipient) = one opaque token
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phish_campaign_recipient (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          uuid NOT NULL REFERENCES phish_campaign(id) ON DELETE CASCADE,
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_ref             text NOT NULL,          -- stable directory id (organization_users.id), NOT just email
  email                text NOT NULL,          -- lower-cased at write (no citext extension in the seed)
  token_hash           text NOT NULL UNIQUE,   -- sha256(opaque token); the raw token is NEVER stored
  token_format         text NOT NULL DEFAULT 'h1',  -- TOKEN_FORMATS: 'h1' opaque; 'h2' reserved (signed)
  injected_message_id  text,                   -- from users.messages.insert: the authoritative "landed"
  delivered_at         timestamptz,            -- ms precision; all timing heuristics key off this
  schema_ver           smallint NOT NULL DEFAULT 1,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_ref)
);
CREATE INDEX IF NOT EXISTS idx_phish_recipient_campaign ON phish_campaign_recipient (campaign_id);
CREATE INDEX IF NOT EXISTS idx_phish_recipient_user ON phish_campaign_recipient (organization_id, user_ref);

COMMENT ON COLUMN phish_campaign_recipient.token_hash IS 'sha256 hex of the h1_ token in the lure URL path. Raw token never persisted or logged.';

-- ---------------------------------------------------------------------------
-- Real report (Detection / Track A): what the button or abuse mailbox ingested
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phish_report (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reporter_user_ref        text,                          -- directory id when resolvable
  reporter_email           text NOT NULL,
  ingest_source            text NOT NULL,                 -- INGEST_SOURCES: addon_post | abuse_mailbox | gmail_native | manual
  ingest_contract_version  smallint NOT NULL DEFAULT 1,   -- L2 button -> Helios ingest contract version
  message_id_header        text,                          -- RFC 5322 Message-ID (dedupe / cluster)
  subject                  text,
  sender_from              text,
  sender_reply_to          text,
  eml_asset_ref            text,                          -- storage pointer; the body never lives in a row
  headers                  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- parsed headers (auth results etc.)
  indicators               jsonb NOT NULL DEFAULT '{}'::jsonb,   -- the add-on's own deterministic analysis
  impersonation            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- directory-join signals (iterable shape)
  cluster_key              text,                          -- sender/subject/url/attachment-hash cluster
  matched_recipient_id     uuid REFERENCES phish_campaign_recipient(id) ON DELETE SET NULL, -- our own sim?
  disposition              text NOT NULL DEFAULT 'unknown',  -- DISPOSITIONS: unknown|clean|spam|threat|simulation
  disposition_by           uuid REFERENCES organization_users(id) ON DELETE SET NULL,
  disposition_at           timestamptz,
  schema_ver               smallint NOT NULL DEFAULT 1,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  reported_at              timestamptz NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phish_report_org_disp ON phish_report (organization_id, disposition, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_phish_report_cluster ON phish_report (organization_id, cluster_key) WHERE cluster_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phish_report_msgid ON phish_report (organization_id, message_id_header) WHERE message_id_header IS NOT NULL;
DROP TRIGGER IF EXISTS trg_phish_report_updated_at ON phish_report;
CREATE TRIGGER trg_phish_report_updated_at BEFORE UPDATE ON phish_report
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE phish_report IS 'A real phishing report (Track A). Triage disposition is the one mutable workflow state; the evidence of the report itself is a phish_event row.';

-- ---------------------------------------------------------------------------
-- THE EVENT STREAM. Append-only, immutable raw evidence. No verdict here.
-- Shared by simulation (campaign_id/recipient_id) and detection (report_id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phish_event (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schema_ver        smallint NOT NULL DEFAULT 1,
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id       uuid REFERENCES phish_campaign(id) ON DELETE CASCADE,           -- NULL for real reports
  recipient_id      uuid REFERENCES phish_campaign_recipient(id) ON DELETE CASCADE, -- NULL for real reports
  report_id         uuid REFERENCES phish_report(id) ON DELETE CASCADE,             -- NULL for simulation
  user_ref          text,                -- who the event is about; denormalised so one query spans sim + real
  event_type        text NOT NULL,       -- EVENT_TYPES (text + app allowlist)
  source            text NOT NULL,       -- EVENT_SOURCES
  occurred_at       timestamptz NOT NULL DEFAULT clock_timestamp(),   -- ms precision
  request_ip_trunc  inet,                -- /24 (v4) or /48 (v6): data minimisation
  request_asn       integer,             -- resolved at ingest; drives datacenter-ASN checks
  user_agent        text,
  link_slug         text,                -- which lure link, when the mail has several
  request_meta      jsonb NOT NULL DEFAULT '{}'::jsonb  -- Sec-Fetch-*, Referer, JA3, geo, full IP (TTL) ...
);
CREATE INDEX IF NOT EXISTS idx_phish_event_recipient ON phish_event (recipient_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_phish_event_campaign_type ON phish_event (campaign_id, event_type);
CREATE INDEX IF NOT EXISTS idx_phish_event_report ON phish_event (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phish_event_user_timeline ON phish_event (organization_id, user_ref, occurred_at);

COMMENT ON TABLE phish_event IS 'APPEND-ONLY immutable evidence. DELETE is rejected; the only permitted UPDATE is redacting request_meta (retention). Verdicts live in phish_event_classification.';

-- Immutability guard. The ONE exception: request_meta may be rewritten (redaction under the
-- retention policy). Every other column must be identical between OLD and NEW.
CREATE OR REPLACE FUNCTION phish_event_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'phish_event is append-only: DELETE rejected (id=%)', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (to_jsonb(OLD) - 'request_meta') IS DISTINCT FROM (to_jsonb(NEW) - 'request_meta') THEN
    RAISE EXCEPTION 'phish_event is immutable: only request_meta may be redacted (id=%)', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_phish_event_immutable ON phish_event;
CREATE TRIGGER trg_phish_event_immutable BEFORE UPDATE OR DELETE ON phish_event
  FOR EACH ROW EXECUTE FUNCTION phish_event_immutable();

-- ---------------------------------------------------------------------------
-- DERIVED verdicts: versioned, re-runnable. Consumers read the LATEST per event.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phish_event_classification (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id            bigint NOT NULL REFERENCES phish_event(id) ON DELETE CASCADE,
  classifier_version  text NOT NULL,
  verdict             text NOT NULL,      -- VERDICTS: human|bot_scanner|prefetch|link_preview|honeypot|unknown
  reason              text,
  signals             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- the inputs that produced the verdict
  classified_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, classifier_version)   -- keeps verdict history; latest classified_at wins
);
CREATE INDEX IF NOT EXISTS idx_phish_classification_event ON phish_event_classification (event_id, classified_at DESC);

-- ---------------------------------------------------------------------------
-- Durable outbox for the Helios -> Aegis wire contract (survives Aegis downtime; idempotent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phish_outbox (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id           bigint NOT NULL REFERENCES phish_event(id) ON DELETE CASCADE,
  classification_id  bigint REFERENCES phish_event_classification(id) ON DELETE SET NULL,
  contract_type      text NOT NULL,      -- AEGIS_CONTRACT_TYPES: phishing.recipient.failed | phishing.recipient.failure_retracted
  schema_version     smallint NOT NULL,
  payload            jsonb NOT NULL,
  status             text NOT NULL DEFAULT 'pending',   -- OUTBOX_STATUSES: pending|delivered|failed|abandoned
  attempts           integer NOT NULL DEFAULT 0,
  last_error         text,
  next_attempt_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  delivered_at       timestamptz,
  UNIQUE (event_id, contract_type)       -- idempotency: at most one failed + one retraction per event
);
CREATE INDEX IF NOT EXISTS idx_phish_outbox_pending ON phish_outbox (status, next_attempt_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Projections (never stored state). Recipient state is recomputed from evidence + latest verdict.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW phish_event_latest_verdict AS
  SELECT DISTINCT ON (c.event_id)
         c.event_id, c.verdict, c.classifier_version, c.classified_at
    FROM phish_event_classification c
   ORDER BY c.event_id, c.classified_at DESC, c.id DESC;

CREATE OR REPLACE VIEW phish_recipient_state AS
  WITH ev AS (
    SELECT e.recipient_id, e.event_type, e.occurred_at,
           COALESCE(v.verdict, 'unknown') AS verdict
      FROM phish_event e
      LEFT JOIN phish_event_latest_verdict v ON v.event_id = e.id
     WHERE e.recipient_id IS NOT NULL
  )
  SELECT r.id AS recipient_id, r.campaign_id, r.organization_id, r.user_ref, r.email,
         r.delivered_at,
         MIN(ev.occurred_at) FILTER (WHERE ev.event_type = 'opened')                              AS first_opened_at,
         MIN(ev.occurred_at) FILTER (WHERE ev.event_type = 'clicked'   AND ev.verdict = 'human')  AS first_clicked_at,
         MIN(ev.occurred_at) FILTER (WHERE ev.event_type = 'submitted' AND ev.verdict = 'human')  AS first_submitted_at,
         MIN(ev.occurred_at) FILTER (WHERE ev.event_type = 'reported')                            AS first_reported_at,
         CASE
           WHEN bool_or(ev.event_type = 'reported')                              THEN 'reported'
           WHEN bool_or(ev.event_type = 'submitted' AND ev.verdict = 'human')    THEN 'submitted'
           WHEN bool_or(ev.event_type = 'clicked'   AND ev.verdict = 'human')    THEN 'clicked'
           WHEN bool_or(ev.event_type = 'opened')                                THEN 'opened'
           WHEN r.delivered_at IS NOT NULL                                       THEN 'delivered'
           ELSE 'pending'
         END AS state
    FROM phish_campaign_recipient r
    LEFT JOIN ev ON ev.recipient_id = r.id
   GROUP BY r.id;

COMMENT ON VIEW phish_recipient_state IS 'Projection only. Pass/fail is computed from evidence + latest verdict; there is no stored status column to break.';

-- ---------------------------------------------------------------------------
-- Feature flags: both modules exist as flags, DISABLED. No UI is registered by this file.
-- ---------------------------------------------------------------------------
INSERT INTO feature_flags (feature_key, name, description, is_enabled, category)
SELECT 'phishing.detection', 'Phishing Detection', 'Reports triage inbox + directory-based impersonation detection (Track A / L3)', false, 'phishing'
 WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE feature_key = 'phishing.detection');
INSERT INTO feature_flags (feature_key, name, description, is_enabled, category)
SELECT 'phishing.simulation', 'Phishing Simulation', 'Workspace-injection simulation campaigns against the org''s own users (Track B)', false, 'phishing'
 WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE feature_key = 'phishing.simulation');
