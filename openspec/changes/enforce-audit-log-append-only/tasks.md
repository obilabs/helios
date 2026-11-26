# Tasks

## 1. Enforcement
- [x] 1.1 Migration 101: drop 066's `DO INSTEAD NOTHING` rules and its appender
- [x] 1.2 Triggers that raise on UPDATE / DELETE / TRUNCATE, naming the row
- [x] 1.3 `REVOKE UPDATE, DELETE, TRUNCATE` from PUBLIC, every grantee and the owner, with a warning when the app runs as superuser
- [x] 1.4 No DELETE exception — decided, with the reason (no foreign keys reach the table)

## 2. The chain
- [x] 2.1 `chain_seq` + `hash_version`, assigned by the trigger, `hash_version` CHECK-constrained to known versions
- [x] 2.2 Canonical payload v2: length-prefixed, UTC timestamps, all 25 content columns plus `previous_hash`
- [x] 2.3 Appends serialised by an advisory transaction lock
- [x] 2.4 Pre-101 rows marked v1, ordered by walking their own hash links, never rewritten
- [x] 2.5 Boundary row `audit.chain.v2.initialised`, linking v2 onto v1 history

## 3. Verification
- [x] 3.1 `verify_security_audit_chain(p_from_seq, p_legacy_timezone)` reporting the first break and the v1 segment separately
- [x] 3.2 `lib/audit-chain.ts` — asks the database, no TypeScript hash
- [x] 3.3 `scripts/verify-audit-chain.ts` CLI with an exit code
- [x] 3.4 `GET /api/v1/organization/audit-logs/integrity`, admin-only, read-only

## 4. Remove the duplicate
- [x] 4.1 Delete `backend/src/lib/audit-hash.ts`
- [x] 4.2 Stop both call sites passing `previous_hash` / `record_hash`

## 5. Proof
- [x] 5.1 13 SQL cases, including three that tamper with the elevated role
- [x] 5.2 Every payload field mutated in turn, so the coverage claim is checked
- [x] 5.3 `scripts/test-db.sh` runner; CI runs the file after seed + migrations
- [x] 5.4 CI asserts the guard triggers, the absence of rules and the verifier exist
- [x] 5.5 Migration applies clean and twice on a fresh install and on an upgrade
- [x] 5.6 Write cost measured and reproducible

## 6. Documentation
- [x] 6.1 `docs/features/AUDIT-LOG-INTEGRITY.md`: operator view, non-superuser role, limits, cost
