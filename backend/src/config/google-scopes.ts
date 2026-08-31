/**
 * Canonical Google Workspace OAuth scopes Helios requests via domain-wide
 * delegation. THIS is the single source of truth.
 *
 * Why this file exists: the scopes used to be duplicated across every JWT client
 * in the service layer, and `getDomainWideDelegationInfo()` advertised only a
 * partial list (5 of them). A Workspace admin who authorised only the advertised
 * scopes got silent 403s on every feature whose scope wasn't listed — Drive
 * sharing-audit, signature management, licensing, offboarding data transfer.
 * That is the "silence indistinguishable from success" failure mode. Keep the
 * setup UI, the delegation-info API, and the runtime clients all reading from
 * here so the list an admin authorises always matches what the code actually
 * requests.
 *
 * Least privilege: each scope carries the reason it is needed so the connect
 * screen can show the admin exactly what they are granting and why.
 */

export interface ScopeDetail {
  scope: string
  reason: string
}

export const SCOPE_DETAILS: ScopeDetail[] = [
  { scope: 'https://www.googleapis.com/auth/admin.directory.user', reason: 'Read and manage Workspace users (create, suspend, offboard).' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.user.security', reason: 'Manage user security settings (2-step verification, recovery, app passwords) during on/offboarding.' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.group', reason: 'Read and manage groups.' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.group.member', reason: 'Add and remove group members.' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.orgunit', reason: 'Read and manage organizational units.' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.domain', reason: 'Read domain configuration.' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.device.mobile', reason: 'View and act on mobile devices during offboarding.' },
  { scope: 'https://www.googleapis.com/auth/admin.reports.audit.readonly', reason: 'Read the admin audit log (activity feed and compliance evidence).' },
  { scope: 'https://www.googleapis.com/auth/admin.reports.usage.readonly', reason: 'Read usage reports (adoption metrics).' },
  { scope: 'https://www.googleapis.com/auth/admin.datatransfer', reason: "Transfer a departing user's Drive and Calendar data during offboarding." },
  { scope: 'https://www.googleapis.com/auth/apps.licensing', reason: 'Read and assign Workspace licenses.' },
  { scope: 'https://www.googleapis.com/auth/calendar', reason: 'Manage calendar resources and hand-off during lifecycle actions.' },
  { scope: 'https://www.googleapis.com/auth/drive', reason: 'External-sharing audit and bulk-revoke of Drive permissions.' },
  { scope: 'https://www.googleapis.com/auth/drive.file', reason: 'Access files Helios itself creates.' },
  { scope: 'https://www.googleapis.com/auth/drive.readonly', reason: 'Read-only Drive access for the external-sharing audit.' },
  { scope: 'https://www.googleapis.com/auth/gmail.settings.basic', reason: 'Read and apply Gmail settings (e.g. delegation) during lifecycle actions.' },
  { scope: 'https://www.googleapis.com/auth/gmail.settings.sharing', reason: 'Manage email signatures and sending settings.' },
]

/**
 * BASE scopes: minted by the transparent proxy on EVERY call and requested by the
 * base API clients. Because Google's domain-wide delegation is all-or-nothing per
 * token exchange, EVERY scope here must be authorised by every connected tenant or
 * all calls 401 — so adding a scope here is a breaking change for existing tenants
 * (they must re-authorise). Keep this list to what the product needs on the common
 * path; niche/optional capabilities go in OPTIONAL_SCOPE_DETAILS instead.
 */
export const REQUIRED_SCOPES: string[] = SCOPE_DETAILS.map((s) => s.scope)

/** Comma-separated form Google's Admin Console expects when authorising a client. */
export const REQUIRED_SCOPES_CSV: string = REQUIRED_SCOPES.join(',')

/**
 * OPTIONAL scopes: needed only by specific niche features (e.g. Google Vault holds
 * via `ediscovery`). They are NOT minted by the proxy default — the feature's own
 * client requests them directly — so adding one here NEVER blanket-401s a tenant
 * that didn't authorise it; that one feature simply fails until it is authorised.
 * They ARE advertised in the delegation list below, so a one-time DWD authorisation
 * can cover them upfront (recommended: authorise the full set at setup, so a later
 * release that lights up an optional feature needs no re-authorisation).
 */
export const OPTIONAL_SCOPE_DETAILS: ScopeDetail[] = [
  { scope: 'https://www.googleapis.com/auth/ediscovery', reason: "Create Google Vault holds to preserve a departing user's Mail and Drive before deletion (Business Plus and above)." },
]

/**
 * The FULL set an admin should authorise in Admin Console → API Controls →
 * Domain-wide delegation = base + optional. Advertise this (not just the base) in
 * the setup UI / copy-paste list / deep-link, so one authorisation covers every
 * current feature — required now and optional-but-may-be-used-later.
 */
export const DELEGATION_SCOPE_DETAILS: ScopeDetail[] = [...SCOPE_DETAILS, ...OPTIONAL_SCOPE_DETAILS]
export const DELEGATION_SCOPES: string[] = DELEGATION_SCOPE_DETAILS.map((s) => s.scope)
export const DELEGATION_SCOPES_CSV: string = DELEGATION_SCOPES.join(',')
