# Security & Authentication Overhaul - Tasks

## Phase 1: Authentication Foundation (CRITICAL)

### 1.1 Database Migration
- [ ] Create migration script for `auth_sessions` table
- [ ] Create migration script for password data (org_users -> auth_accounts)
- [ ] Test migration on copy of production data
- [ ] Create rollback script

### 1.2 better-auth Configuration
- [ ] Update better-auth config to use existing `organization_users` or migrate
- [ ] Configure session-based auth (httpOnly cookies)
- [ ] Set session expiry policies (8h active, 7d refresh)
- [ ] Configure CSRF protection
- [ ] Test in Docker environment

### 1.3 Frontend Auth Migration
- [ ] Remove localStorage JWT usage from `LoginPage.tsx`
- [ ] Remove localStorage JWT usage from `App.tsx`
- [ ] Update `auth-client.ts` to be the primary auth method
- [ ] Update all API calls to rely on cookie auth (no Authorization header)
- [ ] Add CSRF token to mutation requests
- [ ] Test login/logout flow

### 1.4 Backend Auth Migration
- [ ] Update auth middleware to use session instead of JWT
- [ ] Remove JWT verification code
- [ ] Add session validation middleware
- [ ] Update all protected routes
- [ ] Test all API endpoints

### 1.5 Session Management
- [ ] Add device fingerprinting
- [ ] Store sessions in database with metadata
- [ ] Implement "Sign out all devices" feature
- [ ] Add session list in user settings
- [ ] Implement forced session revocation

## Phase 2: MFA (CRITICAL)

### 2.1 TOTP Implementation
- [ ] Add `user_mfa` table migration
- [ ] Implement TOTP secret generation
- [ ] Create QR code generation for authenticator apps
- [ ] Implement TOTP verification endpoint
- [ ] Add TOTP setup UI (scan QR, enter code)
- [ ] Add TOTP prompt during login

### 2.2 Backup Codes
- [ ] Generate 10 backup codes on MFA setup
- [ ] Hash and store backup codes
- [ ] Implement backup code verification
- [ ] Show codes once, require user to save
- [ ] Track usage count

### 2.3 WebAuthn/Passkeys (Future)
- [ ] Research WebAuthn implementation
- [ ] Add credential storage
- [ ] Implement registration flow
- [ ] Implement authentication flow

### 2.4 MFA Policy Engine
- [ ] Create MFA policy configuration
- [ ] Implement per-login-method policies
- [ ] Add "MFA required" enforcement
- [ ] Add acknowledgment flow for SSO MFA bypass
- [ ] Build policy management UI

## Phase 3: Audit Logging (CRITICAL)

### 3.1 Database Setup
- [ ] Create `security_audit_logs` table
- [ ] Add indexes for common queries
- [ ] Add rules to prevent UPDATE/DELETE
- [ ] Create partitioning strategy for large logs

### 3.2 Logging Infrastructure
- [ ] Create `auditLog()` utility function
- [ ] Implement hash chain for tamper detection
- [ ] Add request ID tracking
- [ ] Create audit middleware for automatic logging

### 3.3 Event Coverage
- [ ] Log all authentication events
- [ ] Log all authorization failures
- [ ] Log all admin actions
- [ ] Log all data exports
- [ ] Log service account key access
- [ ] Log API key usage
- [ ] Log bulk operations

### 3.4 Audit UI
- [ ] Create audit log viewer page
- [ ] Add filtering (by actor, action, date, outcome)
- [ ] Add search functionality
- [ ] Add export to CSV/JSON
- [ ] Add drill-down to related events

### 3.5 Alerting
- [ ] Define alert rules (failed logins, key access, etc.)
- [ ] Implement real-time alert evaluation
- [ ] Add email/webhook notifications
- [ ] Create alert management UI

## Phase 4: Secrets Management (HIGH)

### 4.1 KMS Evaluation
- [ ] Evaluate AWS KMS pricing and features
- [ ] Evaluate GCP KMS pricing and features
- [ ] Evaluate Azure Key Vault pricing and features
- [ ] Evaluate HashiCorp Vault (self-hosted option)
- [ ] Document decision and rationale

### 4.2 KMS Integration
- [ ] Create KMS abstraction layer
- [ ] Implement key encryption/decryption via KMS
- [ ] Add key rotation support
- [ ] Migrate existing encrypted data

### 4.3 Service Account Key Protection
- [ ] Update key storage to use KMS
- [ ] Add key access logging
- [ ] Implement key caching with TTL
- [ ] Add key access permissions check
- [ ] Remove ENCRYPTION_KEY from env vars

## Phase 5: API Security (HIGH)

### 5.1 API Key System
- [ ] Create `api_keys` table migration
- [ ] Implement API key generation (prefix + random)
- [ ] Store only key hash in database
- [ ] Implement key validation middleware
- [ ] Add rate limiting per key
- [ ] Add IP whitelist enforcement

### 5.2 MTP Vendor API
- [ ] Define MTP API authentication spec
- [ ] Implement X-Actor-User-Id requirement
- [ ] Implement X-Ticket-Reference tracking
- [ ] Add MTP-specific rate limits
- [ ] Log all MTP actions with context

### 5.3 Service Keys
- [ ] Implement scope-based permissions
- [ ] Add key expiry support
- [ ] Implement key rotation
- [ ] Add usage analytics

### 5.4 API Key Management UI
- [ ] Create API key list view
- [ ] Add key creation wizard
- [ ] Show key once after creation
- [ ] Add revocation flow
- [ ] Show usage statistics

## Phase 6: SSO Integration (MEDIUM)

### 6.1 OIDC Support
- [ ] Create `sso_configurations` table migration
- [ ] Implement OIDC discovery
- [ ] Implement authorization code flow
- [ ] Map OIDC claims to user attributes
- [ ] Handle auto-provisioning

### 6.2 Provider-Specific
- [ ] Add Google Workspace OIDC
- [ ] Add Microsoft Entra OIDC
- [ ] Add Okta OIDC
- [ ] Add JumpCloud OIDC
- [ ] Test each provider

### 6.3 SAML Support
- [ ] Implement SAML 2.0 SP
- [ ] Handle SAML assertions
- [ ] Map SAML attributes to user attributes
- [ ] Add metadata endpoint

### 6.4 LDAP/AD Support
- [ ] Implement LDAP bind authentication
- [ ] Add LDAP user search
- [ ] Map LDAP attributes to user attributes
- [ ] Handle connection pooling

### 6.5 SSO Configuration UI
- [ ] Create SSO provider list
- [ ] Add configuration wizard per provider
- [ ] Add test connection feature
- [ ] Add MFA policy configuration
- [ ] Show SSO button on login page

## Phase 7: OTP Passwordless (MEDIUM)

### 7.1 OTP Generation
- [ ] Create OTP storage table
- [ ] Implement secure code generation
- [ ] Add rate limiting (3/hour per email)
- [ ] Set expiry (10 minutes)

### 7.2 Email Delivery
- [ ] Create OTP email template
- [ ] Integrate with email service
- [ ] Add delivery tracking

### 7.3 OTP Verification
- [ ] Implement verification endpoint
- [ ] Limit to 3 attempts per code
- [ ] Invalidate on successful use
- [ ] Create session after verification

### 7.4 Passwordless UI
- [ ] Add "Sign in with email" option
- [ ] Create email input form
- [ ] Create code input form
- [ ] Handle errors gracefully

## Testing

### Security Testing
- [ ] Penetration testing on auth flows
- [ ] Test session fixation prevention
- [ ] Test CSRF protection
- [ ] Test XSS prevention
- [ ] Test SQL injection prevention
- [ ] Test rate limiting effectiveness

### Integration Testing
- [ ] Test complete login flows (all methods)
- [ ] Test MFA enrollment and verification
- [ ] Test session management
- [ ] Test API key authentication
- [ ] Test audit log completeness

### Load Testing
- [ ] Test auth under load
- [ ] Test audit logging performance
- [ ] Test session validation performance

## Documentation

- [ ] Update API documentation
- [ ] Create security configuration guide
- [ ] Create SSO setup guide per provider
- [ ] Create admin guide for audit logs
- [ ] Update threat model
- [ ] Create incident response playbook
