# Make the security audit log append-only, enforced, verifiable and tested

> Brings `security_audit_logs` to the audit baseline Aegis just set, following
> Aegis migration 099 rather than inventing a second design. One migration, one
> verifier module, one CLI script, one route, one SQL test file, one CI step.
> No UI.

## Why

Migration 066 gave Helios a hash-chained audit table and `DO INSTEAD NOTHING`
rules on `UPDATE` and `DELETE`, and for over a year that was treated as the
reference implementation — Aegis migration 099 copied its shape. Writing 099
surfaced four things about 066 worth changing, and three pieces that were
missing on both sides. This change applies all seven to Helios so the two
products share one design.

The four changes to what 066 built:

1. **The refusal was silent.** `DO INSTEAD NOTHING` rewrites the statement away,
   so `UPDATE security_audit_logs SET …` reports `UPDATE 0`. A caller that does
   not read row counts cannot tell that from success. (Confirmed on a pre-101
   scratch database: `UPDATE 0`, `DELETE 0`.) A guard whose failure is
   indistinguishable from success is the recurring Helios failure mode.
2. **The hash covered seven fields.** `changes_before`, `changes_after`,
   `actor_email`, `actor_ip`, `target_*`, `error_message` and `risk_score` were
   all outside it, so editing any of them left the stored hash correct.
3. **The payload was ambiguous and timezone-dependent.** Fields were joined with
   a bare `'|'` while several of them are free text that can contain `'|'`, and
   `timestamptz::TEXT` renders differently per session `TimeZone`/`DateStyle`.
4. **Appends took no lock** and chose the predecessor by `timestamp DESC`, where
   `timestamp` defaults to transaction-start time. Verified: a single 40-row
   `INSERT … SELECT` under 066 produces a tree, not a chain — 44 rows, 10
   distinct predecessors.

The three pieces neither product had for this table: no `REVOKE`, no verifier
of any kind, and no test. The append-only guarantee was never exercised,
because triggers, ACLs and a hash chain cannot be reached by `tsc` or Jest.

Plus one duplication to remove: `backend/src/lib/audit-hash.ts` computed a
second, `JSON.stringify`-based record hash in TypeScript that both call sites
passed in their `INSERT` and that 066's trigger then overwrote. Two
implementations of the same hash, one of them dead.

## Decisions this encodes

**Pre-101 rows are kept, verified as v1, and reported apart from `ok`.** Aegis
had no hashes to keep, so its legacy rows are simply unverifiable. Helios does
have them, so discarding them would be wasteful and rewriting them under v2
would make the whole table report as strongly protected while certifying
nothing about the period before the migration. They are marked
`hash_version = 1`, ordered by following their own hash links, recomputed
through 066's `calculate_audit_hash()` (which is retained as v1's only
definition), and reported in dedicated `legacy_v1_*` columns. `ok` covers the
v2 segment and its link back into v1 history — which is the part this change
actually guarantees. The verifier distinguishes `legacy_v1_fork` (what 066's
lock-free append produces, not evidence of anything) from
`legacy_v1_orphan_link` (a row really is missing).

**No DELETE exception.** Migration 092 has one (`SET LOCAL
helios.purge_evidence = 'on'`) because `training_completions` references
`organizations`, so an unconditional block would make `DELETE FROM
organizations` fail on a cascade. `security_audit_logs` has no foreign keys, so
no cascade reaches it and no caller needs the escape; adding one would be an
exception with nothing behind it. If a future erasure obligation needs one it
reuses 092's flag rather than a new one.

**Exposure follows Helios's conventions: CLI and route, both thin.** Helios
already ships operational proofs as `backend/src/scripts/prove-*.ts` run with
`node dist/scripts/…`, which is what an operator or auditor on a deployed box
actually has, and it gives a cron job an exit code to hang off. The route is
not redundant: the compliance-facing Audit Logs page is where someone looks at
this trail, and `GET /api/v1/organization/audit-logs/integrity` puts the
integrity answer on the same router behind `requireAdmin`. Both call the same
database function through `lib/audit-chain.ts`; neither reimplements anything.

**`phish_event` is out of scope.** Migration 075 is not on `main` — it is on the
unmerged `bones/phishing-event-stream` branch. Its guard is already a trigger
that raises, which is the part 066 lacked; giving it a full v2-style chain
belongs with that branch, not here. `activity_logs`, the other half of the
`audit_logs_unified` view the UI reads, is not append-only at all and is
genuine follow-up work.

## What lands

| | |
|---|---|
| `backend/database/migrations/101_security_audit_logs_append_only.sql` | drops 066's rules and appender; `chain_seq` / `hash_version`; triggers that raise on UPDATE/DELETE/TRUNCATE naming the row; REVOKE from PUBLIC, grantees and owner; length-prefixed UTC canonical payload v2 over all 25 content columns plus the chain link; `verify_security_audit_chain()`; v1 backfill by link walk; boundary row. Idempotent |
| `backend/src/lib/audit-chain.ts` | asks the database; no TypeScript hash |
| `backend/src/scripts/verify-audit-chain.ts` | CLI verifier with an exit code |
| `backend/src/routes/audit-logs.routes.ts` | `GET /integrity`, admin-only, read-only |
| `backend/database/tests/audit-immutability.integration.test.sql` | 13 cases; three tamper with the elevated role |
| `backend/database/tests/audit-chain-write-cost.sql` | reproduces the measured cost |
| `scripts/test-db.sh` | runner for SQL integration tests |
| `.github/workflows/ci.yml` | the existing `schema` job gains object assertions and runs the test file |
| `docs/features/AUDIT-LOG-INTEGRITY.md` | operator view, non-superuser setup, limits, cost |

Removed: `backend/src/lib/audit-hash.ts` and both call sites' use of it.

## Cost

About +0.24 ms per appended row, likely nearer +0.1 ms on a committed table.
Method and caveats in 101's header; nothing in Helios writes audit rows in a
tight loop.

## What this does not do

A superuser can still disable the triggers — the chain makes that detectable,
not impossible. Deleting the newest row stays undetectable without an external
anchor. Nothing schedules the verifier. A restored older dump verifies clean.
All stated in the doc rather than papered over.
