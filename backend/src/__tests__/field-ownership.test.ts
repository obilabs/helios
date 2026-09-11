/**
 * The decision rule for field ownership. Pure, so every case is pinned here, including
 * the one that matters most: an empty Google value never wipes a filled Helios one.
 */
import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_FIELD_OWNERSHIP,
  OWNED_FIELDS,
  decideAll,
  decideField,
  googleFieldValues,
  heliosFieldValues,
  validateFieldOwnership,
  FieldOwnershipError,
} from '../lib/field-ownership.js';

describe('field ownership decisions', () => {
  it('does nothing when the values agree, ignoring case for the manager and surrounding spaces', () => {
    expect(decideField('jobTitle', 'google', ' Team Lead ', 'Team Lead').action).toBe('none');
    expect(decideField('manager', 'helios', 'Boss@Example.com', 'boss@example.com').action).toBe('none');
  });

  it('pulls Google\'s value when Google owns the field', () => {
    // The proven case: a title changed in the Google console must reach Helios.
    const d = decideField('jobTitle', 'google', 'Team Lead', 'Changed In Google');
    expect(d.action).toBe('pull');
    expect(d.googleValue).toBe('Changed In Google');
  });

  it('never wipes a filled Helios value with an empty Google one, even when Google owns it', () => {
    expect(decideField('department', 'google', 'Engineering', '').action).toBe('drift');
  });

  it('fills an empty Helios value from Google', () => {
    expect(decideField('department', 'google', '', 'Engineering').action).toBe('pull');
  });

  it('reports a difference instead of overwriting when Helios owns the field', () => {
    expect(decideField('jobTitle', 'helios', 'Team Lead', 'Changed In Google').action).toBe('drift');
    expect(decideField('jobTitle', 'helios', '', 'Changed In Google').action).toBe('drift');
  });

  it('defaults every field to Google, the Google-first choice', () => {
    expect(OWNED_FIELDS.every((f) => DEFAULT_FIELD_OWNERSHIP[f] === 'google')).toBe(true);
  });
});

describe('reading values from each side', () => {
  it('reads Google\'s primary job, typed phones, manager relation and first location', () => {
    const g = googleFieldValues({
      organizations: [{ title: 'Other', department: 'X' }, { title: 'Lead', department: 'Eng', primary: true }],
      phones: [{ type: 'work', value: '1' }, { type: 'mobile', value: '2' }],
      relations: [{ type: 'manager', value: 'Boss@Example.com' }],
      locations: [{ type: 'desk', area: 'Edmonton' }],
    });
    expect(g).toEqual({ jobTitle: 'Lead', department: 'Eng', manager: 'boss@example.com', mobilePhone: '2', workPhone: '1', location: 'Edmonton' });
  });

  it('treats missing Google data as empty, not as an error', () => {
    expect(googleFieldValues({})).toEqual({ jobTitle: '', department: '', manager: '', mobilePhone: '', workPhone: '', location: '' });
  });

  it('decides all fields at once', () => {
    const h = heliosFieldValues({ job_title: 'Team Lead', department: 'Eng' }, null);
    const g = googleFieldValues({ organizations: [{ title: 'Changed', department: 'Eng', primary: true }] });
    const byField = Object.fromEntries(decideAll(DEFAULT_FIELD_OWNERSHIP, h, g).map((d) => [d.field, d.action]));
    expect(byField).toEqual({ jobTitle: 'pull', department: 'none', manager: 'none', mobilePhone: 'none', workPhone: 'none', location: 'none' });
  });
});

describe('validating an ownership map', () => {
  it('fills unspecified fields with the default', () => {
    expect(validateFieldOwnership({ jobTitle: 'helios' }).jobTitle).toBe('helios');
    expect(validateFieldOwnership({ jobTitle: 'helios' }).department).toBe('google');
  });

  it('refuses unknown fields and unknown owners', () => {
    expect(() => validateFieldOwnership({ salary: 'google' })).toThrow(FieldOwnershipError);
    expect(() => validateFieldOwnership({ jobTitle: 'microsoft' })).toThrow(FieldOwnershipError);
  });
});
