/**
 * Helios licensing — the fail-open contract this product depends on.
 *
 * Helios is community-licensed: the licence heartbeat must NEVER block or degrade
 * the product. These tests pin that guarantee against the real @obilabs/licensing
 * policy, plus the persistence guard and the base-URL env migration.
 *
 * (End-to-end issue+validate against the control plane is proven separately by
 * aegis/harness/verify-helios-licensing.sh — that needs a live control plane and
 * is not a unit test.)
 */

import { applyFailOpenPolicy, isPersistableStatus, type LicenseResult } from '@obilabs/licensing';
import { deriveBaseUrl } from '../services/license-config.js';

function makeResult(overrides: Partial<LicenseResult>): LicenseResult {
  const now = '2026-08-07T00:00:00.000Z';
  return {
    state: 'valid',
    reason: 'ok',
    message: '',
    product: 'helios',
    plan: 'donor',
    features: null,
    expiresAt: null,
    // Trial lifecycle fields are part of the published LicenseResult contract;
    // a non-trial community/donor licence sets them to their inactive defaults.
    trial: false,
    trialEndsAt: null,
    daysRemaining: null,
    trialEndingSoon: false,
    checkedAt: now,
    authoritativeAt: now,
    ...overrides,
  };
}

describe('Helios licensing — fail-open contract', () => {
  it('valid → allow, no warning', () => {
    const d = applyFailOpenPolicy(makeResult({ state: 'valid', reason: 'ok' }));
    expect(d.allow).toBe(true);
    expect(d.warn).toBe(false);
  });

  it('unknown (outage/timeout) → allow, NO warning (not a licence problem)', () => {
    const d = applyFailOpenPolicy(makeResult({ state: 'unknown', reason: 'unreachable' }));
    expect(d.allow).toBe(true);
    expect(d.warn).toBe(false);
  });

  it('invalid (authoritative revoke) → allow + warn, but still runs', () => {
    const d = applyFailOpenPolicy(makeResult({ state: 'invalid', reason: 'revoked' }));
    expect(d.allow).toBe(true); // fail-open: Helios keeps running
    expect(d.warn).toBe(true);
  });

  it('fail-open GUARANTEE: allow is true for every possible state', () => {
    for (const state of ['valid', 'invalid', 'unknown'] as const) {
      expect(applyFailOpenPolicy(makeResult({ state })).allow).toBe(true);
    }
  });
});

describe('Helios licensing — persistence guard', () => {
  it('only authoritative answers may be persisted (unknown must not be)', () => {
    expect(isPersistableStatus(makeResult({ state: 'valid' }))).toBe(true);
    expect(isPersistableStatus(makeResult({ state: 'invalid' }))).toBe(true);
    expect(isPersistableStatus(makeResult({ state: 'unknown' }))).toBe(false);
  });
});

describe('Helios licensing — base URL migration', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.HELIOS_LICENSE_BASE_URL;
    delete process.env.HELIOS_LICENSE_URL;
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('prefers HELIOS_LICENSE_BASE_URL (trailing slash stripped)', () => {
    process.env.HELIOS_LICENSE_BASE_URL = 'https://cp.example.com/';
    expect(deriveBaseUrl()).toBe('https://cp.example.com');
  });

  it('derives the base from a legacy full HELIOS_LICENSE_URL endpoint', () => {
    process.env.HELIOS_LICENSE_URL = 'https://cp.example.com/api/instances/validate';
    expect(deriveBaseUrl()).toBe('https://cp.example.com');
  });

  it('defaults to the control plane when neither is set', () => {
    expect(deriveBaseUrl()).toBe('https://api.obilabs.dev');
  });
});
