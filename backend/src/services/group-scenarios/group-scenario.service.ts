/**
 * Group scenarios (D-048): list, custom-scenario CRUD, and create-a-group-from-a-
 * scenario with read-back verification.
 *
 * The rule this service exists for: silence must never look like success. Every
 * create runs the same steps (create group, apply settings, add aliases, add
 * members, read back) and the result names each step's status plus every field
 * where what Google holds differs from what the scenario asked for. Only a run
 * with every step ok and zero mismatches is `verified`.
 */
import {
  BUILTIN_GROUP_SCENARIOS,
  MAX_GROUP_ALIASES,
  MEMBER_DELIVERY_VALUES,
  MEMBER_ROLES,
  RESERVED_GROUP_LOCAL_PARTS,
  SCENARIO_KEY_PATTERN,
  describeSettings,
  getBuiltinScenario,
  isBuiltinScenarioKey,
  validateGroupSettings,
  validateMemberDelivery,
  type GroupScenario,
  type GroupSettings,
  type MemberDelivery,
  type MemberRole,
} from '../../config/group-scenarios.js';
import {
  googleErrorInfo,
  isApiNotEnabled,
  isUnauthorisedClient,
  type GroupsGateway,
  type ScopeProbe,
} from './google-groups.gateway.js';
import { isEmailFormat } from '../../utils/email-format.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export type ScenarioSource = 'builtin' | 'custom';

export interface ScenarioView extends GroupScenario {
  source: ScenarioSource;
  disabled: boolean;
  baseKey: string | null;
  settingsDetail: ReturnType<typeof describeSettings>;
  memberDeliveryDetail: Array<{ role: MemberRole; value: MemberDelivery; valueLabel: string }>;
  /** True when applying this scenario needs the optional Groups Settings scope. */
  needsSettingsScope: boolean;
}

export class ScenarioError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.name = 'ScenarioError';
  }
}

export type StepName = 'create_group' | 'apply_settings' | 'add_aliases' | 'add_members' | 'read_back';
export type StepStatus = 'ok' | 'failed' | 'skipped';

export interface StepResult {
  step: StepName;
  status: StepStatus;
  detail?: string;
}

export interface Mismatch {
  area: 'settings' | 'alias' | 'member';
  field: string;
  expected: string;
  actual: string | null;
}

export type CreateOutcome = 'verified' | 'mismatch' | 'partial';

export interface CreateFromScenarioResult {
  outcome: CreateOutcome;
  scenarioKey: string;
  group: { id: string; email: string };
  steps: StepResult[];
  mismatches: Mismatch[];
  warnings: string[];
  manualSteps: string[];
  emailChecklist: string[];
}

export interface CreateFromScenarioInput {
  email: string;
  name: string;
  description?: string;
  aliases?: string[];
  members?: Array<{ email: string; role?: MemberRole }>;
}

export interface CustomScenarioInput {
  key?: string;
  baseKey?: string | null;
  name?: string;
  summary?: string;
  userStory?: string;
  whatHappens?: string[];
  outsideSendersSee?: string;
  membersSee?: string;
  settings?: Record<string, unknown>;
  memberDelivery?: Record<string, unknown>;
  suggestedAliases?: string[];
  manualSteps?: string[];
  emailChecklist?: string[];
  acceptsExternalMail?: boolean;
  disabled?: boolean;
}

export interface ServiceDeps {
  db: Queryable;
  /** Resolves the Google gateway for an organization; null = Google not configured. */
  gatewayFor: (organizationId: string) => Promise<GroupsGateway | null>;
  /**
   * Delays between Groups Settings retries (ms). A group created a moment ago can
   * briefly 404 on the Settings API while Google propagates it.
   */
  settingsRetryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

const MAX_MEMBERS = 50;
const MAX_NAME = 73;

const normaliseEmail = (s: string) => String(s || '').trim().toLowerCase();

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Every settings field where Google's value differs from the expected one. */
export function diffSettings(expected: GroupSettings, actual: Record<string, unknown>): Mismatch[] {
  const out: Mismatch[] = [];
  for (const [field, want] of Object.entries(expected)) {
    const got = actual[field];
    const gotStr = got === undefined || got === null ? null : String(got);
    if (gotStr !== want) out.push({ area: 'settings', field, expected: String(want), actual: gotStr });
  }
  return out;
}

export function diffAliases(expected: string[], actual: string[]): Mismatch[] {
  const have = new Set(actual.map(normaliseEmail));
  return expected
    .filter((a) => !have.has(normaliseEmail(a)))
    .map((a): Mismatch => ({ area: 'alias', field: a, expected: 'present', actual: null }));
}

function rowToScenario(row: any): GroupScenario & { disabled: boolean; baseKey: string | null } {
  return {
    key: row.scenario_key,
    name: row.name,
    summary: row.summary || '',
    userStory: row.user_story || '',
    whatHappens: row.what_happens || [],
    outsideSendersSee: row.outside_senders_see || '',
    membersSee: row.members_see || '',
    settings: row.settings || {},
    memberDelivery: row.member_delivery || {},
    suggestedAliases: row.suggested_aliases || [],
    manualSteps: row.manual_steps || [],
    kbApiNotes: [],
    emailChecklist: row.email_checklist || [],
    acceptsExternalMail: row.accepts_external_mail === true,
    disabled: row.is_disabled === true,
    baseKey: row.base_builtin_key || null,
  };
}

function toView(s: GroupScenario, source: ScenarioSource, disabled: boolean, baseKey: string | null): ScenarioView {
  return {
    ...s,
    source,
    disabled,
    baseKey,
    settingsDetail: describeSettings(s.settings),
    memberDeliveryDetail: (Object.entries(s.memberDelivery) as Array<[MemberRole, MemberDelivery]>).map(([role, value]) => ({
      role,
      value,
      valueLabel: MEMBER_DELIVERY_VALUES[value] ?? value,
    })),
    needsSettingsScope: Object.keys(s.settings).length > 0,
  };
}

function stringList(value: unknown, field: string, problems: Array<{ field: string; message: string }>): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    problems.push({ field, message: `${field} must be a list of strings` });
    return undefined;
  }
  return value as string[];
}

function textField(value: unknown, field: string, max: number, problems: Array<{ field: string; message: string }>): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    problems.push({ field, message: `${field} must be a string` });
    return undefined;
  }
  if (value.length > max) problems.push({ field, message: `${field} must be at most ${max} characters` });
  return value;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GroupScenarioService {
  private readonly retryDelays: number[];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: ServiceDeps) {
    this.retryDelays = deps.settingsRetryDelaysMs ?? [2000, 4000, 8000];
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  async list(organizationId: string): Promise<ScenarioView[]> {
    const [state, custom] = await Promise.all([
      this.deps.db.query('SELECT builtin_key, is_disabled FROM group_scenario_builtin_state WHERE organization_id = $1', [organizationId]),
      this.deps.db.query('SELECT * FROM group_scenarios WHERE organization_id = $1 ORDER BY name', [organizationId]),
    ]);
    const disabled = new Map<string, boolean>(state.rows.map((r: any) => [r.builtin_key, r.is_disabled === true]));
    const builtins = BUILTIN_GROUP_SCENARIOS.map((s) => toView(s, 'builtin', disabled.get(s.key) === true, null));
    const customs = custom.rows.map((row: any) => {
      const s = rowToScenario(row);
      return toView(s, 'custom', s.disabled, s.baseKey);
    });
    return [...builtins, ...customs];
  }

  async get(organizationId: string, key: string): Promise<ScenarioView> {
    const builtin = getBuiltinScenario(key);
    if (builtin) {
      const r = await this.deps.db.query(
        'SELECT is_disabled FROM group_scenario_builtin_state WHERE organization_id = $1 AND builtin_key = $2',
        [organizationId, key],
      );
      return toView(builtin, 'builtin', r.rows[0]?.is_disabled === true, null);
    }
    const r = await this.deps.db.query('SELECT * FROM group_scenarios WHERE organization_id = $1 AND scenario_key = $2', [organizationId, key]);
    if (r.rows.length === 0) throw new ScenarioError(404, 'NOT_FOUND', `Scenario ${key} not found`);
    const s = rowToScenario(r.rows[0]);
    return toView(s, 'custom', s.disabled, s.baseKey);
  }

  async settingsScopeStatus(organizationId: string): Promise<{ googleConfigured: boolean; settingsScope: ScopeProbe | null }> {
    const gateway = await this.deps.gatewayFor(organizationId);
    if (!gateway) return { googleConfigured: false, settingsScope: null };
    return { googleConfigured: true, settingsScope: await gateway.probeSettingsScope() };
  }

  // ── Custom scenarios ─────────────────────────────────────────────────────

  /** Validate and normalise custom-scenario input. `existing` is the scenario being updated. */
  private buildCustom(input: CustomScenarioInput, existing?: GroupScenario): GroupScenario {
    const problems: Array<{ field: string; message: string }> = [];
    let base: GroupScenario | undefined = existing;
    if (!existing && input.baseKey) {
      base = getBuiltinScenario(input.baseKey);
      if (!base) problems.push({ field: 'baseKey', message: `baseKey ${input.baseKey} is not a built-in scenario` });
    }

    const key = existing ? existing.key : String(input.key || '').trim();
    if (!existing) {
      if (!SCENARIO_KEY_PATTERN.test(key) || key.length > 100) {
        problems.push({ field: 'key', message: 'key must be a lowercase slug (letters, digits, single hyphens), at most 100 characters' });
      } else if (isBuiltinScenarioKey(key)) {
        problems.push({ field: 'key', message: `key ${key} is reserved by a built-in scenario` });
      }
    }

    const name = textField(input.name, 'name', 200, problems) ?? base?.name;
    if (!name || !name.trim()) problems.push({ field: 'name', message: 'name is required' });

    const settingsIn = input.settings === undefined ? base?.settings ?? {} : input.settings;
    if (typeof settingsIn !== 'object' || settingsIn === null || Array.isArray(settingsIn)) {
      problems.push({ field: 'settings', message: 'settings must be an object' });
    } else {
      for (const m of validateGroupSettings(settingsIn as Record<string, unknown>)) problems.push({ field: 'settings', message: m });
    }
    const deliveryIn = input.memberDelivery === undefined ? base?.memberDelivery ?? {} : input.memberDelivery;
    if (typeof deliveryIn !== 'object' || deliveryIn === null || Array.isArray(deliveryIn)) {
      problems.push({ field: 'memberDelivery', message: 'memberDelivery must be an object' });
    } else {
      for (const m of validateMemberDelivery(deliveryIn as Record<string, unknown>)) problems.push({ field: 'memberDelivery', message: m });
    }

    const scenario: GroupScenario = {
      key,
      name: (name || '').trim(),
      summary: textField(input.summary, 'summary', 500, problems) ?? base?.summary ?? '',
      userStory: textField(input.userStory, 'userStory', 2000, problems) ?? base?.userStory ?? '',
      whatHappens: stringList(input.whatHappens, 'whatHappens', problems) ?? base?.whatHappens ?? [],
      outsideSendersSee: textField(input.outsideSendersSee, 'outsideSendersSee', 2000, problems) ?? base?.outsideSendersSee ?? '',
      membersSee: textField(input.membersSee, 'membersSee', 2000, problems) ?? base?.membersSee ?? '',
      settings: settingsIn as GroupSettings,
      memberDelivery: deliveryIn as GroupScenario['memberDelivery'],
      suggestedAliases: stringList(input.suggestedAliases, 'suggestedAliases', problems) ?? base?.suggestedAliases ?? [],
      manualSteps: stringList(input.manualSteps, 'manualSteps', problems) ?? base?.manualSteps ?? [],
      kbApiNotes: [],
      emailChecklist: stringList(input.emailChecklist, 'emailChecklist', problems) ?? base?.emailChecklist ?? [],
      acceptsExternalMail: typeof input.acceptsExternalMail === 'boolean' ? input.acceptsExternalMail : base?.acceptsExternalMail ?? false,
    };
    if (problems.length) throw new ScenarioError(400, 'VALIDATION_ERROR', 'Validation failed', problems);
    return scenario;
  }

  async createCustom(organizationId: string, actorId: string | null, input: CustomScenarioInput): Promise<ScenarioView> {
    const s = this.buildCustom(input);
    const baseKey = input.baseKey && getBuiltinScenario(input.baseKey) ? input.baseKey : null;
    try {
      await this.deps.db.query(
        `INSERT INTO group_scenarios (
           organization_id, scenario_key, name, summary, base_builtin_key, user_story, what_happens,
           outside_senders_see, members_see, settings, member_delivery, suggested_aliases, manual_steps,
           email_checklist, accepts_external_mail, is_disabled, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          organizationId, s.key, s.name, s.summary, baseKey, s.userStory, JSON.stringify(s.whatHappens),
          s.outsideSendersSee, s.membersSee, JSON.stringify(s.settings), JSON.stringify(s.memberDelivery),
          JSON.stringify(s.suggestedAliases), JSON.stringify(s.manualSteps), JSON.stringify(s.emailChecklist),
          s.acceptsExternalMail, input.disabled === true, actorId,
        ],
      );
    } catch (error: any) {
      if (error?.code === '23505') throw new ScenarioError(409, 'ALREADY_EXISTS', `A scenario with key ${s.key} already exists`);
      throw error;
    }
    return toView(s, 'custom', input.disabled === true, baseKey);
  }

  /**
   * Built-ins accept only `disabled`. Custom scenarios accept every field except
   * `key` and `baseKey`.
   */
  async update(organizationId: string, actorId: string | null, key: string, input: CustomScenarioInput): Promise<ScenarioView> {
    if (isBuiltinScenarioKey(key)) {
      const other = Object.keys(input).filter((k) => k !== 'disabled');
      if (other.length > 0) {
        throw new ScenarioError(
          400,
          'VALIDATION_ERROR',
          'Built-in scenarios are defined in code. Only "disabled" can be changed; create a custom scenario from this one to change its settings.',
          other.map((field) => ({ field, message: `${field} cannot be changed on a built-in scenario` })),
        );
      }
      if (typeof input.disabled !== 'boolean') {
        throw new ScenarioError(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'disabled', message: 'disabled must be true or false' }]);
      }
      await this.deps.db.query(
        `INSERT INTO group_scenario_builtin_state (organization_id, builtin_key, is_disabled, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (organization_id, builtin_key)
         DO UPDATE SET is_disabled = EXCLUDED.is_disabled, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [organizationId, key, input.disabled, actorId],
      );
      return this.get(organizationId, key);
    }

    const current = await this.get(organizationId, key);
    if (input.key !== undefined && input.key !== key) {
      throw new ScenarioError(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'key', message: 'key cannot be changed' }]);
    }
    if (input.disabled !== undefined && typeof input.disabled !== 'boolean') {
      throw new ScenarioError(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'disabled', message: 'disabled must be true or false' }]);
    }
    const { baseKey: _ignored, ...rest } = input;
    const s = this.buildCustom(rest, current);
    const disabled = typeof input.disabled === 'boolean' ? input.disabled : current.disabled;
    await this.deps.db.query(
      `UPDATE group_scenarios SET
         name = $3, summary = $4, user_story = $5, what_happens = $6, outside_senders_see = $7, members_see = $8,
         settings = $9, member_delivery = $10, suggested_aliases = $11, manual_steps = $12, email_checklist = $13,
         accepts_external_mail = $14, is_disabled = $15, updated_at = NOW()
       WHERE organization_id = $1 AND scenario_key = $2`,
      [
        organizationId, key, s.name, s.summary, s.userStory, JSON.stringify(s.whatHappens), s.outsideSendersSee,
        s.membersSee, JSON.stringify(s.settings), JSON.stringify(s.memberDelivery), JSON.stringify(s.suggestedAliases),
        JSON.stringify(s.manualSteps), JSON.stringify(s.emailChecklist), s.acceptsExternalMail, disabled,
      ],
    );
    return toView(s, 'custom', disabled, current.baseKey);
  }

  async deleteCustom(organizationId: string, key: string): Promise<void> {
    if (isBuiltinScenarioKey(key)) {
      throw new ScenarioError(409, 'BUILTIN_NOT_DELETABLE', 'Built-in scenarios can be disabled but not deleted.');
    }
    const r = await this.deps.db.query('DELETE FROM group_scenarios WHERE organization_id = $1 AND scenario_key = $2', [organizationId, key]);
    if (!r.rowCount) throw new ScenarioError(404, 'NOT_FOUND', `Scenario ${key} not found`);
  }

  // ── Create a group from a scenario ────────────────────────────────────────

  /** Validate the request before anything touches Google. Returns warnings. */
  validateCreateInput(input: CreateFromScenarioInput): string[] {
    const problems: Array<{ field: string; message: string }> = [];
    const warnings: string[] = [];
    const email = normaliseEmail(input.email);
    if (!isEmailFormat(email)) problems.push({ field: 'email', message: 'A valid group email is required' });
    const local = email.split('@')[0];
    if (RESERVED_GROUP_LOCAL_PARTS.includes(local)) {
      problems.push({ field: 'email', message: `${local}@ is reserved by Google and cannot be a group address. Add it as an alias of an existing group instead.` });
    }
    const name = String(input.name || '').trim();
    if (!name) problems.push({ field: 'name', message: 'Group name is required' });
    if (name.length > MAX_NAME) problems.push({ field: 'name', message: `Group name must be at most ${MAX_NAME} characters` });
    if (input.description !== undefined && typeof input.description !== 'string') {
      problems.push({ field: 'description', message: 'description must be a string' });
    }

    const aliases = input.aliases ?? [];
    if (!Array.isArray(aliases)) {
      problems.push({ field: 'aliases', message: 'aliases must be a list of email addresses' });
    } else {
      if (aliases.length > MAX_GROUP_ALIASES) problems.push({ field: 'aliases', message: `A group can have at most ${MAX_GROUP_ALIASES} aliases` });
      const seen = new Set<string>();
      for (const raw of aliases) {
        const a = normaliseEmail(raw);
        if (!isEmailFormat(a)) problems.push({ field: 'aliases', message: `${raw} is not a valid email address` });
        else if (a === email) problems.push({ field: 'aliases', message: `${raw} is the group's own address` });
        else if (seen.has(a)) problems.push({ field: 'aliases', message: `${raw} is listed twice` });
        seen.add(a);
        if (RESERVED_GROUP_LOCAL_PARTS.includes(a.split('@')[0])) {
          warnings.push(`${a} uses a reserved word. Google may refuse it or treat it specially; send a test message to it separately.`);
        }
      }
    }

    const members = input.members ?? [];
    if (!Array.isArray(members)) {
      problems.push({ field: 'members', message: 'members must be a list' });
    } else {
      if (members.length > MAX_MEMBERS) problems.push({ field: 'members', message: `At most ${MAX_MEMBERS} members can be added here` });
      for (const m of members) {
        if (!m || !isEmailFormat(normaliseEmail(m.email))) problems.push({ field: 'members', message: `${m?.email} is not a valid email address` });
        if (m?.role !== undefined && !MEMBER_ROLES.includes(m.role)) problems.push({ field: 'members', message: `role must be one of ${MEMBER_ROLES.join(', ')}` });
      }
    }
    if (problems.length) throw new ScenarioError(400, 'VALIDATION_ERROR', 'Validation failed', problems);
    return warnings;
  }

  private async withSettingsRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const { status } = googleErrorInfo(error);
        const transient = status === 404 || (status !== null && status >= 500);
        if (!transient || attempt === this.retryDelays.length) throw error;
        await this.sleep(this.retryDelays[attempt]);
      }
    }
    throw lastError;
  }

  async createFromScenario(organizationId: string, key: string, input: CreateFromScenarioInput): Promise<CreateFromScenarioResult> {
    const scenario = await this.get(organizationId, key);
    if (scenario.disabled) throw new ScenarioError(409, 'SCENARIO_DISABLED', `Scenario ${key} is disabled`);
    const warnings = this.validateCreateInput(input);

    const gateway = await this.deps.gatewayFor(organizationId);
    if (!gateway) throw new ScenarioError(409, 'GOOGLE_NOT_CONFIGURED', 'Google Workspace is not connected');

    // Refuse before creating anything when the settings cannot be applied: a
    // group with Google's defaults under a scenario's name is the exact failure
    // this feature exists to prevent. The admin can still create a plain group.
    if (scenario.needsSettingsScope) {
      const probe = await gateway.probeSettingsScope();
      if (probe.state === 'not_authorised') {
        throw new ScenarioError(409, 'SETTINGS_SCOPE_NOT_AUTHORISED', probe.message || `The ${probe.scope} scope is not authorised`);
      }
      if (probe.state === 'unknown') {
        throw new ScenarioError(502, 'SETTINGS_SCOPE_UNKNOWN', `Could not confirm the Groups Settings scope: ${probe.message || 'unknown error'}`);
      }
    }

    const email = normaliseEmail(input.email);
    const aliases = (input.aliases ?? []).map(normaliseEmail);
    const members = (input.members ?? []).map((m) => ({ email: normaliseEmail(m.email), role: (m.role ?? 'MEMBER') as MemberRole }));
    const steps: StepResult[] = [];
    const mismatches: Mismatch[] = [];

    // 1. Create the group. A failure here leaves nothing behind, so it is an error.
    let group: { id: string; email: string };
    try {
      group = await gateway.createGroup({ email, name: input.name.trim(), description: input.description ?? '' });
      steps.push({ step: 'create_group', status: 'ok' });
    } catch (error) {
      const info = googleErrorInfo(error);
      if (info.status === 409) throw new ScenarioError(409, 'ALREADY_EXISTS', `${email} already exists in Google Workspace: ${info.message}`);
      if (info.status === 400) throw new ScenarioError(400, 'GOOGLE_REJECTED', `Google rejected the group: ${info.message}`);
      throw new ScenarioError(502, 'GOOGLE_WORKSPACE_ERROR', `Google could not create the group: ${info.message}`);
    }

    // 2. Apply settings.
    let settingsApplied = false;
    if (!scenario.needsSettingsScope) {
      steps.push({ step: 'apply_settings', status: 'skipped', detail: 'This scenario sets no group settings.' });
    } else {
      try {
        await this.withSettingsRetry(() => gateway.patchSettings(group.email, scenario.settings as Record<string, string>));
        settingsApplied = true;
        steps.push({ step: 'apply_settings', status: 'ok' });
      } catch (error) {
        steps.push({ step: 'apply_settings', status: 'failed', detail: this.describeGoogleFailure(error, 'apply the group settings') });
      }
    }

    // 3. Aliases.
    if (aliases.length === 0) {
      steps.push({ step: 'add_aliases', status: 'skipped' });
    } else {
      const failed: string[] = [];
      for (const alias of aliases) {
        try {
          await gateway.insertAlias(group.id, alias);
        } catch (error) {
          failed.push(`${alias}: ${googleErrorInfo(error).message}`);
        }
      }
      steps.push(failed.length ? { step: 'add_aliases', status: 'failed', detail: failed.join('; ') } : { step: 'add_aliases', status: 'ok' });
    }

    // 4. Members, with the scenario's delivery for their role.
    if (members.length === 0) {
      steps.push({ step: 'add_members', status: 'skipped' });
    } else {
      const failed: string[] = [];
      for (const m of members) {
        try {
          await gateway.insertMember(group.id, { email: m.email, role: m.role, delivery: scenario.memberDelivery[m.role] });
        } catch (error) {
          failed.push(`${m.email}: ${googleErrorInfo(error).message}`);
        }
      }
      steps.push(failed.length ? { step: 'add_members', status: 'failed', detail: failed.join('; ') } : { step: 'add_members', status: 'ok' });
    }

    // 5. Read back everything that was asked for, whether or not its step reported ok.
    const readFailures: string[] = [];
    if (scenario.needsSettingsScope) {
      try {
        const actual = await this.withSettingsRetry(() => gateway.getSettings(group.email));
        mismatches.push(...diffSettings(scenario.settings, actual));
      } catch (error) {
        readFailures.push(this.describeGoogleFailure(error, 'read the group settings back'));
      }
    }
    if (aliases.length) {
      try {
        mismatches.push(...diffAliases(aliases, await gateway.listAliases(group.id)));
      } catch (error) {
        readFailures.push(`aliases: ${googleErrorInfo(error).message}`);
      }
    }
    for (const m of members) {
      try {
        const got = await gateway.getMember(group.id, m.email);
        if ((got.role ?? null) !== m.role) mismatches.push({ area: 'member', field: `${m.email} role`, expected: m.role, actual: got.role });
        const wantDelivery = scenario.memberDelivery[m.role];
        if (wantDelivery && (got.delivery ?? null) !== wantDelivery) {
          mismatches.push({ area: 'member', field: `${m.email} delivery`, expected: wantDelivery, actual: got.delivery });
        }
      } catch (error) {
        const info = googleErrorInfo(error);
        if (info.status === 404) mismatches.push({ area: 'member', field: m.email, expected: 'member', actual: null });
        else readFailures.push(`${m.email}: ${info.message}`);
      }
    }
    steps.push(readFailures.length ? { step: 'read_back', status: 'failed', detail: readFailures.join('; ') } : { step: 'read_back', status: 'ok' });

    const anyFailed = steps.some((s) => s.status === 'failed');
    const outcome: CreateOutcome = anyFailed ? 'partial' : mismatches.length ? 'mismatch' : 'verified';
    if (!settingsApplied && scenario.needsSettingsScope) {
      warnings.push('The group exists but its settings were not applied. It has Google\'s defaults until the settings are fixed.');
    }

    return {
      outcome,
      scenarioKey: scenario.key,
      group,
      steps,
      mismatches,
      warnings,
      manualSteps: scenario.manualSteps,
      emailChecklist: scenario.emailChecklist,
    };
  }

  private describeGoogleFailure(error: unknown, action: string): string {
    if (isUnauthorisedClient(error)) return `Could not ${action}: the Groups Settings scope is not authorised for this workspace.`;
    if (isApiNotEnabled(error)) return `Could not ${action}: the Groups Settings API is not enabled in the service account's Google Cloud project.`;
    return `Could not ${action}: ${googleErrorInfo(error).message}`;
  }
}
