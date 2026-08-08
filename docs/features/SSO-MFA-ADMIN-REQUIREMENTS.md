# SSO/MFA Requirements for Administrators

This document outlines the security requirements and best practices for administrative access to Helios, including Single Sign-On (SSO) and Multi-Factor Authentication (MFA).

## Security Principle

**All administrative accounts SHOULD require MFA by default.** This is a security best practice that protects against:
- Credential theft and phishing
- Password reuse attacks
- Unauthorized access to sensitive data
- Compliance violations

## Recommendation Summary

| User Type | MFA Required | SSO Supported | Rationale |
|-----------|--------------|---------------|-----------|
| **Super Admin** | REQUIRED | Yes | Full system access |
| **Admin** | REQUIRED | Yes | Can modify users/settings |
| **Manager** | Recommended | Yes | Department-level access |
| **User** | Optional | Yes | Self-service only |
| **External Admin (Vendor)** | REQUIRED | Via API Key | Third-party access |

## Implementation Phases

### Phase 1: MFA for Administrators (Priority: High)

#### Requirements
1. All users with `role = 'admin'` must have MFA enabled
2. MFA setup required on first admin login
3. MFA cannot be disabled for admin accounts without super-admin approval
4. Support TOTP (Google Authenticator, Authy, etc.)

#### User Experience
- Admin logs in with email/password
- If MFA not configured: forced to setup before continuing
- If MFA configured: prompted for 6-digit code
- Recovery codes provided during setup

#### Settings UI
Add to Settings > Security:
```
[ ] Require MFA for all administrators
    When enabled, all admin users must configure 2FA before accessing the system.

[ ] Require MFA for all users
    When enabled, all users must configure 2FA.
```

### Phase 2: SSO Integration (Priority: Medium)

#### Supported Providers
- Google Workspace (SAML/OIDC)
- Microsoft Entra ID (Azure AD)
- Okta
- OneLogin
- Generic SAML 2.0

#### Configuration
Settings > Security > SSO Configuration:
- Enable/disable SSO
- Select provider
- Configure SAML metadata
- Set default role for SSO users
- Allow/block local password login for admins

#### SSO + MFA
When SSO is enabled:
- MFA handled by identity provider (recommended)
- OR Helios can enforce additional MFA after SSO

### Phase 3: Conditional Access Policies (Priority: Low)

Advanced security policies:
- Require MFA from new devices
- Require MFA outside office IP range
- Block login from specific countries
- Session timeout policies per role

## Database Schema Changes Required

```sql
-- Add MFA fields to organization_users
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS
  mfa_enabled BOOLEAN DEFAULT false;

ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS
  mfa_secret VARCHAR(255); -- Encrypted TOTP secret

ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS
  mfa_recovery_codes JSONB; -- Encrypted recovery codes

ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS
  mfa_enforced_at TIMESTAMPTZ; -- When MFA was required

-- Add SSO fields to organization_settings
ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS
  sso_enabled BOOLEAN DEFAULT false;

ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS
  sso_provider VARCHAR(50); -- 'google', 'microsoft', 'okta', etc.

ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS
  sso_config JSONB; -- Provider-specific config

ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS
  mfa_required_for_admins BOOLEAN DEFAULT true;

ALTER TABLE organization_settings ADD COLUMN IF NOT EXISTS
  mfa_required_for_all BOOLEAN DEFAULT false;
```

## API Endpoints

### MFA Setup
```
POST /api/v1/me/mfa/setup
  - Generate TOTP secret
  - Return QR code for authenticator app

POST /api/v1/me/mfa/verify
  - Verify initial setup code
  - Enable MFA for user
  - Return recovery codes

POST /api/v1/me/mfa/disable
  - Requires current password + MFA code
  - Only allowed for non-admin users (unless super-admin)

POST /api/v1/auth/mfa/challenge
  - Validate MFA code during login
```

### SSO
```
GET /api/v1/auth/sso/:provider
  - Redirect to SSO provider

POST /api/v1/auth/sso/:provider/callback
  - Handle SSO response
  - Create/update user
  - Issue JWT
```

## UI Components Needed

### MFA Setup Modal
1. Show QR code for authenticator app
2. Manual entry key for backup
3. Input field for verification code
4. Recovery codes display (one-time)

### MFA Challenge Screen
1. 6-digit code input
2. "Use recovery code" option
3. "Remember this device" checkbox

### Admin Security Settings
1. MFA requirement toggles
2. SSO configuration panel
3. Session policy settings

## Security Considerations

### TOTP Implementation
- Use proven library (e.g., `speakeasy`, `otplib`)
- Encrypt secrets at rest (AES-256)
- Allow 30-second window for clock drift
- Rate limit verification attempts

### Recovery Codes
- Generate 10 single-use codes
- Hash codes in database
- Mark used codes as consumed
- Allow regeneration (invalidates old codes)

### Session Security
- Shorter session timeout for admins (4 hours vs 24 hours)
- Force re-auth for sensitive operations
- Log all admin actions

## Compliance Mapping

| Requirement | Standard | Status |
|-------------|----------|--------|
| MFA for privileged access | SOC 2 CC6.1 | Planned |
| Access logging | SOC 2 CC7.2 | Implemented |
| Session management | NIST 800-53 IA-11 | Partial |
| Authentication strength | ISO 27001 A.9.4.2 | Planned |

## Implementation Roadmap

### Sprint 1: MFA Foundation
- [ ] Add MFA database columns
- [ ] Implement TOTP generation/verification
- [ ] Create MFA setup UI component
- [ ] Add MFA challenge to login flow

### Sprint 2: Admin Enforcement
- [ ] Add `mfa_required_for_admins` setting
- [ ] Block admin access without MFA
- [ ] Create recovery code system
- [ ] Add MFA to Settings > Security

### Sprint 3: SSO Integration
- [ ] Implement Google SSO
- [ ] Implement Microsoft SSO
- [ ] Add SSO configuration UI
- [ ] Handle SSO user provisioning

## Current Status

**MFA:** Not implemented - Settings > Security shows "Coming Soon" for MFA options

**SSO:** Not implemented - Settings > Security shows "Coming Soon" for SSO configuration

**Priority:** High - Should be implemented before production deployment for security compliance
