-- 092_training_contract.sql
--
-- Training contract v1 (Build Window 2026, Phase 02 bone).
--
-- Helios owns the training REQUIREMENT and its STATUS. Content, player and scoring live
-- wherever the customer wants them: Aegis, a third-party awareness vendor, or a person
-- ticking a box. This migration is the storage half of the wire contract frozen in
-- backend/src/lib/training/contract.ts; read that file first, it carries the reasoning.
--
-- Relationship to the existing training tables: `training_content`,
-- `training_quiz_questions` and `user_training_progress` are the LOCAL content player
-- that shipped with Helios. They are untouched here. This migration adds the
-- provider-agnostic layer above them — the local player becomes one provider among
-- several, and stops being the only way a requirement can be met.
--
-- Everything here is additive. No existing table changes shape; the one ALTER adds a
-- default-false flag. Nothing in this migration is reachable until that flag is on.

BEGIN;

-- ---------------------------------------------------------------------------
-- Feature flag. Ships DISABLED, per the Phase 02 rule: bones freeze the contract,
-- they do not turn on a feature.
-- ---------------------------------------------------------------------------

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS training_contract_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_settings.training_contract_enabled IS
  'Training contract v1 endpoints and webhooks. Default false; the contract is frozen but inert until an admin enables it.';

-- ---------------------------------------------------------------------------
-- Requirements — the thing Helios owns.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS training_requirements (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                     uuid NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Denormalised at creation so a completion can be matched to a requirement by the only
  -- identifier most providers have, without a join through a user row that may since have
  -- been renamed. The user_id remains authoritative for who this is.
  subject_email               varchar(320) NOT NULL,

  provider                    varchar(64) NOT NULL DEFAULT 'helios',
  external_course_id          text,
  title                       varchar(255) NOT NULL,

  -- WHY this requirement exists. The field no learning standard has, and the reason this
  -- is a security product rather than an LMS.
  reason                      varchar(32) NOT NULL,
  -- What triggered it: a phish event id, a policy id, an incident reference. Opaque text
  -- on purpose — the phishing module may not be installed, and this must not become a
  -- foreign key to a table that might not exist.
  reason_ref                  text,

  assigned_at                 timestamptz NOT NULL DEFAULT now(),
  due_at                      timestamptz,

  -- STORED status only. 'overdue' is never written here: it is derived from
  -- (status = 'pending' AND due_at < now()) by training_effective_status() below, so a
  -- record is never wrong merely because a sweeper has not run yet.
  status                      varchar(16) NOT NULL DEFAULT 'pending',
  satisfied_at                timestamptz,
  satisfied_by_completion_id  uuid,

  waived_at                   timestamptz,
  waived_by                   uuid REFERENCES organization_users(id) ON DELETE SET NULL,
  waived_reason               text,
  cancelled_at                timestamptz,

  spec_version                integer NOT NULL DEFAULT 1,
  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by                  uuid REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT training_requirements_reason_check
    CHECK (reason IN ('onboarding', 'policy', 'periodic', 'phish_failure', 'incident', 'manual')),
  -- 'overdue' is deliberately absent: it is not a storable state.
  CONSTRAINT training_requirements_status_check
    CHECK (status IN ('pending', 'satisfied', 'waived', 'cancelled')),
  -- A satisfied requirement must say when. Without this, a row can claim completion with
  -- no completion date and the evidence is worthless to an auditor.
  CONSTRAINT training_requirements_satisfied_has_date
    CHECK (status <> 'satisfied' OR satisfied_at IS NOT NULL),
  CONSTRAINT training_requirements_waived_has_date
    CHECK (status <> 'waived' OR waived_at IS NOT NULL)
);

COMMENT ON TABLE training_requirements IS
  'Training contract v1: a requirement Helios owns. Content and scoring may live in any provider.';

CREATE INDEX IF NOT EXISTS idx_training_requirements_org_user
  ON training_requirements (organization_id, user_id);
-- Serves both the overdue sweep and the "what is outstanding" read.
CREATE INDEX IF NOT EXISTS idx_training_requirements_pending_due
  ON training_requirements (organization_id, due_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_training_requirements_subject
  ON training_requirements (organization_id, lower(subject_email));

-- ---------------------------------------------------------------------------
-- Completions — append-only evidence.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS training_completions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Nullable: a provider may report a completion we did not ask for (someone took a
  -- course voluntarily, or the vendor assigned it themselves). Refusing those would throw
  -- away true evidence because our bookkeeping did not predict it.
  -- CASCADE, not SET NULL: SET NULL is an UPDATE, which the immutability trigger refuses.
  -- A requirement is only ever hard-deleted while erasing the whole organization, and in
  -- that case its evidence must go too.
  requirement_id          uuid REFERENCES training_requirements(id) ON DELETE CASCADE,
  -- Nullable: the actor may not resolve to a Helios user (a contractor in the vendor's
  -- console, a stale address). We keep the record and leave it unmatched rather than
  -- rejecting it, because the raw statement is the evidence.
  --
  -- Deliberately NOT a foreign key. ON DELETE SET NULL would issue an UPDATE against an
  -- append-only table when a directory row is removed — either rewriting evidence or
  -- failing the delete. Evidence must outlive the directory: who completed the training
  -- is a fact about the past, and a departed employee's record is exactly what an
  -- auditor asks for. actor_identifier remains the durable identity.
  user_id                 uuid,

  actor_identifier        text NOT NULL,
  actor_type              varchar(16) NOT NULL,

  provider                varchar(64) NOT NULL,
  verb                    varchar(16) NOT NULL,
  object_id               text NOT NULL,
  object_name             text,

  result_completion       boolean,
  result_success          boolean,
  result_score_scaled     numeric(4,3),
  result_duration_seconds integer,

  occurred_at             timestamptz NOT NULL,
  received_at             timestamptz NOT NULL DEFAULT now(),

  -- Replayed webhooks are the normal failure mode of every vendor integration, not an
  -- edge case. The key is required at the API boundary.
  idempotency_key         text NOT NULL,
  -- Provenance: which credential presented this evidence. This chain IS the compliance
  -- value, and it is exactly what xAPI's `authority` field blurs. No foreign key, for the
  -- same reason as user_id and one more: revoking a key must never erase the record of
  -- what that key attested to. Provenance that disappears when a credential is rotated is
  -- not provenance.
  api_key_id              uuid,

  spec_version            integer NOT NULL DEFAULT 1,
  -- The statement exactly as received. If our parsing is ever wrong, the truth survives.
  raw                     jsonb NOT NULL,

  CONSTRAINT training_completions_verb_check
    CHECK (verb IN ('completed', 'passed', 'failed')),
  CONSTRAINT training_completions_actor_type_check
    CHECK (actor_type IN ('mbox', 'account')),
  CONSTRAINT training_completions_score_range
    CHECK (result_score_scaled IS NULL OR (result_score_scaled >= 0 AND result_score_scaled <= 1)),
  CONSTRAINT training_completions_duration_sane
    CHECK (result_duration_seconds IS NULL OR result_duration_seconds >= 0)
);

COMMENT ON TABLE training_completions IS
  'Training contract v1: append-only completion evidence. Never updated, never deleted.';

-- NULLS NOT DISTINCT (PostgreSQL 15+): an internal producer has no api_key_id, and with
-- the default NULLS DISTINCT every one of its retries would insert a duplicate — the
-- idempotency guarantee would hold for external integrations and silently not for ours.
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_completions_idempotency
  ON training_completions (organization_id, api_key_id, idempotency_key)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_training_completions_requirement
  ON training_completions (requirement_id);
CREATE INDEX IF NOT EXISTS idx_training_completions_org_actor
  ON training_completions (organization_id, actor_identifier);

-- Evidence is immutable. Enforced in the database, not in a service: a future admin
-- screen, a migration script or a well-meaning support query must all fail the same way.
-- UPDATE is refused outright: a correction is a new statement, never an edit.
--
-- DELETE is refused too, with one deliberate exception. Erasing a customer entirely --
-- an organization being deleted, or a data-erasure request -- must be possible, and an
-- unconditional block would mean `DELETE FROM organizations` fails on a foreign-key
-- cascade with an error naming a table the operator has never heard of. So a purge sets
-- a session flag first, which makes the intent explicit and greppable rather than
-- accidental:
--
--   SET LOCAL helios.purge_evidence = 'on';
--
-- LOCAL scopes it to the transaction, so it cannot leak into the next statement on a
-- pooled connection.
CREATE OR REPLACE FUNCTION training_completions_immutable()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('helios.purge_evidence', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'training_completions is append-only (attempted %) — correct a record by appending a new statement, or SET LOCAL helios.purge_evidence = ''on'' to erase a customer',
    TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_training_completions_immutable ON training_completions;
CREATE TRIGGER trg_training_completions_immutable
  BEFORE UPDATE OR DELETE ON training_completions
  FOR EACH ROW EXECUTE FUNCTION training_completions_immutable();

-- ---------------------------------------------------------------------------
-- Derived status — one definition, shared by SQL and TypeScript.
-- ---------------------------------------------------------------------------

-- Mirrors effectiveStatus() in backend/src/lib/training/contract.ts exactly. Two copies
-- is a duplication we accept for one reason: a direct SQL query and the API must never
-- disagree about who is overdue, and a report written against the view is as valid as
-- one written against the endpoint. The contract test asserts they agree.
CREATE OR REPLACE FUNCTION training_effective_status(
  stored_status varchar,
  due_at timestamptz
) RETURNS varchar AS $$
  SELECT CASE
    WHEN stored_status <> 'pending' THEN stored_status
    WHEN due_at IS NULL THEN 'pending'
    WHEN due_at < now() THEN 'overdue'
    ELSE 'pending'
  END;
$$ LANGUAGE sql STABLE;

-- The read projection. Column names are deliberately Helios-native; the Vanta-shaped
-- TrainingRecord naming is applied in the API layer by toTrainingRecord(), so the
-- database is not pinned to a third party's vocabulary.
CREATE OR REPLACE VIEW training_requirement_records AS
SELECT
  r.id,
  r.organization_id,
  r.user_id,
  r.subject_email                                     AS primary_email,
  r.title,
  r.provider,
  r.reason,
  r.reason_ref,
  r.due_at,
  r.assigned_at,
  r.satisfied_at,
  training_effective_status(r.status, r.due_at)       AS status,
  r.status                                            AS stored_status,
  c.result_score_scaled                               AS score_scaled,
  c.verb                                              AS satisfying_verb,
  c.provider                                          AS satisfying_provider,
  r.spec_version
FROM training_requirements r
LEFT JOIN training_completions c ON c.id = r.satisfied_by_completion_id;

COMMENT ON VIEW training_requirement_records IS
  'Training contract v1 read projection: requirement + the completion that satisfied it, with derived status.';

-- ---------------------------------------------------------------------------
-- Outbound webhooks.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS training_webhook_endpoints (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              varchar(255) NOT NULL,
  url               text NOT NULL,
  -- Encrypted, not hashed: we must reproduce the secret to sign with it. Uses the same
  -- AES-256 envelope as service-account keys.
  secret_encrypted  text NOT NULL,
  events            text[] NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_success_at   timestamptz,
  last_failure_at   timestamptz,
  CONSTRAINT training_webhook_endpoints_https
    CHECK (url LIKE 'https://%')
);

COMMENT ON TABLE training_webhook_endpoints IS
  'Training contract v1: signed outbound webhook receivers. HTTPS enforced in the schema.';

CREATE TABLE IF NOT EXISTS training_webhook_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint_id     uuid NOT NULL REFERENCES training_webhook_endpoints(id) ON DELETE CASCADE,
  -- Sent as X-Helios-Event-Id and carried in the body. The receiver's idempotency key:
  -- a retry of the same event reuses it, so a receiver can dedupe without inspecting
  -- the payload.
  event_id        uuid NOT NULL DEFAULT gen_random_uuid(),
  event           varchar(64) NOT NULL,
  requirement_id  uuid REFERENCES training_requirements(id) ON DELETE CASCADE,
  payload         jsonb NOT NULL,
  status          varchar(16) NOT NULL DEFAULT 'pending',
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  response_status integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  CONSTRAINT training_webhook_deliveries_status_check
    CHECK (status IN ('pending', 'delivered', 'failed', 'abandoned'))
);

COMMENT ON TABLE training_webhook_deliveries IS
  'Training contract v1: webhook outbox. One row per (event, endpoint); retried on next_attempt_at.';

-- One delivery per event per endpoint, so a double-fire of the same transition cannot
-- send the receiver two copies.
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_webhook_deliveries_event
  ON training_webhook_deliveries (endpoint_id, event, requirement_id)
  WHERE requirement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_webhook_deliveries_due
  ON training_webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';

COMMIT;
