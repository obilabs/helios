/**
 * Signing secrets fail closed (config/secrets.ts).
 *
 * The backend must refuse to start when JWT_SECRET / BETTER_AUTH_SECRET is
 * missing, shorter than 32 characters, or a known placeholder — in every
 * NODE_ENV except `test`. And no source file may carry a literal fallback for
 * those variables: a fallback string is the same key on every installation.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  assertSecretsConfigured,
  describeSecretProblem,
  getAuthSecret,
  getJwtSecret,
  SecretConfigError,
} from '../config/secrets.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

const GOOD = 'a3f1c9e87b6d5402f1e9c8b7a6d5e4f3a2b1c0d9';

describe('config/secrets', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  describe.each(['production', 'development', undefined])('NODE_ENV=%s', (nodeEnv) => {
    beforeEach(() => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
    });

    it('refuses a missing JWT_SECRET', () => {
      expect(() => assertSecretsConfigured()).toThrow(SecretConfigError);
      expect(() => getJwtSecret()).toThrow(/JWT_SECRET is not set/);
      expect(() => getAuthSecret()).toThrow(SecretConfigError);
    });

    it('refuses a JWT_SECRET shorter than 32 characters', () => {
      process.env.JWT_SECRET = 'short-but-not-empty';
      expect(() => assertSecretsConfigured()).toThrow(/too short/);
      expect(() => getJwtSecret()).toThrow(/too short/);
    });

    it.each([
      'your_super_secure_jwt_secret_key_here',
      'dev-secret-change-in-production-padded-to-length',
      'your-super-secret-jwt-key-change-this',
      'dev-jwt-secret-change-in-production',
    ])('refuses the placeholder %s', (placeholder) => {
      process.env.JWT_SECRET = placeholder;
      expect(() => assertSecretsConfigured()).toThrow(SecretConfigError);
    });

    it('refuses a weak BETTER_AUTH_SECRET even when JWT_SECRET is good', () => {
      process.env.JWT_SECRET = GOOD;
      process.env.BETTER_AUTH_SECRET = 'changeme';
      expect(() => assertSecretsConfigured()).toThrow(/BETTER_AUTH_SECRET/);
      expect(() => getAuthSecret()).toThrow(/BETTER_AUTH_SECRET/);
    });

    it('accepts a real secret and uses JWT_SECRET for better-auth when no own secret is set', () => {
      process.env.JWT_SECRET = GOOD;
      expect(() => assertSecretsConfigured()).not.toThrow();
      expect(getJwtSecret()).toBe(GOOD);
      expect(getAuthSecret()).toBe(GOOD);
    });
  });

  it('the committed dev and e2e values are accepted (so those stacks still boot)', () => {
    expect(describeSecretProblem('helios-local-dev-only-jwt-signing-key-0123456789abcdef')).toBeNull();
    expect(describeSecretProblem('e2e_jwt_secret_not_for_production_0123456789abcdef')).toBeNull();
  });

  it('NODE_ENV=test resolves a missing secret without throwing', () => {
    process.env.NODE_ENV = 'test';
    expect(() => assertSecretsConfigured()).not.toThrow();
    expect(getJwtSecret().length).toBeGreaterThanOrEqual(32);
  });

  it('no backend source file supplies a literal fallback for a signing secret', () => {
    const offenders: string[] = [];
    const fallback =
      /process\.env(?:\.|\[\s*['"])(JWT_SECRET|BETTER_AUTH_SECRET)(?:['"]\s*\])?\s*(\|\||\?\?)\s*(['"`]|process\.env\[['"]JWT_SECRET['"]\]\s*(\|\||\?\?)\s*['"`])/;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (name === 'node_modules' || name === '__tests__') continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.ts') && fallback.test(readFileSync(full, 'utf8'))) {
          offenders.push(full.slice(SRC.length + 1));
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
