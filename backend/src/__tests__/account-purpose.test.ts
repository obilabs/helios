/**
 * Account purpose is stated twice: the TypeScript list the routes and sync validate
 * against, and the database CHECK constraint. If they drift, a value one side accepts
 * the other refuses (a save that 500s, or a sync that silently skips a row). This test
 * makes them agree, and pins how Google and Microsoft values map onto Helios's.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  ACCOUNT_PURPOSES,
  isAccountPurpose,
  purposeFromGoogle,
  purposeFromMicrosoft,
} from '../lib/account-purpose.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const migration = readFileSync(join(REPO, 'backend/database/migrations/097_account_purpose.sql'), 'utf8');

describe('account purpose', () => {
  it('the database CHECK allows exactly the values the code knows', () => {
    const check = migration.match(/CHECK \(account_purpose IN \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const values = check![1].split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(values.sort()).toEqual([...ACCOUNT_PURPOSES].sort());
  });

  it('the org chart view keeps people only', () => {
    expect(migration).toMatch(/CREATE OR REPLACE VIEW org_chart_members[\s\S]*account_purpose = 'person'/);
  });

  it('validates values', () => {
    expect(isAccountPurpose('shared_mailbox')).toBe(true);
    expect(isAccountPurpose('mailbox')).toBe(false);
    expect(isAccountPurpose(undefined)).toBe(false);
  });

  it('reads the Google attribute, and treats an absent one as no opinion', () => {
    expect(purposeFromGoogle({ Helios: { AccountPurpose: 'shared_mailbox' } })).toBe('shared_mailbox');
    expect(purposeFromGoogle({ Helios: { AccountPurpose: 'person' } })).toBe('person');
    // Absent or unrecognised: null, which leaves Helios as it is (never a reset to person).
    expect(purposeFromGoogle(undefined)).toBeNull();
    expect(purposeFromGoogle({})).toBeNull();
    expect(purposeFromGoogle({ Other: { AccountPurpose: 'service' } })).toBeNull();
    expect(purposeFromGoogle({ Helios: { AccountPurpose: 'Shared' } })).toBeNull();
  });

  it("maps Microsoft's mailbox purpose", () => {
    expect(purposeFromMicrosoft('user')).toBe('person');
    expect(purposeFromMicrosoft('linked')).toBe('person');
    expect(purposeFromMicrosoft('shared')).toBe('shared_mailbox');
    expect(purposeFromMicrosoft('room')).toBe('resource');
    expect(purposeFromMicrosoft('equipment')).toBe('resource');
    expect(purposeFromMicrosoft('others')).toBeNull();
    expect(purposeFromMicrosoft(undefined)).toBeNull();
  });
});
