/**
 * Tests for the API relay authorization policy engine.
 *
 * Pure function, no network — exhaustive by design. This is the offline-testable
 * heart the OpenSpec calls for.
 */
import { describe, it, expect } from '@jest/globals';
import {
  evaluate,
  classifyMethod,
  callerCeiling,
  type RuleSet,
  type RelayConfig,
  type RelayDescriptor,
  type CallerAuthority,
} from '../services/relay/policy.js';

const ENABLED: RelayConfig = { relayEnabled: true, writesEnabled: true };
const READS_ONLY: RelayConfig = { relayEnabled: true, writesEnabled: false };

const EMPTY: RuleSet = { orgDenies: [], groupAllows: [] };

function desc(resource: string, method: string, subject?: string): RelayDescriptor {
  return { cloud: 'google', resource, method, subject };
}

function rules(groupAllows: RuleSet['groupAllows'], orgDenies: RuleSet['orgDenies'] = []): RuleSet {
  return { orgDenies, groupAllows };
}

describe('classifyMethod', () => {
  it('reads', () => {
    expect(classifyMethod('GET')).toBe('read');
    expect(classifyMethod('head')).toBe('read');
  });
  it('writes', () => {
    expect(classifyMethod('POST')).toBe('write');
    expect(classifyMethod('PATCH')).toBe('write');
  });
  it('delete', () => {
    expect(classifyMethod('DELETE')).toBe('delete');
  });
  it('treats unknown methods as write (the stricter gate), never read', () => {
    expect(classifyMethod('FROBNICATE')).toBe('write');
  });
});

describe('deny by default', () => {
  it('denies when the relay is disabled, regardless of rules', () => {
    const rs = rules([{ effect: 'allow', match: '*' }]);
    const d = evaluate(desc('admin.directory.users', 'GET'), rs, { relayEnabled: false, writesEnabled: true });
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('relay-disabled');
  });

  it('denies an empty rule set (nothing configured yet)', () => {
    const d = evaluate(desc('admin.directory.users', 'GET'), EMPTY, ENABLED);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('default-deny');
  });
});

describe('reads', () => {
  it('allows a read with a matching allow rule', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET', id: 'r1' }]);
    const d = evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED);
    expect(d.allow).toBe(true);
    expect(d.matchedRuleId).toBe('r1');
  });

  it('denies a read with no matching rule', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.groups:GET' }]);
    const d = evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED);
    expect(d.reason).toBe('default-deny');
  });
});

describe('writes', () => {
  it('allows a write with an allow rule when writes are enabled', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:POST' }]);
    expect(evaluate(desc('admin.directory.users', 'POST'), rs, ENABLED).allow).toBe(true);
  });

  it('denies a write when the writes toggle is off, even with an allow rule', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:POST' }]);
    const d = evaluate(desc('admin.directory.users', 'POST'), rs, READS_ONLY);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('writes-disabled');
  });

  it('denies a write with no matching rule', () => {
    const d = evaluate(desc('admin.directory.users', 'POST'), EMPTY, ENABLED);
    expect(d.reason).toBe('default-deny');
  });
});

describe('deletes — strongest gate', () => {
  it('allows a delete with an EXPLICIT delete rule', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:DELETE' }]);
    expect(evaluate(desc('admin.directory.users', 'DELETE'), rs, ENABLED).allow).toBe(true);
  });

  it('denies a delete backed only by a wildcard-method allow', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:*' }]);
    const d = evaluate(desc('admin.directory.users', 'DELETE'), rs, ENABLED);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('delete-requires-explicit-rule');
  });

  it('a full `*` allow grants a read but NOT a delete', () => {
    const rs = rules([{ effect: 'allow', match: '*' }]);
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED).allow).toBe(true);
    expect(evaluate(desc('admin.directory.users', 'DELETE'), rs, ENABLED).reason).toBe(
      'delete-requires-explicit-rule',
    );
  });

  it('denies a delete when writes are disabled', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:DELETE' }]);
    expect(evaluate(desc('admin.directory.users', 'DELETE'), rs, READS_ONLY).reason).toBe(
      'writes-disabled',
    );
  });
});

describe('precedence — org deny beats group allow', () => {
  it('an org deny overrides a matching group allow', () => {
    const rs = rules(
      [{ effect: 'allow', match: 'admin.directory.users:DELETE' }],
      [{ effect: 'deny', match: 'admin.directory.users:DELETE', id: 'kill' }],
    );
    const d = evaluate(desc('admin.directory.users', 'DELETE'), rs, ENABLED);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('org-deny');
    expect(d.matchedRuleId).toBe('kill');
  });

  it('a `*` org deny is an absolute kill switch', () => {
    const rs = rules([{ effect: 'allow', match: '*' }], [{ effect: 'deny', match: '*' }]);
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED).reason).toBe('org-deny');
  });
});

describe('wildcards and additive allows', () => {
  it('a resource wildcard matches a nested resource', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.*:GET' }]);
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED).allow).toBe(true);
    expect(evaluate(desc('admin.directory.groups', 'GET'), rs, ENABLED).allow).toBe(true);
  });

  it('a resource wildcard does not match a different branch', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.*:GET' }]);
    expect(evaluate(desc('gmail.settings', 'GET'), rs, ENABLED).reason).toBe('default-deny');
  });

  it('the union of two group allows permits either', () => {
    const rs = rules([
      { effect: 'allow', match: 'admin.directory.users:GET' },
      { effect: 'allow', match: 'admin.directory.groups:GET' },
    ]);
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED).allow).toBe(true);
    expect(evaluate(desc('admin.directory.groups', 'GET'), rs, ENABLED).allow).toBe(true);
  });
});

describe('caller ceiling — narrow, never widen', () => {
  const T = 1_000_000; // fixed clock; expiry not under test here
  const allowAll = rules([{ effect: 'allow', match: '*' }]);
  const admin = callerCeiling(true);
  const readUsersOnly: CallerAuthority = { ceiling: ['admin.directory.users:GET'] };

  it('no caller supplied => ceiling not enforced (backward compatible)', () => {
    expect(evaluate(desc('gmail.settings', 'GET'), allowAll, ENABLED, T).allow).toBe(true);
  });

  it('admin ceiling passes anything the config allows', () => {
    expect(evaluate(desc('admin.directory.users', 'GET'), allowAll, ENABLED, T, admin).allow).toBe(true);
  });

  it('a limited caller is allowed within their ceiling', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET' }]);
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED, T, readUsersOnly).allow).toBe(true);
  });

  it('caller ceiling caps BELOW a broad config allow', () => {
    // Config would allow everything (`*`), but the caller may only read users.
    const d = evaluate(desc('admin.directory.groups', 'GET'), allowAll, ENABLED, T, readUsersOnly);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('ceiling-exceeded');
  });

  it('caller cannot write beyond their read-only ceiling even if config allows it', () => {
    const d = evaluate(desc('admin.directory.users', 'POST'), allowAll, ENABLED, T, readUsersOnly);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('ceiling-exceeded');
  });

  it('a non-admin without delete capacity is denied a delete even with an explicit delete rule configured', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:DELETE' }]);
    const d = evaluate(desc('admin.directory.users', 'DELETE'), rs, ENABLED, T, readUsersOnly);
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('ceiling-exceeded');
  });

  it('admin ceiling includes delete capacity (config still needs an explicit delete rule)', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:DELETE' }]);
    expect(evaluate(desc('admin.directory.users', 'DELETE'), rs, ENABLED, T, admin).allow).toBe(true);
  });
});

describe('impersonation-subject constraints', () => {
  const T = 1_000_000;

  it('acting on a privileged subject is denied without an explicit rule', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET' }]);
    const d = evaluate(
      { cloud: 'google', resource: 'admin.directory.users', method: 'GET', subjectPrivileged: true },
      rs, ENABLED, T,
    );
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('privileged-subject-requires-explicit-rule');
  });

  it('a non-privileged subject passes an ordinary rule', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET' }]);
    const d = evaluate(
      { cloud: 'google', resource: 'admin.directory.users', method: 'GET', subjectPrivileged: false },
      rs, ENABLED, T,
    );
    expect(d.allow).toBe(true);
  });

  it('gates privileged subjects on READS too, not just writes/deletes', () => {
    // A scoped read grant must not leak a super-admin's data either.
    const rs = rules([{ effect: 'allow', match: '*' }]);
    const d = evaluate(
      { cloud: 'google', resource: 'admin.directory.users', method: 'GET', subjectPrivileged: true },
      rs, ENABLED, T,
    );
    expect(d.reason).toBe('privileged-subject-requires-explicit-rule');
  });

  it('a rule that explicitly allows privileged subjects permits the action', () => {
    const rs = rules([
      { effect: 'allow', match: 'admin.directory.users:GET', subject: { allowPrivileged: true } },
    ]);
    const d = evaluate(
      { cloud: 'google', resource: 'admin.directory.users', method: 'GET', subjectPrivileged: true },
      rs, ENABLED, T,
    );
    expect(d.allow).toBe(true);
  });

  it('an OU-scoped rule allows a subject inside the OU', () => {
    const rs = rules([
      { effect: 'allow', match: 'admin.directory.users:GET', subject: { orgUnits: ['/Sales'] } },
    ]);
    const d = evaluate(
      { cloud: 'google', resource: 'admin.directory.users', method: 'GET', subject: 'x', subjectOrgUnit: '/Sales' },
      rs, ENABLED, T,
    );
    expect(d.allow).toBe(true);
  });

  it('an OU-scoped rule denies a subject outside the OU', () => {
    const rs = rules([
      { effect: 'allow', match: 'admin.directory.users:GET', subject: { orgUnits: ['/Sales'] } },
    ]);
    const d = evaluate(
      { cloud: 'google', resource: 'admin.directory.users', method: 'GET', subject: 'x', subjectOrgUnit: '/Engineering' },
      rs, ENABLED, T,
    );
    expect(d.allow).toBe(false);
    expect(d.reason).toBe('subject-out-of-scope');
  });

  it('an OU-scoped rule denies when the subject OU is unknown', () => {
    const rs = rules([
      { effect: 'allow', match: 'admin.directory.users:GET', subject: { orgUnits: ['/Sales'] } },
    ]);
    const d = evaluate(
      { cloud: 'google', resource: 'admin.directory.users', method: 'GET', subject: 'x' },
      rs, ENABLED, T,
    );
    expect(d.reason).toBe('subject-out-of-scope');
  });

  it('no subject info => subject constraints do not fire (ordinary request)', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET' }]);
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED, T).allow).toBe(true);
  });
});

describe('rule expiry', () => {
  const NOW = 1_000_000;

  it('an expired allow rule does not match', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET', expiresAt: NOW - 1 }]);
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED, NOW).reason).toBe(
      'default-deny',
    );
  });

  it('a not-yet-expired allow rule matches', () => {
    const rs = rules([{ effect: 'allow', match: 'admin.directory.users:GET', expiresAt: NOW + 1 }]);
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED, NOW).allow).toBe(true);
  });

  it('an expired org deny stops blocking', () => {
    const rs = rules(
      [{ effect: 'allow', match: 'admin.directory.users:GET' }],
      [{ effect: 'deny', match: 'admin.directory.users:GET', expiresAt: NOW - 1 }],
    );
    expect(evaluate(desc('admin.directory.users', 'GET'), rs, ENABLED, NOW).allow).toBe(true);
  });
});
