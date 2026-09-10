# training-contract

## ADDED Requirements

### Requirement: Helios owns the requirement, not the content
Helios SHALL record a training requirement as a row in `training_requirements` carrying who
must complete it, why (`reason`), and by when (`due_at`). It SHALL NOT require that the
content, the player or the scoring live in Helios. A requirement created for a third-party
course SHALL be satisfiable by that provider reporting a completion.

#### Scenario: a requirement is satisfied by an external provider
- **WHEN** a requirement exists with `external_course_id = 'course-phish-101'` and a provider
  posts a `passed` completion whose `object.id` is `course-phish-101`
- **THEN** the requirement's stored status becomes `satisfied`
- **AND** `satisfied_by_completion_id` points at the stored completion

### Requirement: The verb set is closed
The contract SHALL accept exactly three verb IRIs: ADL's `completed`, `passed` and `failed`.
Any other verb, including valid xAPI verbs such as `attempted` or `experienced`, SHALL be
refused with `unsupported_verb`.

#### Scenario: an integrator sends a progress verb
- **WHEN** a statement carries `verb.id = 'http://adlnet.gov/expapi/verbs/attempted'`
- **THEN** the request fails with HTTP 400 and code `unsupported_verb`
- **AND** nothing is stored

#### Scenario: a failed attempt is evidence but does not satisfy
- **WHEN** a `failed` completion matches an open requirement
- **THEN** the completion is stored and linked to that requirement
- **AND** the requirement's status remains `pending`

### Requirement: Ingest is idempotent on a caller-supplied key
`POST /completions` SHALL require an `Idempotency-Key` header. Two requests carrying the same
key from the same credential SHALL result in exactly one stored completion, and the second
SHALL return the first one's identifier.

#### Scenario: a vendor retries a delivery after a timeout
- **WHEN** the same statement is posted twice with `Idempotency-Key: delivery-1`
- **THEN** the first returns HTTP 201 with `duplicate: false`
- **AND** the second returns HTTP 200 with `duplicate: true` and the same `completion_id`
- **AND** `training_completions` holds exactly one matching row

#### Scenario: the header is missing
- **WHEN** a statement is posted with no `Idempotency-Key`
- **THEN** the request fails with HTTP 400 and code `idempotency_key_required`

### Requirement: Completion evidence is append-only
`training_completions` SHALL reject `UPDATE` unconditionally. It SHALL reject `DELETE` unless
the session has set `helios.purge_evidence` to `'on'`, which exists so that erasing a customer
remains possible.

#### Scenario: an operator tries to correct a record in place
- **WHEN** `UPDATE training_completions SET verb = 'failed' WHERE id = $1` is executed
- **THEN** the statement fails and the error names the append-only rule

#### Scenario: an operator tries to delete evidence in normal operation
- **WHEN** `DELETE FROM training_completions WHERE id = $1` is executed
- **THEN** the statement fails

#### Scenario: a customer exercises a right to erasure
- **WHEN** a transaction runs `SET LOCAL helios.purge_evidence = 'on'` and then deletes the
  organization's requirements
- **THEN** the cascade succeeds and the related completions are removed
- **AND** the setting does not persist beyond that transaction

### Requirement: Overdue is derived, never stored
`training_requirements.status` SHALL NOT accept the value `overdue`. A requirement SHALL be
reported as overdue when its stored status is `pending` and `due_at` has passed. The SQL
function and the TypeScript helper SHALL agree.

#### Scenario: a due date passes with no scheduled job having run
- **WHEN** a pending requirement's `due_at` is in the past
- **THEN** `training_requirement_records.status` reads `overdue`
- **AND** the stored `status` column still reads `pending`

#### Scenario: a settled requirement is not reported overdue
- **WHEN** a `satisfied` requirement's `due_at` is in the past
- **THEN** its reported status is `satisfied`

### Requirement: A completion is never matched by guessing
When a statement carries `helios.requirement_id`, the contract SHALL honour it only if that
requirement belongs to the same organization and to the same person. Otherwise it SHALL match
only a pending requirement for the resolved user whose `external_course_id` equals
`object.id`. It SHALL NOT fall back to any other open requirement.

#### Scenario: an unrelated course is reported
- **WHEN** a completion arrives for a course no open requirement names
- **THEN** the completion is stored with `matched: false` and HTTP 201
- **AND** no requirement changes status

#### Scenario: a provider names someone else's requirement
- **WHEN** `helios.requirement_id` belongs to a different user than the statement's actor
- **THEN** the completion is stored unmatched and the mismatch is logged

### Requirement: Refuse ambiguous or unsafe values rather than coercing them
The contract SHALL refuse: an actor carrying both `mbox` and `account`; a `score.scaled`
outside 0..1; an ISO 8601 duration with year or month components; a timestamp more than five
minutes in the future; and a `spec_version` newer than the installation implements.

#### Scenario: a vendor sends a percentage as a scaled score
- **WHEN** `result.score.scaled` is `85`
- **THEN** the request fails with code `invalid_score` and nothing is stored

#### Scenario: a misconfigured integration back-dates the future
- **WHEN** `timestamp` is a year ahead
- **THEN** the request fails with code `invalid_timestamp`

### Requirement: Outbound webhooks are signed over the raw body
Each delivery SHALL carry `X-Helios-Signature: t=<unix>,v1=<hex>` where the HMAC-SHA256 is
computed over `"<timestamp>.<raw body>"` with the endpoint's secret, and
`X-Helios-Event-Id` stable across retries. Endpoint URLs SHALL be HTTPS.

#### Scenario: a receiver verifies a delivery
- **WHEN** the receiver recomputes the HMAC over the raw bytes with its secret
- **THEN** the value matches the `v1` component

#### Scenario: a body is altered in transit
- **WHEN** any byte of the body differs from what was signed
- **THEN** verification fails

#### Scenario: an old delivery is replayed
- **WHEN** a captured body and header are re-sent more than 300 seconds later
- **THEN** verification fails on the timestamp tolerance

#### Scenario: an endpoint is configured over plain HTTP
- **WHEN** an endpoint row is inserted with an `http://` URL
- **THEN** the insert fails on a check constraint

### Requirement: The contract ships inert
Every training-contract route SHALL return HTTP 404 for an organization whose
`organization_settings.training_contract_enabled` is false, which SHALL be the default.

#### Scenario: an installation that has not opted in
- **WHEN** a valid, correctly scoped key posts a completion
- **THEN** the response is HTTP 404 with code `not_enabled`

### Requirement: The contract is published and versioned
The repository SHALL carry an OpenAPI document for the contract, and the installation SHALL
serve an unauthenticated discovery response naming its `spec_version` and accepted
vocabulary. A breaking change SHALL bump `spec_version`, and the previous version SHALL keep
working for at least 12 months after the new one is announced.

#### Scenario: a connector author inspects an installation before holding a key
- **WHEN** `GET /api/v1/training/v1/` is requested with no credentials
- **THEN** the response names the spec version, the three verbs, the reason and status
  vocabularies, the webhook event names, and states that Helios is not a Learning Record Store
