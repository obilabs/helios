# Security & Authentication Overhaul

**Status:** Proposed
**Priority:** CRITICAL - Blocks Release
**Author:** AI Agent
**Date:** 2025-12-26

## Executive Summary

This proposal addresses critical security gaps that must be resolved before any public release. A breach in this application could give attackers control over an organization's entire Google Workspace or Microsoft 365 tenant, including:

- Reading/sending emails as any user
- Accessing all files in Drive/OneDrive
- Managing user accounts (create, delete, password reset)
- Accessing calendars, contacts, and all cloud data

**Current Risk Level: CRITICAL**

## Problem Statement

### What's at Risk

| Asset | Current Storage | Risk if Compromised |
|-------|----------------|---------------------|
| GW Service Account Key | AES-256 encrypted in DB | Full domain admin access |
| M365 Service Account | AES-256 encrypted in DB | Full tenant admin access |
| JWT Secret | Environment variable | Token forgery, impersonation |
| Encryption Key | Environment variable | Decrypt all service accounts |
| User Sessions | localStorage JWT | Account takeover |
| Database | PostgreSQL | All customer data |

### Current Security Gaps

1. **No battle-tested auth** - Custom JWT implementation, better-auth abandoned mid-migration
2. **Encryption key in env var** - Single point of failure, no rotation
3. **No audit logging for auth events** - Can't detect or prove breaches
4. **No MFA** - Single factor auth for admin access to email systems
5. **JWT in localStorage** - Vulnerable to XSS attacks
6. **No session invalidation** - Can't revoke access immediately
7. **No key access logging** - Don't know when service account keys are used
8. **No anomaly detection** - Can't detect unusual patterns

### Attack Scenarios

**Scenario 1: XSS Attack**
- Attacker injects script via vulnerable input
- Script steals JWT from localStorage
- Attacker has full user session
- If admin, can export service account keys

**Scenario 2: Database Breach**
- Attacker gains read access to database
- Encrypted service account keys are useless without ENCRYPTION_KEY
- But if they also compromise the server (env vars), game over

**Scenario 3: Insider Threat**
- Developer or admin with server access
- Can read ENCRYPTION_KEY from env
- Can decrypt and exfiltrate all service account keys
- No audit trail of key access

## Proposed Solution

### Phase 1: Authentication Foundation (Week 1-2)

#### 1.1 Complete better-auth Migration

```typescript
// Migrate from custom JWT to better-auth sessions
// - httpOnly cookies (XSS-resistant)
// - Automatic session management
// - Built-in CSRF protection
```

**Migration Steps:**
1. Create migration script to move passwords from `organization_users.password_hash` to `auth_accounts`
2. Update login flow to use better-auth
3. Update all API routes to use session auth
4. Remove localStorage JWT usage
5. Add session table with device/IP tracking

#### 1.2 MFA Implementation

| Login Method | MFA Policy | Configurable |
|--------------|------------|--------------|
| Local password | Required | No |
| LDAP | Required (default) | Yes, with acknowledgment |
| SSO (OIDC/SAML) | Optional | Yes, owner discretion |
| OTP Passwordless | N/A | Built-in second factor |

**Implementation:**
- TOTP (Google Authenticator, Authy)
- WebAuthn/Passkeys (hardware keys, biometrics)
- Backup codes for recovery

#### 1.3 Session Security

```typescript
interface SecureSession {
  id: string;
  userId: string;
  deviceFingerprint: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  mfaVerified: boolean;
  revokedAt?: Date;
  revokedReason?: string;
}
```

- Sessions stored in database (not just cookies)
- Automatic expiry after inactivity
- Force logout capability
- Device management UI

### Phase 2: Audit Logging (Week 2-3)

#### 2.1 Comprehensive Event Logging

```typescript
interface AuditEvent {
  id: string;
  timestamp: Date;

  // Actor
  actorId: string;
  actorType: 'user' | 'service' | 'mtp' | 'system';
  actorEmail?: string;
  actorIp: string;
  actorUserAgent: string;

  // Action
  action: string;           // e.g., 'user.create', 'email.send', 'key.access'
  actionCategory: string;   // e.g., 'auth', 'admin', 'data', 'security'

  // Target
  targetType?: string;      // e.g., 'user', 'group', 'service_account'
  targetId?: string;
  targetEmail?: string;

  // Context
  ticketReference?: string; // For MTP-initiated actions
  sessionId: string;
  organizationId: string;

  // Outcome
  outcome: 'success' | 'failure' | 'partial';
  errorCode?: string;
  errorMessage?: string;

  // Changes
  changesBefore?: Record<string, any>;
  changesAfter?: Record<string, any>;

  // Security
  riskScore?: number;       // Anomaly detection score
  flagged?: boolean;        // Manual or automatic flag
}
```

#### 2.2 Critical Events to Log

**Authentication:**
- Login attempts (success/failure)
- MFA verification
- Password changes
- Session creation/destruction
- Token refresh

**Authorization:**
- Permission changes
- Role assignments
- Access denials

**Service Account Access:**
- Key decryption events (CRITICAL)
- API calls using service account
- Token generation for Google/Microsoft

**Data Access:**
- User data exports
- Bulk operations
- Email access via API
- Drive file access

**Administrative:**
- User creation/deletion
- Settings changes
- Module enable/disable

#### 2.3 Tamper-Evident Logging

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  -- ... all fields above ...

  -- Tamper detection
  previous_hash VARCHAR(64),  -- Hash of previous record
  record_hash VARCHAR(64),    -- Hash of this record

  -- Immutability
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- No updated_at - records are immutable

  CONSTRAINT no_updates CHECK (created_at = created_at)
);

-- Prevent updates and deletes
CREATE RULE no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

#### 2.4 Real-time Alerting

```typescript
const alertRules = [
  {
    name: 'multiple_failed_logins',
    condition: 'COUNT(failed_login) > 5 IN 5 minutes FROM same IP',
    severity: 'high',
    action: 'block_ip_temporarily'
  },
  {
    name: 'service_account_key_access',
    condition: 'action = "key.decrypt"',
    severity: 'info',
    action: 'log_and_notify_admin'
  },
  {
    name: 'bulk_email_access',
    condition: 'COUNT(email.read) > 100 IN 1 minute',
    severity: 'critical',
    action: 'suspend_session_and_alert'
  },
  {
    name: 'admin_action_outside_hours',
    condition: 'actionCategory = "admin" AND hour NOT BETWEEN 8 AND 18',
    severity: 'medium',
    action: 'flag_for_review'
  }
];
```

### Phase 3: Secrets Management (Week 3-4)

#### 3.1 Key Hierarchy

```
Master Key (Vault/KMS)
    └── Organization Key Encryption Key (KEK)
            └── Service Account Key (DEK)
            └── API Keys (DEK)
            └── Other Secrets (DEK)
```

#### 3.2 Options for Key Storage

**Option A: HashiCorp Vault - Self-Hosted (Default/Recommended)**
- Open source, no cloud dependencies
- Runs as Docker container alongside Helios
- Auto-unseal with local key file or transit
- Full audit logging built-in
- Cost: Free
- Best for: On-premise, privacy-conscious, full control

```yaml
# docker-compose.yml addition
vault:
  image: hashicorp/vault:latest
  container_name: helios_vault
  cap_add:
    - IPC_LOCK
  environment:
    VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_TOKEN}
    VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200
  ports:
    - "8200:8200"
  volumes:
    - vault_data:/vault/file
  networks:
    - helios_client_network
```

**Option B: Cloud KMS (For Cloud Deployments)**
- AWS KMS, GCP KMS, or Azure Key Vault
- Keys never leave the cloud HSM
- Automatic rotation
- Cost: ~$1/key/month
- Best for: Azure App Service, AWS ECS, GCP Cloud Run deployments

**Option C: Encrypted File with Secure Permissions (Minimum Viable)**
- Master key in file with 0400 permissions, owned by root
- Key loaded at startup, not in env vars
- Requires secure host configuration
- Best for: Simple deployments, testing
- Note: Less secure than Vault but better than env vars

```bash
# Key file setup
sudo mkdir -p /etc/helios/secrets
sudo chmod 700 /etc/helios/secrets
sudo openssl rand -hex 32 > /etc/helios/secrets/master.key
sudo chmod 400 /etc/helios/secrets/master.key
sudo chown root:root /etc/helios/secrets/master.key
```

#### 3.3 Service Account Key Protection

```typescript
// Current (vulnerable)
const key = decrypt(encryptedKey, process.env.ENCRYPTION_KEY);

// Proposed (secure)
async function getServiceAccountKey(orgId: string, purpose: string): Promise<ServiceAccountKey> {
  // 1. Log the access attempt
  await auditLog({
    action: 'service_account.key_access',
    targetId: orgId,
    context: { purpose }
  });

  // 2. Check permissions
  if (!canAccessServiceAccount(currentUser, orgId)) {
    throw new AuthorizationError('Not authorized to access service account');
  }

  // 3. Decrypt via KMS (key never in memory on our server)
  const key = await kms.decrypt({
    keyId: `org-${orgId}-service-account`,
    ciphertext: encryptedKey
  });

  // 4. Return with automatic expiry
  return {
    key,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute TTL
    purpose
  };
}
```

### Phase 4: API Security (Week 4-5)

#### 4.1 API Authentication Types

| Type | Use Case | Auth Method |
|------|----------|-------------|
| User Session | Web UI | httpOnly cookie + CSRF |
| Vendor API | MTP Portal | API Key + User Context Header |
| Service Key | 3rd Party Apps | API Key + IP Whitelist |
| Webhook | Inbound events | Signature verification |

#### 4.2 Vendor API (MTP Integration)

```typescript
// Required headers for MTP API calls
interface MTPRequestHeaders {
  'X-API-Key': string;           // MTP's API key
  'X-Actor-User-Id': string;     // User initiating the action
  'X-Actor-Email': string;       // User's email for logging
  'X-Ticket-Reference'?: string; // Optional ticket number
  'X-Request-Id': string;        // For request tracing
}

// Middleware validates and logs
async function mtpAuthMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const actorUserId = req.headers['x-actor-user-id'];

  // Validate API key
  const mtp = await validateMTPApiKey(apiKey);
  if (!mtp) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Actor is required for all mutating operations
  if (req.method !== 'GET' && !actorUserId) {
    return res.status(400).json({ error: 'X-Actor-User-Id required for mutations' });
  }

  // Attach to request for logging
  req.actor = {
    type: 'mtp',
    mtpId: mtp.id,
    userId: actorUserId,
    email: req.headers['x-actor-email'],
    ticketRef: req.headers['x-ticket-reference']
  };

  next();
}
```

#### 4.3 Service Keys

```typescript
interface ServiceKey {
  id: string;
  name: string;
  keyHash: string;          // Only hash stored, not the key
  prefix: string;           // First 8 chars for identification

  // Permissions
  scopes: string[];         // e.g., ['users:read', 'groups:write']

  // Restrictions
  ipWhitelist?: string[];
  rateLimit: number;        // Requests per minute

  // Metadata
  createdBy: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;

  // Status
  isActive: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  revokedReason?: string;
}
```

### Phase 5: SSO Integration (Week 5-6)

#### 5.1 Supported Providers

| Provider | Protocol | Status |
|----------|----------|--------|
| Google Workspace | OIDC | Planned |
| Microsoft Entra | OIDC/SAML | Planned |
| Okta | OIDC/SAML | Planned |
| JumpCloud | OIDC/SAML | Planned |
| Generic OIDC | OIDC | Planned |
| Generic SAML | SAML 2.0 | Planned |
| LDAP/AD | LDAP | Planned |

#### 5.2 SSO Configuration

```typescript
interface SSOConfiguration {
  id: string;
  provider: 'google' | 'microsoft' | 'okta' | 'jumpcloud' | 'oidc' | 'saml' | 'ldap';

  // Display
  name: string;
  buttonLabel: string;

  // OIDC Config
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string;  // Encrypted
    scopes: string[];
  };

  // SAML Config
  saml?: {
    entityId: string;
    ssoUrl: string;
    certificate: string;
    signatureAlgorithm: string;
  };

  // LDAP Config
  ldap?: {
    url: string;
    bindDn: string;
    bindPassword: string;  // Encrypted
    baseDn: string;
    userFilter: string;
    attributes: Record<string, string>;
  };

  // Policies
  mfaRequired: boolean;
  mfaAcknowledgment?: string;  // If mfaRequired=false, requires acknowledgment
  autoProvision: boolean;
  defaultRole: string;

  // Status
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Phase 6: OTP Passwordless (Week 6)

```typescript
// Flow
// 1. User enters email
// 2. System sends 6-digit code (valid 10 minutes)
// 3. User enters code
// 4. Session created

interface OTPLogin {
  email: string;
  code: string;           // 6 digits
  codeHash: string;       // Stored hash
  expiresAt: Date;
  attempts: number;       // Max 3
  createdAt: Date;
  ipAddress: string;
  verified: boolean;
}

// Security measures
// - Rate limit: 3 OTP requests per email per hour
// - Code expires in 10 minutes
// - Max 3 verification attempts
// - Different code each request
// - Codes are one-time use
```

## Database Schema Changes

```sql
-- Session management
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id),

  -- Device info
  device_fingerprint VARCHAR(64),
  ip_address INET,
  user_agent TEXT,

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Security
  mfa_verified BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_method VARCHAR(20),  -- 'totp', 'webauthn', 'backup_code'

  -- Revocation
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_reason VARCHAR(100)
);

-- MFA setup
CREATE TABLE user_mfa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id),

  -- TOTP
  totp_secret_encrypted TEXT,
  totp_verified BOOLEAN DEFAULT FALSE,

  -- WebAuthn
  webauthn_credentials JSONB DEFAULT '[]',

  -- Backup codes
  backup_codes_hash TEXT[],  -- Array of hashed codes
  backup_codes_used INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SSO configurations
CREATE TABLE sso_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  provider VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  config_encrypted TEXT NOT NULL,  -- Encrypted JSON

  mfa_required BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_acknowledgment TEXT,
  auto_provision BOOLEAN DEFAULT FALSE,
  default_role VARCHAR(20) DEFAULT 'user',

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API keys (for service accounts and MTP)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,  -- For identification
  key_hash VARCHAR(64) NOT NULL,   -- SHA-256 of key

  key_type VARCHAR(20) NOT NULL,   -- 'service', 'mtp', 'webhook'
  scopes TEXT[] NOT NULL,

  ip_whitelist INET[],
  rate_limit INT DEFAULT 60,

  created_by UUID NOT NULL REFERENCES organization_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  is_active BOOLEAN DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  revoked_reason VARCHAR(200)
);

-- Enhanced audit logs
CREATE TABLE security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Actor
  actor_id UUID,
  actor_type VARCHAR(20) NOT NULL,  -- 'user', 'service', 'mtp', 'system'
  actor_email VARCHAR(255),
  actor_ip INET,
  actor_user_agent TEXT,

  -- Action
  action VARCHAR(100) NOT NULL,
  action_category VARCHAR(50) NOT NULL,

  -- Target
  target_type VARCHAR(50),
  target_id UUID,
  target_identifier VARCHAR(255),

  -- Context
  session_id UUID,
  organization_id UUID NOT NULL,
  request_id VARCHAR(64),
  ticket_reference VARCHAR(100),

  -- Outcome
  outcome VARCHAR(20) NOT NULL,
  error_code VARCHAR(50),
  error_message TEXT,

  -- Changes
  changes_before JSONB,
  changes_after JSONB,

  -- Security
  risk_score SMALLINT,
  flagged BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,

  -- Integrity
  previous_hash VARCHAR(64),
  record_hash VARCHAR(64) NOT NULL
);

-- Indexes for audit log queries
CREATE INDEX idx_audit_timestamp ON security_audit_logs(timestamp DESC);
CREATE INDEX idx_audit_actor ON security_audit_logs(actor_id, timestamp DESC);
CREATE INDEX idx_audit_action ON security_audit_logs(action, timestamp DESC);
CREATE INDEX idx_audit_target ON security_audit_logs(target_id, timestamp DESC);
CREATE INDEX idx_audit_flagged ON security_audit_logs(flagged, timestamp DESC) WHERE flagged = TRUE;

-- Prevent modifications
CREATE RULE prevent_audit_update AS ON UPDATE TO security_audit_logs DO INSTEAD NOTHING;
CREATE RULE prevent_audit_delete AS ON DELETE TO security_audit_logs DO INSTEAD NOTHING;
```

## Implementation Tasks

### Phase 1: Authentication (Priority: CRITICAL)
- [ ] Create password migration script (organization_users -> auth_accounts)
- [ ] Configure better-auth with session-based auth
- [ ] Replace localStorage JWT with httpOnly cookies
- [ ] Update all API routes to use session auth
- [ ] Add CSRF protection
- [ ] Implement session management UI
- [ ] Add device tracking

### Phase 2: MFA (Priority: CRITICAL)
- [ ] Implement TOTP setup flow
- [ ] Add TOTP verification to login
- [ ] Implement backup codes
- [ ] Add WebAuthn/Passkey support
- [ ] Create MFA policy engine
- [ ] Build MFA management UI

### Phase 3: Audit Logging (Priority: CRITICAL)
- [ ] Create security_audit_logs table
- [ ] Implement audit logging middleware
- [ ] Add hash chain for tamper detection
- [ ] Log all auth events
- [ ] Log service account key access
- [ ] Log all admin actions
- [ ] Build audit log viewer UI
- [ ] Implement export functionality

### Phase 4: Secrets Management (Priority: HIGH)
- [ ] Evaluate KMS options (AWS/GCP/Azure/Vault)
- [ ] Implement key hierarchy
- [ ] Migrate service account encryption to KMS
- [ ] Add key access logging
- [ ] Implement key rotation
- [ ] Remove ENCRYPTION_KEY from env vars

### Phase 5: API Security (Priority: HIGH)
- [ ] Implement API key system
- [ ] Add MTP vendor API authentication
- [ ] Add service key management
- [ ] Implement IP whitelisting
- [ ] Add rate limiting per key
- [ ] Build API key management UI

### Phase 6: SSO (Priority: MEDIUM)
- [ ] Implement OIDC provider support
- [ ] Add SAML 2.0 support
- [ ] Add LDAP/AD integration
- [ ] Build SSO configuration UI
- [ ] Implement auto-provisioning
- [ ] Add SSO-specific MFA policies

### Phase 7: OTP Passwordless (Priority: MEDIUM)
- [ ] Implement OTP generation and email
- [ ] Add OTP verification flow
- [ ] Build passwordless login UI
- [ ] Add rate limiting

## Security Considerations

### Key Theft Prevention

**Q: Can the service account key be stolen from our app?**

**Current vulnerabilities:**
1. **Server compromise** - If attacker gains shell access, they can read ENCRYPTION_KEY from env and decrypt keys from database
2. **SQL injection** - Could exfiltrate encrypted keys (useless without encryption key)
3. **Application vulnerability** - RCE could expose env vars
4. **Insider threat** - Anyone with server access can read keys
5. **Backup theft** - Database backups contain encrypted keys

**Mitigations (implemented in this proposal):**
1. **KMS integration** - Keys never exist in plaintext on our servers
2. **Key access logging** - Every decryption is logged with context
3. **Anomaly detection** - Unusual access patterns trigger alerts
4. **Session binding** - Service account access tied to authenticated session
5. **Rate limiting** - Can't bulk-export keys quickly
6. **Least privilege** - Service accounts only requested when needed

**Post-breach detection:**
1. Audit logs show all key access
2. Tamper-evident logging proves timeline
3. Alert rules catch unusual patterns
4. Forensic export for investigation

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Auth method | Custom JWT | better-auth sessions |
| MFA adoption | 0% | 100% for local/LDAP |
| Audit coverage | ~10% | 100% of security events |
| Key access logging | None | 100% with context |
| Mean time to detect breach | Unknown | < 1 hour |
| Session management | None | Full device tracking |

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. Authentication | 2 weeks | None |
| 2. MFA | 1 week | Phase 1 |
| 3. Audit Logging | 1 week | Phase 1 |
| 4. Secrets Management | 1 week | Phase 3 |
| 5. API Security | 1 week | Phase 1, 3 |
| 6. SSO | 2 weeks | Phase 1, 2 |
| 7. OTP Passwordless | 1 week | Phase 1 |

**Total: 8-10 weeks for complete implementation**

## Appendix A: Compliance Mapping

| Requirement | SOC 2 | ISO 27001 | GDPR |
|-------------|-------|-----------|------|
| MFA | CC6.1 | A.9.4.2 | Art. 32 |
| Audit Logging | CC7.2 | A.12.4 | Art. 30 |
| Access Control | CC6.3 | A.9.2 | Art. 25 |
| Encryption | CC6.7 | A.10.1 | Art. 32 |
| Session Management | CC6.1 | A.9.4.3 | Art. 32 |

## Appendix B: Chat UI Library Evaluation

For the AI assistant / help widget, we evaluated chat UI libraries:

### Evaluation Criteria
- Bundle size (affects load time)
- Accessibility (WCAG compliance)
- Customization (theming, layout)
- Maintenance (active development, security patches)
- Dependencies (supply chain risk)

### Libraries Evaluated

| Library | Bundle | Stars | Last Update | Deps | Verdict |
|---------|--------|-------|-------------|------|---------|
| @chatscope/chat-ui-kit-react | 150kb | 1.3k | Active | 2 | **Recommended** |
| react-chat-elements | 40kb | 1.2k | 6 months | 3 | Good for simple |
| stream-chat-react | 200kb | 800 | Active | 15+ | Overkill (needs backend) |
| Custom (roll our own) | ~10kb | - | - | 0 | For simple cards only |

### Recommendation

**Use @chatscope/chat-ui-kit-react for:**
- AI chat panel (human/AI conversation bubbles)
- Message threading
- Typing indicators
- Avatar support

**Roll our own for:**
- Simple notification cards (acknowledge buttons)
- Alert banners
- Toast messages

### Rationale

The AI chat interface is complex enough to warrant a library:
- Message history with scroll
- Different message types (user, AI, system)
- Code blocks, markdown rendering
- Typing indicators
- Accessibility (keyboard nav, screen readers)

Notification cards are simple enough to build:
- Static content
- Acknowledge button
- Dismiss action
- No complex state

### Security Considerations

For any library we use:
1. Pin exact versions (no `^` or `~`)
2. Run `npm audit` in CI
3. Use Dependabot/Renovate for updates
4. Review changelogs before updating
5. Consider vendoring critical deps

## Appendix C: Self-Hosted Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Docker Host (Single Server or VM)                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│  │  Nginx   │────▶│  Helios  │────▶│ Postgres │            │
│  │  (443)   │     │  Backend │     │  (5432)  │            │
│  └──────────┘     └────┬─────┘     └──────────┘            │
│                        │                                     │
│       ┌────────────────┼────────────────┐                   │
│       ▼                ▼                ▼                   │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│  │  Vault   │     │  Redis   │     │  MinIO   │            │
│  │  (8200)  │     │  (6379)  │     │  (9000)  │            │
│  └──────────┘     └──────────┘     └──────────┘            │
│                                                              │
│  ┌──────────┐     ┌──────────┐                              │
│  │  Loki    │     │ Grafana  │  (Optional: Logging)         │
│  │  (3100)  │     │  (3001)  │                              │
│  └──────────┘     └──────────┘                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘

External Dependencies: NONE
All services run locally in Docker.
```

### Cloud Deployment (Azure App Service Example)

```
┌─────────────────────────────────────────────────────────────┐
│  Azure                                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐                      │
│  │ App Service  │────▶│ Azure        │                      │
│  │ (Helios)     │     │ PostgreSQL   │                      │
│  └──────┬───────┘     └──────────────┘                      │
│         │                                                    │
│    ┌────┴────┐                                              │
│    ▼         ▼                                              │
│  ┌─────┐  ┌─────────┐  ┌──────────┐                        │
│  │Redis│  │Key Vault│  │Blob Store│                        │
│  │Cache│  │(secrets)│  │(assets)  │                        │
│  └─────┘  └─────────┘  └──────────┘                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
