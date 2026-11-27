/**
 * Built-in group scenarios (D-048) are the single source of truth for what a
 * scenario applies. These checks run offline and fail the build when:
 *
 *   - a built-in asks for a value Google does not accept (checked against the
 *     enum values documented in the installed googleapis Groups Settings client,
 *     so the vocabulary is not our own guess);
 *   - a built-in drifts from the facts verified in the KB recipes (spam handling
 *     for inboxes that outsiders write to, default sender, replies, Collaborative
 *     Inbox needs history);
 *   - a scenario points at a KB recipe that does not exist;
 *   - validation lets through what Google would reject.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  BUILTIN_GROUP_SCENARIOS,
  GROUP_SETTING_FIELDS,
  MEMBER_DELIVERY_VALUES,
  SCENARIO_KEY_PATTERN,
  describeSettings,
  getBuiltinScenario,
  validateGroupSettings,
  validateMemberDelivery,
} from '../config/group-scenarios.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Enum values per field from the googleapis Groups Settings type docs. */
function sdkEnumValues(): Record<string, Set<string>> {
  const require = createRequire(import.meta.url);
  const pkg = dirname(require.resolve('googleapis/package.json'));
  const dts = readFileSync(join(pkg, 'build', 'src', 'apis', 'groupssettings', 'v1.d.ts'), 'utf8');
  const out: Record<string, Set<string>> = {};
  // Each property is preceded by a JSDoc block listing "- VALUE" lines.
  const re = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*(\w+)\?:\s*string \| null;/g;
  for (const m of dts.matchAll(re)) {
    const values = [...m[1].matchAll(/^\s*\*\s*-\s*([A-Za-z_]+)\b/gm)].map((v) => v[1]);
    if (values.length) out[m[2]] = new Set(values);
  }
  return out;
}

/**
 * Fields the Groups Settings API reference documents but the installed googleapis
 * client does not type (the client passes the request body through unchanged).
 * Keep this list short and explicit; the live read-back is what proves Google
 * honours them.
 */
const API_REFERENCE_ONLY: Record<string, Set<string>> = {
  defaultSender: new Set(['DEFAULT_SELF', 'GROUP']),
};

const recipes = (() => {
  const kb = JSON.parse(readFileSync(join(HERE, '..', 'knowledge', 'content', 'google-groups.json'), 'utf8'));
  return kb.entries.find((e: any) => e.id === 'guide-google-groups-recipes').content as string;
})();

describe('built-in group scenarios', () => {
  it('has the scenarios D-048 names, with unique slug keys', () => {
    const keys = BUILTIN_GROUP_SCENARIOS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(SCENARIO_KEY_PATTERN);
    expect(keys).toEqual(
      expect.arrayContaining([
        'public-contact-inbox',
        'shared-team-inbox',
        'security-reports-inbox',
        'announcement-list',
        'access-only-group',
        'client-inquiries',
        'departed-employee-address',
      ]),
    );
  });

  it('every built-in passes the same validation custom scenarios get', () => {
    for (const s of BUILTIN_GROUP_SCENARIOS) {
      expect({ key: s.key, problems: validateGroupSettings(s.settings) }).toEqual({ key: s.key, problems: [] });
      expect({ key: s.key, problems: validateMemberDelivery(s.memberDelivery) }).toEqual({ key: s.key, problems: [] });
    }
  });

  it('every explainer is complete: user story, what happens, both audiences, a checklist', () => {
    for (const s of BUILTIN_GROUP_SCENARIOS) {
      expect(s.userStory).toMatch(/^As (a|an|the) .+, I want .+, so that .+/);
      expect(s.whatHappens.length).toBeGreaterThan(0);
      expect(s.outsideSendersSee.length).toBeGreaterThan(0);
      expect(s.membersSee.length).toBeGreaterThan(0);
      expect(s.emailChecklist.length).toBeGreaterThan(0);
      expect(s.summary.length).toBeGreaterThan(0);
    }
  });

  it('every recipe letter a scenario cites exists in the KB recipes article', () => {
    for (const s of BUILTIN_GROUP_SCENARIOS) {
      expect(s.kbRecipe).toBeTruthy();
      for (const letter of String(s.kbRecipe).split(',').map((l) => l.trim())) {
        expect(recipes).toContain(`## ${letter}) `);
      }
    }
  });

  it('every field and value a scenario can use is one Google documents', () => {
    const sdk = sdkEnumValues();
    // Guard: the parser found the Groups Settings docs at all.
    expect(sdk.whoCanPostMessage?.has('ANYONE_CAN_POST')).toBe(true);
    for (const [field, def] of Object.entries(GROUP_SETTING_FIELDS)) {
      if (!def.values) continue;
      const allowed = Object.keys(def.values);
      if (allowed.every((v) => v === 'true' || v === 'false')) continue; // booleans: "true"/"false" strings
      const documented = sdk[field] ?? API_REFERENCE_ONLY[field];
      expect({ field, known: Boolean(documented) }).toEqual({ field, known: true });
      for (const v of allowed) expect({ field, value: v, documented: documented.has(v) }).toEqual({ field, value: v, documented: true });
    }
  });

  it('whoCanViewMembership has no owners-only value, so no scenario pretends to set one', () => {
    const sdk = sdkEnumValues();
    expect([...sdk.whoCanViewMembership].sort()).toEqual(['ALL_IN_DOMAIN_CAN_VIEW', 'ALL_MANAGERS_CAN_VIEW', 'ALL_MEMBERS_CAN_VIEW']);
    const security = getBuiltinScenario('security-reports-inbox')!;
    expect(security.settings.whoCanViewMembership).toBeUndefined();
    expect(security.kbApiNotes.join(' ')).toMatch(/whoCanViewMembership/);
    expect(security.manualSteps.join(' ')).toMatch(/View members: Group owners/);
  });

  it('inboxes outsiders write to post suspicious mail instead of holding it (KB: not the default MODERATE)', () => {
    for (const key of ['public-contact-inbox', 'security-reports-inbox', 'departed-employee-address', 'client-inquiries']) {
      const s = getBuiltinScenario(key)!;
      expect({ key, post: s.settings.whoCanPostMessage }).toEqual({ key, post: 'ANYONE_CAN_POST' });
      expect({ key, spam: s.settings.spamModerationLevel }).toEqual({ key, spam: 'ALLOW' });
      expect({ key, moderation: s.settings.messageModerationLevel }).toEqual({ key, moderation: 'MODERATE_NONE' });
      expect(s.acceptsExternalMail).toBe(true);
    }
  });

  it('contact and security inboxes: default sender Author, replies sender\'s choice, members post as the group', () => {
    for (const key of ['public-contact-inbox', 'security-reports-inbox']) {
      const s = getBuiltinScenario(key)!.settings;
      expect(s.defaultSender).toBe('DEFAULT_SELF');
      expect(s.replyTo).toBe('REPLY_TO_IGNORE');
      expect(s.membersCanPostAsTheGroup).toBe('true');
      expect(s.isArchived).toBe('true');
    }
  });

  it('Collaborative Inbox always comes with conversation history and members who can take threads', () => {
    for (const s of BUILTIN_GROUP_SCENARIOS) {
      if (s.settings.enableCollaborativeInbox === 'true') {
        expect(s.settings.isArchived).toBe('true');
        expect(s.settings.whoCanAssistContent).toBe('ALL_MEMBERS');
      }
    }
  });

  it('announcement list: only managers post, replies go to the author', () => {
    const s = getBuiltinScenario('announcement-list')!.settings;
    expect(s.whoCanPostMessage).toBe('ALL_MANAGERS_CAN_POST');
    expect(s.replyTo).toBe('REPLY_TO_SENDER');
  });

  it('access-only group: members get no email, and the unsupported "allow email posting" switch is a manual step, not a guess', () => {
    const s = getBuiltinScenario('access-only-group')!;
    expect(Object.values(s.memberDelivery)).toEqual(['NONE', 'NONE', 'NONE']);
    expect(s.settings.whoCanPostMessage).toBe('ALL_MEMBERS_CAN_POST');
    expect(s.kbApiNotes.join(' ')).toMatch(/NONE_CAN_POST/);
    expect(s.manualSteps.join(' ')).toMatch(/Allow email posting/);
  });

  it('client inquiries allow external members; nothing else does', () => {
    for (const s of BUILTIN_GROUP_SCENARIOS) {
      const expected = s.key === 'client-inquiries' ? 'true' : s.settings.allowExternalMembers === undefined ? undefined : 'false';
      expect({ key: s.key, external: s.settings.allowExternalMembers }).toEqual({ key: s.key, external: expected });
    }
  });

  it('the drill-in rows show the API field, value and Google\'s wording', () => {
    const rows = describeSettings(getBuiltinScenario('public-contact-inbox')!.settings);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'spamModerationLevel', value: 'ALLOW', valueLabel: 'Post suspicious messages to the group' }),
        expect.objectContaining({ field: 'replyTo', value: 'REPLY_TO_IGNORE', valueLabel: "Sender's choice" }),
      ]),
    );
  });
});

describe('group settings validation', () => {
  it('rejects unknown fields, unknown values and non-strings', () => {
    expect(validateGroupSettings({ whoCanPostMessage: 'EVERYONE' })).toEqual([expect.stringMatching(/whoCanPostMessage must be one of/)]);
    expect(validateGroupSettings({ showInGroupDirectory: 'true' })).toEqual([expect.stringMatching(/not a supported group setting/)]);
    expect(validateGroupSettings({ isArchived: true })).toEqual([expect.stringMatching(/must be a string/)]);
  });

  it('refuses NONE_CAN_POST (Google only accepts it on an archive-only group) and REPLY_TO_CUSTOM (needs a per-group address)', () => {
    expect(validateGroupSettings({ whoCanPostMessage: 'NONE_CAN_POST' })).toHaveLength(1);
    expect(validateGroupSettings({ replyTo: 'REPLY_TO_CUSTOM' })).toHaveLength(1);
  });

  it('enforces Collaborative Inbox -> conversation history and footer text -> custom footer on', () => {
    expect(validateGroupSettings({ enableCollaborativeInbox: 'true' })).toEqual([expect.stringMatching(/requires conversation history/)]);
    expect(validateGroupSettings({ enableCollaborativeInbox: 'true', isArchived: 'true' })).toEqual([]);
    expect(validateGroupSettings({ customFooterText: 'x' })).toEqual([expect.stringMatching(/requires includeCustomFooter/)]);
  });

  it('member delivery accepts only Directory API values for known roles', () => {
    expect(Object.keys(MEMBER_DELIVERY_VALUES).sort()).toEqual(['ALL_MAIL', 'DAILY', 'DIGEST', 'NONE']);
    expect(validateMemberDelivery({ OWNER: 'DAILY' })).toEqual([]);
    expect(validateMemberDelivery({ OWNER: 'WEEKLY' })).toHaveLength(1);
    expect(validateMemberDelivery({ GUEST: 'ALL_MAIL' })).toHaveLength(1);
  });
});
