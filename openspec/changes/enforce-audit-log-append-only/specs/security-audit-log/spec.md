# security-audit-log

## ADDED Requirements

### Requirement: A forbidden write fails loudly
`security_audit_logs` SHALL refuse `UPDATE`, `DELETE` and `TRUNCATE` by raising
an exception that names the row and the operation. It SHALL NOT refuse them by
rewriting the statement away, because a statement that reports affecting zero
rows is indistinguishable from success to a caller that does not read row
counts.

#### Scenario: an UPDATE is attempted
- **WHEN** any role runs `UPDATE security_audit_logs SET action = '…'`
- **THEN** the statement raises with SQLSTATE 23000 and a message containing
  the row's `id` and `chain_seq`
- **AND** the row is unchanged

#### Scenario: a TRUNCATE is attempted
- **WHEN** any role runs `TRUNCATE TABLE security_audit_logs`
- **THEN** the statement raises
- **AND** no row is removed

### Requirement: The hash covers every column
`record_hash` SHALL be computed over every content column of the row plus
`previous_hash`. Changing any one of them SHALL change the hash.

#### Scenario: a field outside the old seven-field hash is altered
- **WHEN** `changes_after`, `actor_email`, `actor_ip`, `target_identifier`,
  `error_message`, `risk_score`, `flagged`, `reviewed_at` or `reviewed_by` is
  altered on a stored row
- **THEN** the recomputed `record_hash` no longer matches the stored one

#### Scenario: free text contains the field separator
- **WHEN** two rows differ only in which field a `'|'` character falls in
- **THEN** their canonical payloads differ

### Requirement: The chain's framing belongs to the database
`chain_seq`, `hash_version`, `previous_hash` and `record_hash` SHALL be assigned
by the insert trigger. A value supplied by the caller SHALL be discarded.
`chain_seq` SHALL be allocated under a lock that serialises appends, so
concurrent writers cannot choose the same predecessor.

#### Scenario: a caller supplies a hash
- **WHEN** an `INSERT` passes `previous_hash` and `record_hash`
- **THEN** the stored values are the ones the trigger computed

#### Scenario: many rows are appended by one statement
- **WHEN** one `INSERT … SELECT` appends 50 rows
- **THEN** each row's `previous_hash` is the preceding row's `record_hash`
- **AND** the verifier reports no break

### Requirement: Verification names the first break and cannot repair
`verify_security_audit_chain()` SHALL walk the chain in `chain_seq` order and
return the first break with the row's `id`, `chain_seq`, timestamp and a reason
distinguishing an altered row from a missing predecessor. It SHALL be
read-only. Its result SHALL be reachable without the application running.

#### Scenario: a row is edited with the guard trigger disabled
- **WHEN** an elevated role disables `trg_security_audit_no_update`, edits a row
  and re-enables it
- **THEN** `ok` is false and `first_break_id` is that row
- **AND** `first_break_reason` begins `record_hash_mismatch`

#### Scenario: a row is deleted with the guard trigger disabled
- **WHEN** an elevated role disables `trg_security_audit_no_delete`, removes a
  row and re-enables it
- **THEN** `ok` is false and `first_break_id` is the removed row's successor
- **AND** `first_break_reason` begins `chain_link_mismatch`

### Requirement: Pre-migration history is never certified as more than it is
Rows written before this change SHALL keep their original hashes, SHALL NOT be
rewritten, and SHALL be reported in their own fields. Their result SHALL NOT
contribute to `ok`.

#### Scenario: an upgrade with existing rows
- **WHEN** the migration is applied to a database holding rows written under the
  seven-field hash
- **THEN** those rows are marked `hash_version = 1` with their stored hashes
  intact
- **AND** `legacy_v1_rows` reports their count separately from `checked_v2_rows`
- **AND** the first new row's `previous_hash` is the last old row's
  `record_hash`, so removing the newest old row is still detected

### Requirement: One implementation of the hash
The record hash SHALL be computed only in the database. No second
implementation SHALL exist in application code.

#### Scenario: a write path records an audit row
- **WHEN** `auditMiddleware` or `SecurityAuditService.log()` inserts a row
- **THEN** it passes no hash and no chain framing
