# API Key Management - Design Document

## Architecture Overview

### System Context
```
┌─────────────────────────────────────────────────────────────┐
│  External Systems                                            │
│  ┌──────────────────┐     ┌──────────────────┐            │
│  │ Helios MTP       │     │ Other Services   │            │
│  │ (Vendor Key)     │     │ (Service Key)    │            │
│  └────────┬─────────┘     └────────┬─────────┘            │
└───────────┼──────────────────────────┼──────────────────────┘
            │                          │
            │ X-API-Key               │ X-API-Key
            │ X-Actor-Name            │
            │ X-Actor-Email           │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Helios Client Portal API                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Authentication Middleware                               ││
│  │ ├─ JWT Token Auth (existing)                           ││
│  │ └─ API Key Auth (new)                                  ││
│  │    ├─ Validate key hash                                ││
│  │    ├─ Check expiration                                 ││
│  │    ├─ Verify IP whitelist                              ││
│  │    ├─ Enforce actor headers (vendor keys)              ││
│  │    └─ Log usage                                        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ API Endpoints                                           ││
│  │ ├─ /api/organization/users                             ││
│  │ ├─ /api/organization/groups                            ││
│  │ └─ /api/organization/api-keys (management)             ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Database                                                ││
│  │ ├─ api_keys                                            ││
│  │ └─ api_key_usage_logs                                  ││
│  └─────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

## Design Decisions

### Decision 1: Dual-Tier Key System

**Options Considered:**
1. Single key type with optional actor fields
2. Dual-tier system (Service vs Vendor keys)
3. Multiple key types (Service, Vendor, Partner, Integration, etc.)

**Decision:** Option 2 - Dual-tier system

**Rationale:**
- **Clear mental model**: Automation vs Human operators
- **Enforces compliance**: Vendor keys REQUIRE actor attribution
- **Scales appropriately**: Two types cover 95% of use cases
- **Simple to understand**: Avoid decision paralysis with too many options
- **Follows industry patterns**: Similar to AWS IAM (Service vs User credentials)

**Trade-offs:**
- ✅ Clear distinction prevents misuse
- ✅ Easy to explain and document
- ❌ Less flexible than single unified system
- ❌ Code duplication for type-specific logic

### Decision 2: Settings > Integrations (not Directory > Service Accounts)

**Options Considered:**
1. Directory > Users > Service Accounts tab
2. Settings > Integrations > API Keys
3. Settings > Security > API Keys
4. Separate top-level "Integrations" menu item

**Decision:** Option 2 - Settings > Integrations

**Rationale:**
- **Mental model**: Users think "I need to connect a system" → Settings
- **Industry standard**: GitHub, Stripe, AWS all use similar patterns
- **Scalability**: Room for webhooks, OAuth apps, etc.
- **Clean separation**: API keys are auth credentials, not users
- **Audit clarity**: Separate from user management in logs

**Trade-offs:**
- ✅ Matches user expectations
- ✅ Extensible for future integrations
- ✅ Clear security boundary
- ❌ Adds another Settings tab (acceptable - already have 5)

### Decision 3: Show Once Modal (vs Retrieve Later)

**Options Considered:**
1. Show key once, never again
2. Allow retrieval with admin password
3. Store encrypted, decrypt on demand

**Decision:** Option 1 - Show once only

**Rationale:**
- **Security best practice**: Even admins can't retrieve plaintext keys
- **Forces good behavior**: Users must store keys securely immediately
- **Industry standard**: GitHub, Stripe, AWS all show once
- **Simplifies storage**: Hash only, no encryption key management
- **Renewal is easy**: If lost, just renew

**Trade-offs:**
- ✅ Maximum security
- ✅ Simple implementation
- ✅ Forces secure practices
- ❌ Support burden if users lose keys (mitigated by easy renewal)

### Decision 4: Renewal (vs Reactivation)

**Options Considered:**
1. Reactivate expired key (same key value)
2. Renew key (generate new key, keep config)
3. Force manual recreation

**Decision:** Option 2 - Renewal workflow

**Rationale:**
- **Security**: Ensures fresh cryptographic material
- **Continuity**: Preserves config, permissions, vendor relationship
- **Audit trail**: Clear lineage from old key to new key
- **Best practice**: Rotation without downtime

**Trade-offs:**
- ✅ Best security
- ✅ Maintains continuity
- ✅ Clear audit trail
- ❌ Requires vendor to update key (acceptable for security)

### Decision 5: Actor Attribution Enforcement

**Options Considered:**
1. Optional actor headers (log if present)
2. Required for vendor keys, validated at middleware
3. Required for all keys

**Decision:** Option 2 - Required for vendor keys only

**Rationale:**
- **Compliance**: Vendor keys MUST show human attribution
- **Simplicity**: Service keys don't burden automation
- **Validation**: Reject requests without actor headers at auth layer
- **Pre-approved lists**: Optional but recommended for high security

**Trade-offs:**
- ✅ Meets compliance requirements
- ✅ Clear audit trails
- ✅ Doesn't burden automation
- ❌ Vendors must implement correctly (mitigated by clear docs)

## Data Flow

### Service Key Authentication
```
1. External System → POST /api/organization/users
   Headers:
     X-API-Key: helios_prod_abc123...

2. Authentication Middleware
   ├─ Extract key from header
   ├─ Hash key → lookup in database
   ├─ Verify: exists, active, not expired
   ├─ Check IP whitelist (if configured)
   ├─ Update last_used_at
   └─ Attach to request:
      req.apiKey = { id, name, type: 'service', ... }
      req.organizationId = key.organization_id

3. Route Handler
   ├─ Process request normally
   └─ Create audit log with system attribution

4. Response → External System
```

### Vendor Key Authentication
```
1. External System → POST /api/organization/users
   Headers:
     X-API-Key: helios_vendor_xyz789...
     X-Actor-Name: John Smith
     X-Actor-Email: john.smith@msp.com
     X-Actor-ID: emp_12345
     X-Client-Reference: TICKET-456

2. Authentication Middleware
   ├─ Extract key from header
   ├─ Hash key → lookup in database
   ├─ Verify: exists, active, not expired, type === 'vendor'
   ├─ Check IP whitelist (if configured)
   │
   ├─ ENFORCE ACTOR HEADERS
   │  ├─ X-Actor-Name required → 400 if missing
   │  ├─ X-Actor-Email required → 400 if missing
   │  └─ Validate against allowed_actors (if configured)
   │
   ├─ Update last_used_at
   └─ Attach to request:
      req.apiKey = { id, name, type: 'vendor', ... }
      req.actorContext = {
        type: 'human',
        name: 'John Smith',
        email: 'john.smith@msp.com',
        id: 'emp_12345',
        clientReference: 'TICKET-456'
      }
      req.organizationId = key.organization_id

3. Route Handler
   ├─ Process request normally
   └─ Create audit log with actor attribution

4. Response → External System
```

## Database Schema Design

### api_keys Table
- **Primary Key**: UUID for uniqueness
- **Security**: `key_hash` stores SHA-256 hash, never plaintext
- **Type Enforcement**: CHECK constraint ensures only 'service' or 'vendor'
- **Config JSONB**: Flexible storage for type-specific configuration
- **Indexes**: Optimized for key lookup and organization queries

### api_key_usage_logs Table
- **Partition Strategy**: Consider partitioning by timestamp for large volumes
- **Retention**: Implement TTL policy (recommendation: 90 days standard, 1 year compliance)
- **Indexes**: Optimized for key-based and actor-based queries

## Security Model

### Key Generation
```typescript
function generateApiKey(): { key: string; hash: string; prefix: string } {
  // Format: helios_{env}_{random}
  const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  const random = crypto.randomBytes(32).toString('base64url');
  const key = `helios_${env}_${random}`;

  // Hash for storage (SHA-256)
  const hash = crypto.createHash('sha256').update(key).digest('hex');

  // Prefix for UI display
  const prefix = `${key.substring(0, 20)}...`;

  return { key, hash, prefix };
}
```

### Authentication Flow
```typescript
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  // Skip if no API key (try JWT)
  if (!apiKey) return next();

  // Validate format
  if (!apiKey.startsWith('helios_')) {
    return res.status(401).json({ error: 'Invalid API key format' });
  }

  // Hash and lookup
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const key = await db.query(
    'SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true',
    [keyHash]
  );

  if (!key) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Check expiration
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return res.status(401).json({
      error: 'API key expired',
      expiresAt: key.expires_at
    });
  }

  // Check IP whitelist
  if (key.ip_whitelist && !key.ip_whitelist.includes(req.ip)) {
    return res.status(403).json({ error: 'IP not whitelisted' });
  }

  // Vendor key: enforce actor headers
  if (key.type === 'vendor' && key.vendor_config?.requiresActor) {
    if (!req.headers['x-actor-name'] || !req.headers['x-actor-email']) {
      return res.status(400).json({
        error: 'Actor information required for vendor API keys',
        requiredHeaders: ['X-Actor-Name', 'X-Actor-Email']
      });
    }

    // Optional: validate against allowed actors
    if (key.vendor_config.allowedActors?.length > 0) {
      if (!key.vendor_config.allowedActors.includes(req.headers['x-actor-email'])) {
        return res.status(403).json({ error: 'Actor not pre-approved' });
      }
    }
  }

  // Update last used
  await db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]);

  // Attach context
  req.apiKey = key;
  req.organizationId = key.organization_id;
  if (key.type === 'vendor') {
    req.actorContext = {
      type: req.headers['x-actor-type'] || 'human',
      name: req.headers['x-actor-name'],
      email: req.headers['x-actor-email'],
      id: req.headers['x-actor-id'],
      clientReference: req.headers['x-client-reference']
    };
  }

  next();
}
```

## UI Component Architecture

### Component Tree
```
Settings
└── IntegrationsTab
    └── ApiKeysSection
        ├── ApiKeyList
        │   ├── ApiKeyListItem (for each key)
        │   │   ├── ApiKeyBadge (active/expired/revoked)
        │   │   ├── LastUsedIndicator
        │   │   └── ActionButtons
        │   └── CreateKeyButton
        │
        ├── ApiKeyCreateWizard
        │   ├── TypeSelectionStep
        │   ├── ServiceConfigStep
        │   ├── VendorConfigStep
        │   ├── PermissionsStep
        │   └── ExpirationStep
        │
        ├── ApiKeyShowOnceModal
        │   ├── KeyDisplay (with copy button)
        │   └── IntegrationInstructions
        │
        └── ApiKeyDetailView
            ├── OverviewTab
            ├── UsageTab (with chart)
            └── SettingsTab
```

## Performance Considerations

### Database Optimization
- **Index on key_hash**: O(1) lookup for authentication
- **Index on organization_id**: Fast filtering per org
- **Partial index**: `WHERE is_active = true` for active keys only

### Caching Strategy
- Consider caching active keys in Redis (5-minute TTL)
- Invalidate cache on key update/revocation
- Trade-off: Slight delay in revocation vs reduced DB load

### Rate Limiting
- Per-key rate limits stored in Redis
- Token bucket algorithm recommended
- Default: 1000 requests/hour for service, 500/hour for vendor

## Testing Strategy

### Unit Tests
- Key generation (format, uniqueness, hashing)
- Permission validation
- Actor header validation
- Expiration checking

### Integration Tests
- Authentication middleware with service keys
- Authentication middleware with vendor keys
- Actor enforcement for vendor keys
- IP whitelisting
- Audit log creation

### E2E Tests
- Create service key → authenticate → make API call
- Create vendor key → authenticate with actor → make API call
- Create vendor key → authenticate without actor → expect 400
- Expired key → expect 401
- Revoked key → expect 401
- Renew key workflow

## Migration & Rollout

### Phase 1: Backend (Week 1)
1. Database migration
2. Authentication middleware
3. API key CRUD endpoints
4. Unit and integration tests

### Phase 2: Frontend (Week 1)
1. Integrations tab in Settings
2. Create key wizard
3. Key list and detail views
4. E2E tests

### Phase 3: Documentation (Week 2)
1. User guide
2. Helios MTP integration guide
3. API reference
4. Security best practices

### Phase 4: Monitoring (Ongoing)
1. Alert on high failure rates
2. Alert on expiring keys (14 days)
3. Usage analytics
4. Compliance reporting

## Future Enhancements

### Phase 2 Features
- Webhooks management
- API usage dashboard
- Automated alerts for suspicious activity
- Key rotation automation

### Phase 3 Features
- OAuth2/OIDC for third-party apps
- Multi-factor auth for key creation
- Advanced permission templates
- API call replay/debugging tools

## References
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Stripe API Keys](https://stripe.com/docs/keys)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
