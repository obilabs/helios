import { describe, it, expect } from '@jest/globals';
import { isEmailFormat, MAX_EMAIL_LENGTH } from '../utils/email-format.js';
import { trimTrailing } from '../utils/strings.js';
import { logSafe, MAX_LOG_VALUE_LENGTH } from '../utils/log-safe.js';

// The pattern isEmailFormat replaces; results must match it for sane lengths.
const LEGACY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('isEmailFormat', () => {
  const cases = [
    'a@b.c', 'first.last@corp.test', 'x@sub.domain.org', 'a@b.c.', 'a@.b.c',
    '', '@b.c', 'a@', 'a@b', 'a@b.', 'a@.c', 'a b@c.d', 'a@b@c.d', 'a@b .c', 'a\t@b.c',
  ];
  it.each(cases)('agrees with the previous pattern for %j', (v) => {
    expect(isEmailFormat(v)).toBe(LEGACY.test(v));
  });

  it('refuses non-strings and over-long values', () => {
    expect(isEmailFormat(undefined)).toBe(false);
    expect(isEmailFormat(42)).toBe(false);
    expect(isEmailFormat(`${'a'.repeat(MAX_EMAIL_LENGTH)}@b.c`)).toBe(false);
  });

  it('is fast on a long adversarial input', () => {
    const start = Date.now();
    isEmailFormat('a@' + '.'.repeat(100_000));
    expect(Date.now() - start).toBeLessThan(100);
  });
});

describe('trimTrailing', () => {
  it.each([
    ['https://x.test///', '/', 'https://x.test'],
    ['deprovisioned...', '.', 'deprovisioned'],
    ['...', '.', ''],
    ['abc', '.', 'abc'],
    ['', '/', ''],
  ])('trimTrailing(%j, %j) = %j', (value, ch, expected) => {
    expect(trimTrailing(value, ch)).toBe(expected);
  });
});

describe('logSafe', () => {
  it('removes line breaks', () => {
    expect(logSafe('GET /x\r\n[info]: forged')).toBe('GET /x[info]: forged');
  });

  it('uses an Error message and truncates long values', () => {
    expect(logSafe(new Error('bad\nthing'))).toBe('badthing');
    const out = logSafe('x'.repeat(MAX_LOG_VALUE_LENGTH + 10));
    expect(out.length).toBe(MAX_LOG_VALUE_LENGTH + 3);
  });
});
