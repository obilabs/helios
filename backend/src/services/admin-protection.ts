/**
 * Self-lockout protection for destructive Google Workspace actions.
 *
 * Helios authenticates to Google by impersonating ONE configured super admin
 * (the `subject` of every delegated JWT — `gw_credentials.admin_email`). If a
 * destructive action (suspend / delete / offboard) is aimed at that same
 * account, Helios would sever its own authentication — and likely lock the
 * operator out of Workspace too. Google won't stop you; Helios must.
 *
 * This is the one flow where the ObiLabs failure mode (silence indistinguishable
 * from success) is unrecoverable: a wrong destructive write to the admin can't
 * be undone. So every destructive user path routes through `assertNotProtectedAdmin`
 * before it acts, and the guard FAILS SAFE — if it can't prove the target is not
 * the protected admin, it refuses.
 *
 * Kept dependency-free (no DB, no logger) so it is trivially unit-testable.
 */

export class ProtectedAdminError extends Error {
  /** Stable code so routes can map this to a 409/friendly message rather than a 500. */
  readonly code = 'PROTECTED_ADMIN'
  constructor(message: string) {
    super(message)
    this.name = 'ProtectedAdminError'
  }
}

/** Minimal shape of the Directory client this guard needs (a `users.get`). */
export interface DirectoryUserLookup {
  users: {
    get: (params: {
      userKey: string
      projection?: string
    }) => Promise<{ data: { primaryEmail?: string | null; isAdmin?: boolean | null } }>
  }
}

/**
 * Throw if `target` resolves to the configured impersonation admin.
 *
 * @param admin       an authorised Directory v1 client (for resolving an id → email)
 * @param target      the user being acted on — a Google user id OR a primary email
 * @param adminEmail  the configured impersonation admin (`gw_credentials.admin_email`)
 * @param action      verb for the message, e.g. "suspend" | "delete" | "offboard"
 */
export async function assertNotProtectedAdmin(
  admin: DirectoryUserLookup | null | undefined,
  target: string,
  adminEmail: string | null | undefined,
  action = 'modify',
): Promise<void> {
  const configured = (adminEmail || '').trim().toLowerCase()
  // Nothing configured to protect (e.g. credentials not set up yet). Don't block.
  if (!configured) return

  let targetEmail = (target || '').trim().toLowerCase()

  // If we were handed an opaque id rather than an email, resolve it. Callers that
  // already hold the email (e.g. offboarding config) pass `null` for `admin`.
  if (targetEmail && !targetEmail.includes('@')) {
    if (!admin) {
      // Fail safe: an id we can't resolve could be the protected admin.
      throw new ProtectedAdminError(
        `Refusing to ${action} "${target}": Helios has no directory client to verify whether ` +
          `this user id is the admin it connects with. Retry, or act in the Google Admin console.`,
      )
    }
    try {
      const res = await admin.users.get({ userKey: target, projection: 'basic' })
      targetEmail = (res.data.primaryEmail || '').trim().toLowerCase()
    } catch (err: any) {
      // Fail safe: we cannot prove this is NOT the protected admin, and the
      // action is irreversible, so refuse rather than risk a self-lockout.
      throw new ProtectedAdminError(
        `Refusing to ${action} "${target}": Helios could not verify whether it is the ` +
          `Google Workspace admin it connects with (lookup failed: ${err?.message || 'unknown error'}). ` +
          `Retry, or make this change directly in the Google Admin console.`,
      )
    }
  }

  if (targetEmail && targetEmail === configured) {
    throw new ProtectedAdminError(
      `Refusing to ${action} ${targetEmail}: it is the Google Workspace admin Helios uses to stay ` +
        `connected. Doing this through Helios would lock Helios out of your Workspace (and likely lock ` +
        `you out too). If you truly intend to ${action} this account, do it directly in the Google Admin console.`,
    )
  }
}
