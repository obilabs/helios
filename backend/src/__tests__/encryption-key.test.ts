/**
 * Tests for resolveEncryptionKey — the boot-time guard that replaced the
 * per-process `crypto.randomBytes` fallback for at-rest encryption keys.
 *
 * The resolver reads process.env at CALL time (not import time), so each case
 * sets the environment it needs and restores it afterwards.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { resolveEncryptionKey } from '../config/encryption-key.js';
import { logger } from '../utils/logger.js';

const STRONG_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex
const TEST_VAR = 'HELIOS_TEST_KEY_SLOT';
const FALLBACK_VAR = 'HELIOS_TEST_FALLBACK_SLOT';

describe('resolveEncryptionKey', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let warnSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    delete process.env[TEST_VAR];
    delete process.env[FALLBACK_VAR];
    // Silence the intentional dev-mode warning so test output stays clean.
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger as any);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env[TEST_VAR];
    delete process.env[FALLBACK_VAR];
    warnSpy.mockRestore();
  });

  it('returns a strong key verbatim (trimmed), regardless of environment', () => {
    process.env.NODE_ENV = 'production';
    process.env[TEST_VAR] = `  ${STRONG_KEY}  `;
    expect(resolveEncryptionKey(TEST_VAR)).toBe(STRONG_KEY);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('throws in production when the key is missing', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveEncryptionKey(TEST_VAR)).toThrow(/is not set/);
  });

  it('throws in production when the key is a known placeholder', () => {
    process.env.NODE_ENV = 'production';
    process.env[TEST_VAR] = 'your-32-character-encryption-key-here-change-this';
    expect(() => resolveEncryptionKey(TEST_VAR)).toThrow(/too weak/);
  });

  it('throws in production when the key is too short', () => {
    process.env.NODE_ENV = 'production';
    process.env[TEST_VAR] = 'short';
    expect(() => resolveEncryptionKey(TEST_VAR)).toThrow(/too weak/);
  });

  it('returns a STABLE dev key (no throw) when missing outside production', () => {
    process.env.NODE_ENV = 'development';
    const first = resolveEncryptionKey(TEST_VAR);
    const second = resolveEncryptionKey(TEST_VAR);
    expect(first).toBe(second); // deterministic — survives restarts, unlike randomBytes
    expect(first).toMatch(/^[0-9a-f]{64}$/); // valid 32-byte AES key
    expect(warnSpy).toHaveBeenCalled();
  });

  it('namespaces the dev key per env-var so slots do not collide', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveEncryptionKey('KEY_A')).not.toBe(resolveEncryptionKey('KEY_B'));
  });

  it('falls back to another env var before applying the dev/prod logic', () => {
    process.env.NODE_ENV = 'production';
    process.env[FALLBACK_VAR] = STRONG_KEY;
    // Primary unset, fallback strong -> returns fallback and does not throw.
    expect(resolveEncryptionKey(TEST_VAR, { fallbackEnv: FALLBACK_VAR })).toBe(STRONG_KEY);
  });
});
