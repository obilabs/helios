# API Authentication Capability

## ADDED Requirements

### Requirement: API Key Authentication Method
The system SHALL support API key authentication as an alternative to JWT token authentication for programmatic access.

#### Scenario: Service authenticates with API key
**Given** a service has a valid API key
**When** the service makes an API request with X-API-Key header
**Then** the system authenticates the request
**And** grants access to permitted resources

### Requirement: Dual-Tier API Key Types
The system SHALL support two distinct API key types: Service keys for automation and Vendor keys for human operators.

#### Scenario: Service key for automation
**Given** an administrator creates a Service API key
**When** an automated system uses the key
**Then** no actor attribution is required
**And** the audit log shows system-level attribution

#### Scenario: Vendor key for human operators
**Given** an administrator creates a Vendor API key
**When** a human operator uses the key
**Then** actor attribution headers are required
**And** the audit log shows human-level attribution

### Requirement: Actor Attribution Enforcement
The system SHALL enforce actor attribution for Vendor API keys by requiring X-Actor-Name and X-Actor-Email headers.

#### Scenario: Vendor key without actor headers (rejection)
**Given** a Vendor API key exists
**When** a request is made without X-Actor-Name header
**Then** the system returns HTTP 400
**And** the error message specifies required headers

#### Scenario: Vendor key with actor headers (success)
**Given** a Vendor API key exists
**When** a request includes X-Actor-Name and X-Actor-Email headers
**Then** the system authenticates the request
**And** the actor context is attached to the request

### Requirement: API Key Format and Storage
The system SHALL generate API keys in the format helios_{env}_{random} and store only SHA-256 hashes, never plaintext.

#### Scenario: Key generation
**Given** an administrator creates a new API key
**When** the key is generated
**Then** the format matches helios_{env}_{random}
**And** only the SHA-256 hash is stored in the database
**And** the plaintext key is shown once and never retrievable

### Requirement: API Key Expiration
The system SHALL enforce API key expiration dates and reject expired keys.

#### Scenario: Expired key rejection
**Given** an API key has expired
**When** a request is made with the expired key
**Then** the system returns HTTP 401
**And** the error message indicates the key is expired

### Requirement: IP Whitelisting (Optional)
The system SHALL support optional IP whitelisting per API key to restrict access by source IP address.

#### Scenario: Request from whitelisted IP
**Given** an API key has IP whitelist [198.51.100.0/24]
**When** a request originates from 198.51.100.50
**Then** the system authenticates the request

#### Scenario: Request from non-whitelisted IP
**Given** an API key has IP whitelist [198.51.100.0/24]
**When** a request originates from 203.0.113.10
**Then** the system returns HTTP 403
**And** the error message indicates IP not whitelisted

### Requirement: API Key Revocation
The system SHALL support immediate revocation of API keys, after which they cannot be used for authentication.

#### Scenario: Revoked key rejection
**Given** an API key has been revoked
**When** a request is made with the revoked key
**Then** the system returns HTTP 401
**And** the error message indicates the key is invalid

### Requirement: Permission Scoping
The system SHALL enforce fine-grained permissions per API key (read:users, write:groups, etc.).

#### Scenario: Request exceeds key permissions
**Given** an API key has permissions [read:users]
**When** the key attempts to create a user (write:users)
**Then** the system returns HTTP 403
**And** the error message indicates insufficient permissions

### Requirement: Rate Limiting Per Key
The system SHALL enforce per-key rate limits to prevent abuse.

#### Scenario: Rate limit exceeded
**Given** an API key has rate limit 1000 requests/hour
**When** the key makes 1001 requests in one hour
**Then** the system returns HTTP 429
**And** the error message indicates rate limit exceeded

### Requirement: Last Used Tracking
The system SHALL track and display the last used timestamp for each API key.

#### Scenario: Last used timestamp updates
**Given** an API key exists
**When** a request is authenticated with the key
**Then** the last_used_at timestamp is updated
**And** the timestamp is visible in the management UI

### Requirement: Pre-Approved Actor Lists (Optional)
The system SHALL support optional pre-approved actor lists for Vendor keys to restrict which humans can use the key.

#### Scenario: Actor not on pre-approved list
**Given** a Vendor key has allowedActors [john@msp.com]
**When** a request includes X-Actor-Email: sarah@msp.com
**Then** the system returns HTTP 403
**And** the error message indicates actor not pre-approved

#### Scenario: Actor on pre-approved list
**Given** a Vendor key has allowedActors [john@msp.com]
**When** a request includes X-Actor-Email: john@msp.com
**Then** the system authenticates the request

### Requirement: Backward Compatibility
The system SHALL maintain full backward compatibility with existing JWT token authentication.

#### Scenario: JWT authentication still works
**Given** a user has a valid JWT token
**When** the user makes an API request with Authorization: Bearer {token}
**Then** the system authenticates the request using JWT
**And** all existing functionality continues to work

### Requirement: Authentication Priority
The system SHALL attempt API key authentication first, then fall back to JWT if no API key is present.

#### Scenario: Both API key and JWT present
**Given** a request includes both X-API-Key and Authorization headers
**When** the authentication middleware processes the request
**Then** the system uses the API key for authentication
**And** ignores the JWT token

#### Scenario: Only JWT present
**Given** a request includes only Authorization header
**When** the authentication middleware processes the request
**Then** the system uses JWT authentication
