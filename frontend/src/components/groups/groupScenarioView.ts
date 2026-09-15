/**
 * Pure view logic for group scenarios, kept out of the components so it can be
 * tested without a DOM. Nothing here restates scenario content: that comes from
 * the API.
 */
import type { CreateFromScenarioResult, GroupScenario, MemberRole, ScenarioStatus, ScenarioStep } from '../../hooks/queries/useGroupScenarios';

export type Tone = 'success' | 'warning' | 'error' | 'info';

export interface ScopeView {
  /** Scenarios that set Google settings can be used. */
  canApplySettings: boolean;
  tone: Tone;
  message: string | null;
}

/** What the scope state means for the picker. Unknown is never treated as authorised. */
export function scopeView(status: ScenarioStatus | undefined, loading: boolean): ScopeView {
  if (loading) return { canApplySettings: false, tone: 'info', message: 'Checking whether Helios can apply group settings...' };
  if (!status) return { canApplySettings: false, tone: 'error', message: 'Could not check whether Helios can apply group settings. You can still create a plain group.' };
  if (!status.googleConfigured) return { canApplySettings: false, tone: 'error', message: 'Google Workspace is not connected.' };
  const scope = status.settingsScope;
  if (scope?.state === 'authorised') return { canApplySettings: true, tone: 'success', message: null };
  if (scope?.state === 'not_authorised') {
    return {
      canApplySettings: false,
      tone: 'warning',
      message: `Group settings can't be applied: this workspace has not authorised the ${scope.scope} scope for Helios (Google Admin console > Security > API controls > Domain-wide delegation). You can still create a plain group with Google's default settings.`,
    };
  }
  return {
    canApplySettings: false,
    tone: 'warning',
    message: `Group settings can't be applied right now: ${scope?.message || 'the scope could not be checked'}. You can still create a plain group.`,
  };
}

/** Scenarios offered in the dropdown: enabled ones, with a reason when one cannot be used. */
export function scenarioOptions(scenarios: GroupScenario[], scope: ScopeView): Array<{ scenario: GroupScenario; usable: boolean; reason?: string }> {
  return scenarios
    .filter((s) => !s.disabled)
    .map((scenario) =>
      scenario.needsSettingsScope && !scope.canApplySettings
        ? { scenario, usable: false, reason: 'needs the Groups Settings scope' }
        : { scenario, usable: true },
    );
}

export interface OutcomeView {
  tone: Tone;
  title: string;
  message: string;
}

export function outcomeView(result: CreateFromScenarioResult): OutcomeView {
  if (result.outcome === 'verified') {
    return {
      tone: 'success',
      title: 'Group created and verified',
      message: `${result.group.email} was created and every setting read back from Google matches the scenario. Finish the manual steps, then run the email checklist.`,
    };
  }
  if (result.outcome === 'mismatch') {
    return {
      tone: 'warning',
      title: 'Group created, but settings differ',
      message: `${result.group.email} was created, but ${result.mismatches.length} value(s) read back from Google differ from the scenario. Fix them in Google before relying on this group.`,
    };
  }
  return {
    tone: 'error',
    title: 'Group created, but not fully configured',
    message: `${result.group.email} exists, but at least one step failed. Until it is fixed the group may have Google's default settings.`,
  };
}

const STEP_LABELS: Record<ScenarioStep['step'], string> = {
  create_group: 'Create the group',
  apply_settings: 'Apply group settings',
  add_aliases: 'Add aliases',
  add_members: 'Add members with delivery settings',
  read_back: 'Read settings back from Google',
};

export function stepLabel(step: ScenarioStep['step']): string {
  return STEP_LABELS[step] ?? step;
}

/** Parse the free-text alias and member fields of the form. */
export function parseList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Members field: one per line, "email" or "email role" (OWNER, MANAGER, MEMBER).
 * Returns the parsed members and a problem per line that could not be read.
 */
export function parseMembers(text: string): { members: Array<{ email: string; role: MemberRole }>; problems: string[] } {
  const members: Array<{ email: string; role: MemberRole }> = [];
  const problems: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [email, roleRaw] = line.split(/[\s,;]+/);
    const role = (roleRaw || 'MEMBER').toUpperCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`"${line}": not an email address`);
    else if (role !== 'OWNER' && role !== 'MANAGER' && role !== 'MEMBER') problems.push(`"${line}": role must be OWNER, MANAGER or MEMBER`);
    else members.push({ email, role });
  }
  return { members, problems };
}
