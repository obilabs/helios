/**
 * Account purpose: what an account is for (a person, a shared mailbox, a service
 * account, a resource). The single definition; the migration's CHECK constraint, the
 * routes, the sync and the Google mirror all use these values.
 *
 * Why it exists: Google has no "shared mailbox" flag. A shared inbox in Google
 * Workspace is an ordinary licensed user, so Helios showed info@ and billing@ as
 * people: on the org chart, in the manager picker, and as "no manager assigned".
 * Microsoft 365 does have the distinction (mailboxSettings.userPurpose); it maps onto
 * the same values.
 *
 * Mirrored to Google as the custom attribute Helios.AccountPurpose, so a purpose set
 * in the Google console reaches Helios on the next sync.
 */

export const ACCOUNT_PURPOSES = ['person', 'shared_mailbox', 'service', 'resource'] as const;
export type AccountPurpose = (typeof ACCOUNT_PURPOSES)[number];

export const DEFAULT_ACCOUNT_PURPOSE: AccountPurpose = 'person';

export const ACCOUNT_PURPOSE_LABELS: Record<AccountPurpose, string> = {
  person: 'Person',
  shared_mailbox: 'Shared mailbox',
  service: 'Service account',
  resource: 'Resource',
};

/** The Google custom schema that carries Helios attributes on a user record. */
export const HELIOS_SCHEMA_NAME = 'Helios';
export const ACCOUNT_PURPOSE_FIELD = 'AccountPurpose';

export function isAccountPurpose(value: unknown): value is AccountPurpose {
  return typeof value === 'string' && (ACCOUNT_PURPOSES as readonly string[]).includes(value);
}

/**
 * The purpose recorded on a Google user record, or null when Google has no opinion
 * (no attribute, or a value Helios does not recognise). Null means "leave Helios as
 * it is": an absent attribute is not a request to reset anyone to person.
 */
export function purposeFromGoogle(customSchemas: unknown): AccountPurpose | null {
  if (!customSchemas || typeof customSchemas !== 'object') return null;
  const schema = (customSchemas as Record<string, any>)[HELIOS_SCHEMA_NAME];
  const value = schema && typeof schema === 'object' ? schema[ACCOUNT_PURPOSE_FIELD] : undefined;
  return isAccountPurpose(value) ? value : null;
}

/**
 * Microsoft 365's mailboxSettings.userPurpose, mapped onto the same values.
 * Microsoft's values: user, linked, shared, room, equipment, others, unknownFutureValue.
 * Rooms and equipment are resources; "others" and unknown values give no opinion.
 */
export function purposeFromMicrosoft(userPurpose: unknown): AccountPurpose | null {
  switch (userPurpose) {
    case 'user':
    case 'linked':
      return 'person';
    case 'shared':
      return 'shared_mailbox';
    case 'room':
    case 'equipment':
      return 'resource';
    default:
      return null;
  }
}
