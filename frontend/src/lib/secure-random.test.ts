import { describe, it, expect } from 'vitest';
import { secureRandomInt } from './secure-random';

describe('secureRandomInt', () => {
  it('stays within [0, max)', () => {
    for (let i = 0; i < 2000; i++) {
      const v = secureRandomInt(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('reaches every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(secureRandomInt(5));
    expect(seen.size).toBe(5);
  });

  it('rejects invalid bounds', () => {
    expect(() => secureRandomInt(0)).toThrow(RangeError);
    expect(() => secureRandomInt(1.5)).toThrow(RangeError);
  });
});
