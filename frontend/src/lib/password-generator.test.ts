import { describe, it, expect } from 'vitest';
import {
  generateStrongPassword,
  generatePin,
  passwordEntropyBits,
  PASSWORD_ALPHABET,
  MIN_PASSWORD_LENGTH,
} from './password-generator';

describe('generateStrongPassword', () => {
  it('is at least 16 characters from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateStrongPassword();
      expect(p.length).toBeGreaterThanOrEqual(16);
      for (const ch of p) expect(PASSWORD_ALPHABET).toContain(ch);
    }
  });

  it('never goes below the minimum length', () => {
    expect(generateStrongPassword(8).length).toBe(MIN_PASSWORD_LENGTH);
    expect(generateStrongPassword(24).length).toBe(24);
  });

  it('contains upper, lower, digit and symbol', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateStrongPassword();
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('has at least 90 bits of entropy by construction', () => {
    expect(PASSWORD_ALPHABET.length).toBeGreaterThanOrEqual(60);
    expect(new Set(PASSWORD_ALPHABET).size).toBe(PASSWORD_ALPHABET.length);
    expect(passwordEntropyBits(16)).toBeGreaterThanOrEqual(90);
  });

  it('does not repeat across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateStrongPassword());
    expect(seen.size).toBe(1000);
  });
});

describe('generatePin', () => {
  it('is digits of the requested length', () => {
    expect(generatePin(6)).toMatch(/^\d{6}$/);
  });
});
