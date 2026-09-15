/**
 * GroupScenarioService (D-048): the create / apply / read-back / diff flow and
 * the built-in vs custom rules, against a fake Google gateway and a fake
 * database. What this pins down:
 *
 *   - "verified" only when every step is ok AND Google's read-back matches;
 *   - a value Google silently ignored is reported as a mismatch, never success;
 *   - a failed settings step still reads back and reports (partial);
 *   - without the Groups Settings scope nothing is created (the admin gets a
 *     clear reason and can still create a plain group elsewhere);
 *   - built-ins can be disabled but not deleted or edited; custom scenarios are
 *     validated with the same rules as built-ins.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  GroupScenarioService,
  ScenarioError,
  diffAliases,
  diffSettings,
  type Queryable,
} from '../services/group-scenarios/group-scenario.service.js';
import type { GroupsGateway, ScopeProbe } from '../services/group-scenarios/google-groups.gateway.js';
import { getBuiltinScenario } from '../config/group-scenarios.js';

const ORG = 'org-1';
const SCOPE = 'https://www.googleapis.com/auth/apps.groups.settings';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeDb implements Queryable {
  builtinState = new Map<string, boolean>();
  custom = new Map<string, any>();
  async query(text: string, params: unknown[] = []): Promise<{ rows: any[]; rowCount?: number }> {
    const sql = text.replace(/\s+/g, ' ');
    if (sql.includes('FROM group_scenario_builtin_state') && sql.includes('builtin_key = $2')) {
      const v = this.builtinState.get(params[1] as string);
      return { rows: v === undefined ? [] : [{ is_disabled: v }] };
    }
    if (sql.includes('FROM group_scenario_builtin_state')) {
      return { rows: [...this.builtinState].map(([builtin_key, is_disabled]) => ({ builtin_key, is_disabled })) };
    }
    if (sql.startsWith('INSERT INTO group_scenario_builtin_state')) {
      this.builtinState.set(params[1] as string, params[2] as boolean);
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM group_scenarios') && sql.includes('scenario_key = $2')) {
      const row = this.custom.get(params[1] as string);
      return { rows: row ? [row] : [] };
    }
    if (sql.startsWith('SELECT * FROM group_scenarios')) return { rows: [...this.custom.values()] };
    if (sql.startsWith('INSERT INTO group_scenarios')) {
      const key = params[1] as string;
      if (this.custom.has(key)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      const j = (i: number) => JSON.parse(params[i] as string);
      this.custom.set(key, {
        scenario_key: key, name: params[2], summary: params[3], base_builtin_key: params[4], user_story: params[5],
        what_happens: j(6), outside_senders_see: params[7], members_see: params[8], settings: j(9), member_delivery: j(10),
        suggested_aliases: j(11), manual_steps: j(12), email_checklist: j(13), accepts_external_mail: params[14], is_disabled: params[15],
      });
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE group_scenarios')) {
      const row = this.custom.get(params[1] as string);
      Object.assign(row, { name: params[2], settings: JSON.parse(params[8] as string), is_disabled: params[14] });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('DELETE FROM group_scenarios')) {
      const had = this.custom.delete(params[1] as string);
      return { rows: [], rowCount: had ? 1 : 0 };
    }
    throw new Error(`FakeDb: unexpected query ${sql}`);
  }
}

function googleError(status: number, message: string) {
  return Object.assign(new Error(message), { response: { status, data: { error: { code: status, message } } } });
}

class FakeGateway implements GroupsGateway {
  probe: ScopeProbe = { state: 'authorised', scope: SCOPE };
  created: Array<{ email: string; name: string }> = [];
  settings: Record<string, unknown> = {};
  /** Fields Google "accepts" but does not store (simulates silent ignore). */
  ignoreFields = new Set<string>();
  patchFailures: Error[] = [];
  getFailures: Error[] = [];
  aliases: string[] = [];
  members = new Map<string, { role: string; delivery: string | null }>();
  memberDeliveryIgnored = false;
  calls: string[] = [];

  async probeSettingsScope() { this.calls.push('probe'); return this.probe; }
  async createGroup(input: { email: string; name: string; description: string }) {
    this.calls.push('create');
    this.created.push(input);
    return { id: 'gid-1', email: input.email };
  }
  async patchSettings(_email: string, values: Record<string, string>) {
    this.calls.push('patch');
    const f = this.patchFailures.shift();
    if (f) throw f;
    for (const [k, v] of Object.entries(values)) if (!this.ignoreFields.has(k)) this.settings[k] = v;
  }
  async getSettings() {
    this.calls.push('get');
    const f = this.getFailures.shift();
    if (f) throw f;
    return { ...this.settings };
  }
  async insertAlias(_g: string, alias: string) { this.calls.push('alias'); this.aliases.push(alias); }
  async listAliases() { return [...this.aliases]; }
  async insertMember(_g: string, m: { email: string; role: string; delivery?: string }) {
    this.calls.push('member');
    this.members.set(m.email, { role: m.role, delivery: this.memberDeliveryIgnored ? 'ALL_MAIL' : m.delivery ?? 'ALL_MAIL' });
  }
  async getMember(_g: string, email: string) {
    const m = this.members.get(email);
    if (!m) throw googleError(404, 'Resource Not Found: memberKey');
    return { email, role: m.role, delivery: m.delivery };
  }
  async deleteGroup() { this.calls.push('delete'); }
}

let db: FakeDb;
let gw: FakeGateway;
let service: GroupScenarioService;

beforeEach(() => {
  db = new FakeDb();
  gw = new FakeGateway();
  service = new GroupScenarioService({
    db,
    gatewayFor: async () => gw,
    settingsRetryDelaysMs: [0, 0],
    sleep: async () => undefined,
  });
});

const input = { email: 'hello@example.com', name: 'Hello', description: 'Contact inbox' };

async function expectScenarioError(p: Promise<unknown>, status: number, code: string) {
  await expect(p).rejects.toBeInstanceOf(ScenarioError);
  await p.catch((e: ScenarioError) => {
    expect({ status: e.status, code: e.code }).toEqual({ status, code });
  });
}

// ---------------------------------------------------------------------------
// Create, apply, read back
// ---------------------------------------------------------------------------

describe('createFromScenario', () => {
  it('verified: creates, applies every setting, reads back a full match', async () => {
    const result = await service.createFromScenario(ORG, 'public-contact-inbox', input);
    expect(result.outcome).toBe('verified');
    expect(result.mismatches).toEqual([]);
    expect(result.steps.map((s) => `${s.step}:${s.status}`)).toEqual([
      'create_group:ok', 'apply_settings:ok', 'add_aliases:skipped', 'add_members:skipped', 'read_back:ok',
    ]);
    expect(gw.settings).toEqual(getBuiltinScenario('public-contact-inbox')!.settings);
    expect(gw.settings.spamModerationLevel).toBe('ALLOW');
    expect(result.emailChecklist.length).toBeGreaterThan(0);
    expect(result.manualSteps.length).toBeGreaterThan(0);
  });

  it('mismatch: a setting Google accepted but did not keep is reported, not hidden', async () => {
    gw.ignoreFields.add('defaultSender');
    const result = await service.createFromScenario(ORG, 'public-contact-inbox', input);
    expect(result.outcome).toBe('mismatch');
    expect(result.mismatches).toEqual([{ area: 'settings', field: 'defaultSender', expected: 'DEFAULT_SELF', actual: null }]);
  });

  it('partial: the settings step fails, the group exists, the read-back still runs and reports every field', async () => {
    gw.patchFailures.push(googleError(403, 'Access Not Configured. Groups Settings API has not been used in project 1 before or it is disabled.'));
    const result = await service.createFromScenario(ORG, 'security-reports-inbox', { ...input, email: 'security@example.com' });
    expect(result.outcome).toBe('partial');
    expect(result.steps.find((s) => s.step === 'apply_settings')).toEqual(
      expect.objectContaining({ status: 'failed', detail: expect.stringMatching(/not enabled in the service account's Google Cloud project/) }),
    );
    expect(result.mismatches.length).toBe(Object.keys(getBuiltinScenario('security-reports-inbox')!.settings).length);
    expect(result.warnings.join(' ')).toMatch(/settings were not applied/);
  });

  it('retries the settings call while a brand-new group is still propagating (404), then succeeds', async () => {
    gw.patchFailures.push(googleError(404, 'Resource Not Found'), googleError(404, 'Resource Not Found'));
    const result = await service.createFromScenario(ORG, 'announcement-list', { ...input, email: 'all-staff@example.com' });
    expect(result.outcome).toBe('verified');
    expect(gw.calls.filter((c) => c === 'patch')).toHaveLength(3);
  });

  it('does not retry a permanent error', async () => {
    gw.patchFailures.push(googleError(400, 'Invalid Value'));
    const result = await service.createFromScenario(ORG, 'announcement-list', { ...input, email: 'all-staff@example.com' });
    expect(result.outcome).toBe('partial');
    expect(gw.calls.filter((c) => c === 'patch')).toHaveLength(1);
  });

  it('read-back failure is partial, never verified', async () => {
    gw.getFailures.push(googleError(403, 'Not Authorized to access this resource/api'));
    const result = await service.createFromScenario(ORG, 'announcement-list', { ...input, email: 'all-staff@example.com' });
    expect(result.outcome).toBe('partial');
    expect(result.steps.at(-1)).toEqual(expect.objectContaining({ step: 'read_back', status: 'failed' }));
  });

  it('applies member delivery by role and reports delivery Google did not keep', async () => {
    const members = [
      { email: 'owner@example.com', role: 'OWNER' as const },
      { email: 'staff@example.com', role: 'MANAGER' as const },
    ];
    const ok = await service.createFromScenario(ORG, 'public-contact-inbox', { ...input, members });
    expect(ok.outcome).toBe('verified');
    expect(gw.members.get('owner@example.com')).toEqual({ role: 'OWNER', delivery: 'DAILY' });

    gw = new FakeGateway();
    gw.memberDeliveryIgnored = true;
    const bad = await service.createFromScenario(ORG, 'public-contact-inbox', { ...input, members });
    expect(bad.outcome).toBe('mismatch');
    expect(bad.mismatches).toEqual([{ area: 'member', field: 'owner@example.com delivery', expected: 'DAILY', actual: 'ALL_MAIL' }]);
  });

  it('adds aliases and verifies they are present', async () => {
    const result = await service.createFromScenario(ORG, 'security-reports-inbox', {
      ...input, email: 'security@example.com', aliases: ['abuse@example.com'],
    });
    expect(result.outcome).toBe('verified');
    expect(gw.aliases).toEqual(['abuse@example.com']);
    // Reserved word as an alias: allowed (the KB recommends it) but flagged for a separate test.
    expect(result.warnings.join(' ')).toMatch(/reserved word/);
  });

  it('without the Groups Settings scope, refuses before creating anything', async () => {
    gw.probe = { state: 'not_authorised', scope: SCOPE, message: 'not authorised' };
    await expectScenarioError(service.createFromScenario(ORG, 'public-contact-inbox', input), 409, 'SETTINGS_SCOPE_NOT_AUTHORISED');
    expect(gw.created).toEqual([]);
  });

  it('an unconfirmable scope is an error, not a guess', async () => {
    gw.probe = { state: 'unknown', scope: SCOPE, message: 'network' };
    await expectScenarioError(service.createFromScenario(ORG, 'public-contact-inbox', input), 502, 'SETTINGS_SCOPE_UNKNOWN');
    expect(gw.created).toEqual([]);
  });

  it('a scenario with no settings needs no scope and skips the settings step', async () => {
    gw.probe = { state: 'not_authorised', scope: SCOPE };
    await service.createCustom(ORG, 'admin-1', { key: 'plain-list', name: 'Plain list', settings: {} });
    const result = await service.createFromScenario(ORG, 'plain-list', input);
    expect(result.outcome).toBe('verified');
    expect(result.steps.find((s) => s.step === 'apply_settings')?.status).toBe('skipped');
    expect(gw.calls).not.toContain('probe');
  });

  it('refuses a disabled scenario, an unknown scenario, and Google not connected', async () => {
    await service.update(ORG, 'admin-1', 'announcement-list', { disabled: true });
    await expectScenarioError(service.createFromScenario(ORG, 'announcement-list', input), 409, 'SCENARIO_DISABLED');
    await expectScenarioError(service.createFromScenario(ORG, 'no-such-scenario', input), 404, 'NOT_FOUND');
    const unconfigured = new GroupScenarioService({ db, gatewayFor: async () => null });
    await expectScenarioError(unconfigured.createFromScenario(ORG, 'public-contact-inbox', input), 409, 'GOOGLE_NOT_CONFIGURED');
    expect(gw.created).toEqual([]);
  });

  it('maps a Google 409 on create to ALREADY_EXISTS and creates nothing further', async () => {
    gw.createGroup = async () => { throw googleError(409, 'Entity already exists.'); };
    await expectScenarioError(service.createFromScenario(ORG, 'public-contact-inbox', input), 409, 'ALREADY_EXISTS');
    expect(gw.calls).not.toContain('patch');
  });

  it('validates input before touching Google: reserved address, too many aliases, bad members', async () => {
    await expectScenarioError(service.createFromScenario(ORG, 'security-reports-inbox', { ...input, email: 'abuse@example.com' }), 400, 'VALIDATION_ERROR');
    const aliases = Array.from({ length: 31 }, (_, i) => `a${i}@example.com`);
    await expectScenarioError(service.createFromScenario(ORG, 'public-contact-inbox', { ...input, aliases }), 400, 'VALIDATION_ERROR');
    await expectScenarioError(
      service.createFromScenario(ORG, 'public-contact-inbox', { ...input, members: [{ email: 'x@example.com', role: 'ADMIN' as any }] }),
      400, 'VALIDATION_ERROR',
    );
    expect(gw.calls).toEqual([]);
  });
});

describe('diff helpers', () => {
  it('diffSettings compares as strings and reports missing fields as null', () => {
    expect(diffSettings({ isArchived: 'true', replyTo: 'REPLY_TO_IGNORE' }, { isArchived: 'true' })).toEqual([
      { area: 'settings', field: 'replyTo', expected: 'REPLY_TO_IGNORE', actual: null },
    ]);
  });
  it('diffAliases is case-insensitive', () => {
    expect(diffAliases(['Info@Example.com'], ['info@example.com'])).toEqual([]);
    expect(diffAliases(['info@example.com'], [])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Built-in vs custom
// ---------------------------------------------------------------------------

describe('scenario management', () => {
  it('lists built-ins with their drill-in and disabled state, then custom scenarios', async () => {
    await service.update(ORG, 'admin-1', 'client-inquiries', { disabled: true });
    await service.createCustom(ORG, 'admin-1', { key: 'hr-inbox', baseKey: 'public-contact-inbox', name: 'HR inbox' });
    const list = await service.list(ORG);
    expect(list.find((s) => s.key === 'client-inquiries')).toEqual(expect.objectContaining({ source: 'builtin', disabled: true }));
    const hr = list.find((s) => s.key === 'hr-inbox')!;
    expect(hr).toEqual(expect.objectContaining({ source: 'custom', baseKey: 'public-contact-inbox', needsSettingsScope: true }));
    expect(hr.settings).toEqual(getBuiltinScenario('public-contact-inbox')!.settings);
    expect(hr.settingsDetail.length).toBe(Object.keys(hr.settings).length);
  });

  it('built-ins can be disabled and re-enabled, but not deleted or edited', async () => {
    await service.update(ORG, 'admin-1', 'announcement-list', { disabled: true });
    expect((await service.get(ORG, 'announcement-list')).disabled).toBe(true);
    await service.update(ORG, 'admin-1', 'announcement-list', { disabled: false });
    expect((await service.get(ORG, 'announcement-list')).disabled).toBe(false);
    await expectScenarioError(service.deleteCustom(ORG, 'announcement-list'), 409, 'BUILTIN_NOT_DELETABLE');
    await expectScenarioError(service.update(ORG, 'admin-1', 'announcement-list', { name: 'Renamed' }), 400, 'VALIDATION_ERROR');
  });

  it('custom scenarios: validated like built-ins, keys unique and never a built-in key', async () => {
    await expectScenarioError(service.createCustom(ORG, null, { key: 'public-contact-inbox', name: 'x' }), 400, 'VALIDATION_ERROR');
    await expectScenarioError(service.createCustom(ORG, null, { key: 'Bad Key', name: 'x' }), 400, 'VALIDATION_ERROR');
    await expectScenarioError(
      service.createCustom(ORG, null, { key: 'inbox', name: 'x', settings: { enableCollaborativeInbox: 'true' } }),
      400, 'VALIDATION_ERROR',
    );
    await expectScenarioError(service.createCustom(ORG, null, { key: 'inbox', name: 'x', baseKey: 'nope' }), 400, 'VALIDATION_ERROR');
    await service.createCustom(ORG, null, { key: 'inbox', name: 'Inbox', settings: { whoCanPostMessage: 'ALL_MEMBERS_CAN_POST' } });
    await expectScenarioError(service.createCustom(ORG, null, { key: 'inbox', name: 'Inbox' }), 409, 'ALREADY_EXISTS');
  });

  it('custom scenarios can be updated (settings re-validated) and deleted', async () => {
    await service.createCustom(ORG, null, { key: 'inbox', name: 'Inbox' });
    const updated = await service.update(ORG, null, 'inbox', { settings: { spamModerationLevel: 'REJECT' } });
    expect(updated.settings).toEqual({ spamModerationLevel: 'REJECT' });
    await expectScenarioError(service.update(ORG, null, 'inbox', { settings: { spamModerationLevel: 'NEVER' } }), 400, 'VALIDATION_ERROR');
    await expectScenarioError(service.update(ORG, null, 'inbox', { key: 'renamed' }), 400, 'VALIDATION_ERROR');
    await service.deleteCustom(ORG, 'inbox');
    await expectScenarioError(service.deleteCustom(ORG, 'inbox'), 404, 'NOT_FOUND');
  });

  it('scope status reports not configured, and passes the probe through', async () => {
    expect(await service.settingsScopeStatus(ORG)).toEqual({ googleConfigured: true, settingsScope: { state: 'authorised', scope: SCOPE } });
    const unconfigured = new GroupScenarioService({ db, gatewayFor: async () => null });
    expect(await unconfigured.settingsScopeStatus(ORG)).toEqual({ googleConfigured: false, settingsScope: null });
  });
});
