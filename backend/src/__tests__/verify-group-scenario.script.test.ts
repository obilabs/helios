/**
 * The live verification script must never touch a real group. Its only guard is
 * the address prefix, so the guard is tested here.
 */
import { describe, it, expect } from '@jest/globals';
import { BUILTIN_GROUP_SCENARIOS } from '../config/group-scenarios.js';
import {
  TEST_GROUP_PREFIX,
  assertTestGroupAddress,
  parseArgs,
  testGroupAddress,
} from '../scripts/verify-group-scenario.js';

describe('verify-group-scenario guard', () => {
  it('accepts only helios-scenario-test- addresses', () => {
    expect(assertTestGroupAddress('helios-scenario-test-x-1@example.com')).toBe('helios-scenario-test-x-1@example.com');
    for (const bad of ['hello@example.com', 'security@example.com', 'x-helios-scenario-test-1@example.com', `${TEST_GROUP_PREFIX}@example.com`, 'helios-scenario-test-x', '']) {
      expect(() => assertTestGroupAddress(bad)).toThrow(/Refusing to touch/);
    }
  });

  it('generates a unique, guarded address within the 63-character local-part limit for every built-in', () => {
    for (const s of BUILTIN_GROUP_SCENARIOS) {
      const a = testGroupAddress(s.key, 'Example.com', 1_760_000_000_000);
      expect(a.startsWith(TEST_GROUP_PREFIX)).toBe(true);
      expect(a.split('@')[0].length).toBeLessThanOrEqual(63);
      expect(a.endsWith('@example.com')).toBe(true);
    }
    expect(testGroupAddress('announcement-list', 'example.com', 1)).not.toBe(testGroupAddress('announcement-list', 'example.com', 2));
  });

  it('parses the documented arguments', () => {
    expect(parseArgs(['--scenario', 'public-contact-inbox', '--member', 'a@example.com:owner', '--cleanup'])).toEqual({
      list: false,
      cleanup: true,
      scenario: 'public-contact-inbox',
      members: [{ email: 'a@example.com', role: 'OWNER' }],
      aliases: [],
    });
    expect(() => parseArgs(['--member', 'a@example.com:ADMIN'])).toThrow();
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
  });
});
