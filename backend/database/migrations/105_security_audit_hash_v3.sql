-- 105_security_audit_hash_v3.sql
--
-- Canonical payload v3 for `security_audit_logs`: the same 26 length-prefixed
-- fields as v2 (migration 101), hashed over the payload's UTF-8 bytes.
--
-- WHY A NEW VERSION
-- -----------------
-- v2 turned the payload into bytes with a text-to-bytea CAST:
--
--     sha256(security_audit_canonical_payload_v2(r)::bytea)
--
-- That cast does not encode text. It PARSES it as bytea input, where a
-- backslash starts an escape sequence: `\\` becomes one backslash, `\ooo`
-- becomes the byte with that octal value, and any other sequence is rejected
-- with "invalid input syntax for type bytea". Two consequences:
--
--   * a row whose payload contains a backslash that is not a valid escape
--     cannot be hashed, so the insert is refused. jsonb text escapes a double
--     quote inside a string as `\"`, so this includes any `changes_before` /
--     `changes_after` value holding a quoted string;
--   * where the escape IS valid, two different payloads can hash alike
--     (`\\` and `\134` both become a single backslash byte).
--
-- v3 uses `convert_to(payload, 'UTF8')`, which encodes the text as it is. Every
-- payload hashes, and distinct payloads give distinct byte strings.
--
-- WHAT HAPPENS TO EXISTING ROWS
-- -----------------------------
-- Nothing. As in 101, stored hashes are never rewritten:
--
--   * v1 rows (pre-101) stay v1 and are reported in the legacy_v1_* columns;
--   * v2 rows stay v2 and are still recomputed with the v2 function. Every v2
--     row that exists was hashable under v2, so it recomputes the same way;
--   * rows appended from now on are `hash_version = 3`;
--   * the first v3 row links to the last existing row's `record_hash`, so the
--     table is still one chain.
--
-- `verify_security_audit_chain()` keeps its signature and column names. Its
-- `ok` now covers every row with `hash_version >= 2`, each recomputed with its
-- own version's function. The column names still say "v2" (`checked_v2_rows`,
-- `v2_start_seq`, `v2_end_seq`); read them as "the chained segment". Renaming
-- them would change the function's return type for no gain to a caller.
--
-- The payload layout is unchanged apart from its version tag
-- ('helios.security_audit_logs.v3'). The field list is in 101's header.
--
-- Idempotent: CREATE OR REPLACE, guarded DO blocks.

-- ---------------------------------------------------------------------------
-- 1. Allow hash_version 3.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'security_audit_logs_hash_version_known'
       AND conrelid = 'security_audit_logs'::regclass
       AND pg_get_constraintdef(oid) NOT LIKE '%3%'
  ) THEN
    ALTER TABLE security_audit_logs
      DROP CONSTRAINT security_audit_logs_hash_version_known;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'security_audit_logs_hash_version_known'
       AND conrelid = 'security_audit_logs'::regclass
  ) THEN
    ALTER TABLE security_audit_logs
      ADD CONSTRAINT security_audit_logs_hash_version_known
      CHECK (hash_version IN (1, 2, 3));
  END IF;
END $$;

ALTER TABLE security_audit_logs ALTER COLUMN hash_version SET DEFAULT 3;

COMMENT ON COLUMN security_audit_logs.hash_version IS
  '1 = the seven-field hash from migration 066 (kept, verified separately, never rewritten). 2 = canonical payload v2 from migration 101, hashed through a text-to-bytea cast (kept, still verified as v2). 3 = the same 26 fields hashed over the payload''s UTF-8 bytes (migration 105); all new rows.';

-- ---------------------------------------------------------------------------
-- 2. Canonical payload v3 + the record hash.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION security_audit_canonical_payload_v3(r security_audit_logs)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'helios.security_audit_logs.v3|26|'
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

COMMENT ON FUNCTION security_audit_canonical_payload_v3(security_audit_logs) IS
  'Canonical serialisation of a security_audit_logs row, version 3: the same 26 length-prefixed fields as v2 under its own version tag. Field list in the header of migration 101. Never edit in place — add a v4.';

CREATE OR REPLACE FUNCTION security_audit_record_hash_v3(r security_audit_logs)
RETURNS varchar(64)
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(security_audit_canonical_payload_v3(r), 'UTF8')), 'hex');
$$;

COMMENT ON FUNCTION security_audit_record_hash_v3(security_audit_logs) IS
  'sha256 over the UTF-8 bytes of canonical payload v3. convert_to encodes the text as it is; the v2 function cast text to bytea, which parses backslash escapes instead.';

COMMENT ON FUNCTION security_audit_record_hash_v2(security_audit_logs) IS
  'Record hash for hash_version 2 rows (migration 101). Superseded by security_audit_record_hash_v3 for new rows; retained as the only definition of v2 so existing rows stay checkable. Do not use for new writes.';

-- One place that knows which function belongs to which version.
CREATE OR REPLACE FUNCTION security_audit_record_hash(r security_audit_logs)
RETURNS varchar(64)
LANGUAGE sql STABLE AS $$
  SELECT CASE r.hash_version
           WHEN 3 THEN security_audit_record_hash_v3(r)
           WHEN 2 THEN security_audit_record_hash_v2(r)
           WHEN 1 THEN security_audit_record_hash_v1(r)
         END;
$$;

COMMENT ON FUNCTION security_audit_record_hash(security_audit_logs) IS
  'Recomputes a row''s record_hash with the function for its own hash_version. NULL for a version nothing verifies (the CHECK constraint refuses those).';

-- ---------------------------------------------------------------------------
-- 3. Append: new rows are v3.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION security_audit_chain_before_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_previous_hash varchar(64);
BEGIN
  -- Same lock and same head read as migration 101; only the version changes.
  PERFORM pg_advisory_xact_lock(7741101);

  SELECT record_hash INTO v_previous_hash
    FROM security_audit_logs
   ORDER BY chain_seq DESC
   LIMIT 1;

  NEW.chain_seq     := nextval('security_audit_logs_chain_seq');
  NEW.hash_version  := 3;
  NEW.previous_hash := v_previous_hash;
  NEW.record_hash   := security_audit_record_hash_v3(NEW);

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Verification: every chained row, each with its own version's hash.
--
-- Same signature and return columns as 101, so CREATE OR REPLACE applies and
-- no caller changes.
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
  -- ---- v1 segment: informational, reported apart from ok (unchanged) ------
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

  -- ---- chained segment (hash_version >= 2): this is what ok means ---------
  --
  -- Seeded with the last v1 record_hash (or NULL when there is none), so a
  -- removed newest-v1 row is caught at the first chained row. v2 and v3 rows
  -- are one sequence here: the first v3 row's previous_hash is the last v2
  -- row's record_hash.
  IF p_from_seq IS NOT NULL THEN
    SELECT previous_hash INTO v_expected
      FROM security_audit_logs
     WHERE hash_version >= 2 AND chain_seq >= p_from_seq
     ORDER BY chain_seq
     LIMIT 1;
  END IF;

  FOR r IN
    SELECT * FROM security_audit_logs
     WHERE hash_version >= 2
       AND (p_from_seq IS NULL OR chain_seq >= p_from_seq)
     ORDER BY chain_seq
  LOOP
    IF v_start IS NULL THEN
      v_start := r.chain_seq;
    END IF;
    v_end     := r.chain_seq;
    v_checked := v_checked + 1;

    -- (a) The link. Catches a DELETED row.
    IF r.previous_hash IS DISTINCT FROM v_expected THEN
      v_break_id     := r.id;
      v_break_seq    := r.chain_seq;
      v_break_at     := r."timestamp";
      v_break_reason := format(
        'chain_link_mismatch: row previous_hash=%s but predecessor record_hash=%s (a row before this one was removed or altered)',
        COALESCE(r.previous_hash, '<genesis>'), COALESCE(v_expected, '<genesis>'));
      EXIT;
    END IF;

    -- (b) The content, with the function for this row's own version. A v2 row
    --     edited into something the v2 cast cannot parse raises instead of
    --     returning a hash; that is a content break, not a verifier failure.
    BEGIN
      v_recomputed := security_audit_record_hash(r);
    EXCEPTION WHEN OTHERS THEN
      v_recomputed := NULL;
    END;

    IF v_recomputed IS DISTINCT FROM r.record_hash THEN
      v_break_id     := r.id;
      v_break_seq    := r.chain_seq;
      v_break_at     := r."timestamp";
      v_break_reason := format(
        'record_hash_mismatch: stored=%s recomputed=%s (this row''s contents were altered)',
        r.record_hash, COALESCE(v_recomputed, '<not computable>'));
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
  'Walks the security_audit_logs hash chain in chain_seq order. ok covers every row with hash_version >= 2 (migrations 101 and 105), each recomputed with its own version''s function, plus the link back into v1 history; it names the FIRST break with its row id and reason (chain_link_mismatch | record_hash_mismatch). The checked_v2_rows / v2_start_seq / v2_end_seq columns keep their names from 101 and describe that whole chained segment. Pre-101 v1 rows are reported in the legacy_v1_* columns only. Pass p_from_seq to verify a suffix from a known-good point, p_legacy_timezone to reproduce the TimeZone v1 rows were written under.';

-- ---------------------------------------------------------------------------
-- 5. Record the boundary between v2 and v3, once.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_org_id  uuid;
  v_older   bigint;
BEGIN
  SELECT COUNT(*) INTO v_older FROM security_audit_logs WHERE hash_version < 3;

  IF v_older = 0 THEN
    RAISE NOTICE 'security_audit_logs: no earlier rows; the v3 chain starts with the first append.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM security_audit_logs WHERE action = 'audit.chain.v3.initialised') THEN
    RAISE NOTICE 'security_audit_logs: v3 boundary already recorded.';
    RETURN;
  END IF;

  SELECT id INTO v_org_id FROM organizations ORDER BY created_at NULLS LAST, id LIMIT 1;

  INSERT INTO security_audit_logs (
    actor_type, action, action_category, target_type, target_identifier,
    organization_id, outcome, changes_after
  ) VALUES (
    'system', 'audit.chain.v3.initialised', 'security',
    'security_audit_logs', 'security_audit_logs',
    v_org_id, 'success',
    jsonb_build_object(
      'migration', '105_security_audit_hash_v3',
      'hash_version', 3,
      'canonical_payload', 'helios.security_audit_logs.v3',
      'earlier_rows', v_older,
      'note', 'Rows before this one keep the hash version they were written under and are verified with that version.'
    )
  );

  RAISE NOTICE 'security_audit_logs: v3 boundary recorded; % earlier row(s) kept.', v_older;
END $$;
