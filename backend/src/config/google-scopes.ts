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
  { scope: 'https://www.googleapis.com/auth/admin.directory.userschema', reason: 'Define custom user attributes (schemas) so Helios-specific fields can be stored on the Google user record.' },
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

// ---------------------------------------------------------------------------
// Scope contract v1 (frozen 2026-09-08) and per-call minting.
// ---------------------------------------------------------------------------
//
// Google domain-wide delegation is all-or-nothing PER TOKEN EXCHANGE: a JWT that
// asks for one scope the tenant has not authorised is refused outright, so every
// call that minted "the full list" failed the moment the list grew. That is how
// adding `userschema` in August 2026 broke every connected workspace.
//
// Two rules, enforced by google-scopes.contract.test.ts:
//
//   1. REQUIRED_SCOPES is a WIRE CONTRACT. Its content hash is pinned. Changing
//      it is a deliberate decision recorded in the north-star tracker, then the
//      pin is bumped. Existing tenants must re-authorise after such a change.
//
//   2. Nothing mints the full list per call. `googleScopesForPath()` returns the
//      minimal scopes for one request. Paths it does not know fall back to the
//      frozen contract, never to a wider set, so a new optional scope can only
//      ever be requested by the path that needs it. An unauthorised optional
//      scope fails that one feature with a clear 401; nothing else notices.

export const SCOPE_CONTRACT_VERSION = 1

const G = 'https://www.googleapis.com/auth/'

/**
 * Per-path scope map. Order matters: first match wins. Patterns are matched
 * against the Google API path with the leading slash and version removed
 * (`admin/directory/v1/users/x` -> `admin/directory/users/x`).
 */
interface PathScopeRule {
  test: RegExp
  read: string[]
  write: string[]
}

const PATH_SCOPES: PathScopeRule[] = [
  // Directory: schemas need their own scope (optional; per-call only).
  { test: /^admin\/directory\/customer\/[^/]+\/schemas/, read: [`${G}admin.directory.userschema.readonly`], write: [`${G}admin.directory.userschema`] },
  // Directory: user security sub-resources (tokens, ASPs, verification codes, signOut).
  { test: /^admin\/directory\/users\/[^/]+\/(tokens|asps|verificationCodes|signOut)/, read: [`${G}admin.directory.user.security`], write: [`${G}admin.directory.user.security`] },
  // Directory: users (incl. undelete, aliases, photos, makeAdmin).
  { test: /^admin\/directory\/users/, read: [`${G}admin.directory.user.readonly`], write: [`${G}admin.directory.user`] },
  // Directory: groups and members.
  { test: /^admin\/directory\/groups\/[^/]+\/(members|hasMember)/, read: [`${G}admin.directory.group.member.readonly`], write: [`${G}admin.directory.group.member`] },
  { test: /^admin\/directory\/groups/, read: [`${G}admin.directory.group.readonly`], write: [`${G}admin.directory.group`] },
  // Directory: customer-scoped resources.
  { test: /^admin\/directory\/customer\/[^/]+\/orgunits/, read: [`${G}admin.directory.orgunit.readonly`], write: [`${G}admin.directory.orgunit`] },
  { test: /^admin\/directory\/customer\/[^/]+\/domains/, read: [`${G}admin.directory.domain.readonly`], write: [`${G}admin.directory.domain`] },
  { test: /^admin\/directory\/customer\/[^/]+\/devices\/mobile/, read: [`${G}admin.directory.device.mobile.readonly`], write: [`${G}admin.directory.device.mobile`] },
  { test: /^admin\/directory\/customers/, read: [`${G}admin.directory.customer.readonly`], write: [`${G}admin.directory.customer`] },
  // Reports.
  { test: /^admin\/reports\/activity/, read: [`${G}admin.reports.audit.readonly`], write: [`${G}admin.reports.audit.readonly`] },
  { test: /^admin\/reports\/usage/, read: [`${G}admin.reports.usage.readonly`], write: [`${G}admin.reports.usage.readonly`] },
  // Data transfer.
  { test: /^admin\/datatransfer/, read: [`${G}admin.datatransfer.readonly`], write: [`${G}admin.datatransfer`] },
  // Licensing.
  { test: /^apps\/licensing/, read: [`${G}apps.licensing`], write: [`${G}apps.licensing`] },
  // Gmail settings: sendAs, delegates and forwarding need the sharing scope; the rest basic.
  { test: /^gmail\/users\/[^/]+\/settings\/(sendAs|delegates|forwardingAddresses)/, read: [`${G}gmail.settings.basic`, `${G}gmail.settings.sharing`], write: [`${G}gmail.settings.basic`, `${G}gmail.settings.sharing`] },
  { test: /^gmail\/users\/[^/]+\/settings/, read: [`${G}gmail.settings.basic`], write: [`${G}gmail.settings.basic`] },
  // Calendar and Drive.
  { test: /^calendar/, read: [`${G}calendar.readonly`], write: [`${G}calendar`] },
  { test: /^drive/, read: [`${G}drive.readonly`], write: [`${G}drive`] },
]

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Strip leading slashes and any `/vN/` version segment. */
export function normaliseGooglePath(path: string): string {
  return String(path || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter((seg) => seg && !/^v\d+(?:beta\d*|alpha)?$/i.test(seg))
    .join('/')
}

/**
 * Minimal scopes to mint for one Google API call. Unknown paths return the
 * frozen v1 contract (never wider). `fellBack` tells the caller so it can log
 * the gap; every fallback is a candidate row for PATH_SCOPES.
 */
export function googleScopesForPath(method: string, path: string): { scopes: string[]; fellBack: boolean } {
  const p = normaliseGooglePath(path)
  const isRead = READ_METHODS.has(String(method || 'GET').toUpperCase())
  for (const rule of PATH_SCOPES) {
    if (rule.test.test(p)) return { scopes: isRead ? rule.read : rule.write, fellBack: false }
  }
  return { scopes: REQUIRED_SCOPES, fellBack: true }
}
