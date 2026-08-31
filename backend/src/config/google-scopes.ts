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

/** The plain scope list — what an admin authorises in Admin Console → API Controls → Domain-wide delegation. */
export const REQUIRED_SCOPES: string[] = SCOPE_DETAILS.map((s) => s.scope)

/** Comma-separated form Google's Admin Console expects when authorising a client. */
export const REQUIRED_SCOPES_CSV: string = REQUIRED_SCOPES.join(',')
