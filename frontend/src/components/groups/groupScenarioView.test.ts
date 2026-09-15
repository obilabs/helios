import { describe, expect, it } from 'vitest';
import type { CreateFromScenarioResult, GroupScenario } from '../../hooks/queries/useGroupScenarios';
import { outcomeView, parseList, parseMembers, scenarioOptions, scopeView } from './groupScenarioView';

const SCOPE = 'https://www.googleapis.com/auth/apps.groups.settings';

function scenario(over: Partial<GroupScenario>): GroupScenario {
  return {
    key: 'k', name: 'N', summary: '', userStory: '', whatHappens: [], outsideSendersSee: '', membersSee: '',
    settings: {}, memberDelivery: {}, suggestedAliases: [], manualSteps: [], kbApiNotes: [], emailChecklist: [],
    acceptsExternalMail: false, source: 'builtin', disabled: false, baseKey: null, settingsDetail: [],
    memberDeliveryDetail: [], needsSettingsScope: true, ...over,
  };
}

function result(over: Partial<CreateFromScenarioResult>): CreateFromScenarioResult {
  return {
    outcome: 'verified', scenarioKey: 'k', group: { id: 'g', email: 'team@example.com' }, steps: [], mismatches: [],
    warnings: [], manualSteps: [], emailChecklist: [], ...over,
  };
}

describe('scopeView', () => {
  it('only an authorised scope allows settings; unknown and loading never do', () => {
    expect(scopeView({ googleConfigured: true, settingsScope: { state: 'authorised', scope: SCOPE } }, false).canApplySettings).toBe(true);
    const missing = scopeView({ googleConfigured: true, settingsScope: { state: 'not_authorised', scope: SCOPE } }, false);
    expect(missing.canApplySettings).toBe(false);
    expect(missing.message).toMatch(/can't be applied/);
    expect(missing.message).toMatch(/plain group/);
    expect(scopeView({ googleConfigured: true, settingsScope: { state: 'unknown', scope: SCOPE } }, false).canApplySettings).toBe(false);
    expect(scopeView(undefined, true).canApplySettings).toBe(false);
    expect(scopeView(undefined, false).canApplySettings).toBe(false);
    expect(scopeView({ googleConfigured: false, settingsScope: null }, false).message).toMatch(/not connected/);
  });
});

describe('scenarioOptions', () => {
  it('hides disabled scenarios and marks settings scenarios unusable without the scope', () => {
    const list = [scenario({ key: 'a' }), scenario({ key: 'b', disabled: true }), scenario({ key: 'c', needsSettingsScope: false })];
    const noScope = scopeView({ googleConfigured: true, settingsScope: { state: 'not_authorised', scope: SCOPE } }, false);
    expect(scenarioOptions(list, noScope).map((o) => [o.scenario.key, o.usable])).toEqual([['a', false], ['c', true]]);
  });
});

describe('outcomeView', () => {
  it('only verified reads as success', () => {
    expect(outcomeView(result({ outcome: 'verified' })).tone).toBe('success');
    const mismatch = outcomeView(result({ outcome: 'mismatch', mismatches: [{ area: 'settings', field: 'x', expected: 'a', actual: null }] }));
    expect(mismatch.tone).toBe('warning');
    expect(mismatch.message).toMatch(/1 value/);
    expect(outcomeView(result({ outcome: 'partial' })).tone).toBe('error');
  });
});

describe('form parsing', () => {
  it('parses aliases and members, and reports unreadable member lines', () => {
    expect(parseList('a@example.com, b@example.com\nc@example.com')).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
    expect(parseMembers('owner@example.com OWNER\n\nstaff@example.com\nbad line\nx@example.com ADMIN')).toEqual({
      members: [{ email: 'owner@example.com', role: 'OWNER' }, { email: 'staff@example.com', role: 'MEMBER' }],
      problems: ['"bad line": not an email address', '"x@example.com ADMIN": role must be OWNER, MANAGER or MEMBER'],
    });
  });
});
