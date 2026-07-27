# API Relay Authorization Capability

## ADDED Requirements

### Requirement: Deny by Default
The API relay SHALL deny any request that is not explicitly permitted by a
matching allow rule within the caller's granted capabilities.

#### Scenario: Freshly enabled relay permits nothing
**Given** an organization has just enabled the API relay
**And** no capability bundles have been granted
**When** any relay request is made
**Then** the system denies it with an authorization error
**And** records the denied descriptor to the discovery queue

#### Scenario: Unmatched endpoint is denied
**Given** the caller has a capability granting `admin.directory.users:GET`
**When** the caller requests `admin.directory.groups:DELETE`
**Then** the system denies the request
**And** the audit log records the decision as "default deny"

### Requirement: Read/Write/Delete Asymmetry
The relay SHALL treat reads, writes, and deletes with distinct default postures:
reads are permitted within granted capabilities and OAuth scopes; writes are
denied unless an explicit allow rule matches; deletes are denied and require an
explicit rule that a plain administrator role cannot self-grant.

#### Scenario: Read within a granted capability
**Given** the caller holds the "Read directory" capability
**When** the caller issues `admin.directory.users:GET`
**Then** the system allows the request

#### Scenario: Write without an explicit allow rule
**Given** the caller holds only read capabilities
**When** the caller issues `admin.directory.users:POST`
**Then** the system denies the request

#### Scenario: Delete requires an explicit destructive rule
**Given** the caller holds a capability that allows directory writes
**And** no rule explicitly permits directory deletes
**When** the caller issues `admin.directory.users:DELETE`
**Then** the system denies the request

### Requirement: Deny Precedence
An organization-level deny rule SHALL override any group-level allow rule.

#### Scenario: Org deny beats group allow
**Given** an organization deny rule matches `admin.directory.users:DELETE`
**And** the caller's group has an allow rule for `admin.directory.users:DELETE`
**When** the caller issues that request
**Then** the system denies it

#### Scenario: Additive group allows
**Given** the caller belongs to two groups
**And** one group allows `admin.directory.users:GET` and the other allows `admin.directory.groups:GET`
**And** no organization deny matches
**When** the caller issues either request
**Then** the system allows it

### Requirement: Authority Ceilings
The relay SHALL NOT grant more authority than either the caller's Helios
role/API-key permissions or the OAuth scopes minted for the request. The relay
may only narrow authority, never widen it.

#### Scenario: API key permission caps the grant
**Given** an API key was issued without the `admin` permission
**When** a rule would otherwise allow an administrative write
**Then** the system denies the request because the key lacks the permission

#### Scenario: Token is scoped to the capability
**Given** the caller is permitted `admin.directory.users:GET`
**When** the transport mints the OAuth token for the request
**Then** the token carries only the read scope needed for that call
**And** does not carry directory write scopes

### Requirement: Batch Sub-Request Authorization
The relay SHALL authorize each sub-request of a batch API call independently and
SHALL deny the batch unless every sub-request is permitted.

#### Scenario: Mixed batch is denied
**Given** the caller may read but not delete directory users
**When** the caller submits a batch containing a read and a delete
**Then** the system denies the batch

#### Scenario: Unparseable batch is denied, not passed through
**Given** a batch in a format the relay cannot unwrap
**When** the caller submits it
**Then** the system denies the batch

### Requirement: Impersonation Subject Constraints
When a request uses domain-wide delegation, the relay SHALL evaluate the
impersonated subject against the matching rule and SHALL require an explicit rule
to act upon a privileged subject.

#### Scenario: Acting on a super-admin requires an explicit rule
**Given** the caller holds a general "manage users" capability
**And** no rule explicitly permits acting on super-admin subjects
**When** the caller targets a super-admin account
**Then** the system denies the request

#### Scenario: A bulk reorg excludes the privileged account, which is updated separately
**Given** a bulk update runs under a grant that does not permit privileged subjects
**And** the batch includes a super-admin account
**When** the batch is evaluated
**Then** the batch is denied and the report identifies the super-admin sub-request
**And** the super-admin can still be updated by a separate action under a capability that explicitly permits privileged subjects

### Requirement: Decision Auditing
The relay SHALL write every authorization decision — allowed and denied — to the
append-only audit trail, including caller identity, request descriptor, decision,
and the matched rule or "default deny".

#### Scenario: Denied call is audited and queued
**Given** a caller makes a request that is denied
**When** the decision is recorded
**Then** the audit trail contains the denied descriptor and reason
**And** the discovery queue contains a proposed-rule entry

#### Scenario: Write is attributed to the acting user
**Given** an org-owned key with actor-assertion headers performs an allowed write
**When** the decision is recorded
**Then** the audit entry attributes the write to the asserted acting user

### Requirement: Shadow-Mode Discovery
The relay SHALL record each denied request to a **valid, known** endpoint as a
proposed rule and expose it to administrators for review and promotion to an
allow rule. Nothing SHALL be auto-promoted; promotion is always an explicit
administrator action.

#### Scenario: Promoting a discovered rule
**Given** the discovery queue contains a proposed rule for `admin.directory.groups.members:POST`
**When** an administrator promotes it to an allow rule for a specific group
**Then** subsequent matching requests by that group are permitted

#### Scenario: Deduplicated proposal
**Given** a caller issues the same denied valid request 14 times
**When** the discovery queue is displayed
**Then** it shows one proposed rule with a count of 14, attributed to that caller

### Requirement: Invalid-Endpoint Classification
The relay SHALL validate each request descriptor against a catalogue of real
endpoints for the target cloud, and SHALL NOT make a denied request to a
nonexistent endpoint promotable. Such requests SHALL be recorded as an anomaly
signal, not a proposed rule, and SHALL NOT be forwarded to the cloud.

#### Scenario: Guessed nonexistent endpoint does not enter the allowlist
**Given** the relay is enabled
**When** a caller issues a request to `admin.directory.flooberize:POST`, which is not a real endpoint
**Then** the system denies it
**And** does not forward it to the cloud
**And** records it in the anomaly signal, not the discovery queue
**And** it can never be promoted to an allow rule

#### Scenario: High-volume probing is surfaced as an anomaly
**Given** a single caller issues many denied requests across many endpoints in a short window
**When** the relay records the denials
**Then** the activity is surfaced as an anomaly signal for security review
**And** does not flood the promotable discovery queue

### Requirement: Rule References a Real Endpoint
The relay SHALL reject creation of an allow rule or capability bundle that names
an endpoint not present in the known-endpoint catalogue for its cloud.

#### Scenario: Cannot author a rule for a nonexistent endpoint
**Given** an administrator attempts to create an allow rule for `admin.directory.flooberize:POST`
**When** the rule is validated
**Then** the system rejects it because the endpoint is not in the catalogue

### Requirement: Endpoint Library
The relay SHALL provide an endpoint library, auto-generated from the target
cloud's API catalogue (Google API Discovery documents; Microsoft Graph
`$metadata`), from which an administrator enables endpoints and their actions
before any caller can use them. Enabling a library entry SHALL produce the allow
rules the policy engine evaluates. Library actions SHALL reflect the API's real
operations — not a fixed Create/Read/Update/Delete set — so that custom methods
(e.g. `makeAdmin`, `undelete`) are represented precisely and are not mislabeled
under a CRUD verb.

#### Scenario: Nothing works until enabled from the library
**Given** the relay is enabled but no library entries have been enabled
**When** a caller issues a request to a real endpoint
**Then** the system denies it (default deny)

#### Scenario: Enabling a library entry authorizes its actions
**Given** an administrator enables the directory-users entry with the Read action for a group
**When** a caller in that group issues `admin.directory.users:GET`
**Then** the system allows it
**And** a write or delete on the same entry remains denied until those actions are enabled

#### Scenario: A privileged custom method is not granted by a CRUD toggle
**Given** the directory-users entry exposes a privileged custom method `makeAdmin`
**When** an administrator enables the entry's Update (write) actions
**Then** `makeAdmin` is not enabled
**And** it requires explicit enablement in the privileged-actions category

### Requirement: Catalogue Currency
The relay SHALL keep the endpoint library current with the cloud's API surface by
refreshing from the cloud's Discovery documents on a schedule. A newly discovered
endpoint SHALL appear in the library disabled. The system SHALL NOT require an
administrator to manually catalogue or hand-add endpoints.

#### Scenario: A new cloud endpoint appears disabled
**Given** the cloud adds a new endpoint to its Discovery document
**When** the scheduled catalogue refresh runs
**Then** the endpoint appears in the library disabled
**And** no caller can use it until an administrator enables it

#### Scenario: A real new endpoint is not mislabeled as an attack
**Given** a caller repeatedly issues a valid request to an endpoint not yet in the catalogue
**When** the relay detects repeated same-endpoint unknown hits
**Then** it triggers a debounced on-demand catalogue refresh and re-classifies
**And** if the endpoint now exists it becomes a library discovery hint rather than an anomaly

#### Scenario: On-demand refresh is debounced
**Given** many requests to nonexistent endpoints arrive in a short window
**When** the relay considers on-demand refreshes
**Then** it performs at most one refresh per API per interval
**And** endpoints still absent after the refresh are treated as anomalies

### Requirement: Discovery Points Into the Library
When a caller is denied a request to a valid endpoint, the discovery hint SHALL
identify the library entry and action to enable, rather than presenting a raw
endpoint descriptor.

#### Scenario: A hint names the library entry to enable
**Given** callers repeatedly attempt a denied but valid `admin.directory.groups:DELETE`
**When** an administrator reviews the discovery queue
**Then** the hint identifies the groups library entry and its Delete action to enable

### Requirement: Dark Launch Controls
The relay SHALL be gated by a per-organization feature flag that is off by
default, and enabling the relay SHALL NOT by itself enable write operations.

#### Scenario: Relay disabled by default
**Given** a newly provisioned organization
**When** a relay request is made
**Then** the system rejects it because the relay feature is disabled

#### Scenario: Enabling the relay does not enable writes
**Given** an administrator enables the relay feature
**And** does not enable the separate writes toggle
**When** a caller issues an otherwise-permitted write
**Then** the system denies the write

### Requirement: Cloud-Specific Rule Vocabularies
The relay SHALL evaluate a shared policy engine against separate rule
vocabularies for Google Workspace and Microsoft 365, without assuming the two
clouds share admin semantics.

#### Scenario: Google and Microsoft rules are independent
**Given** an organization grants a Google directory-read capability
**When** a caller issues a Microsoft Graph request
**Then** the Google grant does not authorize the Microsoft request
