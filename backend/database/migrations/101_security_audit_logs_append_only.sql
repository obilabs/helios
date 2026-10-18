-- 101_security_audit_logs_append_only.sql
--
-- Brings `security_audit_logs` up to the audit baseline: append-only and
-- tamper-evident, ENFORCED BY THE DATABASE, with a verifier and tests.
--
-- Migration 066 built most of this already: a SHA-256 chain filled by a BEFORE
-- INSERT trigger, plus `DO INSTEAD NOTHING` rules on UPDATE and DELETE. Aegis
-- then copied 066's shape and tightened four things while doing it (its
-- migration 099, obilabs/aegis). This migration applies the same four to
-- Helios so there is ONE pattern across the products rather than two, and adds
-- the three pieces neither product had here: a REVOKE, a verifier, and tests.
--
-- Nothing in 066 is edited. This file supersedes it in place.
--
-- ===========================================================================
-- THE FOUR CHANGES, AND WHY
-- ===========================================================================
--
--   1. RAISE INSTEAD OF IGNORING. 066's rules make history immutable but they
--      are SILENT: `UPDATE security_audit_logs SET ...` reports "UPDATE 0" and
--      a caller that does not check row counts believes it succeeded. A guard
--      whose failure is indistinguishable from success is not a guard. The
--      rules are dropped and replaced with BEFORE triggers that raise and name
--      the row and the operation, copying the shape of
--      `training_completions_immutable()` in migration 092.
--
--      No DELETE exception is added. 092 has one (`SET LOCAL
--      helios.purge_evidence = 'on'`) because `training_completions`
--      references `organizations`, so an unconditional block would make
--      `DELETE FROM organizations` fail on a cascade with an error naming a
--      table the operator has never heard of. `security_audit_logs` has NO
--      foreign keys, so no cascade reaches it and no caller needs the escape.
--      If a future erasure obligation needs one, it reuses 092's existing
--      `helios.purge_evidence` flag — not a new one.
--
--   2. THE HASH COVERS EVERY COLUMN. 066 hashes seven fields (id, timestamp,
--      actor_type, action, outcome, organization_id, previous_hash), so
--      editing `changes_before` / `changes_after`, the actor's email or IP, the
--      target, the error detail or the risk score of an existing row leaves the
--      stored hash correct. v2 covers all 25 content columns plus the chain
--      link.
--
--   3. UNAMBIGUOUS, TIMEZONE-INDEPENDENT SERIALISATION. 066 joins fields with
--      a bare `'|'`, and `error_message`, `target_identifier`,
--      `actor_user_agent` and the two jsonb columns are free text that can
--      contain `'|'` — so bytes can be moved across a field boundary without
--      changing the hash. v2 length-prefixes every field. 066 also casts
--      `timestamptz::TEXT`, whose output depends on the session's `TimeZone`
--      and `DateStyle`; v2 formats at UTC with an explicit pattern, so
--      verification gives the same answer from any session.
--
--   4. ORDERED BY A SEQUENCE, UNDER A LOCK. 066 picks the predecessor with
--      `ORDER BY timestamp DESC, id DESC` and takes no lock. `now()` is
--      transaction-start time, so two concurrent appenders read the same
--      predecessor and fork the chain — and a fork is indistinguishable from
--      tampering at verification time. v2 orders the chain by `chain_seq` and
--      serialises appends with an advisory transaction lock.
--
-- ===========================================================================
-- WHAT HAPPENS TO ROWS ALREADY WRITTEN (v1): KEPT, VERIFIABLE, REPORTED APART
-- ===========================================================================
-- Unlike Aegis, Helios's existing rows DO carry hashes — 066's chain is real,
-- just weak. So they are NOT discarded and NOT rewritten:
--
--   * existing rows keep their `previous_hash` / `record_hash` exactly as
--     written and are marked `hash_version = 1`;
--   * they get a `chain_seq` in (timestamp, id) order — the same order 066's
--     trigger used to choose a predecessor, so the reconstruction is exact;
--   * `verify_security_audit_chain()` has a v1 branch that recomputes the 066
--     hash (still through `calculate_audit_hash()`, which remains v1's one
--     definition) and reports the v1 result in its OWN columns;
--   * the v1 result never feeds `ok`. Two properties of v1 make a mismatch
--     weak evidence rather than proof of tampering: its timestamp
--     serialisation depends on the writing session's `TimeZone`/`DateStyle`
--     (pass `p_legacy_timezone` to reproduce a different one; the default
--     install writes under UTC), and its lock-free appends can fork the
--     chain. Measured while building this file: 25 rows written the way
--     Helios writes them — one single-row INSERT each, in its own
--     transaction — reconstruct and verify completely (25/25); a single
--     40-row `INSERT ... SELECT` produces a TREE, not a chain, because 066's
--     predecessor read does not see all of its own statement's rows, and only
--     10 distinct predecessors are chosen for 44 rows. Nothing in Helios
--     writes audit rows that way, so a real upgrade should verify clean, and
--     the verifier reports a fork as `legacy_v1_fork` rather than as a break.
--     `ok` therefore means "the v2 segment verified", which is the segment
--     this migration actually guarantees;
--   * the FIRST v2 row links to the last v1 row's `record_hash`, so it is one
--     continuous chain and removing the newest v1 row is still detected.
--
-- Rewriting the old hashes under v2 was the alternative. It would make the
-- whole table report as strongly protected while in fact certifying nothing
-- about the period before this migration — manufactured evidence, which is
-- worse than a smaller honest claim.
--
-- ===========================================================================
-- WHAT THE v2 HASH COVERS (canonical payload v2)
-- ===========================================================================
-- `record_hash` = sha256 hex of the text built by
-- `security_audit_canonical_payload_v2()`:
--
--   'helios.security_audit_logs.v2' || '|' || '26' || '|' || f1 || ... || f26
--
-- where each field is LENGTH-PREFIXED:
--
--   NULL          -> '-1:'
--   a text value  -> octet_length(value) || ':' || value
--
-- so NULL and the empty string stay distinct ('-1:' vs '0:'), and no value can
-- impersonate a field boundary.
--
-- The 26 fields, in order:
--
--    1 id                 uuid::text
--    2 timestamp          to_char(AT TIME ZONE 'UTC',
--                         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')  (microseconds, UTC)
--    3 actor_id           uuid::text
--    4 actor_type         text as stored
--    5 actor_email        text as stored
--    6 actor_ip           inet::text
--    7 actor_user_agent   text as stored
--    8 action             text as stored
--    9 action_category    text as stored
--   10 target_type        text as stored
--   11 target_id          uuid::text
--   12 target_identifier  text as stored
--   13 session_id         uuid::text
--   14 organization_id    uuid::text  (nullable since migration 068)
--   15 request_id         text as stored
--   16 ticket_reference   text as stored
--   17 outcome            text as stored
--   18 error_code         text as stored
--   19 error_message      text as stored
--   20 changes_before     jsonb::text  (Postgres canonicalises jsonb — keys
--                         sorted, whitespace normalised, duplicates dropped —
--                         so the text form is stable for a given value)
--   21 changes_after      jsonb::text  (same)
--   22 risk_score         smallint::text
--   23 flagged            boolean::text -> 'true' / 'false'
--   24 reviewed_at        same UTC pattern as `timestamp`
--   25 reviewed_by        uuid::text
--   26 previous_hash      text as stored; NULL only if there is no predecessor
--
-- `hash_version` and `chain_seq` are deliberately NOT inside the payload: they
-- are the chain's own framing, and a verifier that cannot trust the framing
-- cannot run at all.
--
-- A future column needs a **v3** payload function and a v3 branch in the
-- verifier. Editing v2 in place would silently change the meaning of every
-- hash already written under it.
--
-- ===========================================================================
-- WRITE COST
-- ===========================================================================
-- Appends are now serialised: the BEFORE INSERT trigger takes
-- `pg_advisory_xact_lock(7741101)` before reading the chain head, and an
-- advisory XACT lock is held until COMMIT.
--
-- Measured on Postgres 16 in the dev `helios_postgres` container, on a scratch
-- database built from `database/schema_organization.sql` + every migration.
--
-- Method matters here. Wall-clock timing of a whole statement on this host was
-- useless — the same 5 000-row insert took between 10 s and 72 s run to run,
-- and the "with chain" case sometimes beat the "without" one, because the
-- machine runs several other stacks. So the figures below are the MARGINAL
-- cost of the chain, isolated: the identical statement timed with
-- `trg_security_audit_chain` enabled and disabled, alternately, in one
-- session, taking the MINIMUM of ten rounds. That cancels host load, and the
-- three repeats below agree to within 15%.
-- `backend/database/tests/audit-chain-write-cost.sql` is that harness.
--
--     one INSERT per row (how Helios writes)
--         bare insert       0.155 ms/row
--         with the chain    0.390 ms/row
--         marginal         +0.236 ms/row   (2.5x)
--     500-row INSERT ... SELECT, no jsonb
--         bare insert       0.026 ms/row
--         with the chain    0.260 ms/row
--         marginal         +0.234 ms/row   (10.1x)
--     500-row INSERT ... SELECT, ~200-byte changes_after
--         bare insert       0.030 ms/row
--         with the chain    0.286 ms/row
--         marginal         +0.256 ms/row   (9.6x)
--
-- So about +0.24 ms per appended row, and the marginal cost does not care
-- about batching or payload size — only the bare insert gets cheaper in a
-- batch, which is why the multiplier moves and the absolute number does not.
--
-- Treat +0.24 ms as an UPPER bound. The harness runs inside one transaction,
-- so by the end the head read is scanning tens of thousands of uncommitted
-- tuples. On a committed table of 5 000 rows the same read is an index-only
-- backward scan measured at 0.036 ms (0.059 ms total execution under
-- `EXPLAIN ANALYZE`), and sha256 over a few hundred bytes is microseconds —
-- so a normal append pays closer to +0.1 ms.
--
-- Consequences:
--
--   * Concurrent audit writes queue. The serialising cost is not the hash
--     (a single-row index scan on `chain_seq DESC` plus sha256 over a few
--     hundred bytes) but however long the ENCLOSING transaction stays open
--     after the insert.
--   * Helios is helped by how it already writes. `SecurityAuditService.log()`
--     and `auditMiddleware` both write one row through `db.query` in its own
--     autocommit transaction (the middleware writes from `res.on('finish')`,
--     after the response), so the lock is held for about the insert.
--   * Nothing in Helios writes audit rows in a tight loop today. If something
--     ever needs thousands, batch them into one multi-row
--     `INSERT ... SELECT`: that takes the lock once and the rows still chain
--     to each other in order, because each BEFORE ROW trigger sees the rows
--     the same statement has already inserted.
--   * Gaps in `chain_seq` are expected and harmless — `nextval` is not
--     transactional, so a rolled-back append burns a number. Verification
--     follows the HASH LINKS, never seq contiguity, which is exactly why a
--     deleted row is still detected at its successor.
--
-- ===========================================================================
-- WHAT THIS DOES NOT STOP
-- ===========================================================================
-- A PostgreSQL superuser can `ALTER TABLE security_audit_logs DISABLE TRIGGER
-- ...` or set `session_replication_role = replica`, and table ACLs do not
-- apply to superusers at all. The default `docker-compose.yml` connects as
-- `postgres`, the container's superuser — so on a default install the REVOKE
-- below is documentation and the TRIGGERS are the enforcing control. That is
-- still a real improvement (a bug, a stray query or a hand-run UPDATE all fail
-- loudly), and the chain keeps even a superuser's tampering DETECTABLE after
-- the fact. To make the ACL bite too, run the app as a non-superuser role —
-- see `docs/features/AUDIT-LOG-INTEGRITY.md`.
--
-- Deleting the NEWEST row stays undetectable by a self-contained chain: there
-- is no successor left to point at the missing hash. That needs an external
-- anchor and is not implemented.
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / guarded DO blocks), because
-- the tracked boot runner applies each migration once but a hand-run replay
-- must be safe.

-- ---------------------------------------------------------------------------
-- 1. Drop 066's silent rules FIRST.
--
-- They must go before the backfill below, because an `ON UPDATE DO INSTEAD
-- NOTHING` rule rewrites the UPDATE away entirely — the backfill would report
-- success and change nothing, and no BEFORE UPDATE trigger would ever fire
-- either.
-- ---------------------------------------------------------------------------

DROP RULE IF EXISTS prevent_security_audit_update ON security_audit_logs;
DROP RULE IF EXISTS prevent_security_audit_delete ON security_audit_logs;

-- 066's appender. Replaced below; dropped here so the two BEFORE INSERT
-- triggers never both fire.
DROP TRIGGER IF EXISTS security_audit_hash_before_insert ON security_audit_logs;
DROP FUNCTION IF EXISTS security_audit_hash_trigger();

-- `calculate_audit_hash()` from 066 is deliberately KEPT: it is the one
-- definition of the v1 hash, and the verifier needs it to check v1 rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'calculate_audit_hash') THEN
    COMMENT ON FUNCTION calculate_audit_hash(uuid, timestamptz, varchar, varchar, varchar, uuid, varchar) IS
      'Canonical v1 (migration 066) record hash: seven fields joined with "|". Superseded by security_audit_canonical_payload_v2 for new rows; retained as the only definition of v1 so pre-101 rows stay checkable. Do not use for new writes.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Chain framing columns + sequence. All backfill happens BEFORE the guard
--    triggers exist.
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS security_audit_logs_chain_seq AS bigint START WITH 1;

ALTER TABLE security_audit_logs ADD COLUMN IF NOT EXISTS chain_seq    bigint;
ALTER TABLE security_audit_logs ADD COLUMN IF NOT EXISTS hash_version smallint;

COMMENT ON COLUMN security_audit_logs.chain_seq IS
  'Total append order. Assigned by the insert trigger under an advisory lock so it agrees with the hash links. Gaps are expected (rolled-back appends) and harmless.';
COMMENT ON COLUMN security_audit_logs.hash_version IS
  '1 = the seven-field hash from migration 066 (kept, verified separately, never rewritten). 2 = canonical payload v2, all 25 content columns plus the chain link.';

-- Mark pre-101 rows as v1 and give them the append order 066's trigger used.
--
-- This is the ONE sanctioned UPDATE on security_audit_logs, and it can only
-- run before the immutability trigger exists. Guarded so a hand-run replay
-- skips it rather than being refused by the very trigger this file installs —
-- the error would be correct but baffling.
DO $$
DECLARE
  v_marked bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'security_audit_logs'::regclass
       AND tgname = 'trg_security_audit_no_update'
       AND NOT tgisinternal
  ) THEN
    RAISE NOTICE 'security_audit_logs: immutability trigger already present; skipping the v1 backfill (replay).';
    RETURN;
  END IF;

  -- Reconstruct the v1 append order by FOLLOWING THE HASH LINKS, not by
  -- (timestamp, id).
  --
  -- 066 defaults `timestamp` to now(), which is transaction-start time, so a
  -- multi-row INSERT gives every row the identical timestamp and (timestamp,
  -- id) then degenerates to UUID order — an order that has nothing to do with
  -- the chain. Getting this wrong matters twice over: the v1 report would call
  -- untouched history broken, and the first v2 row would link to the wrong
  -- predecessor, so a correct upgrade would verify as tampered.
  --
  -- The links are the only authority on the order, so walk them: start at
  -- every row whose predecessor is absent (the genesis, or a discontinuity
  -- 066 left behind), then follow previous_hash -> record_hash forward.
  -- Segments are ordered among themselves by (timestamp, id); rows the walk
  -- cannot reach are appended after it in the same order.
  --
  -- Guarded on record_hash being unique among the rows being ordered: without
  -- that the walk has no single successor per row and could cycle.
  IF EXISTS (
    SELECT 1 FROM security_audit_logs
     WHERE chain_seq IS NULL
     GROUP BY record_hash HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'security_audit_logs: duplicate record_hash values in pre-101 history; ordering v1 rows by (timestamp, id) instead of by the chain links.';

    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY "timestamp", id) AS rn
        FROM security_audit_logs
       WHERE chain_seq IS NULL
    )
    UPDATE security_audit_logs s
       SET chain_seq = ordered.rn, hash_version = 1
      FROM ordered
     WHERE s.id = ordered.id;
  ELSE
    WITH RECURSIVE starts AS (
      SELECT s.id, s.record_hash,
             row_number() OVER (ORDER BY s."timestamp", s.id) AS seg
        FROM security_audit_logs s
       WHERE s.chain_seq IS NULL
         AND (s.previous_hash IS NULL
              OR NOT EXISTS (SELECT 1 FROM security_audit_logs p
                              WHERE p.chain_seq IS NULL
                                AND p.record_hash = s.previous_hash))
    ),
    walk AS (
      SELECT id, record_hash, seg, 1::bigint AS pos FROM starts
      UNION ALL
      SELECT n.id, n.record_hash, w.seg, w.pos + 1
        FROM walk w
        JOIN security_audit_logs n
          ON n.chain_seq IS NULL
         AND n.previous_hash = w.record_hash
       -- Depth bound: a crafted cycle cannot run away.
       WHERE w.pos < (SELECT count(*) FROM security_audit_logs WHERE chain_seq IS NULL)
    ),
    ordered AS (
      SELECT s.id,
             row_number() OVER (ORDER BY w.seg NULLS LAST, w.pos NULLS LAST,
                                         s."timestamp", s.id) AS rn
        FROM security_audit_logs s
        LEFT JOIN walk w ON w.id = s.id
       WHERE s.chain_seq IS NULL
    )
    UPDATE security_audit_logs s
       SET chain_seq = ordered.rn, hash_version = 1
      FROM ordered
     WHERE s.id = ordered.id;
  END IF;

  GET DIAGNOSTICS v_marked = ROW_COUNT;

  -- Park the sequence past the backfilled block. Inside this guard on
  -- purpose: on a replay the sequence has already issued values (and
  -- `nextval` burns one per rolled-back append), so setval here would rewind
  -- it and the next append would collide on idx_security_audit_chain_seq.
  PERFORM setval('security_audit_logs_chain_seq',
                 GREATEST((SELECT COALESCE(MAX(chain_seq), 0) FROM security_audit_logs), 1),
                 -- is_called false on an empty table, so the first append gets
                 -- chain_seq 1 rather than 2.
                 (SELECT COUNT(*) > 0 FROM security_audit_logs));

  RAISE NOTICE 'security_audit_logs: marked % pre-existing row(s) as hash_version 1.', v_marked;
END $$;

-- No column DEFAULT on chain_seq on purpose: the trigger assigns it under the
-- advisory lock, and a DEFAULT would burn a second sequence value per append
-- for nothing.
ALTER TABLE security_audit_logs ALTER COLUMN chain_seq    DROP DEFAULT;
ALTER TABLE security_audit_logs ALTER COLUMN hash_version SET DEFAULT 2;
ALTER TABLE security_audit_logs ALTER COLUMN chain_seq    SET NOT NULL;
ALTER TABLE security_audit_logs ALTER COLUMN hash_version SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_security_audit_chain_seq
  ON security_audit_logs (chain_seq);

-- Only versions this file knows how to verify may be stored. A v3 adds itself
-- here and to the verifier in the same migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'security_audit_logs_hash_version_known'
       AND conrelid = 'security_audit_logs'::regclass
  ) THEN
    ALTER TABLE security_audit_logs
      ADD CONSTRAINT security_audit_logs_hash_version_known
      CHECK (hash_version IN (1, 2));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Canonical payload v2 + the record hash.
-- ---------------------------------------------------------------------------

-- Length-prefixed (netstring-style) field encoder.
CREATE OR REPLACE FUNCTION security_audit_hash_field(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN p_value IS NULL THEN '-1:'
           ELSE octet_length(p_value)::text || ':' || p_value
         END;
$$;

COMMENT ON FUNCTION security_audit_hash_field(text) IS
  'Length-prefixed encoding of one audit field, so free text cannot shift bytes across a field boundary. NULL is -1:, the empty string is 0:.';

CREATE OR REPLACE FUNCTION security_audit_canonical_payload_v2(r security_audit_logs)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'helios.security_audit_logs.v2|26|'
      || security_audit_hash_field(r.id::text)
      || security_audit_hash_field(
           to_char(r."timestamp" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
      || security_audit_hash_field(r.actor_id::text)
      || security_audit_hash_field(r.actor_type)
      || security_audit_hash_field(r.actor_email)
      || security_audit_hash_field(r.actor_ip::text)
      || security_audit_hash_field(r.actor_user_agent)
      || security_audit_hash_field(r.action)
      || security_audit_hash_field(r.action_category)
      || security_audit_hash_field(r.target_type)
      || security_audit_hash_field(r.target_id::text)
      || security_audit_hash_field(r.target_identifier)
      || security_audit_hash_field(r.session_id::text)
      || security_audit_hash_field(r.organization_id::text)
      || security_audit_hash_field(r.request_id)
      || security_audit_hash_field(r.ticket_reference)
      || security_audit_hash_field(r.outcome)
      || security_audit_hash_field(r.error_code)
      || security_audit_hash_field(r.error_message)
      || security_audit_hash_field(r.changes_before::text)
      || security_audit_hash_field(r.changes_after::text)
      || security_audit_hash_field(r.risk_score::text)
      || security_audit_hash_field(r.flagged::text)
      || security_audit_hash_field(
           to_char(r.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
      || security_audit_hash_field(r.reviewed_by::text)
      || security_audit_hash_field(r.previous_hash);
$$;

COMMENT ON FUNCTION security_audit_canonical_payload_v2(security_audit_logs) IS
  'Canonical, unambiguous serialisation of a security_audit_logs row: 26 length-prefixed fields (all 25 content columns plus previous_hash). Field list in the header of migration 101. Never edit in place — add a v3.';

-- v1, expressed through 066's own function so there is still exactly one
-- definition of the v1 hash.
CREATE OR REPLACE FUNCTION security_audit_record_hash_v1(r security_audit_logs)
RETURNS varchar(64)
LANGUAGE sql STABLE AS $$
  SELECT calculate_audit_hash(
           r.id, r."timestamp", r.actor_type, r.action,
           r.outcome, r.organization_id, r.previous_hash);
$$;

COMMENT ON FUNCTION security_audit_record_hash_v1(security_audit_logs) IS
  'Recomputes a pre-101 (v1) record_hash via calculate_audit_hash(). STABLE, not IMMUTABLE: v1 casts timestamptz to text, so the result depends on the session TimeZone and DateStyle. That dependence is why v2 exists and why a v1 mismatch is reported apart from ok.';

CREATE OR REPLACE FUNCTION security_audit_record_hash_v2(r security_audit_logs)
RETURNS varchar(64)
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(security_audit_canonical_payload_v2(r)::bytea), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- 4. Append: fill the chain. BEFORE INSERT, serialised.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION security_audit_chain_before_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_previous_hash varchar(64);
BEGIN
  -- Serialise appenders for the whole transaction. Without this, two
  -- concurrent inserts read the same chain head and fork the chain, which is
  -- indistinguishable from tampering at verification time. Key 7741101 is
  -- this migration's number; it is this table's lock and nothing else's.
  PERFORM pg_advisory_xact_lock(7741101);

  -- Any hash_version: the first v2 row links onto the last v1 row, so the
  -- table stays ONE chain and removing the newest v1 row is still detected.
  SELECT record_hash INTO v_previous_hash
    FROM security_audit_logs
   ORDER BY chain_seq DESC
   LIMIT 1;

  -- The chain's framing is the database's to set, never the caller's.
  NEW.chain_seq     := nextval('security_audit_logs_chain_seq');
  NEW.hash_version  := 2;
  NEW.previous_hash := v_previous_hash;
  NEW.record_hash   := security_audit_record_hash_v2(NEW);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_security_audit_chain ON security_audit_logs;
CREATE TRIGGER trg_security_audit_chain
  BEFORE INSERT ON security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION security_audit_chain_before_insert();

-- ---------------------------------------------------------------------------
-- 5. Immutability: UPDATE / DELETE / TRUNCATE all raise, loudly and by name.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION security_audit_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'security_audit_logs is append-only: DELETE rejected (id=%, chain_seq=%)', OLD.id, OLD.chain_seq
      USING ERRCODE = 'integrity_constraint_violation',
            DETAIL  = 'Audit history is immutable and hash-chained; removing this row would break the chain for every row after it.',
            HINT    = 'Nothing in Helios may delete audit rows. Record the correction as a NEW audit event.';
  END IF;

  RAISE EXCEPTION
    'security_audit_logs is append-only: UPDATE rejected (id=%, chain_seq=%)', OLD.id, OLD.chain_seq
    USING ERRCODE = 'integrity_constraint_violation',
          DETAIL  = 'Audit history is immutable and hash-chained; editing this row would invalidate its record_hash.',
          HINT    = 'Nothing in Helios may edit audit rows — including the flagged / reviewed_at / reviewed_by columns. Record the review as a NEW audit event.';
END $$;

CREATE OR REPLACE FUNCTION security_audit_reject_truncate()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_logs is append-only: TRUNCATE rejected'
    USING ERRCODE = 'integrity_constraint_violation',
          DETAIL  = 'Audit history is immutable and hash-chained; TRUNCATE would destroy the whole chain at once.',
          HINT    = 'There is no supported way to clear the audit trail.';
END $$;

-- Two row triggers rather than one combined trigger: the trigger name in the
-- error says which operation was refused, and a forensic exercise can disable
-- one without the other.
DROP TRIGGER IF EXISTS trg_security_audit_no_update ON security_audit_logs;
CREATE TRIGGER trg_security_audit_no_update
  BEFORE UPDATE ON security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION security_audit_reject_mutation();

DROP TRIGGER IF EXISTS trg_security_audit_no_delete ON security_audit_logs;
CREATE TRIGGER trg_security_audit_no_delete
  BEFORE DELETE ON security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION security_audit_reject_mutation();

DROP TRIGGER IF EXISTS trg_security_audit_no_truncate ON security_audit_logs;
CREATE TRIGGER trg_security_audit_no_truncate
  BEFORE TRUNCATE ON security_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION security_audit_reject_truncate();

COMMENT ON TABLE security_audit_logs IS
  'APPEND-ONLY, hash-chained security audit trail. UPDATE / DELETE / TRUNCATE are rejected by trigger and revoked at the table ACL. Verify with SELECT * FROM verify_security_audit_chain(). See migration 101 and docs/features/AUDIT-LOG-INTEGRITY.md.';

-- ---------------------------------------------------------------------------
-- 6. REVOKE as the second layer. A privileged role bypasses one of these two
--    controls, so both exist; neither is relied on alone.
-- ---------------------------------------------------------------------------

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE security_audit_logs FROM PUBLIC;

DO $$
DECLARE
  v_grantee text;
BEGIN
  -- Every role holding an explicit grant, including the owner.
  FOR v_grantee IN
    SELECT DISTINCT pg_get_userbyid(a.grantee)
      FROM pg_class c, aclexplode(c.relacl) a
     WHERE c.oid = 'security_audit_logs'::regclass
       AND a.grantee <> 0                      -- 0 is PUBLIC, handled above
       AND a.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE security_audit_logs FROM %I', v_grantee);
    RAISE NOTICE 'security_audit_logs: revoked UPDATE/DELETE/TRUNCATE from %', v_grantee;
  END LOOP;

  -- The owner's privileges are implicit when relacl IS NULL, so the loop above
  -- may not have seen them.
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE security_audit_logs FROM %I',
                 pg_get_userbyid((SELECT relowner FROM pg_class
                                   WHERE oid = 'security_audit_logs'::regclass)));

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
    RAISE WARNING 'security_audit_logs: % is a SUPERUSER, which bypasses table ACLs entirely. The immutability TRIGGERS are the enforcing control on this install; the hash chain keeps tampering detectable. Run Helios as a non-superuser role to make the ACL bite too — see docs/features/AUDIT-LOG-INTEGRITY.md.', current_user;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Verification: walk the chain, report the FIRST break with its row id.
--
-- `ok` covers the v2 segment and its link back into v1 history. The v1 segment
-- is reported in its own columns and never feeds `ok` — see the header.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION verify_security_audit_chain(
  p_from_seq         bigint DEFAULT NULL,
  p_legacy_timezone  text   DEFAULT NULL
)
RETURNS TABLE (
  ok                            boolean,
  checked_v2_rows               bigint,
  v2_start_seq                  bigint,
  v2_end_seq                    bigint,
  first_break_id                uuid,
  first_break_seq               bigint,
  first_break_at                timestamptz,
  first_break_reason            text,
  legacy_v1_rows                bigint,
  legacy_v1_verified            bigint,
  legacy_v1_unverified          bigint,
  legacy_v1_first_issue_id      uuid,
  legacy_v1_first_issue_reason  text
)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  r                 security_audit_logs;
  v_expected        varchar(64);
  v_recomputed      varchar(64);
  v_checked         bigint := 0;
  v_start           bigint;
  v_end             bigint;
  v_break_id        uuid;
  v_break_seq       bigint;
  v_break_at        timestamptz;
  v_break_reason    text;
  v_legacy          bigint := 0;
  v_legacy_ok       bigint := 0;
  v_legacy_bad      bigint := 0;
  v_legacy_id       uuid;
  v_legacy_reason   text;
  v_prev_tz         text;
BEGIN
  -- ---- v1 segment: informational, reported apart from ok -----------------
  --
  -- p_legacy_timezone reproduces the TimeZone the v1 rows were written under
  -- (a default install writes under UTC). set_config(..., true) is
  -- transaction-local; the previous value is restored below.
  IF p_legacy_timezone IS NOT NULL THEN
    v_prev_tz := current_setting('TimeZone');
    PERFORM set_config('TimeZone', p_legacy_timezone, true);
  END IF;

  v_expected := NULL;
  FOR r IN
    SELECT * FROM security_audit_logs
     WHERE hash_version = 1
     ORDER BY chain_seq
  LOOP
    v_legacy := v_legacy + 1;

    IF r.previous_hash IS DISTINCT FROM v_expected THEN
      v_legacy_bad := v_legacy_bad + 1;
      IF v_legacy_id IS NULL THEN
        v_legacy_id := r.id;
        -- Distinguish the two causes. A FORK — this row's predecessor is a row
        -- that is still present, just not the one in front of it — is what
        -- 066's lock-free append produces for concurrent or batched writes,
        -- and is not evidence of anything. An ORPHAN link points at a hash no
        -- row carries, which does mean a row is missing.
        IF EXISTS (SELECT 1 FROM security_audit_logs p
                    WHERE p.hash_version = 1 AND p.record_hash = r.previous_hash) THEN
          v_legacy_reason := format(
            'legacy_v1_fork: previous_hash=%s is a row that is present but is not this row''s predecessor in chain order. Migration 066 chose the predecessor without a lock, so concurrent or batched appends fork the chain legitimately — not proof of tampering.',
            r.previous_hash);
        ELSE
          v_legacy_reason := format(
            'legacy_v1_orphan_link: previous_hash=%s matches no row in v1 history (expected %s), so a row before this one is missing.',
            COALESCE(r.previous_hash, '<none>'), COALESCE(v_expected, '<none>'));
        END IF;
      END IF;
    ELSIF security_audit_record_hash_v1(r) IS DISTINCT FROM r.record_hash THEN
      v_legacy_bad := v_legacy_bad + 1;
      IF v_legacy_id IS NULL THEN
        v_legacy_id := r.id;
        v_legacy_reason := format(
          'legacy_v1_record_hash_mismatch: stored=%s recomputed=%s. Migration 066 hashed timestamptz::text, so a TimeZone/DateStyle different from the writing session also produces this — pass p_legacy_timezone before reading it as tampering.',
          r.record_hash, security_audit_record_hash_v1(r));
      END IF;
    ELSE
      v_legacy_ok := v_legacy_ok + 1;
    END IF;

    v_expected := r.record_hash;
  END LOOP;

  IF p_legacy_timezone IS NOT NULL THEN
    PERFORM set_config('TimeZone', v_prev_tz, true);
  END IF;

  -- ---- v2 segment: this is what ok means ---------------------------------
  --
  -- Seeded with the last v1 record_hash (or NULL when there is none), so a
  -- removed newest-v1 row is caught at the v2 genesis.
  IF p_from_seq IS NOT NULL THEN
    -- Partial verification from a known-good point: trust that row's own
    -- previous_hash as the seed. Content hashes are still checked.
    SELECT previous_hash INTO v_expected
      FROM security_audit_logs
     WHERE hash_version = 2 AND chain_seq >= p_from_seq
     ORDER BY chain_seq
     LIMIT 1;
  END IF;

  FOR r IN
    SELECT * FROM security_audit_logs
     WHERE hash_version = 2
       AND (p_from_seq IS NULL OR chain_seq >= p_from_seq)
     ORDER BY chain_seq
  LOOP
    IF v_start IS NULL THEN
      v_start := r.chain_seq;
    END IF;
    v_end     := r.chain_seq;
    v_checked := v_checked + 1;

    -- (a) The link. Catches a DELETED row: the successor still points at the
    --     hash of a row that is no longer in front of it.
    IF r.previous_hash IS DISTINCT FROM v_expected THEN
      v_break_id     := r.id;
      v_break_seq    := r.chain_seq;
      v_break_at     := r."timestamp";
      v_break_reason := format(
        'chain_link_mismatch: row previous_hash=%s but predecessor record_hash=%s (a row before this one was removed or altered)',
        COALESCE(r.previous_hash, '<genesis>'), COALESCE(v_expected, '<genesis>'));
      EXIT;
    END IF;

    -- (b) The content. Catches an EDITED row.
    v_recomputed := security_audit_record_hash_v2(r);
    IF v_recomputed <> r.record_hash THEN
      v_break_id     := r.id;
      v_break_seq    := r.chain_seq;
      v_break_at     := r."timestamp";
      v_break_reason := format(
        'record_hash_mismatch: stored=%s recomputed=%s (this row''s contents were altered)',
        r.record_hash, v_recomputed);
      EXIT;
    END IF;

    v_expected := r.record_hash;
  END LOOP;

  RETURN QUERY SELECT
    v_break_reason IS NULL,
    v_checked,
    v_start,
    v_end,
    v_break_id,
    v_break_seq,
    v_break_at,
    v_break_reason,
    v_legacy,
    v_legacy_ok,
    v_legacy_bad,
    v_legacy_id,
    v_legacy_reason;
END $$;

COMMENT ON FUNCTION verify_security_audit_chain(bigint, text) IS
  'Walks the security_audit_logs hash chain in chain_seq order. ok covers the v2 segment (migration 101) and its link back into v1 history, and names the FIRST break with its row id and reason (chain_link_mismatch | record_hash_mismatch). Pre-101 v1 rows are recomputed through calculate_audit_hash() and reported in the legacy_v1_* columns only, because v1 serialisation is timezone-dependent and its appends were lock-free. Pass p_from_seq to verify a suffix from a known-good point, p_legacy_timezone to reproduce the TimeZone v1 rows were written under.';

-- ---------------------------------------------------------------------------
-- 8. Record the boundary between v1 and v2, once.
--
-- This row is the v2 genesis. Its own previous_hash is the last v1
-- record_hash, so the two segments are one chain.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org_id  uuid;
  v_legacy  bigint;
  v_newest  timestamptz;
BEGIN
  SELECT COUNT(*), MAX("timestamp") INTO v_legacy, v_newest
    FROM security_audit_logs WHERE hash_version = 1;

  IF v_legacy = 0 THEN
    RAISE NOTICE 'security_audit_logs: no pre-existing rows; the v2 chain starts with the first append.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM security_audit_logs WHERE action = 'audit.chain.v2.initialised') THEN
    RAISE NOTICE 'security_audit_logs: v1/v2 boundary already recorded.';
    RETURN;
  END IF;

  -- organization_id is nullable since migration 068, so this does not depend
  -- on an organization existing.
  SELECT id INTO v_org_id FROM organizations ORDER BY created_at NULLS LAST, id LIMIT 1;

  INSERT INTO security_audit_logs (
    actor_type, action, action_category, target_type, target_identifier,
    organization_id, outcome, changes_after
  ) VALUES (
    'system', 'audit.chain.v2.initialised', 'security',
    'security_audit_logs', 'security_audit_logs',
    v_org_id, 'success',
    jsonb_build_object(
      'migration', '101_security_audit_logs_append_only',
      'hash_version', 2,
      'canonical_payload', 'helios.security_audit_logs.v2',
      'legacy_v1_rows', v_legacy,
      'newest_v1_row_at', v_newest,
      'note', 'Rows before this one were hashed by migration 066 over seven fields with a timezone-dependent, separator-joined payload. They are kept and verified as v1, and reported apart from ok.'
    )
  );

  RAISE NOTICE 'security_audit_logs: v2 genesis recorded; % v1 row(s) kept.', v_legacy;
END $$;
