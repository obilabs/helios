/**
 * How a Microsoft 365 account is filed in Helios. The single rule; the Microsoft sync
 * and its reconcile into the directory both use it.
 *
 * Before (proven on the obilabs.dev trial, 2026-09-11): guests were recognised only by
 * "#EXT#" in the sign-in name, and every unlicensed account was filed as a contact.
 * Graph states the answer directly, and a contact in Helios means someone outside the
 * organization with no account at all (an address-book entry), so an unlicensed member
 * account is not one.
 *
 *   guest  userType Guest, or created by invitation, or has an external-user state,
 *          or (fallback) #EXT# in the sign-in name
 *   staff  every other account. What it is FOR (person, shared mailbox, room) is the
 *          account purpose, read from the mailbox where permitted.
 */

export interface MicrosoftAccountFacts {
  userType?: string | null;
  creationType?: string | null;
  externalUserState?: string | null;
  userPrincipalName?: string | null;
}

export function isMicrosoftGuest(u: MicrosoftAccountFacts): boolean {
  if (u.userType === 'Guest') return true;
  if (u.creationType === 'Invitation') return true;
  if (u.externalUserState) return true;
  return String(u.userPrincipalName || '').includes('#EXT#');
}

export function microsoftUserType(u: MicrosoftAccountFacts): 'guest' | 'staff' {
  return isMicrosoftGuest(u) ? 'guest' : 'staff';
}
