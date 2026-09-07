# phishing-event-stream

## ADDED Requirements

### Requirement: One per-recipient event stream shared by detection and simulation
Every phishing interaction — simulated (campaign) or real (report) — SHALL be recorded as a row
in `phish_event`. Simulation rows carry `campaign_id` + `recipient_id`; real-report rows carry
`report_id`. Both carry `user_ref` so a person's timeline is one query.

#### Scenario: a real report and a simulated report land in the same stream
- **WHEN** a user reports a real phish via the button and, separately, reports a simulation
- **THEN** both produce `phish_event` rows with `event_type = 'reported'` and the same `user_ref`
- **AND** `SELECT … FROM phish_event WHERE user_ref = $1 ORDER BY occurred_at` returns both

### Requirement: Evidence is append-only and immutable
`phish_event` SHALL reject `DELETE`. It SHALL reject any `UPDATE` that changes a column other
than `request_meta`. Rewriting `request_meta` (retention redaction) is the single sanctioned
mutation.

#### Scenario: an operator tries to rewrite history
- **WHEN** `UPDATE phish_event SET event_type = 'opened' WHERE id = $1` is executed
- **THEN** the statement fails with `integrity_constraint_violation`

#### Scenario: an operator tries to delete evidence
- **WHEN** `DELETE FROM phish_event WHERE id = $1` is executed
- **THEN** the statement fails with `integrity_constraint_violation`

#### Scenario: the retention job redacts the full IP
- **WHEN** `UPDATE phish_event SET request_meta = request_meta - 'ip_full' WHERE id = $1` is executed
- **THEN** the statement succeeds and every other column is unchanged

### Requirement: Verdicts are derived, versioned and re-runnable
A verdict SHALL never be a column on `phish_event`. Verdicts live in
`phish_event_classification` keyed by `(event_id, classifier_version)`; consumers read the
latest via `phish_event_latest_verdict`. Only `verdict = 'human'` on a `clicked` or
`submitted` event may fail a recipient. `opened` SHALL never fail anyone or trigger training.

#### Scenario: a bot click is later reclassified as human
- **WHEN** an event has classifications `('clf-1','bot_scanner')` then `('clf-2','human')` with a later `classified_at`
- **THEN** `phish_recipient_state.state` for that recipient becomes `'clicked'`

#### Scenario: an opened event alone
- **WHEN** a recipient has only an `opened` event
- **THEN** `phish_recipient_state.state` is `'opened'` and no outbox row is produced

### Requirement: Recipient state is a projection
Pass/fail and recipient status SHALL be computed from evidence + latest verdict
(`phish_recipient_state`); no stored status or score column exists on the recipient.

### Requirement: Opaque per-(campaign, recipient) token in the URL path
Each `phish_campaign_recipient` SHALL hold `token_hash = sha256(token)` and a `token_format`.
The raw `h1_` token (`h1_` + 26 lower-case base32 chars from 16 CSPRNG bytes) SHALL appear
only in the lure URL **path** and SHALL never be persisted or logged. A malformed, unknown or
expired token SHALL take the same uniform benign response path.

#### Scenario: a database leak does not hand out live links
- **WHEN** an attacker reads `phish_campaign_recipient`
- **THEN** no column contains a value that resolves as a tracking token

### Requirement: Closed sets are text with an application allowlist
`event_type`, `source`, `verdict`, `status`, `disposition`, `ingest_source`, `delivery_mode`
and `contract_type` SHALL be `text` columns. The allowed values are the literals in
`backend/src/lib/phishing/contract.ts`, pinned by a contract test. Adding a value is a code
change with zero DDL; renaming or removing one is a recorded decision.

### Requirement: Credential values are never stored
The landing-form submit handler SHALL record only which fields were populated and their
lengths. No submitted value SHALL be written to any table, log, or queue.

#### Scenario: hunter2
- **WHEN** a landing form posts `password=hunter2`
- **THEN** the resulting event, serialised, does not contain `hunter2`
- **AND** no other table contains `hunter2`

### Requirement: IP minimisation
The durable `request_ip_trunc` SHALL be a /24 (IPv4) or /48 (IPv6) prefix. The full IP MAY be
kept only under `request_meta.ip_full` for the retention TTL, after which it is redacted.

### Requirement: Helios → Aegis wire contract v1 is versioned and additive-only
Helios SHALL emit `phishing.recipient.failed` only when a `clicked`/`submitted` event's latest
verdict is `human`, and `phishing.recipient.failure_retracted` when a later classification
withdraws it. Both carry `schema_version: 1` and at least the fields listed in
`AEGIS_CONTRACT_REQUIRED_FIELDS`. Delivery goes through `phish_outbox`, unique on
`(event_id, contract_type)`, so retries never double-assign training.

#### Scenario: a retry does not double-assign
- **WHEN** the same `phishing.recipient.failed` is delivered twice
- **THEN** Aegis treats the second delivery as a no-op (same `event_id`)

### Requirement: Additive-only evolution
Later changes SHALL add nullable columns or jsonb keys. No column on the tables introduced
here SHALL be renamed or dropped.
