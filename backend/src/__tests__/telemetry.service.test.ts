/**
 * Telemetry service wiring: what actually goes over the wire, and that the
 * kill-switch stops it (licence re-validation included).
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

let stored: Record<string, string> = {};
let organizations = 1;

jest.unstable_mockModule('../database/connection.js', () => ({
  db: {
    query: async (sql: string): Promise<{ rows: unknown[] }> => {
      if (sql.includes('FROM system_settings')) {
        return { rows: Object.entries(stored).map(([key, value]) => ({ key, value })) };
      }
      if (sql.includes('FROM organizations')) return { rows: organizations ? [{ exists: 1 }] : [] };
      if (sql.includes('FROM organization_users')) return { rows: [{ count: '7' }] };
      if (sql.includes('FROM modules')) return { rows: [{ slug: 'google_workspace' }] };
      return { rows: [] };
    },
    getClient: async (): Promise<unknown> => ({
      query: async (): Promise<{ rows: unknown[] }> => ({ rows: [] }),
      release: (): void => {},
    }),
  },
}));
jest.unstable_mockModule('../services/instance-identity.js', () => ({
  getOrCreateInstanceId: async () => 'helios_test0instance0id',
}));
jest.unstable_mockModule('../utils/version.js', () => ({
  getHeliosVersion: () => '9.9.9',
}));
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log: async () => 'audit-id' },
}));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

const actualLicensing = await import('@obilabs/licensing');
const mockValidate = jest.fn<(...args: any[]) => Promise<any>>(async () => ({ state: 'unknown' }));
jest.unstable_mockModule('@obilabs/licensing', () => ({
  ...actualLicensing,
  validateLicense: mockValidate,
}));

const { telemetryService } = await import('../services/telemetry.service.js');
const { licenseService } = await import('../services/license.service.js');

const fetchMock = jest.fn<(...args: any[]) => Promise<Response>>(
  async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
);
const sentBodies = (): any[] =>
  fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));

const ENV_KEYS = ['HELIOS_TELEMETRY_ENABLED', 'HELIOS_LICENSE_KEY'];
const savedEnv: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  stored = {};
  organizations = 1;
  fetchMock.mockClear();
  mockValidate.mockClear();
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  telemetryService.shutdown();
  licenseService.shutdown();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('telemetry service', () => {
  it('sends the liveness ping by default, with exactly instance_id and version', async () => {
    await telemetryService.init();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBodies()[0]).toEqual({ instance_id: 'helios_test0instance0id', version: '9.9.9' });
  });

  it('sends nothing before first-run setup is complete', async () => {
    organizations = 0;
    await telemetryService.init();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the admin turned the liveness ping off', async () => {
    stored = { telemetry_liveness_enabled: 'false' };
    await telemetryService.init();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the usage heartbeat instead once usage telemetry is opted in', async () => {
    stored = { telemetry_usage_enabled: 'true' };
    await telemetryService.init();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = sentBodies()[0];
    expect(body).toMatchObject({
      instance_id: 'helios_test0instance0id',
      version: '9.9.9',
      user_count_range: '1-10',
      modules_enabled: ['google_workspace'],
    });
    expect(body).not.toHaveProperty('domain');
    expect(body).not.toHaveProperty('ip_address');
  });

  it('kill-switch: HELIOS_TELEMETRY_ENABLED=false sends nothing, even with both settings on', async () => {
    process.env.HELIOS_TELEMETRY_ENABLED = 'false';
    stored = { telemetry_liveness_enabled: 'true', telemetry_usage_enabled: 'true' };
    await telemetryService.init();
    expect(await telemetryService.tick()).toBe('none');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(telemetryService.isEnabled()).toBe(false);
  });

  it('kill-switch also stops licence re-validation', async () => {
    process.env.HELIOS_TELEMETRY_ENABLED = 'false';
    process.env.HELIOS_LICENSE_KEY = 'HELIOS-TEST-KEY';
    await licenseService.init();
    expect(await licenseService.validate()).toBeNull();
    expect(mockValidate).not.toHaveBeenCalled();
  });
});
