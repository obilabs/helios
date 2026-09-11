/**
 * What an account is for. Mirrors backend/src/lib/account-purpose.ts (the API contract);
 * the server validates, this only labels.
 */
export type AccountPurpose = 'person' | 'shared_mailbox' | 'service' | 'resource';

export const ACCOUNT_PURPOSE_OPTIONS: { id: AccountPurpose; label: string }[] = [
  { id: 'person', label: 'Person' },
  { id: 'shared_mailbox', label: 'Shared mailbox' },
  { id: 'service', label: 'Service account' },
  { id: 'resource', label: 'Resource' },
];

export function accountPurposeLabel(purpose?: string | null): string {
  return ACCOUNT_PURPOSE_OPTIONS.find((o) => o.id === purpose)?.label ?? 'Person';
}
