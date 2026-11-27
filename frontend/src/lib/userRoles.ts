/**
 * Roles offered when creating or editing a user.
 *
 * The server refuses an administrator role at creation and when editing a
 * user (backend/src/routes/organization.routes.ts, PRIVILEGED_ROLES).
 * Administrator access is granted afterwards in Settings > Roles & Admins, so
 * the forms do not offer it.
 */

export interface RoleOption {
  value: string;
  label: string;
}

/** Roles an admin can choose when creating a user. */
export const CREATABLE_ROLES: readonly RoleOption[] = Object.freeze([
  { value: 'user', label: 'User' },
  { value: 'manager', label: 'Manager' },
]);

/** Help text shown under a role select. */
export const ADMIN_ROLE_HINT =
  'To make this person an administrator, create the account, then grant administrator access in Settings > Roles & Admins.';

/**
 * Options for a role select. When editing an existing user whose role is not
 * one of the creatable roles (for example an administrator), that role is kept
 * as an option so the select shows the real value instead of a wrong one.
 */
export function roleOptionsFor(currentRole?: string | null): RoleOption[] {
  const options = [...CREATABLE_ROLES];
  if (currentRole && !options.some((o) => o.value === currentRole)) {
    options.push({ value: currentRole, label: roleLabel(currentRole) });
  }
  return options;
}

function roleLabel(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
