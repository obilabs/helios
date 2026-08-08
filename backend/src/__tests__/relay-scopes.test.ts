/**
 * Tests for minimal OAuth scope SELECTION (relay transport ceiling 2).
 *
 * The live token exchange against Google cannot run offline; what must be
 * airtight is WHICH scopes get minted. A read must select a readonly scope and
 * never a write scope; an unmapped resource must select nothing (the transport
 * then denies rather than falling back to broad scopes).
 */
import { describe, it, expect } from '@jest/globals';
import {
  selectScopes,
  selectScopesForRequest,
  selectScopesForBatch,
} from '../services/relay/scopes.js';

const RO_USER = 'https://www.googleapis.com/auth/admin.directory.user.readonly';
const RW_USER = 'https://www.googleapis.com/auth/admin.directory.user';
const RO_GROUP = 'https://www.googleapis.com/auth/admin.directory.group.readonly';
const RW_GROUP = 'https://www.googleapis.com/auth/admin.directory.group';

describe('selectScopes', () => {
  it('a directory read selects ONLY the readonly scope', () => {
    const scopes = selectScopes('admin.directory.users', 'read');
    expect(scopes).toEqual([RO_USER]);
    expect(scopes).not.toContain(RW_USER);
  });

  it('a write selects the write scope', () => {
    expect(selectScopes('admin.directory.users', 'write')).toEqual([RW_USER]);
  });

  it('a delete selects the write scope (Google has no delete-only scope)', () => {
    expect(selectScopes('admin.directory.users', 'delete')).toEqual([RW_USER]);
  });

  it('covers each mapped directory family', () => {
    expect(selectScopes('admin.directory.groups', 'read')).toEqual([RO_GROUP]);
    expect(selectScopes('admin.directory.orgunits', 'read')).toEqual([
      'https://www.googleapis.com/auth/admin.directory.orgunit.readonly',
    ]);
    expect(selectScopes('admin.directory.domains', 'write')).toEqual([
      'https://www.googleapis.com/auth/admin.directory.domain',
    ]);
  });

  it('an unmapped resource selects NOTHING — never a broad fallback', () => {
    expect(selectScopes('gmail.users.settings', 'read')).toEqual([]);
    expect(selectScopes('admin.reports.activities', 'read')).toEqual([]);
  });
});

describe('selectScopesForRequest (raw HTTP method)', () => {
  it('GET maps to the readonly scope', () => {
    expect(selectScopesForRequest('admin.directory.users', 'GET')).toEqual([RO_USER]);
  });

  it('an exotic method is classified as write, never read', () => {
    expect(selectScopesForRequest('admin.directory.users', 'FROBNICATE')).toEqual([RW_USER]);
  });
});

describe('selectScopesForBatch', () => {
  it('unions minimal scopes across sub-requests without duplicates', () => {
    const scopes = selectScopesForBatch([
      { resource: 'admin.directory.users', method: 'GET' },
      { resource: 'admin.directory.users', method: 'GET' },
      { resource: 'admin.directory.groups', method: 'GET' },
    ]);
    expect(scopes).toEqual(expect.arrayContaining([RO_USER, RO_GROUP]));
    expect(scopes).toHaveLength(2);
  });

  it('a read-only batch never picks up write scopes', () => {
    const scopes = selectScopesForBatch([
      { resource: 'admin.directory.users', method: 'GET' },
      { resource: 'admin.directory.groups', method: 'GET' },
    ]);
    expect(scopes).not.toContain(RW_USER);
    expect(scopes).not.toContain(RW_GROUP);
  });

  it('one unmapped sub-request poisons the whole batch (null => deny)', () => {
    expect(
      selectScopesForBatch([
        { resource: 'admin.directory.users', method: 'GET' },
        { resource: 'gmail.users.settings', method: 'GET' },
      ]),
    ).toBeNull();
  });
});
