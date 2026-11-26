import { describe, it, expect } from '@jest/globals';
import { directResourceKey, isDeletedListing } from '../middleware/proxy-paths.js';

describe('directResourceKey', () => {
  it('decodes an address that arrives URL-encoded', () => {
    expect(directResourceKey('admin/directory/v1/users/ana%40example.com', 'users')).toBe('ana@example.com');
  });

  it('reads a plain address, an id, a trailing slash and a query string', () => {
    expect(directResourceKey('admin/directory/v1/users/ana@example.com', 'users')).toBe('ana@example.com');
    expect(directResourceKey('admin/directory/v1/users/113423699759092746019/', 'users')).toBe('113423699759092746019');
    expect(directResourceKey('admin/directory/v1/users/ana%40example.com?fields=id', 'users')).toBe('ana@example.com');
    expect(directResourceKey('admin/directory/v1/groups/team%40example.com', 'groups')).toBe('team@example.com');
  });

  it('is null for something beneath a user, so removing an alias is not read as removing the user', () => {
    expect(directResourceKey('admin/directory/v1/users/ana%40example.com/aliases/a%40example.com', 'users')).toBeNull();
    expect(directResourceKey('admin/directory/v1/users/ana%40example.com/undelete', 'users')).toBeNull();
    expect(directResourceKey('admin/directory/v1/users/ana%40example.com/photos/thumbnail', 'users')).toBeNull();
  });

  it('is null for something beneath a group, so removing a member is not read as removing the group', () => {
    expect(directResourceKey('admin/directory/v1/groups/team%40example.com/members/ana%40example.com', 'groups')).toBeNull();
    expect(directResourceKey('admin/directory/v1/groups/team%40example.com/aliases/t%40example.com', 'groups')).toBeNull();
  });

  it('is null for the collection itself', () => {
    expect(directResourceKey('admin/directory/v1/users', 'users')).toBeNull();
    expect(directResourceKey('admin/directory/v1/users?customer=my_customer', 'users')).toBeNull();
  });

  it('leaves a key that is not valid encoding as it is', () => {
    expect(directResourceKey('admin/directory/v1/users/100%done', 'users')).toBe('100%done');
  });
});

describe('isDeletedListing', () => {
  it('is true only for an entry Google marks with a deletion time', () => {
    expect(isDeletedListing({ deletionTime: '2026-11-26T19:52:00.000Z' })).toBe(true);
    expect(isDeletedListing({})).toBe(false);
    expect(isDeletedListing({ deletionTime: null })).toBe(false);
    expect(isDeletedListing(undefined)).toBe(false);
  });
});
