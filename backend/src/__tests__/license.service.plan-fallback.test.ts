/**
 * Helios licensing — the plan key is never interpreted.
 *
 * Helios is free and never gates on a licence, so whatever plan key the control
 * plane reports (a current one, a retired one, or one this build has never
 * heard of) must yield exactly the community feature floor, and a missing
 * plan reads as 'community'.
 */

import { jest, describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import type { LicenseResult } from '@obilabs/licensing';

const actualLicensing = await import('@obilabs/licensing');
const mockValidate = jest.fn<(...args: any[]) => Promise<LicenseResult>>();

jest.unstable_mockModule('@obilabs/licensing', () => ({
  ...actualLicensing,
  validateLicense: mockValidate,
}));
jest.unstable_mockModule('../database/connection.js', () => ({
  db: {
    getClient: async (): Promise<unknown> => ({
      query: async (): Promise<{ rows: unknown[] }> => ({ rows: [] }),
      release: (): void => {},
    }),
  },
}));
jest.unstable_mockModule('../services/instance-identity.js', () => ({
  getOrCreateInstanceId: async () => 'helios_test-instance',
}));
jest.unstable_mockModule('../utils/version.js', () => ({
  getHeliosVersion: () => '0.0.0-test',
}));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

const { licenseService } = await import('../services/license.service.js');

const COMMUNITY_FLOOR = {
  support_chat: false,
  priority_updates: false,
  custom_domain: false,
  api_access: true,
};

function result(plan: string | null): LicenseResult {
  const now = '2026-09-13T00:00:00.000Z';
  return {
    state: 'valid',
    reason: 'ok',
    message: '',
    product: 'helios',
    plan,
    features: null,
    expiresAt: null,
    trial: false,
    trialEndsAt: null,
    daysRemaining: null,
    trialEndingSoon: false,
    checkedAt: now,
    authoritativeAt: now,
  } as LicenseResult;
}

describe('Helios licensing — unknown plan keys behave like community', () => {
  const ORIGINAL_KEY = process.env.HELIOS_LICENSE_KEY;

  beforeEach(() => {
    process.env.HELIOS_LICENSE_KEY = 'lic_hlc_test_1_sig';
  });
  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.HELIOS_LICENSE_KEY;
    else process.env.HELIOS_LICENSE_KEY = ORIGINAL_KEY;
    licenseService.shutdown();
  });

  it.each(['community', 'retired_plan', 'some_future_plan'])(
    'plan %s → community feature floor, nothing gated',
    async (plan) => {
      mockValidate.mockResolvedValueOnce(result(plan));
      await licenseService.validate();
      expect(licenseService.getFeatures()).toEqual(COMMUNITY_FLOOR);
      expect(licenseService.hasFeature('api_access')).toBe(true);
      expect(licenseService.hasFeature('support_chat')).toBe(false);
    },
  );

  it('no plan reported → getPlan() falls back to community', async () => {
    mockValidate.mockResolvedValueOnce(result(null));
    await licenseService.validate();
    expect(licenseService.getPlan()).toBe('community');
    expect(licenseService.getFeatures()).toEqual(COMMUNITY_FLOOR);
  });
});
