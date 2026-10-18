-- Integration test: security_audit_logs is append-only and tamper-evident
-- (migration 101).
--
-- Spec: openspec/changes/enforce-audit-log-append-only/proposal.md
-- Run via: scripts/test-db.sh audit-immutability
--
-- These cases PROVE the guarantees rather than assert that the DDL exists:
-- every one performs the forbidden operation and checks what the database does
-- about it. T07, T08 and T12 tamper using the ELEVATED role (disabling a guard
-- trigger, which only the table's owner or a superuser can do), because a test
-- that only tries what the application role can do would prove nothing about
-- detection.
--
-- Self-sufficient: writes rows with organization_id NULL (legal since
-- migration 068, and it keeps the test off the single-organization invariant),
-- and scopes verification to the rows it wrote (p_from_seq) so it passes on a
-- database that already holds real history.

\set ON_ERROR_STOP on
\set VERBOSITY terse

BEGIN;

DO $$
DECLARE
  v_start_seq bigint;
  v_id1       uuid;
  v_id2       uuid;
  v_id3       uuid;
  v_seq1      bigint;
  v_seq2      bigint;
  v_seq3      bigint;
  v_hash1     varchar(64);
  v_hash2     varchar(64);
  v_prev2     varchar(64);
  v_hv        smallint;
  v_caught    text;
  v_ok        boolean;
  v_break_id  uuid;
  v_reason    text;
  v_checked   bigint;
  v_count     int;
BEGIN
  v_start_seq := COALESCE((SELECT MAX(chain_seq) FROM security_audit_logs), 0) + 1;

  -- =========================================================================
  -- T01: an ordinary append still works, and the database fills the chain
  --      framing itself.
  -- =========================================================================
  INSERT INTO security_audit_logs (actor_type, action, action_category, outcome, target_type, target_identifier)
    VALUES ('user', 'test.append.one', 'security', 'success', 'user', 'U-1')
    RETURNING id, chain_seq, hash_version, record_hash INTO v_id1, v_seq1, v_hv, v_hash1;

  ASSERT v_id1 IS NOT NULL,     'T01: insert returned no id';
  ASSERT v_seq1 IS NOT NULL,    'T01: chain_seq was not assigned';
  ASSERT v_hv = 2,              format('T01: expected hash_version 2, got %s', v_hv);
  ASSERT v_hash1 IS NOT NULL,   'T01: record_hash was not computed';
  ASSERT length(v_hash1) = 64,  format('T01: record_hash is not 64 hex chars: %s', v_hash1);

  -- =========================================================================
  -- T02: a second append links to the first, and the verifier walks it clean.
  -- =========================================================================
  INSERT INTO security_audit_logs (actor_type, action, action_category, outcome)
    VALUES ('user', 'test.append.two', 'admin', 'failure')
    RETURNING id, chain_seq, previous_hash, record_hash INTO v_id2, v_seq2, v_prev2, v_hash2;

  ASSERT v_prev2 = v_hash1,
    format('T02: previous_hash should be the first row''s record_hash. got=%s want=%s', v_prev2, v_hash1);
  ASSERT v_seq2 > v_seq1, 'T02: chain_seq did not advance';

  INSERT INTO security_audit_logs (actor_type, action, action_category, outcome)
    VALUES ('system', 'test.append.three', 'sync', 'success')
    RETURNING id, chain_seq INTO v_id3, v_seq3;

  SELECT ok, checked_v2_rows, first_break_reason
    INTO v_ok, v_checked, v_reason
    FROM verify_security_audit_chain(v_start_seq);
  ASSERT v_ok, format('T02: verifier reported a break on a clean chain: %s', v_reason);
  ASSERT v_checked = 3, format('T02: expected 3 rows checked, got %s', v_checked);

  -- =========================================================================
  -- T03: UPDATE is refused, by the database, with a clear error. Migration
  --      066's rule returned "UPDATE 0" instead, which a caller that does not
  --      read row counts cannot tell from success.
  -- =========================================================================
  v_caught := 'no error';
  BEGIN
    UPDATE security_audit_logs SET action = 'test.tampered' WHERE id = v_id1;
    v_caught := 'UPDATE SUCCEEDED (BAD)';
  EXCEPTION WHEN integrity_constraint_violation THEN
    v_caught := SQLERRM;
  END;
  ASSERT v_caught LIKE '%append-only%' AND v_caught LIKE '%UPDATE rejected%',
    format('T03: expected an append-only UPDATE refusal, got: %s', v_caught);

  SELECT COUNT(*) INTO v_count
    FROM security_audit_logs WHERE id = v_id1 AND action = 'test.append.one';
  ASSERT v_count = 1, 'T03: the row changed despite the refusal';

  -- =========================================================================
  -- T04: DELETE is refused.
  -- =========================================================================
  v_caught := 'no error';
  BEGIN
    DELETE FROM security_audit_logs WHERE id = v_id2;
    v_caught := 'DELETE SUCCEEDED (BAD)';
  EXCEPTION WHEN integrity_constraint_violation THEN
    v_caught := SQLERRM;
  END;
  ASSERT v_caught LIKE '%append-only%' AND v_caught LIKE '%DELETE rejected%',
    format('T04: expected an append-only DELETE refusal, got: %s', v_caught);

  SELECT COUNT(*) INTO v_count FROM security_audit_logs WHERE id = v_id2;
  ASSERT v_count = 1, 'T04: the row was deleted despite the refusal';

  -- =========================================================================
  -- T05: TRUNCATE is refused — the one statement that would erase the whole
  --      chain at once, and the one no rule ever covered.
  -- =========================================================================
  v_caught := 'no error';
  BEGIN
    EXECUTE 'TRUNCATE TABLE security_audit_logs';
    v_caught := 'TRUNCATE SUCCEEDED (BAD)';
  EXCEPTION WHEN integrity_constraint_violation THEN
    v_caught := SQLERRM;
  END;
  ASSERT v_caught LIKE '%TRUNCATE rejected%',
    format('T05: expected an append-only TRUNCATE refusal, got: %s', v_caught);

  -- =========================================================================
  -- T06: the second layer — no role holds UPDATE/DELETE/TRUNCATE in the table
  --      ACL. (A superuser bypasses ACLs, which is why T03-T05 exist too.)
  -- =========================================================================
  SELECT COUNT(*) INTO v_count
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.oid = 'security_audit_logs'::regclass
     AND a.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  ASSERT v_count = 0,
    format('T06: %s UPDATE/DELETE/TRUNCATE grant(s) still present on security_audit_logs', v_count);

  -- The 066 rules must be GONE, or the BEFORE UPDATE trigger never fires and
  -- the refusal above is a rule swallowing the statement rather than a raise.
  SELECT COUNT(*) INTO v_count FROM pg_rules WHERE tablename = 'security_audit_logs';
  ASSERT v_count = 0,
    format('T06: %s DO INSTEAD rule(s) still on security_audit_logs', v_count);

  -- =========================================================================
  -- T07: ELEVATED-ROLE TAMPER. Disable the guard trigger, edit a row, and
  --      prove the verifier names that row.
  -- =========================================================================
  EXECUTE 'ALTER TABLE security_audit_logs DISABLE TRIGGER trg_security_audit_no_update';
  UPDATE security_audit_logs SET target_identifier = 'quietly-rewritten' WHERE id = v_id1;
  EXECUTE 'ALTER TABLE security_audit_logs ENABLE TRIGGER trg_security_audit_no_update';

  SELECT ok, first_break_id, first_break_reason
    INTO v_ok, v_break_id, v_reason
    FROM verify_security_audit_chain(v_start_seq);
  ASSERT NOT v_ok, 'T07: verifier did not notice an edited row';
  ASSERT v_break_id = v_id1,
    format('T07: verifier blamed the wrong row. got=%s want=%s', v_break_id, v_id1);
  ASSERT v_reason LIKE 'record_hash_mismatch%',
    format('T07: expected record_hash_mismatch, got: %s', v_reason);

  -- Put it back so T08 starts from a clean chain.
  EXECUTE 'ALTER TABLE security_audit_logs DISABLE TRIGGER trg_security_audit_no_update';
  UPDATE security_audit_logs SET target_identifier = 'U-1' WHERE id = v_id1;
  EXECUTE 'ALTER TABLE security_audit_logs ENABLE TRIGGER trg_security_audit_no_update';
  SELECT ok INTO v_ok FROM verify_security_audit_chain(v_start_seq);
  ASSERT v_ok, 'T07: restoring the original value did not restore the chain';

  -- =========================================================================
  -- T08: ELEVATED-ROLE DELETE. A removed row is still detected, because its
  --      successor points at a hash that is no longer in front of it.
  -- =========================================================================
  EXECUTE 'ALTER TABLE security_audit_logs DISABLE TRIGGER trg_security_audit_no_delete';
  DELETE FROM security_audit_logs WHERE id = v_id2;
  EXECUTE 'ALTER TABLE security_audit_logs ENABLE TRIGGER trg_security_audit_no_delete';

  SELECT COUNT(*) INTO v_count FROM security_audit_logs WHERE id = v_id2;
  ASSERT v_count = 0, 'T08: setup failed, the row was not actually removed';

  SELECT ok, first_break_id, first_break_reason
    INTO v_ok, v_break_id, v_reason
    FROM verify_security_audit_chain(v_start_seq);
  ASSERT NOT v_ok, 'T08: verifier did not notice a deleted row';
  ASSERT v_break_id = v_id3,
    format('T08: break should be reported at the successor row. got=%s want=%s', v_break_id, v_id3);
  ASSERT v_reason LIKE 'chain_link_mismatch%',
    format('T08: expected chain_link_mismatch, got: %s', v_reason);

  RAISE NOTICE 'T01-T08 passed (append, chain, UPDATE/DELETE/TRUNCATE refused, ACL + no rules, tamper and delete detected)';
END $$;

-- ===========================================================================
-- T09: the canonical payload is UNAMBIGUOUS. Two rows whose free-text fields
--      differ only in where a '|' sits must hash differently — the case
--      migration 066's bare pipe-joined payload cannot distinguish.
-- ===========================================================================
DO $$
DECLARE
  v_a text;
  v_b text;
BEGIN
  v_a := security_audit_hash_field('a|b') || security_audit_hash_field('c');
  v_b := security_audit_hash_field('a')   || security_audit_hash_field('b|c');
  ASSERT v_a <> v_b, format('T09: field encoding is ambiguous: %s == %s', v_a, v_b);

  -- NULL and the empty string are distinct inputs and must stay distinct.
  ASSERT security_audit_hash_field(NULL) = '-1:', 'T09: NULL encoding changed';
  ASSERT security_audit_hash_field('')   = '0:',  'T09: empty-string encoding changed';

  RAISE NOTICE 'T09 passed (length-prefixed payload is unambiguous)';
END $$;

-- ===========================================================================
-- T10: only a hash version the verifier knows may be stored, even with the
--      insert trigger out of the way — so a row cannot be parked under a
--      version nothing checks.
-- ===========================================================================
DO $$
DECLARE
  v_caught text := 'no error';
BEGIN
  EXECUTE 'ALTER TABLE security_audit_logs DISABLE TRIGGER trg_security_audit_chain';
  BEGIN
    INSERT INTO security_audit_logs (actor_type, action, action_category, outcome,
                                     chain_seq, hash_version, record_hash)
      VALUES ('system', 'test.unknown.version', 'security', 'success',
              nextval('security_audit_logs_chain_seq'), 3, repeat('a', 64));
    v_caught := 'INSERT SUCCEEDED (BAD)';
  EXCEPTION WHEN check_violation THEN
    v_caught := 'check_violation';
  END;
  EXECUTE 'ALTER TABLE security_audit_logs ENABLE TRIGGER trg_security_audit_chain';

  ASSERT v_caught = 'check_violation',
    format('T10: expected check_violation for hash_version 3, got: %s', v_caught);

  RAISE NOTICE 'T10 passed (unknown hash_version refused)';
END $$;

-- ===========================================================================
-- T11: the hash really does cover every column it claims to. For each of the
--      26 fields in canonical payload v2, change ONLY that field and check the
--      recomputed hash changes. "All columns" is a claim; this is the check.
--
--      Done by round-tripping the row through jsonb rather than by UPDATEing
--      the table, so no guard trigger has to be disabled.
-- ===========================================================================
DO $$
DECLARE
  v_id        uuid;
  v_base      varchar(64);
  v_new       varchar(64);
  v_field     text;
  v_value     jsonb;
  v_uncovered text := '';
  v_mutations jsonb;
BEGIN
  INSERT INTO security_audit_logs (
    actor_id, actor_type, actor_email, actor_ip, actor_user_agent,
    action, action_category,
    target_type, target_id, target_identifier,
    session_id, organization_id, request_id, ticket_reference,
    outcome, error_code, error_message,
    changes_before, changes_after,
    risk_score, flagged
  ) VALUES (
    gen_random_uuid(), 'user', 'a@b.c', '10.0.0.1'::inet, 'curl/8',
    'test.coverage.base', 'admin',
    'user', gen_random_uuid(), 'U-cov',
    gen_random_uuid(), NULL, 'req-1', 'TKT-1',
    'success', 'E1', 'none',
    '{"o":1}'::jsonb, '{"n":1}'::jsonb,
    10, true
  ) RETURNING id INTO v_id;

  SELECT record_hash INTO v_base FROM security_audit_logs WHERE id = v_id;

  -- field -> a different value of the right type
  v_mutations := jsonb_build_object(
    'id',                to_jsonb(gen_random_uuid()),
    'timestamp',         to_jsonb((SELECT "timestamp" + interval '1 microsecond'
                                     FROM security_audit_logs WHERE id = v_id)),
    'actor_id',          to_jsonb(gen_random_uuid()),
    'actor_type',        to_jsonb('service'::text),
    'actor_email',       to_jsonb('x@y.z'::text),
    'actor_ip',          to_jsonb('10.0.0.9'::text),
    'actor_user_agent',  to_jsonb('wget/1'::text),
    'action',            to_jsonb('test.coverage.other'::text),
    'action_category',   to_jsonb('data'::text),
    'target_type',       to_jsonb('group'::text),
    'target_id',         to_jsonb(gen_random_uuid()),
    'target_identifier', to_jsonb('renamed'::text),
    'session_id',        to_jsonb(gen_random_uuid()),
    'organization_id',   to_jsonb(gen_random_uuid()),
    'request_id',        to_jsonb('req-2'::text),
    'ticket_reference',  to_jsonb('TKT-2'::text),
    'outcome',           to_jsonb('failure'::text),
    'error_code',        to_jsonb('E2'::text),
    'error_message',     to_jsonb('boom'::text),
    'changes_before',    '{"o":2}'::jsonb,
    'changes_after',     '{"n":2}'::jsonb,
    'risk_score',        to_jsonb(11),
    'flagged',           to_jsonb(false),
    'reviewed_at',       to_jsonb(now()),
    'reviewed_by',       to_jsonb(gen_random_uuid()),
    'previous_hash',     to_jsonb(repeat('f', 64))
  );

  FOR v_field, v_value IN SELECT * FROM jsonb_each(v_mutations) LOOP
    SELECT security_audit_record_hash_v2(
             jsonb_populate_record(s, to_jsonb(s) || jsonb_build_object(v_field, v_value)))
      INTO v_new
      FROM security_audit_logs s
     WHERE s.id = v_id;

    IF v_new = v_base THEN
      v_uncovered := v_uncovered || ' ' || v_field;
    END IF;
  END LOOP;

  ASSERT v_uncovered = '',
    format('T11: these columns are NOT covered by the hash:%s', v_uncovered);

  ASSERT (SELECT COUNT(*) FROM jsonb_object_keys(v_mutations)) = 26,
    'T11: the mutation set must cover all 26 fields of canonical payload v2';

  RAISE NOTICE 'T11 passed (all 26 payload v2 fields change the hash)';
END $$;

-- ===========================================================================
-- T12: a pre-101 (v1) row stays verifiable AS v1, and is reported in its own
--      columns rather than folded into ok. Written the way migration 066
--      wrote it — through calculate_audit_hash(), with the insert trigger out
--      of the way, which needs the elevated role.
-- ===========================================================================
DO $$
DECLARE
  v_id        uuid;
  v_stored    varchar(64);
  v_v1        bigint;
  v_v1_ok     bigint;
  v_v1_other  bigint;
  v_tz_before text;
BEGIN
  v_id := gen_random_uuid();

  -- 066's trigger computed the hash from the values it was about to insert, so
  -- do the same here: supply id and timestamp, hash them, insert once. No
  -- UPDATE is needed, which keeps the immutability guard in place throughout.
  EXECUTE 'ALTER TABLE security_audit_logs DISABLE TRIGGER trg_security_audit_chain';
  INSERT INTO security_audit_logs (id, "timestamp", actor_type, action, action_category, outcome,
                                   chain_seq, hash_version, previous_hash, record_hash)
    VALUES (v_id, now(), 'user', 'test.legacy.v1', 'auth', 'success',
            nextval('security_audit_logs_chain_seq'), 1, NULL,
            calculate_audit_hash(v_id, now(), 'user', 'test.legacy.v1', 'success', NULL, NULL));
  EXECUTE 'ALTER TABLE security_audit_logs ENABLE TRIGGER trg_security_audit_chain';

  SELECT record_hash INTO v_stored FROM security_audit_logs WHERE id = v_id;

  -- The v1 branch reproduces it, from the stored row alone.
  ASSERT (SELECT security_audit_record_hash_v1(s) = v_stored
            FROM security_audit_logs s WHERE s.id = v_id),
    'T12: the v1 branch does not reproduce a v1 row''s stored hash';

  -- And a v1 row is counted and reported, not silently treated as verified v2.
  SELECT legacy_v1_rows, legacy_v1_verified
    INTO v_v1, v_v1_ok
    FROM verify_security_audit_chain();
  ASSERT v_v1 >= 1, format('T12: v1 rows not reported (legacy_v1_rows=%s)', v_v1);
  ASSERT v_v1_ok >= 1,
    format('T12: the v1 row just written did not verify (legacy_v1_verified=%s)', v_v1_ok);

  -- The reason the v1 result must stay out of `ok`: v1 hashed
  -- timestamptz::text, so verifying from a session in another timezone turns
  -- untouched rows into mismatches. Asking for a timezone the rows were NOT
  -- written under must therefore stop them verifying — and must leave the
  -- session's own TimeZone as it found it.
  v_tz_before := current_setting('TimeZone');
  SELECT legacy_v1_verified INTO v_v1_other
    FROM verify_security_audit_chain(NULL,
      CASE WHEN v_tz_before = 'America/Edmonton' THEN 'Asia/Tokyo' ELSE 'America/Edmonton' END);
  ASSERT v_v1_other < v_v1_ok,
    format('T12: v1 recomputation is not timezone-sensitive after all (%s verified under a different TimeZone vs %s)',
           v_v1_other, v_v1_ok);
  ASSERT current_setting('TimeZone') = v_tz_before,
    format('T12: the verifier left TimeZone changed: %s (was %s)', current_setting('TimeZone'), v_tz_before);

  RAISE NOTICE 'T12 passed (v1 rows recomputable as v1, timezone-sensitive, reported apart from ok)';
END $$;

-- ===========================================================================
-- T13: a MULTI-ROW insert still chains in order. This is the escape hatch the
--      migration header offers for anything that ever needs many audit rows
--      (one lock acquisition for the whole statement), so it has to hold.
-- ===========================================================================
DO $$
DECLARE
  v_from bigint;
  v_ok   boolean;
  v_n    bigint;
  v_why  text;
BEGIN
  v_from := COALESCE((SELECT MAX(chain_seq) FROM security_audit_logs), 0) + 1;

  INSERT INTO security_audit_logs (actor_type, action, action_category, outcome)
  SELECT 'system', 'test.batch.' || g, 'sync', 'success'
    FROM generate_series(1, 50) g;

  SELECT ok, checked_v2_rows, first_break_reason INTO v_ok, v_n, v_why
    FROM verify_security_audit_chain(v_from);
  ASSERT v_ok,     format('T13: a 50-row batch did not chain cleanly: %s', v_why);
  ASSERT v_n = 50, format('T13: expected 50 rows checked, got %s', v_n);

  RAISE NOTICE 'T13 passed (multi-row INSERT chains in order)';
END $$;

ROLLBACK;
