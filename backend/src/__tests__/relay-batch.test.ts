/**
 * Tests for API relay batch unwrapping.
 *
 * The security property under test: a batch is authorized sub-request by
 * sub-request, allowed only if ALL pass, and an unparseable batch is DENIED
 * (never passed through). Pure — no network.
 */
import { describe, it, expect } from '@jest/globals';
import {
  parseGoogleBatch,
  evaluateBatch,
  authorizeGoogleBatch,
  BatchParseError,
} from '../services/relay/batch.js';
import {
  descriptorFromPath,
  callerCeiling,
  type RuleSet,
  type RelayConfig,
} from '../services/relay/policy.js';

const T = 1_000_000;
const ENABLED: RelayConfig = { relayEnabled: true, writesEnabled: true };
const READS_ONLY: RelayConfig = { relayEnabled: true, writesEnabled: false };

function rules(groupAllows: RuleSet['groupAllows'], orgDenies: RuleSet['orgDenies'] = []): RuleSet {
  return { orgDenies, groupAllows };
}

const B = 'batch_boundary';

/** Build a well-formed Google multipart/mixed batch body from request lines. */
function batchBody(reqs: Array<{ method: string; path: string }>): string {
  const parts = reqs
    .map(
      (r, i) =>
        `--${B}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\n${r.method} ${r.path} HTTP/1.1\r\n`,
    )
    .join('');
  return `${parts}--${B}--`;
}

describe('descriptorFromPath (shared extraction)', () => {
  it('drops version segments and takes the dotted resource', () => {
    const d = descriptorFromPath('google', '/admin/directory/v1/users/alice@example.com', 'GET');
    expect(d.resource).toBe('admin.directory.users');
    expect(d.method).toBe('GET');
  });
});

describe('parseGoogleBatch', () => {
  it('parses a well-formed batch into sub-requests', () => {
    const body = batchBody([
      { method: 'GET', path: '/admin/directory/v1/users/a@e.com' },
      { method: 'POST', path: '/admin/directory/v1/groups' },
    ]);
    const subs = parseGoogleBatch(body, B);
    expect(subs).toEqual([
      { method: 'GET', path: '/admin/directory/v1/users/a@e.com' },
      { method: 'POST', path: '/admin/directory/v1/groups' },
    ]);
  });

  it('throws on a missing boundary', () => {
    expect(() => parseGoogleBatch('anything', '')).toThrow(BatchParseError);
  });

  it('throws on a body with no request line (garbage)', () => {
    expect(() => parseGoogleBatch(`--${B}\r\njust noise\r\n--${B}--`, B)).toThrow(BatchParseError);
  });

  it('does not mistake a header line for a request line', () => {
    // Content-Type has no space-separated absolute path, so it must not parse as a request.
    const body = `--${B}\r\nContent-Type: application/http\r\n\r\n--${B}--`;
    expect(() => parseGoogleBatch(body, B)).toThrow(BatchParseError);
  });
});

describe('evaluateBatch — allowed only if ALL sub-requests pass', () => {
  it('allows a batch of all-permitted reads', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET' }]);
    const subs = [
      { method: 'GET', path: '/admin/directory/v1/users/a@e.com' },
      { method: 'GET', path: '/admin/directory/v1/users/b@e.com' },
    ];
    expect(evaluateBatch('google', subs, rs, ENABLED, T).allow).toBe(true);
  });

  it('denies the whole batch if any sub-request is denied', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET' }]);
    const subs = [
      { method: 'GET', path: '/admin/directory/v1/users/a@e.com' },
      { method: 'GET', path: '/admin/directory/v1/groups' }, // no rule for groups
    ];
    const d = evaluateBatch('google', subs, rs, ENABLED, T);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('sub-denied');
    expect(d.deniedIndex).toBe(1);
  });

  it('blocks a DELETE smuggled among reads (only a wildcard allow present)', () => {
    // The core bypass: outer looks benign, one sub is a delete.
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:*' }]);
    const subs = [
      { method: 'GET', path: '/admin/directory/v1/users/a@e.com' },
      { method: 'DELETE', path: '/admin/directory/v1/users/b@e.com' },
    ];
    const d = evaluateBatch('google', subs, rs, ENABLED, T);
    expect(d.allow).toBe(false);
    expect(d.subDecisions?.[1].decision.reason).toBe('delete-requires-explicit-rule');
  });

  it('respects the writes toggle per sub-request', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:*' }]);
    const subs = [{ method: 'POST', path: '/admin/directory/v1/users' }];
    expect(evaluateBatch('google', subs, rs, READS_ONLY, T).reason).toBe('sub-denied');
  });

  it('enforces the caller ceiling per sub-request', () => {
    const rs = rules([{ effect: 'allow', match: '*' }]);
    const caller = callerCeiling(false, ['admin.directory.users:GET']);
    const subs = [
      { method: 'GET', path: '/admin/directory/v1/users/a@e.com' },
      { method: 'GET', path: '/admin/directory/v1/groups' }, // outside ceiling
    ];
    const d = evaluateBatch('google', subs, rs, ENABLED, T, caller);
    expect(d.allow).toBe(false);
    expect(d.subDecisions?.[1].decision.reason).toBe('ceiling-exceeded');
  });

  it('denies an empty batch', () => {
    expect(evaluateBatch('google', [], rules([]), ENABLED, T).reason).toBe('batch-empty');
  });
});

describe('authorizeGoogleBatch — deny on unparseable, never pass through', () => {
  const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET' }]);

  it('authorizes a well-formed all-allowed batch', () => {
    const body = batchBody([
      { method: 'GET', path: '/admin/directory/v1/users/a@e.com' },
      { method: 'GET', path: '/admin/directory/v1/users/b@e.com' },
    ]);
    expect(authorizeGoogleBatch(body, B, 'google', rs, ENABLED, T).allow).toBe(true);
  });

  it('DENIES a garbage body rather than forwarding it', () => {
    const d = authorizeGoogleBatch('total garbage, no parts', B, 'google', rs, ENABLED, T);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('batch-unparseable');
  });

  it('DENIES when the boundary is missing', () => {
    const body = batchBody([{ method: 'GET', path: '/admin/directory/v1/users/a@e.com' }]);
    expect(authorizeGoogleBatch(body, '', 'google', rs, ENABLED, T).reason).toBe('batch-unparseable');
  });
});
