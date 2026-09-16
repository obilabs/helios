/**
 * Group scenarios through the REAL Google gateway, replayed with no network.
 *
 * The googleapis SDK transport is hooked by testing/google-replay.ts, so the
 * gateway's actual calls (Directory groups.insert, Groups Settings patch and get)
 * are served from fixtures. This proves the request shape (host, path, method)
 * and that the service reads Google's response format correctly.
 *
 * Fixture provenance: `admin.directory/groups.post` was recorded live
 * (2026-09-08). The `groupssettings/*.synthetic` fixtures are NOT recordings:
 * they are shaped from the Groups Settings API reference and say so in their
 * `note`. The live verification session (scripts/verify-group-scenario.ts with
 * HELIOS_GOOGLE_RECORD=1) replaces them with real responses.
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';

jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: jest.fn() } }));

const { loadGoogleFixture, useGoogleReplay, resetGoogleReplay, installGoogleSdkSeam } = await import('../testing/google-replay.js');
const { createGoogleGroupsGateway } = await import('../services/group-scenarios/google-groups.gateway.js');
const { GroupScenarioService } = await import('../services/group-scenarios/group-scenario.service.js');

const SCOPE = 'https://www.googleapis.com/auth/apps.groups.settings';

function serviceWithReplayGateway() {
  // No auth client: the replay seam serves the API calls, so no token exchange happens.
  const gateway = createGoogleGroupsGateway(() => undefined);
  gateway.probeSettingsScope = async () => ({ state: 'authorised', scope: SCOPE });
  const db = { query: async () => ({ rows: [] as any[] }) };
  return new GroupScenarioService({ db, gatewayFor: async () => gateway, settingsRetryDelaysMs: [], sleep: async () => undefined });
}

const input = { email: 'user1@example.com', name: 'E2E Team (seed for offboarding)' };

afterEach(() => resetGoogleReplay());

describe('group scenario replay (no network)', () => {
  it('fixtures are labelled honestly and carry no real identifiers', () => {
    for (const name of ['groups.patch.synthetic', 'groups.get.synthetic', 'groups.get.synthetic-without-default-sender', 'groups.patch.synthetic-api-disabled']) {
      const fx = loadGoogleFixture('groupssettings', name) as any;
      expect(fx.note).toMatch(/^SYNTHETIC, not recorded/);
      expect(fx.request.host).toBe('www.googleapis.com');
      const emails = JSON.stringify(fx).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
      for (const e of emails) expect(e.endsWith('@example.com')).toBe(true);
    }
  });

  it('public contact inbox: create, patch settings, read back -> verified', async () => {
    useGoogleReplay([
      { family: 'admin.directory', name: 'groups.post' },
      { family: 'groupssettings', name: 'groups.patch.synthetic' },
      { family: 'groupssettings', name: 'groups.get.synthetic' },
    ]);
    installGoogleSdkSeam();
    const result = await serviceWithReplayGateway().createFromScenario('org-1', 'public-contact-inbox', input);
    expect(result.steps.map((s) => `${s.step}:${s.status}`)).toEqual([
      'create_group:ok', 'apply_settings:ok', 'add_aliases:skipped', 'add_members:skipped', 'read_back:ok',
    ]);
    expect(result.group).toEqual({ id: '03ygebqi2qpwo7u', email: 'user1@example.com' });
    expect(result.mismatches).toEqual([]);
    expect(result.outcome).toBe('verified');
  });

  it('a setting missing from Google\'s read-back is a mismatch', async () => {
    useGoogleReplay([
      { family: 'admin.directory', name: 'groups.post' },
      { family: 'groupssettings', name: 'groups.patch.synthetic' },
      { family: 'groupssettings', name: 'groups.get.synthetic-without-default-sender' },
    ]);
    installGoogleSdkSeam();
    const result = await serviceWithReplayGateway().createFromScenario('org-1', 'public-contact-inbox', input);
    expect(result.outcome).toBe('mismatch');
    expect(result.mismatches).toEqual([{ area: 'settings', field: 'defaultSender', expected: 'DEFAULT_SELF', actual: null }]);
  });

  it('Groups Settings API disabled in the Cloud project: partial, with the reason named', async () => {
    useGoogleReplay([
      { family: 'admin.directory', name: 'groups.post' },
      { family: 'groupssettings', name: 'groups.patch.synthetic-api-disabled' },
      { family: 'groupssettings', name: 'groups.get.synthetic-without-default-sender' },
    ]);
    installGoogleSdkSeam();
    const result = await serviceWithReplayGateway().createFromScenario('org-1', 'public-contact-inbox', input);
    expect(result.outcome).toBe('partial');
    expect(result.steps.find((s) => s.step === 'apply_settings')?.detail).toMatch(/not enabled in the service account's Google Cloud project/);
  });
});
