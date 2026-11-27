/**
 * Telemetry policy: anonymous liveness ping on by default, usage telemetry
 * opt-in, and HELIOS_TELEMETRY_ENABLED=false turning everything off.
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildLivenessPayload,
  buildUsagePayload,
  decideTelemetrySend,
  isTelemetryKillSwitchOn,
  resolveTelemetryState,
  telemetryEnvOverride,
} from '../lib/telemetry-policy.js';

const METRICS = {
  user_count_range: '1-10',
  modules_enabled: ['google_workspace'],
  uptime_hours: 3,
  outcome: 'success' as const,
  api_usage: { 'admin.directory': 2 },
  command_usage: { sync_google_workspace: 1 },
  ui_actions: {},
};

const FORBIDDEN_KEYS = ['ip', 'ip_address', 'domain', 'organization', 'organization_name', 'org', 'email', 'name'];

describe('telemetry defaults', () => {
  it('liveness is on and usage is off when nothing is configured', () => {
    expect(resolveTelemetryState({}, {})).toEqual({ liveness: true, usage: false, envOverride: null });
  });

  it('a fresh install sends the liveness ping once setup is complete', () => {
    const state = resolveTelemetryState({}, {});
    expect(decideTelemetrySend(state, { setupComplete: true, hasLicenseKey: false })).toBe('liveness');
  });

  it('nothing is sent before setup, so the wizard can disclose the ping first', () => {
    const state = resolveTelemetryState({}, {});
    expect(decideTelemetrySend(state, { setupComplete: false, hasLicenseKey: false })).toBe('none');
  });

  it('the admin can turn the liveness ping off', () => {
    const state = resolveTelemetryState({ liveness: false }, {});
    expect(decideTelemetrySend(state, { setupComplete: true, hasLicenseKey: false })).toBe('none');
  });

  it('usage telemetry, once opted in, replaces the liveness ping', () => {
    const state = resolveTelemetryState({ usage: true }, {});
    expect(decideTelemetrySend(state, { setupComplete: true, hasLicenseKey: false })).toBe('usage');
  });

  it('a licensed install is already counted by the licence check, so no extra liveness ping', () => {
    const state = resolveTelemetryState({}, {});
    expect(decideTelemetrySend(state, { setupComplete: true, hasLicenseKey: true })).toBe('none');
  });
});

describe('HELIOS_TELEMETRY_ENABLED', () => {
  it.each(['false', 'FALSE', '0', 'off', 'no'])('%s is the kill-switch and beats every in-app setting', (value) => {
    const env = { HELIOS_TELEMETRY_ENABLED: value };
    expect(isTelemetryKillSwitchOn(env)).toBe(true);
    const state = resolveTelemetryState({ liveness: true, usage: true }, env);
    expect(state).toEqual({ liveness: false, usage: false, envOverride: 'disabled' });
    expect(decideTelemetrySend(state, { setupComplete: true, hasLicenseKey: false })).toBe('none');
  });

  it('true keeps its previous meaning: usage telemetry on', () => {
    const env = { HELIOS_TELEMETRY_ENABLED: 'true' };
    expect(isTelemetryKillSwitchOn(env)).toBe(false);
    expect(resolveTelemetryState({ usage: false }, env)).toEqual({ liveness: true, usage: true, envOverride: 'usage_enabled' });
  });

  it('unset or empty leaves the in-app settings in charge', () => {
    expect(telemetryEnvOverride({})).toBeNull();
    expect(telemetryEnvOverride({ HELIOS_TELEMETRY_ENABLED: '' })).toBeNull();
    expect(isTelemetryKillSwitchOn({ HELIOS_TELEMETRY_ENABLED: '' })).toBe(false);
  });
});

describe('payload shape', () => {
  it('liveness ping carries exactly instance_id and version', () => {
    const payload = buildLivenessPayload('helios_abc123def456', '1.2.3');
    expect(payload).toEqual({ instance_id: 'helios_abc123def456', version: '1.2.3' });
    expect(Object.keys(payload).sort()).toEqual(['instance_id', 'version']);
  });

  it('usage heartbeat carries only the documented fields', () => {
    // Anything extra on the input must not reach the wire.
    const polluted = { ...METRICS, domain: 'example.com', ip_address: '203.0.113.9' };
    const payload = buildUsagePayload('helios_abc123def456', '1.2.3', polluted);
    expect(Object.keys(payload).sort()).toEqual([
      'api_usage', 'command_usage', 'instance_id', 'modules_enabled',
      'outcome', 'ui_actions', 'uptime_hours', 'user_count_range', 'version',
    ]);
  });

  it('usage heartbeat adds license_key only when one is set', () => {
    expect(buildUsagePayload('helios_x1234567', '1', METRICS)).not.toHaveProperty('license_key');
    expect(buildUsagePayload('helios_x1234567', '1', METRICS, 'KEY')).toHaveProperty('license_key', 'KEY');
  });

  it('no payload contains an IP address, organization or domain field', () => {
    const payloads = [
      buildLivenessPayload('helios_x1234567', '1'),
      buildUsagePayload('helios_x1234567', '1', METRICS, 'KEY'),
    ];
    for (const payload of payloads) {
      for (const key of FORBIDDEN_KEYS) expect(payload).not.toHaveProperty(key);
    }
  });
});
