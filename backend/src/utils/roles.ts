/**
 * Role policy — the single definition of which roles carry admin privileges.
 *
 * Everything that asks "is this caller an admin?" goes through here: the JWT and
 * session paths in middleware/auth.ts (which set `req.user.isAdmin`), the
 * `requireAdmin` route guard, and any handler that needs an admin-or-self
 * decision inline. Do not compare `role === 'admin'` directly — that silently
 * refuses `super_admin`.
 *
 * Dependency-free on purpose so route and service modules (and tests that mock
 * middleware/auth.ts) can import it.
 */

/** Roles with full organization administration rights. */
export const ADMIN_ROLES: readonly string[] = Object.freeze(['admin', 'super_admin', 'platform_owner']);

/** True when `role` carries admin privileges. */
export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

/**
 * True when the authenticated request belongs to an admin. Uses the role (the
 * source of truth) rather than trusting a pre-computed flag alone.
 */
export function isAdminUser(user: { role?: string; isAdmin?: boolean } | undefined | null): boolean {
  return !!user && isAdminRole(user.role);
}
