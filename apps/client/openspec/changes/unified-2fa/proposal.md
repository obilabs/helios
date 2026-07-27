# Unified 2FA - Proposal

## Summary

Add better-auth 2FA (TOTP) support for Helios local users and create a unified 2FA visibility system that shows 2FA status across all identity sources (Helios, Google Workspace, Microsoft 365).

## Problem

Currently:
- `list 2fa` only shows Google Workspace 2FA status
- Helios local users have no 2FA option (better-auth plugin not enabled)
- No visibility into Microsoft 365 MFA status
- CLI commands don't indicate which service the 2FA status comes from

## Solution

### 1. Enable better-auth twoFactor Plugin

Add TOTP-based 2FA for Helios local users using better-auth's built-in plugin.

### 2. Unified 2FA API

Create a unified endpoint that aggregates 2FA status from all sources:
- **Helios**: Query `two_factor` table (better-auth)
- **Google**: Query `gw_synced_users.is_enrolled_in_2sv`
- **Microsoft 365**: Query Graph API for MFA status (future)

### 3. Improved CLI Commands

```bash
# List all users with 2FA status (shows source column)
list 2fa

# Filter by source
list 2fa --helios
list 2fa --google
list 2fa --m365

# Filter by enrollment status
list 2fa --enrolled
list 2fa --not-enrolled

# Combine filters
list 2fa --google --not-enrolled

# Get specific user (shows all sources)
get 2fa user@example.com

# Get specific user filtered by source
get 2fa user@example.com --helios
```

### 4. Unified Output Format

```
2FA Status Summary
══════════════════════════════════════════════════════════
  Helios Users:     12 enrolled / 15 total (80%)
  Google Users:     45 enrolled / 50 total (90%)
  Microsoft 365:    Not configured
══════════════════════════════════════════════════════════

Email                         Source    2FA Status
─────────────────────────────────────────────────────────
john@example.com              Google    ✓ Enrolled
jane@example.com              Helios    ✓ TOTP Enabled
bob@example.com               Google    ✗ Not Enrolled
admin@example.com             Helios    ✗ Not Enrolled
```

## User Stories

1. **As an admin**, I want to see 2FA status for all users regardless of their identity source
2. **As an admin**, I want to filter 2FA status by identity source (Helios/Google/M365)
3. **As a Helios local user**, I want to enable TOTP 2FA for my account
4. **As an admin**, I want to enforce 2FA for Helios local users

## Scope

### In Scope
- Enable better-auth twoFactor plugin
- Database migration for `two_factor` table
- 2FA enrollment UI for Helios users (Settings > Security)
- Unified `/api/v1/security/2fa-status` endpoint
- Updated CLI commands with source filtering
- Update User Slideout security tab to show Helios 2FA

### Out of Scope (Future)
- Microsoft 365 MFA status (requires additional Graph API permissions)
- Admin-enforced 2FA policies
- Backup codes / recovery options
- Hardware key support (WebAuthn)

## Dependencies

- better-auth twoFactor plugin
- Existing security-visibility feature (completed)

## Acceptance Criteria

- [ ] Helios local users can enable TOTP 2FA
- [ ] `list 2fa` shows all users with source column
- [ ] `list 2fa --helios` filters to Helios users only
- [ ] `list 2fa --google` filters to Google users only
- [ ] `get 2fa <email>` shows 2FA status from all applicable sources
- [ ] User Slideout shows Helios 2FA status and enrollment option
- [ ] Dashboard widget shows combined 2FA adoption rate
