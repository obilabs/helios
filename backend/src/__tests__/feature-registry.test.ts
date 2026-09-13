/**
 * Release-profile feature flags. These are the guarantees a versioned release
 * depends on (docs/RELEASING.md):
 *
 *   - In the `release` profile NO experimental flag can resolve on — not by
 *     default, not through a stored override, not through the API.
 *   - Anything but an explicit `development` profile is `release`.
 *   - Core flags cannot be turned off; the registry has one entry per key.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

type QueryResult = { rows: any[] };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: { query: mockQuery },
}));
jest.unstable_mockModule('../services/cache.service.js', () => ({
  cacheService: {
    get: async (): Promise<null> => null,
    set: async (): Promise<void> => undefined,
    del: async (): Promise<void> => undefined,
  },
}));

const {
  FEATURE_REGISTRY,
  resolveFeature,
  resolveFeatureProfile,
} = await import('../config/feature-registry.js');
const { featureFlagsService, FeatureFlagError } = await import('../services/feature-flags.service.js');

const experimental = FEATURE_REGISTRY.filter((f) => f.maturity === 'experimental');
const preview = FEATURE_REGISTRY.filter((f) => f.maturity === 'preview');

/** Stored overrides that try to switch EVERY flag on. */
function primeOverridesAllOn(): void {
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('is_override = true')) {
      return { rows: FEATURE_REGISTRY.map((f) => ({ feature_key: f.key, is_enabled: true })) };
    }
    return { rows: [] };
  });
}

describe('feature registry shape', () => {
  it('has unique, well-formed keys', () => {
    const keys = FEATURE_REGISTRY.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_.]*$/);
  });

  it('marks exactly the core.* flags as required, and they are stable', () => {
    for (const f of FEATURE_REGISTRY) {
      expect([f.key, f.required === true]).toEqual([f.key, f.key.startsWith('core.')]);
      if (f.required) expect(f.maturity).toBe('stable');
    }
  });

  it('gives operational flags an explicit default and never marks them experimental', () => {
    for (const f of FEATURE_REGISTRY.filter((x) => x.operational)) {
      expect(typeof f.defaultEnabled).toBe('boolean');
      expect(f.maturity).not.toBe('experimental');
    }
  });
});

describe('resolveFeatureProfile', () => {
  it('only an explicit development value selects development', () => {
    expect(resolveFeatureProfile('development')).toBe('development');
    expect(resolveFeatureProfile(' Development ')).toBe('development');
    expect(resolveFeatureProfile('release')).toBe('release');
    expect(resolveFeatureProfile(undefined)).toBe('release');
    expect(resolveFeatureProfile('')).toBe('release');
    expect(resolveFeatureProfile('dev')).toBe('release');
  });
});

describe('release profile', () => {
  it('never resolves an experimental flag on, even with an override', () => {
    expect(experimental.length).toBeGreaterThan(0);
    for (const f of experimental) {
      expect(resolveFeature(f, 'release').enabled).toBe(false);
      expect(resolveFeature(f, 'release', true).enabled).toBe(false);
      expect(resolveFeature(f, 'release').available).toBe(false);
    }
  });

  it('turns stable on and preview off by default, and lets an admin enable preview', () => {
    for (const f of FEATURE_REGISTRY.filter((x) => x.maturity === 'stable' && !x.operational)) {
      expect(resolveFeature(f, 'release').enabled).toBe(true);
    }
    for (const f of preview) {
      expect(resolveFeature(f, 'release').enabled).toBe(false);
      expect(resolveFeature(f, 'release', true).enabled).toBe(true);
    }
  });

  it('keeps core flags on regardless of overrides', () => {
    for (const f of FEATURE_REGISTRY.filter((x) => x.required)) {
      expect(resolveFeature(f, 'release', false).enabled).toBe(true);
      expect(resolveFeature(f, 'development', false).enabled).toBe(true);
    }
  });
});

describe('development profile', () => {
  it('turns every non-operational flag on by default', () => {
    for (const f of FEATURE_REGISTRY.filter((x) => !x.operational)) {
      expect(resolveFeature(f, 'development').enabled).toBe(true);
    }
  });
});

describe('featureFlagsService under HELIOS_FEATURE_PROFILE=release', () => {
  const saved = process.env.HELIOS_FEATURE_PROFILE;
  beforeEach(() => {
    process.env.HELIOS_FEATURE_PROFILE = 'release';
    mockQuery.mockReset();
    primeOverridesAllOn();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.HELIOS_FEATURE_PROFILE;
    else process.env.HELIOS_FEATURE_PROFILE = saved;
  });

  it('serves no experimental flag as enabled, whatever the database says', async () => {
    const map = await featureFlagsService.getAllFlagsMap();
    for (const f of experimental) expect([f.key, map[f.key]]).toEqual([f.key, false]);
    for (const f of preview) expect([f.key, map[f.key]]).toEqual([f.key, true]);
  });

  it('refuses to store an override for an experimental flag', async () => {
    await expect(featureFlagsService.setFlag(experimental[0].key, true)).rejects.toBeInstanceOf(FeatureFlagError);
    expect(mockQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO feature_flags'))).toBe(false);
  });

  it('refuses to switch off a core flag and rejects unknown keys', async () => {
    await expect(featureFlagsService.setFlag('core.settings', false)).rejects.toBeInstanceOf(FeatureFlagError);
    await expect(featureFlagsService.setFlag('nav.not_a_flag', true)).rejects.toBeInstanceOf(FeatureFlagError);
  });

  it('stores a preview override as an is_override row', async () => {
    await featureFlagsService.setFlag(preview[0].key, true);
    const insert = mockQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO feature_flags'));
    expect(insert?.[0]).toContain('is_override = true');
    expect(insert?.[1]?.[0]).toBe(preview[0].key);
  });
});
