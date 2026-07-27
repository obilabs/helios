# Add API Key Management System

## Summary
Implement a dual-tier API key authentication system for secure machine-to-machine and vendor access. Service keys enable automation without human attribution, while Vendor keys enforce actor identification for compliance and audit requirements. This enables Helios MTP and other third-party systems to integrate securely with comprehensive audit trails.

## Problem Statement
Currently, Helios lacks a secure way for external systems to authenticate API requests. The only option is creating fake "service account" users in the directory, which:
- Clutters the user list with non-human accounts
- Provides inappropriate user-level permissions (admin/manager/user roles too coarse)
- Cannot distinguish between human operators and automated systems
- Lacks proper audit attribution (who performed the action via the API?)
- Doesn't support key rotation or expiration
- Cannot track API usage or enforce rate limits per integration

For Helios MTP (multi-tenant platform) integration, we need to know:
- **WHAT** happened (user created, group updated)
- **WHEN** it happened (timestamp)
- **WHO** authorized it (which API key/vendor)
- **WHO** performed it (MSP technician name/email OR automation system)
- **WHY** it happened (ticket number, reference)
- **FROM WHERE** (IP address, system)

## Proposed Solution
Create a comprehensive API key management system with two distinct key types:

### 1. **Service Keys** (Automation)
For system-to-system automation where no human operator is involved:
- Examples: Scheduled sync jobs, automated reports, integration webhooks
- No actor information required
- Longer expiration (1 year+)
- Simple audit trail (system name only)

### 2. **Vendor Keys** (Human Operators)
For third-party vendors with human operators performing actions:
- Examples: MSP technicians, support contractors, partner portals
- **REQUIRES** actor information with every API request:
  - X-Actor-Name: "John Smith"
  - X-Actor-Email: "john.smith@msp.com"
  - X-Actor-ID: "emp_12345" (optional)
  - X-Client-Reference: "TICKET-789" (optional)
- Shorter expiration (90 days default)
- Rich audit trail showing human attribution
- Optional pre-approved actor list
- Optional ticket/reference requirement

### Key Features
- **Scoped Permissions**: Fine-grained access control (read:users, write:groups, etc.)
- **Expiration & Renewal**: Keys expire with easy renewal workflow
- **Comprehensive Audit Logging**: Every API call tracked with full context
- **IP Whitelisting**: Optional IP restrictions per key
- **Rate Limiting**: Per-key rate limits
- **Settings > Integrations UI**: Professional management interface
- **Show Once Security**: Keys displayed only once on creation
- **Key Rotation**: Generate new key, revoke old seamlessly

## Success Criteria
- Helios MTP can authenticate and perform user/group operations
- All API actions clearly attributed to specific humans or systems
- Audit logs show who (MSP technician) did what via which vendor
- Keys can be created, renewed, and revoked without downtime
- Zero plaintext key storage (hashed like passwords)
- Full compliance with enterprise audit requirements

## Scope

### In Scope
- Dual-tier API key system (Service + Vendor types)
- API key CRUD operations (create, list, view, revoke, renew)
- Authentication middleware for API key validation
- Actor attribution enforcement for vendor keys
- Comprehensive audit logging with actor context
- Settings > Integrations tab UI
- Key creation wizard with type selection
- "Show once" modal for new keys
- Expiration management and renewal workflow
- Permission scoping system
- IP whitelisting (optional per key)
- Database schema and migrations
- E2E tests for key management flows

### Out of Scope (Future Enhancements)
- Webhooks (Phase 2)
- OAuth2/OIDC for third-party apps (Phase 3)
- API usage analytics dashboard (Phase 2)
- Automated key rotation (Phase 3)
- Multi-factor authentication for key creation (Phase 3)

## Technical Approach

### Database Schema
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('service', 'vendor')),

  -- Never store plaintext - hash like passwords
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(20) NOT NULL,  -- For UI display

  permissions JSONB NOT NULL,

  -- Expiration
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id),
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,

  -- Service-specific
  service_config JSONB,  -- { systemName, automationRules, etc. }

  -- Vendor-specific
  vendor_config JSONB,   -- { vendorName, requiresActor, allowedActors, etc. }

  -- Security
  ip_whitelist JSONB,
  rate_limit_config JSONB,

  UNIQUE(organization_id, name)
);

CREATE TABLE api_key_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id),
  timestamp TIMESTAMP DEFAULT NOW(),

  -- The action
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(255),
  result VARCHAR(20) NOT NULL,  -- success/failure

  -- Actor context (for vendor keys)
  actor_type VARCHAR(20),  -- human/automation/system
  actor_name VARCHAR(255),
  actor_email VARCHAR(255),
  actor_id VARCHAR(255),
  client_reference VARCHAR(255),

  -- Request context
  ip_address INET NOT NULL,
  user_agent TEXT,
  request_duration INTEGER,  -- milliseconds

  -- Additional metadata
  metadata JSONB
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(organization_id, is_active);
CREATE INDEX idx_api_usage_key ON api_key_usage_logs(api_key_id, timestamp DESC);
CREATE INDEX idx_api_usage_actor ON api_key_usage_logs(actor_email, timestamp DESC);
```

### Backend Architecture
- **Middleware**: `authenticateApiKey(req, res, next)`
  - Validates API key from `X-API-Key` header
  - Checks expiration and IP whitelist
  - For vendor keys: validates actor headers are present
  - Attaches key and actor context to request
  - Updates `last_used_at` timestamp

- **API Endpoints**: `/api/organization/api-keys/*`
  - POST /api-keys - Create new key
  - GET /api-keys - List all keys
  - GET /api-keys/:id - Get key details
  - PATCH /api-keys/:id - Update permissions/expiration
  - DELETE /api-keys/:id - Revoke key
  - POST /api-keys/:id/renew - Renew expired key
  - GET /api-keys/:id/usage - Usage history

- **Key Generation**: Cryptographically secure random keys
  - Format: `helios_{env}_{random32bytes}`
  - Example: `helios_prod_a9k3f8ds7fg2h5j1k4l9m3n8p2q7r5t6`
  - Hash with SHA-256 for storage
  - Show prefix in UI: `helios_prod_a9k3...`

### Frontend Architecture
- **Settings > Integrations Tab**: New tab in Settings component
  - API Keys section
  - List view (active/revoked keys)
  - Create key wizard
  - Key detail view

- **Components**:
  - `ApiKeyList.tsx` - List of keys with actions
  - `ApiKeyCreateWizard.tsx` - Multi-step creation flow
  - `ApiKeyShowOnce.tsx` - Modal to display new key
  - `ApiKeyDetail.tsx` - View key details and usage
  - `ApiKeyRenewDialog.tsx` - Renewal confirmation

## User Experience

### Creating a Service Key
1. Settings > Integrations > API Keys > "+ Create New Key"
2. Choose type: "🤖 Service / Automation"
3. Fill form:
   - Service Name: "Helios MTP Automated Sync"
   - Description: "Syncs user data every 4 hours"
   - Permissions: Select scopes (read:users, write:users, read:groups)
   - Expiration: 365 days or Never
4. Create → Show once modal with key
5. User copies key → Confirmation
6. Key appears in list

### Creating a Vendor Key
1. Settings > Integrations > API Keys > "+ Create New Key"
2. Choose type: "👥 Vendor / Partner Access"
3. Fill form:
   - Vendor Name: "GridWorx MSP"
   - Vendor Contact Email: "support@gridworx.io"
   - Description: "Access for MSP technicians"
   - ⚠️ Actor Information Required (checkbox pre-checked, disabled)
   - Pre-approved Actors (optional list)
   - Permissions: Select scopes
   - Client Reference Required: Yes/No
   - Expiration: 90 days (recommended)
4. Create → Show once modal with key + integration instructions
5. User copies key → Confirmation
6. Key appears in list

### Renewing an Expired Key
1. Expired key shows ⚠️ Expired badge
2. Click "Renew Key" button
3. Confirmation dialog:
   - Generates new key with same config
   - Old key remains revoked
   - New expiration date set
4. Show once modal with new key
5. Updated key appears in list

### Viewing Activity
1. Click key → Detail view
2. "Usage" tab shows:
   - Recent API calls
   - Actor attribution (for vendor keys)
   - Success/failure rates
   - Usage graph over time
3. Export option for compliance reports

## Security Considerations
1. ✅ Never store plaintext keys (hash with SHA-256)
2. ✅ Show key only once on creation
3. ✅ Enforce actor attribution for vendor keys
4. ✅ Optional IP whitelisting per key
5. ✅ Rate limiting per key
6. ✅ Expiration enforcement (no "never expire" for vendors)
7. ✅ Comprehensive audit logging
8. ✅ Easy revocation
9. ✅ Renewal workflow (not reactivation)
10. ✅ Pre-approved actor lists (optional)

## Testing Strategy
- Unit tests for key generation and hashing
- Integration tests for authentication middleware
- E2E tests for:
  - Service key creation and usage
  - Vendor key creation with actor attribution
  - Key expiration enforcement
  - Renewal workflow
  - Revocation
  - Actor validation for vendor keys
  - Audit log entries

## Migration Strategy
No migration needed - this is a new feature. Existing authentication continues to work via JWT tokens for human users.

## Documentation Requirements
1. API Key Management user guide
2. Integration guide for Helios MTP
3. Security best practices
4. Actor attribution requirements for vendors
5. API reference for authenticated endpoints

## Risks & Mitigation
| Risk | Impact | Mitigation |
|------|--------|------------|
| Key leakage | High | Show once, audit logging, easy revocation |
| Vendor non-compliance | Medium | Enforce actor headers, reject requests without |
| Performance impact | Low | Efficient hash lookups, caching, rate limiting |
| Audit log volume | Medium | Retention policies, log rotation, archival |

## Dependencies
- Existing authentication middleware
- Audit logging system
- Settings UI framework
- Database migrations system

## Timeline Estimate
- Backend (database, API, middleware): 4-5 hours
- Frontend (UI components, wizard): 3-4 hours
- Testing (unit, integration, E2E): 2-3 hours
- Documentation: 1-2 hours
- **Total: 10-14 hours (2-3 work days)**

## Success Metrics
- Helios MTP successfully authenticates and operates
- 100% of vendor API actions attributed to specific humans
- Zero plaintext keys in database
- Audit logs meet compliance requirements
- Key creation takes < 2 minutes
- Renewal workflow takes < 1 minute

## Open Questions
1. ✅ Should service keys ever expire? **Decision: Optional, default 1 year**
2. ✅ Require pre-approved actors for all vendor keys? **Decision: Optional per key**
3. ✅ IP whitelisting mandatory for production? **Decision: Optional per key**
4. ❓ Rate limits per key - what are reasonable defaults?
5. ❓ How long to retain audit logs? (30 days? 1 year?)
6. ❓ Should we support key rotation (automatic replacement)?
