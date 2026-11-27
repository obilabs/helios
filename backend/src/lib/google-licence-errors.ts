/**
 * Turning Google's refusal of a per-user licence change into something an admin
 * can act on.
 *
 * While automatic licensing is on for a person's organizational unit, Google
 * refuses to assign, change or remove that person's licence. It says so in two
 * different ways:
 *
 *   - What a real tenant returns (recorded 2026-09-08, seen again 2026-11-26):
 *     HTTP 400, reason "invalid", "Combination of product and sku is invalid or
 *     the product has auto-assigned feature enabled".
 *   - What Google's Licensing API guide documents: HTTP 412, "Auto License
 *     un-assignment is not allowed" / "Auto License switching is not allowed".
 *
 * Both are recognised here. Anything else is passed on with Google's own status
 * and wording, not flattened into one generic failure.
 */

export type LicenceAction = 'assign' | 'remove';

export interface LicenceRefusal {
  /** HTTP status Helios should answer with. */
  status: number;
  /** Message for the admin. */
  message: string;
  /** Machine-readable cause. */
  reason: 'automatic_licensing' | 'google_refused';
  /** Google's own HTTP status, when it gave one. */
  googleStatus?: number;
}

const AUTOMATIC_LICENSING = /auto-assigned|auto[\s-]?licen[cs]e\s+(un-?assignment|switching)/i;

/** Where the setting lives in the Google Admin console. */
export const AUTOMATIC_LICENSING_PATH = 'Menu > Billing > License settings';

export function isAutomaticLicensingRefusal(googleMessage: string | undefined | null): boolean {
  return AUTOMATIC_LICENSING.test(googleMessage || '');
}

export function explainLicenceRefusal(
  action: LicenceAction,
  googleMessage: string | undefined | null,
  googleStatus?: number
): LicenceRefusal {
  const status = typeof googleStatus === 'number' && Number.isFinite(googleStatus) ? googleStatus : undefined;

  if (isAutomaticLicensingRefusal(googleMessage)) {
    const what = action === 'remove' ? 'removed from' : 'changed for';
    return {
      // The request was fine; the state of the Workspace does not allow it.
      status: 409,
      reason: 'automatic_licensing',
      googleStatus: status,
      message:
        `Google assigns this licence automatically to the person's organizational unit, so it cannot be ${what} one person. ` +
        `In the Google Admin console go to ${AUTOMATIC_LICENSING_PATH}, turn automatic licensing off for that unit ` +
        `(or move the person to a unit where it is off), then try again. ` +
        `Turning it off keeps the licences people already have. A suspended person is still billed until the licence is removed.`,
    };
  }

  // A 4xx from Google is the caller's or the Workspace's problem and is passed
  // on as it is; anything else is Google failing, reported as a bad gateway.
  const passThrough = status !== undefined && status >= 400 && status < 500 ? status : 502;
  const verb = action === 'remove' ? 'removal' : 'change';
  return {
    status: passThrough,
    reason: 'google_refused',
    googleStatus: status,
    message: `Google Workspace rejected the licence ${verb}: ${googleMessage || 'no reason given'}`,
  };
}

/** Google's HTTP status from an error thrown by the Google API client. */
export function googleStatusOf(error: any): number | undefined {
  const candidates = [error?.response?.status, error?.status, error?.code];
  for (const c of candidates) {
    const n = typeof c === 'string' ? Number(c) : c;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }
  return undefined;
}
