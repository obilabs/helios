# Audit log integrity

`security_audit_logs` is **append-only and tamper-evident, enforced by the
database** — not by convention and not by application discipline. Migration
`backend/database/migrations/101_security_audit_logs_append_only.sql` is the
whole mechanism and its file header is the authoritative reference; this page
is the operator view.

Migration 066 built most of it: a SHA-256 chain filled by a `BEFORE INSERT`
trigger. 101 changes four things about it, adds the `REVOKE`, the verifier and
the tests, and keeps the pattern identical to Aegis migration 099 so there is
one design across the products rather than two. The four changes and the
reasoning are in 101's header.

## What is enforced

| Operation | What happens |
|---|---|
| `INSERT` | Allowed. A `BEFORE INSERT` trigger assigns `chain_seq`, sets `hash_version = 2`, links `previous_hash` to the preceding row and computes `record_hash`. Callers cannot set any of these — anything they send is overwritten. |
| `UPDATE` | **Rejected** by `trg_security_audit_no_update` with SQLSTATE 23000 and a message naming the row. Also revoked at the table ACL. |
| `DELETE` | **Rejected** by `trg_security_audit_no_delete`, same. There is no sanctioned exception: `security_audit_logs` has no foreign keys, so no cascade reaches it and nothing needs one. |
| `TRUNCATE` | **Rejected** by `trg_security_audit_no_truncate`. No rule ever covered this. |

Before 101, `UPDATE` and `DELETE` were `DO INSTEAD NOTHING` rules. History was
immutable, but the refusal was silent: the statement reported `UPDATE 0` and a
caller that does not read row counts could not tell it from success. (Verified
on a pre-101 scratch database: `UPDATE security_audit_logs SET action='…'`
returns `UPDATE 0`, `DELETE FROM security_audit_logs` returns `DELETE 0`.)

Two layers on purpose: a privileged role can bypass either one alone. Table
ACLs do not apply to superusers; triggers can be disabled by the table's owner.
Neither is relied on by itself, and the hash chain means tampering that gets
past both is **detectable afterwards**.

## Run the application as a non-superuser role

The default `docker-compose.yml` connects as `postgres`, which is the Postgres
container's **superuser**. On such an install the `REVOKE` is documentation and
the triggers are the enforcing control (the migration prints a `WARNING` saying
so). To make the ACL bite as well, give the app its own non-superuser role:

```sql
-- as the database owner
CREATE ROLE helios_app LOGIN PASSWORD '<secret>';
GRANT CONNECT ON DATABASE helios TO helios_app;
GRANT USAGE ON SCHEMA public TO helios_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO helios_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO helios_app;

-- then take back what nothing may do to history
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE security_audit_logs FROM helios_app;
```

Then point the app's database URL at `helios_app`. Migrations still run as the
owner.

## Verifying the chain

Three ways into the same database function.

**SQL** — works on any deployed install, no app needed:

```bash
docker exec helios_postgres psql -U postgres -d helios \
  -c "SELECT * FROM verify_security_audit_chain();"
```

**CLI**, inside the backend container — the same thing with an exit code, so it
can be dropped into a cron job or a health check:

```bash
node dist/scripts/verify-audit-chain.js
node dist/scripts/verify-audit-chain.js --from-seq 12345
```

Exit 0 when the chain verified, 1 when it did not. Pre-101 rows are reported
but do not affect the exit code.

**HTTP**, admin session required:

```
GET /api/v1/organization/audit-logs/integrity
GET /api/v1/organization/audit-logs/integrity?fromSeq=12345
```

Admin-only, because the response says exactly where the trail stops being
trustworthy — which is also exactly what someone covering their tracks would
want to know. It returns 200 with `data.ok: false` for a broken chain: that is
a successful verification with a bad answer, not a request failure. It cannot
repair anything, because a repairable audit trail is not evidence.

Both the CLI and the route go through `verifyAuditChain()` in
`backend/src/lib/audit-chain.ts`, which only calls the database function. There
is no TypeScript hash implementation, deliberately — see "One implementation"
below.

The result reports the **first** break with its row id:

| Field | Meaning |
|---|---|
| `ok` | Every row covered by the chain verified. |
| `checked_v2_rows` | Rows covered by the chain and inspected. |
| `v2_start_seq` / `v2_end_seq` | Range inspected. |
| `first_break_id` / `first_break_seq` / `first_break_at` | The row where verification stopped. |
| `first_break_reason` | `record_hash_mismatch` (the row was edited) or `chain_link_mismatch` (a row before it was removed or altered). |
| `legacy_v1_*` | Pre-101 rows — see below. |

## Pre-101 rows: kept, verified as v1, reported separately

Unlike Aegis, Helios's existing rows already carry hashes: migration 066's
chain is real, just weak. So they are **not** discarded and **not** rewritten.
They keep their stored `previous_hash` / `record_hash`, are marked
`hash_version = 1`, and get a `chain_seq` reconstructed by following the hash
links (not by timestamp — 066 defaults `timestamp` to transaction-start time,
so a batch of rows all share one). `verify_security_audit_chain()` recomputes
them through 066's own `calculate_audit_hash()` and reports the outcome in the
`legacy_v1_*` columns.

**The v1 result never feeds `ok`.** Two properties of v1 make a mismatch weak
evidence rather than proof of tampering:

- it hashed `timestamptz::TEXT`, so the result depends on the writing session's
  `TimeZone` and `DateStyle`. Pass `p_legacy_timezone` / `--legacy-timezone` /
  `?legacyTimezone=` to reproduce a different one; a default install writes
  under UTC.
- it chose a predecessor without a lock, so concurrent or batched appends can
  **fork** the chain legitimately. Measured while building 101: 25 rows written
  the way Helios writes them — one single-row `INSERT` each, in its own
  transaction — reconstruct and verify completely; a single 40-row
  `INSERT ... SELECT` produces a tree, with only 10 distinct predecessors
  chosen for 44 rows. Nothing in Helios writes audit rows in a batch, so a real
  upgrade should report every v1 row verified. The verifier labels a fork
  `legacy_v1_fork` and a genuinely missing predecessor
  `legacy_v1_orphan_link`, so the two are not confused.

So `ok` means "the v2 segment verified", which is the segment 101 actually
guarantees. Rewriting the old hashes under v2 was the alternative; it would
have made the whole table report as strongly protected while certifying nothing
about the period before the migration.

The first v2 row links to the last v1 row's `record_hash`, so it is one
continuous chain and removing the newest v1 row is still detected. On an
upgrade, 101 also appends one `audit.chain.v2.initialised` row recording the
boundary: how many v1 rows there were and the newest v1 timestamp.

## What the hash covers

`record_hash` is the SHA-256 of a **length-prefixed** serialisation of all 25
content columns plus `previous_hash` — field list, NULL handling, and jsonb and
timestamp serialisation are specified in 101's header under "WHAT THE v2 HASH
COVERS". Three properties worth knowing:

- 066 hashed **seven** fields, so editing `changes_before` / `changes_after`,
  the actor's email or IP, the target, the error detail or the risk score left
  the stored hash correct. v2 covers every column.
- Length prefixing (not a `'|'` join) is what makes the payload unambiguous:
  `error_message`, `target_identifier`, `actor_user_agent` and the jsonb
  columns are free text and can contain the separator.
- `timestamp` and `reviewed_at` are serialised at UTC with an explicit pattern,
  so verification gives the same answer from any session timezone.

`flagged`, `reviewed_at` and `reviewed_by` are inside the hash. They can
therefore only be set at insert; marking a row reviewed later is a new audit
event, not an edit. `SecurityAuditService.flagEntry()` already works that way.

A future column needs a **v3** payload function and a v3 branch in the
verifier, and must add itself to the `hash_version` CHECK constraint. Never
edit v2 in place — that would silently change the meaning of every hash already
written under it.

## One implementation

The hash exists **only** in SQL. `backend/src/lib/audit-hash.ts` used to
compute a second, `JSON.stringify`-based record hash in TypeScript, which both
`audit.middleware.ts` and `security-audit.service.ts` passed in their `INSERT`
— and which 066's `BEFORE INSERT` trigger then overwrote with a different
value. Two implementations of the same hash, one of them dead. 101 removes it;
`lib/audit-chain.ts` only asks the database.

## Limits (state these honestly, do not oversell)

- **A superuser can still tamper.** `ALTER TABLE security_audit_logs DISABLE
  TRIGGER ...` or `session_replication_role = replica` gets past the guards,
  and ACLs do not apply to superusers. The chain makes it detectable, not
  impossible. The tests do exactly this, with the elevated role, and prove the
  verifier names the row.
- **Deleting the newest row(s) is undetectable** by a self-contained chain:
  there is no successor left to point at the missing hash. That needs an
  external anchor — periodically recording the latest `record_hash` outside the
  database. Not implemented.
- **Nothing watches the verifier.** It answers when asked. Scheduling it and
  alerting on `ok: false` is separate work; the CLI's exit code is what that
  would hang off.
- **Backups are not covered.** Restoring an older dump silently rewinds
  history, and the chain will verify clean because it is internally consistent.
- **Pre-101 history is not strongly protected**, by construction — see above.
- `activity_logs`, the other table behind the `audit_logs_unified` view, is
  **not** append-only. The compliance-facing Audit Logs page reads both, so
  only the `security_audit_logs` half of what it shows carries this guarantee.
  Giving `activity_logs` the same treatment is follow-up work, not this
  migration.

## Cost

About **+0.24 ms per appended row**, and probably closer to +0.1 ms on a
committed table. Measured numbers, the method (the chain trigger toggled
alternately in one session, minimum of ten rounds, because wall-clock timing of
whole statements on a loaded host varied 7x run to run) and the caveats are in
101's header under "WRITE COST".
`backend/database/tests/audit-chain-write-cost.sql` reproduces them.

Nothing in Helios writes audit rows in a tight loop today: `auditMiddleware`
and `SecurityAuditService.log()` each write one row in its own autocommit
transaction, so the advisory lock is held for about the insert. If something
ever needs thousands of audit rows, batch them into one multi-row
`INSERT ... SELECT` — it takes the lock once and the rows still chain in order
(proven by T13).

## Tests

`backend/database/tests/audit-immutability.integration.test.sql`, run with
`scripts/test-db.sh audit-immutability`, and in CI against a real Postgres 16
(the `schema` job in `.github/workflows/ci.yml`, after it has applied the seed
and every migration). Thirteen cases:

| | |
|---|---|
| T01–T02 | appends work, the database fills the framing, rows chain, the verifier walks clean |
| T03–T05 | `UPDATE`, `DELETE` and `TRUNCATE` are each refused, and the row is unchanged afterwards |
| T06 | no role holds those privileges, and no `DO INSTEAD` rule remains (a rule would stop the triggers firing at all) |
| T07 | an **edited** row is caught — tampering done with the elevated role, guard trigger disabled — and the verifier names that row |
| T08 | a **deleted** row is caught at its successor, same way |
| T09 | the field encoding is unambiguous; NULL and `''` stay distinct |
| T10 | a row cannot be parked under a `hash_version` nothing verifies |
| T11 | each of the 26 payload fields is mutated in turn and must change the hash, so "covers every column" is checked rather than asserted |
| T12 | a v1 row is still recomputable as v1 and is reported apart from `ok` |
| T13 | a 50-row batch still chains in order |

The guarantee is not something `tsc` or Jest can check — triggers, ACLs and a
hash chain only exist inside a real Postgres, which is why it went untested
from 066 until now.
