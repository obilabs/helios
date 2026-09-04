# Specifications: Portal Login Policy for Platform-Sourced Users

## SPEC-PLP-001: Default-deny for synced users

**Requirement:** A user synced from Google Workspace or Microsoft 365 has no portal
login capability unless explicitly granted.

### Scenario: Newly synced staff cannot sign in
```gherkin
Given a user "alice@corp.com" is synced from Google Workspace as user_type='staff'
And the org policy autoGrantSyncedStaff is false
When the sync creates her organization_users row
Then portal_access_enabled is false
And she cannot complete portal sign-in (password or SSO)
And she is shown "Portal access is not enabled for your account — contact your administrator"
```

### Scenario: Sync never re-enables a revoked grant
```gherkin
Given "alice@corp.com" had portal_access_enabled set to false by an admin
When the nightly directory sync runs again
Then portal_access_enabled remains false
And the sync does not modify portal_access_enabled for any existing user
```

---

## SPEC-PLP-002: Guests and contacts are never eligible

**Requirement:** Users of user_type 'guest' or 'contact' can never be granted portal access.

### Scenario: Grant control is unavailable for guests/contacts
```gherkin
Given a user "vendor@ext.com" has user_type='guest'
When an admin views the Users list
Then the "Portal access" toggle for that row is absent or disabled
And attempting to set portal_access_enabled=true for a guest/contact via the API is rejected with 400
```

### Scenario: A guest cannot sign in even if a stale flag exists
```gherkin
Given a row with user_type='contact' somehow has portal_access_enabled=true
When that identity attempts portal sign-in
Then the eligibility guard refuses it because user_type IN ('guest','contact')
```

---

## SPEC-PLP-003: Local accounts retain access

**Requirement:** Locally-created (user_type='local') accounts can sign in with their
Helios credentials, subject to is_active.

### Scenario: Local admin still logs in after rollout
```gherkin
Given "admin@myorg.test" has user_type='local' and is_active=true
And the migration backfilled portal_access_enabled=true for local users
When they sign in with their password
Then sign-in succeeds
```

### Scenario: Deactivated local account cannot sign in
```gherkin
Given "admin@myorg.test" has user_type='local' and is_active=false
When they attempt to sign in
Then sign-in is refused
```

---

## SPEC-PLP-004: Explicit per-user opt-in

**Requirement:** An admin can grant/revoke portal access to an individual staff user.

### Scenario: Admin grants portal access to a staff member
```gherkin
Given "alice@corp.com" is user_type='staff' with portal_access_enabled=false
And the org policy allowStaffSSO is true
When an admin toggles her "Portal access" on
Then portal_access_enabled becomes true
And the change is written to the audit log
And she can complete SSO sign-in
```

### Scenario: Non-admin cannot change portal access
```gherkin
Given I am signed in as a non-admin user
When I call PUT the portal-access flag for another user
Then the request is refused with 403
```

---

## SPEC-PLP-005: Org-level policy

**Requirement:** A per-org policy governs SSO admission and optional auto-grant, and
defaults to the most restrictive setting.

### Scenario: Default policy denies SSO
```gherkin
Given a freshly configured organization
Then portal_login_policy.allowStaffSSO defaults to false
And portal_login_policy.autoGrantSyncedStaff defaults to false
And no synced user can complete SSO sign-in
```

### Scenario: Enabling auto-grant admits future synced staff only
```gherkin
Given an admin sets autoGrantSyncedStaff=true
When a new user_type='staff' user is synced
Then that user is created with portal_access_enabled=true
But newly synced user_type='guest' and 'contact' users remain portal_access_enabled=false
And existing synced staff are NOT retroactively changed by the sync
```

### Scenario: allowStaffSSO=false blocks SSO even for granted users
```gherkin
Given "alice@corp.com" has portal_access_enabled=true
And portal_login_policy.allowStaffSSO is false
When she attempts SSO sign-in
Then sign-in is refused
And password sign-in for local users is unaffected
```

---

## SPEC-PLP-006: Single reusable eligibility guard

**Requirement:** All authentication entry points (current password login, future SSO
callback) enforce the same `canAccessPortal(user, policy)` guard.

### Scenario: SSO cannot bypass the guard
```gherkin
Given a future SSO callback issues sessions
When it authenticates any user
Then it MUST call canAccessPortal(user, policy) before issuing a session
And a user failing the guard receives no session regardless of valid SSO credentials
```

### Scenario: Guard is decisive and side-effect free
```gherkin
Given the eligibility rule:
  is_active = true
  AND (user_type='local' OR (user_type='staff' AND portal_access_enabled))
  AND user_type NOT IN ('guest','contact')
When canAccessPortal is evaluated for any user
Then it returns a boolean without mutating any record
```

---

## SPEC-PLP-007: Portal-access visibility

**Requirement:** The admin Users list shows whether each staff/local user can access
the portal.

### Scenario: Portal-access column
```gherkin
Given the admin Users "Staff" tab (which includes user_type IN ('staff','local'))
When an admin views the list
Then each row shows a "Portal access" indicator (enabled/disabled)
And local users show enabled
And staff without a grant show disabled
```

---

## SPEC-PLP-008: Per-group grant

**Requirement:** An admin can grant portal access to the members of a group, and
guests/contacts in that group are never granted.

### Scenario: Static bulk grant by group
```gherkin
Given a group "Sales" whose members are 2 staff, 1 guest, and 1 contact
When an admin chooses "Enable portal access for everyone in Sales"
Then portal_access_enabled becomes true for the 2 staff members
And it stays false for the guest and the contact
And each change is written to the audit log
```

### Scenario: Standing rule grant requires dynamic groups
```gherkin
Given dynamic/rule-based group membership is not yet functional
When an admin configures a standing "members of Staff get portal access" rule
Then the system applies it as a one-time static grant to current members
And surfaces that live auto-grant is unavailable until dynamic groups ship
```
