## ADDED Requirements

### Requirement: Single-use, time-bounded MTP pairing

Helios SHALL support a `helios-mtp-pairing` API-key type whose first successful
handshake atomically and permanently binds the key. Issuance MUST open a 15-minute
pairing window; a handshake outside the window MUST be refused. A second handshake on
an already-bound key MUST be refused.

#### Scenario: First handshake binds
- **WHEN** a valid pairing key completes `POST /api/v1/mtp/handshake` inside its window
- **THEN** the key is marked bound (paired_at, paired_from_ip, paired_user_agent set) and the response returns the organization + advertised scopes/capabilities

#### Scenario: Window closed
- **WHEN** a handshake arrives more than 15 minutes after issuance
- **THEN** it is refused with a `window_closed` error and the key is not bound

#### Scenario: Already paired
- **WHEN** a handshake targets a key that is already bound
- **THEN** it is refused with an `already_paired` error and the existing binding is unchanged

#### Scenario: Binding is atomic under concurrency
- **WHEN** two handshakes race on the same unbound key
- **THEN** exactly one succeeds and binds; the other is refused

### Requirement: Handshake advertises scopes and capabilities

The handshake response SHALL include the organization identity, the pairing's granted
`scopes`, and the server `capabilities` (the coarse product-level action set Helios
supports) plus the poll endpoint, so the MTP can gate its UI to what Helios supports.

#### Scenario: Capabilities returned
- **WHEN** a handshake succeeds
- **THEN** the response contains `pairing.scopes[]` and `server.capabilities[]` describing Helios's supported actions (which differ from an ITSM product's)

### Requirement: MTP poll returns a directory/security aggregate

Helios SHALL expose `GET /api/v1/mtp/poll` returning an aggregate appropriate to its
domain — directory and security posture, not tickets. The payload MUST be read-only
and MUST NOT require actor-assertion headers.

#### Scenario: Poll aggregate shape
- **WHEN** the MTP polls a paired Helios install
- **THEN** the response includes the organization id, a polled-at timestamp, and aggregates such as user count, group count, suspended/at-risk account counts, security-event counts, and Google-Workspace sync freshness

#### Scenario: Poll is header-free read
- **WHEN** the poll is called with a valid pairing bearer and no actor headers
- **THEN** it succeeds (reads do not require actor assertion)

### Requirement: MTP actions require scope and actor assertion

A state-changing MTP action (e.g. offboard/suspend a Workspace user) SHALL require the
pairing's scope AND actor-assertion headers (`X-Actor-Email`, `X-Actor-Name`). A
request missing either MUST be refused, and the action MUST be recorded to the audit
log with the asserted actor.

#### Scenario: Action without actor headers is refused
- **WHEN** an offboard action is called with a valid bearer but no `X-Actor-Email`/`X-Actor-Name`
- **THEN** Helios refuses it (missing actor context) and performs no change

#### Scenario: Action lacking scope is refused
- **WHEN** the pairing lacks the scope required for the action
- **THEN** Helios refuses with 403 and performs no change

#### Scenario: Successful action is audited
- **WHEN** an authorized, actor-asserted offboard action succeeds
- **THEN** the Workspace user is offboarded via the existing offboarding service and an audit record captures the acting MSP technician

### Requirement: Revocation is authoritative

Revoking a pairing SHALL record an explicit revocation event so a subsequent poll
returns an authoritative "access revoked" signal rather than an ambiguous auth
failure. A revoked pairing MUST refuse all `/api/v1/mtp/*` calls.

#### Scenario: Revoked pairing signals revocation
- **WHEN** a pairing is revoked and the MTP next calls the surface
- **THEN** the response is an authoritative revocation (distinguishable from a transient outage), and no data is returned
