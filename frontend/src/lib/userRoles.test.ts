import { describe, it, expect } from 'vitest';
import { CREATABLE_ROLES, roleOptionsFor } from './userRoles';

describe('CREATABLE_ROLES', () => {
  it('does not offer an administrator role', () => {
    expect(CREATABLE_ROLES.map((r) => r.value)).toEqual(['user', 'manager']);
  });
});

describe('roleOptionsFor', () => {
  it('offers user and manager for a new user', () => {
    expect(roleOptionsFor().map((r) => r.value)).toEqual(['user', 'manager']);
    expect(roleOptionsFor('user').map((r) => r.value)).toEqual(['user', 'manager']);
  });

  it('keeps an existing administrator role so the select shows it', () => {
    expect(roleOptionsFor('admin')).toEqual([
      { value: 'user', label: 'User' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ]);
    expect(roleOptionsFor('super_admin').at(-1)).toEqual({ value: 'super_admin', label: 'Super Admin' });
  });
});
