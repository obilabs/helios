# Tasks: Portal Login Policy for Platform-Sourced Users

## Data model
- [ ] Migration: add `organization_users.portal_access_enabled BOOLEAN NOT NULL DEFAULT false`.
- [ ] Migration: one-time backfill `portal_access_enabled = true WHERE user_type = 'local'`.
- [ ] Add `portal_login_policy` to the org settings shape with defaults
      `{ allowStaffSSO: false, autoGrantSyncedStaff: false }`.

## Backend — eligibility guard (load-bearing)
- [ ] Implement `canAccessPortal(user, policy): boolean` in a shared auth util
      enforcing: `is_active AND (user_type='local' OR (user_type='staff' AND
      portal_access_enabled)) AND user_type NOT IN ('guest','contact')`.
- [ ] Call the guard in the password-login handler (`auth.routes.ts`); on failure
      return a specific "portal access not enabled" message, not a generic 401.
- [ ] Unit tests for the guard: local, granted staff, ungranted staff, guest,
      contact, inactive — each asserts the expected boolean.

## Backend — grant management
- [ ] `PUT /organization/users/:id/portal-access { enabled }` (admin only). Reject
      with 400 when the target `user_type IN ('guest','contact')`. Audit-log the change.
- [ ] Bulk endpoint: enable/disable portal access for a set of staff user ids.
- [ ] `GET`/`PUT /organization/portal-login-policy` (admin) for the two toggles.

## Backend — sync integration
- [ ] User sync: create synced users with `portal_access_enabled=false`; never
      modify it on subsequent syncs.
- [ ] When `autoGrantSyncedStaff=true`, set `portal_access_enabled=true` for newly
      synced `user_type='staff'` rows only (never guest/contact).

## Frontend
- [ ] Users list: "Portal access" column + per-row admin toggle for staff/local
      rows; absent/disabled for guests/contacts.
- [ ] Bulk action: "Enable/disable portal access" on selected staff.
- [ ] Settings → Security: `allowStaffSSO` and `autoGrantSyncedStaff` toggles with
      security-implication copy.

## SSO readiness (consumed by the separate SSO change)
- [ ] Document that any SSO callback MUST call `canAccessPortal` before issuing a
      session; add a guard test that fails if a session is issued for an ineligible user.

## Verification
- [ ] Regression: existing local-account password login still works post-migration.
- [ ] Confirm no synced user (staff/guest/contact) can obtain a session by any path
      unless explicitly granted and permitted by policy.
- [ ] Audit-log entries exist for flag and policy changes.
