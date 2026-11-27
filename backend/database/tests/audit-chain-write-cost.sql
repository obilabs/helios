-- Reproduces the per-row append cost quoted in the header of migration 101.
--
-- Not a pass/fail test, so it is not wired into CI — it prints timings, and a
-- shared runner's numbers would be noise.
--
--   docker exec -i helios_postgres psql -U postgres -d <scratch> \
--     -f backend/database/tests/audit-chain-write-cost.sql
--
-- WHY IT IS SHAPED LIKE THIS. Timing a whole statement with \timing was
-- useless on the machine this was written on: the same 5 000-row insert took
-- anywhere from 10 s to 72 s, and the version WITH the chain sometimes beat
-- the version without it, because other containers were competing for the
-- host. So this measures the MARGINAL cost of the chain instead: the identical
-- statement, timed with `trg_security_audit_chain` enabled and disabled,
-- alternately, in one session, reporting the MINIMUM of ten rounds. Host load
-- can only make a round slower, so the minimum is the least contaminated
-- estimate, and repeated runs of this file agree closely.
--
-- Toggling the trigger needs the table's owner (or a superuser). Everything is
-- rolled back, so the audit trail is untouched. Run it on a scratch database
-- anyway, not on a live one: the rows are real appends until the ROLLBACK, and
-- it burns sequence values.
--
-- The "chain disabled" arm has to supply chain_seq, hash_version and
-- record_hash itself, because with the trigger off nothing else fills them.

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  t0        timestamptz;
  d         numeric;
  i         int;
  g         int;
  row_on    numeric := 1e9;
  row_off   numeric := 1e9;
  bat_on    numeric := 1e9;
  bat_off   numeric := 1e9;
  batj_on   numeric := 1e9;
  batj_off  numeric := 1e9;
BEGIN
  -- Warm the relation and the index so round 1 is not an outlier.
  INSERT INTO security_audit_logs (actor_type, action, action_category, outcome)
  SELECT 'system', 'cost.warm.' || s, 'sync', 'success' FROM generate_series(1, 200) s;

  FOR i IN 1..10 LOOP
    -- ---- one INSERT statement per row: how Helios actually writes ---------
    t0 := clock_timestamp();
    FOR g IN 1..200 LOOP
      INSERT INTO security_audit_logs (actor_type, action, action_category, outcome)
        VALUES ('system', 'cost.row.on.' || i || '.' || g, 'sync', 'success');
    END LOOP;
    d := round((extract(epoch FROM clock_timestamp() - t0) * 1000 / 200)::numeric, 4);
    IF d < row_on THEN row_on := d; END IF;

    -- ---- 500-row batch, no jsonb -----------------------------------------
    t0 := clock_timestamp();
    INSERT INTO security_audit_logs (actor_type, action, action_category, outcome)
    SELECT 'system', 'cost.bat.on.' || i || '.' || bg, 'sync', 'success'
      FROM generate_series(1, 500) AS s(bg);
    d := round((extract(epoch FROM clock_timestamp() - t0) * 1000 / 500)::numeric, 4);
    IF d < bat_on THEN bat_on := d; END IF;

    -- ---- 500-row batch, ~200-byte changes_after --------------------------
    t0 := clock_timestamp();
    INSERT INTO security_audit_logs (actor_type, action, action_category, outcome, changes_after)
    SELECT 'system', 'cost.batj.on.' || i || '.' || bg, 'sync', 'success',
           jsonb_build_object('endpoint', '/api/v1/users/' || bg,
                              'method', 'PATCH',
                              'body', repeat('x', 150))
      FROM generate_series(1, 500) AS s(bg);
    d := round((extract(epoch FROM clock_timestamp() - t0) * 1000 / 500)::numeric, 4);
    IF d < batj_on THEN batj_on := d; END IF;

    EXECUTE 'ALTER TABLE security_audit_logs DISABLE TRIGGER trg_security_audit_chain';

    t0 := clock_timestamp();
    FOR g IN 1..200 LOOP
      INSERT INTO security_audit_logs (actor_type, action, action_category, outcome,
                                       chain_seq, hash_version, record_hash)
        VALUES ('system', 'cost.row.off.' || i || '.' || g, 'sync', 'success',
                nextval('security_audit_logs_chain_seq'), 2,
                md5(random()::text) || md5(random()::text));
    END LOOP;
    d := round((extract(epoch FROM clock_timestamp() - t0) * 1000 / 200)::numeric, 4);
    IF d < row_off THEN row_off := d; END IF;

    t0 := clock_timestamp();
    INSERT INTO security_audit_logs (actor_type, action, action_category, outcome,
                                     chain_seq, hash_version, record_hash)
    SELECT 'system', 'cost.bat.off.' || i || '.' || bg, 'sync', 'success',
           nextval('security_audit_logs_chain_seq'), 2,
           md5(random()::text) || md5(random()::text)
      FROM generate_series(1, 500) AS s(bg);
    d := round((extract(epoch FROM clock_timestamp() - t0) * 1000 / 500)::numeric, 4);
    IF d < bat_off THEN bat_off := d; END IF;

    t0 := clock_timestamp();
    INSERT INTO security_audit_logs (actor_type, action, action_category, outcome, changes_after,
                                     chain_seq, hash_version, record_hash)
    SELECT 'system', 'cost.batj.off.' || i || '.' || bg, 'sync', 'success',
           jsonb_build_object('endpoint', '/api/v1/users/' || bg,
                              'method', 'PATCH',
                              'body', repeat('x', 150)),
           nextval('security_audit_logs_chain_seq'), 2,
           md5(random()::text) || md5(random()::text)
      FROM generate_series(1, 500) AS s(bg);
    d := round((extract(epoch FROM clock_timestamp() - t0) * 1000 / 500)::numeric, 4);
    IF d < batj_off THEN batj_off := d; END IF;

    EXECUTE 'ALTER TABLE security_audit_logs ENABLE TRIGGER trg_security_audit_chain';
  END LOOP;

  RAISE NOTICE 'minimum of 10 rounds, ms per appended row';
  RAISE NOTICE '  one INSERT per row        bare % / chain % / marginal % (%x)',
    row_off,  row_on,  round(row_on  - row_off,  4), round(row_on  / row_off,  1);
  RAISE NOTICE '  500-row batch             bare % / chain % / marginal % (%x)',
    bat_off,  bat_on,  round(bat_on  - bat_off,  4), round(bat_on  / bat_off,  1);
  RAISE NOTICE '  500-row batch, 200B jsonb bare % / chain % / marginal % (%x)',
    batj_off, batj_on, round(batj_on - batj_off, 4), round(batj_on / batj_off, 1);
END $$;

-- The head read is the part that scales, and inside the transaction above it
-- ends up scanning tens of thousands of uncommitted tuples. This is what it
-- costs on a committed table — the number a real append pays.
\echo '--- head read on the committed table ---'
EXPLAIN (ANALYZE, TIMING ON)
  SELECT record_hash FROM security_audit_logs ORDER BY chain_seq DESC LIMIT 1;

ROLLBACK;
