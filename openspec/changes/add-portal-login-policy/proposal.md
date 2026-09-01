# OpenSpec Proposal: Portal Login Policy for Platform-Sourced Users

**ID:** add-portal-login-policy
**Status:** Draft
**Priority:** High (P1) — security surface
**Author:** Claude (Opus 4.8)
**Created:** 2026-09-01

## Summary

Make Helios portal login an **explicit, admin-granted capability** rather than an
implicit side effect of being present in the directory. Users synced from Google
Workspace or Microsoft 365 (and all guests/contacts) get **no portal login by
default**; an admin opts specific people in, or enables a per-org policy that
grants portal access to internal staff via their source platform's SSO. Helios
never creates or stores a password for a synced user.

## Problem Statement

Helios syncs the entire external directory into `organization_users` — in the
reference org that is 15 rows, but only 1 is a locally-created Helios account. The
other 14 are Google/M365 identities, including 3 guests (external `#EXT#`) and 9
contacts (shared mailboxes / unlicensed accounts).

Today, whether these identities can sign in to the Helios **portal** is governed
only accidentally:

1. Synced users are given a placeholder password hash (`GOOGLE_WORKSPACE_AUTH` /
   `MICROSOFT_365_AUTH`), so password login happens to fail for them — but this is
   an implementation artifact, not a policy. The moment Helios adds "Sign in with
   Google/Microsoft" SSO (a natural next step for a Workspace-first product), every
   synced identity — including guests and contacts — could authenticate into the
   portal unless something explicitly stops them.
2. There is no per-user "can this person access the portal" control and no org-level
   policy. An admin cannot see, at a glance, who is able to sign in.

This violates least privilege: the authentication surface silently equals the whole
synced directory. The question the admin actually wants to answer — *"who can log
in to Helios, and did I mean for them to?"* — has no home in the product.

## Goals

- **Default-deny** portal login for every platform-sourced identity.
- **Explicit opt-in**: an admin grants portal access per-user (or in bulk), or turns
  on an org policy that admits internal staff via SSO.
- **Guests and contacts are never eligible** for portal login.
- **No Helios passwords for synced users** — access is via the source platform's SSO
  only; password auth stays limited to locally-created (`user_type='local'`) accounts.
- **Visibility**: a "Portal access" indicator in the admin Users list so the sign-in
  surface is legible.
- **Never a hard business gate** — this governs authentication, not licensing.

## Non-Goals

- Implementing the SSO provider integration itself (Google/Microsoft OIDC) — this
  proposal defines the *authorization gate* that SSO (existing password login, and
  any future SSO) must honor. SSO wiring is a separate change that consumes this gate.
- Changing how `user_type` is assigned (covered by the directory strictness work).

## Current State (verified)

- `organization_users` has no portal-access column; login checks only `is_active`
  (`auth.routes.ts`), plus the incidental placeholder-hash behavior above.
- `user_type` is clean and mutually exclusive: `staff`, `guest`, `contact`, `local`.
- Locally-created accounts are `user_type='local'` and DO have real credentials.

## Proposed Solution

### 1. Per-user capability flag

Add `portal_access_enabled BOOLEAN NOT NULL DEFAULT false` to `organization_users`.

- Locally-created users (`user_type='local'`, real credentials) are provisioned with
  `portal_access_enabled = true` (they exist specifically to use the portal).
- Synced users (Google/M365) are created with `portal_access_enabled = false`.
- Sync **never flips this true**; only an explicit admin action or the org policy does.

### 2. Org-level policy

A `portal_login_policy` setting (org key/value), default:

```json
{ "allowStaffSSO": false, "autoGrantSyncedStaff": false }
```

- `allowStaffSSO` — when true, a `staff`/`local` user with `portal_access_enabled`
  may complete SSO sign-in. When false, SSO sign-in is refused for everyone except…
  (password login for `local` users is always allowed).
- `autoGrantSyncedStaff` — when true, newly synced `staff` users are granted
  `portal_access_enabled = true` automatically. Default false (deny). Guests and
  contacts are excluded regardless.

### 3. Eligibility rule (authoritative)

A user may authenticate into the portal **iff**:

```
is_active = true
AND (
      user_type = 'local'                                 -- local accounts (password or SSO)
   OR (user_type IN ('staff') AND portal_access_enabled)  -- opted-in internal staff via SSO
)
AND NOT (user_type IN ('guest','contact'))                -- never
```

Guests and contacts can never be granted `portal_access_enabled` through the UI
(the control is disabled/absent for them).

### 4. Admin controls

The authoritative gate is always the per-user `portal_access_enabled` flag; every
control below is just a way to *set* it, which keeps the eligibility guard simple.

- **Users list**: a "Portal access" column (enabled/disabled icon) for staff/local
  rows; a per-row toggle (admin only) that flips `portal_access_enabled`.
- **Per-user**: the row toggle above (one person at a time).
- **Per-group**: "Enable portal access for everyone in group X". Two flavors:
  - *Static bulk* — flips `portal_access_enabled = true` for the group's current
    staff members (a one-time convenience). Works with any Helios group today.
  - *Standing rule* — a group whose membership auto-grants portal access as members
    come and go. This depends on **dynamic/rule-based group membership**, which is
    specced but not yet functional against the live schema (see the group-sync
    findings); until that lands, per-group grant is static-bulk only.
  Guests/contacts in the group are always skipped (never eligible).
- **Bulk**: "Enable/disable portal access" bulk action on selected staff.
- **Settings → Security**: the `portal_login_policy` toggles (`allowStaffSSO`,
  `autoGrantSyncedStaff`) with clear copy on the security implications.

### 5. Enforcement points

- The existing password-login handler additionally checks the eligibility rule (a
  `local` user is fine; a synced user is refused with a clear "portal access not
  enabled — ask your administrator" message rather than a generic failure).
- The (future) SSO callback MUST call the same eligibility check before issuing a
  session. This proposal ships the reusable `canAccessPortal(user, policy)` guard so
  SSO cannot bypass it.

## Security & Privacy Considerations

- Least privilege by construction: the sign-in surface starts empty and grows only by
  explicit grant.
- No new secret material: synced users never receive a Helios password; the flag
  gates SSO, and password login remains impossible for them by both the placeholder
  hash and the eligibility rule (defense in depth).
- Auditable: flag changes and policy changes are written to the audit log.

## Rollout

- Migration adds the column with `DEFAULT false`, then a one-time backfill sets
  `portal_access_enabled = true` for `user_type='local'` rows so existing local
  admins are not locked out. All synced rows stay false.
- The eligibility guard is additive; because synced users already cannot password-log-in,
  no currently-working login breaks. The guard becomes load-bearing when SSO ships.

## Alternatives Considered

- **Auto-grant all synced staff** (opt-out): rejected — expands the auth surface by
  default, the exact problem this fixes. Offered as an explicit opt-in policy instead.
- **Rely on placeholder password hashes** (status quo): rejected — implicit, invisible
  to admins, and silently defeated the moment SSO is added.
- **Reuse `is_active`**: rejected — `is_active` reflects directory/account status, not
  the distinct decision of "may use the Helios portal." Conflating them removes the
  admin's ability to keep an active employee out of the portal (or vice versa).
