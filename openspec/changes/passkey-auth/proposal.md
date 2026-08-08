# Passkey Authentication

## Summary

Add WebAuthn passkey support for passwordless authentication. Users can register passkeys (fingerprint, Face ID, hardware keys like YubiKey) and login without entering passwords. This complements the existing TOTP 2FA implementation.

## Motivation

1. **Better UX**: No passwords to remember or type
2. **Phishing Resistant**: Passkeys are bound to the domain, can't be phished
3. **Modern Standard**: WebAuthn is supported by all major browsers
4. **User Choice**: Some prefer TOTP, others prefer biometrics

## Scope

### In Scope
- Add better-auth `passkey` plugin to backend
- Add `passkeyClient` plugin to frontend
- Database table for passkey credentials
- UI to register/manage passkeys in User Settings
- Login flow option for passkey authentication
- Support for multiple passkeys per user

### Out of Scope
- Password replacement enforcement (users can still use password + TOTP)
- Admin-forced passkey enrollment
- Passkey-only accounts (password remains as fallback)

## User Stories

### US-1: Register Passkey
As a user, I want to register a passkey (fingerprint, Face ID, or hardware key) so I can login without entering my password.

**Flow:**
1. Go to User Settings > Security
2. Click "Add Passkey"
3. Browser prompts for biometric or hardware key
4. Passkey registered with a user-chosen name (e.g., "MacBook Touch ID")

### US-2: Login with Passkey
As a user with a registered passkey, I want to login using my passkey instead of password.

**Flow:**
1. Enter email on login page
2. Click "Sign in with Passkey"
3. Browser prompts for biometric/hardware key
4. Authenticated (bypasses password AND TOTP)

### US-3: Manage Passkeys
As a user, I want to view and remove my registered passkeys.

**Flow:**
1. Go to User Settings > Security
2. See list of registered passkeys with names and last used dates
3. Click "Remove" on any passkey to delete it

## Technical Approach

### Backend (better-auth passkey plugin)
```typescript
import { passkey } from 'better-auth/plugins';

plugins: [
  twoFactor({ ... }),  // Existing
  passkey({
    rpName: 'Helios',
    rpID: process.env['PASSKEY_RP_ID'] || 'localhost',
    origin: process.env['PASSKEY_ORIGIN'] || 'http://localhost:3000',
  }),
]
```

### Frontend (passkeyClient plugin)
```typescript
import { passkeyClient } from 'better-auth/client/plugins';

plugins: [
  twoFactorClient(),  // Existing
  passkeyClient(),
]
```

### Database
One new table: `passkeys` (managed by better-auth)

## Dependencies

- Existing: better-auth with twoFactor plugin (unified-2fa change)
- Browser: WebAuthn API (all modern browsers)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| User loses all passkeys | Password + TOTP remains as fallback |
| Device doesn't support WebAuthn | Gracefully hide passkey option |
| RP ID mismatch in production | Document deployment configuration |

## Success Criteria

- [ ] Users can register passkeys from User Settings
- [ ] Users can login with passkey (no password needed)
- [ ] Users can manage (view/remove) their passkeys
- [ ] Login page shows passkey option when user has one registered
- [ ] Works with hardware keys (YubiKey) and platform authenticators (Touch ID, Face ID)
