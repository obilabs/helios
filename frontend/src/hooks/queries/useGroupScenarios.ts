/**
 * TanStack Query hooks for group scenarios (D-048).
 *
 * Scenario definitions come from the API (backend/src/config/group-scenarios.ts
 * is the single source of truth); nothing here repeats them. Every hook is inert
 * while the `directory.group_scenarios` preview flag is off.
 *
 * Creating a group from a scenario answers 201 only when Google's read-back
 * matched. A 207 carries the created group plus the failed steps and mismatches;
 * `createGroupFromScenario` returns it as a result (not an exception) so the UI
 * must show it, and throws only when nothing was created.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../config/api';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

export const GROUP_SCENARIOS_FLAG = 'directory.group_scenarios';

export type MemberRole = 'OWNER' | 'MANAGER' | 'MEMBER';

export interface ScenarioSettingRow {
  field: string;
  value: string;
  label: string;
  valueLabel: string;
  location: string;
}

export interface GroupScenario {
  key: string;
  name: string;
  summary: string;
  kbRecipe?: string;
  userStory: string;
  whatHappens: string[];
  outsideSendersSee: string;
  membersSee: string;
  settings: Record<string, string>;
  memberDelivery: Partial<Record<MemberRole, string>>;
  suggestedAliases: string[];
  manualSteps: string[];
  kbApiNotes: string[];
  emailChecklist: string[];
  acceptsExternalMail: boolean;
  source: 'builtin' | 'custom';
  disabled: boolean;
  baseKey: string | null;
  settingsDetail: ScenarioSettingRow[];
  memberDeliveryDetail: Array<{ role: MemberRole; value: string; valueLabel: string }>;
  needsSettingsScope: boolean;
}

export interface ScenarioStatus {
  googleConfigured: boolean;
  settingsScope: { state: 'authorised' | 'not_authorised' | 'unknown'; scope: string; message?: string } | null;
}

export interface ScenarioStep {
  step: 'create_group' | 'apply_settings' | 'add_aliases' | 'add_members' | 'read_back';
  status: 'ok' | 'failed' | 'skipped';
  detail?: string;
}

export interface ScenarioMismatch {
  area: 'settings' | 'alias' | 'member';
  field: string;
  expected: string;
  actual: string | null;
}

export interface CreateFromScenarioResult {
  outcome: 'verified' | 'mismatch' | 'partial';
  scenarioKey: string;
  group: { id: string; email: string };
  steps: ScenarioStep[];
  mismatches: ScenarioMismatch[];
  warnings: string[];
  manualSteps: string[];
  emailChecklist: string[];
}

export interface CreateFromScenarioInput {
  scenarioKey: string;
  email: string;
  name: string;
  description?: string;
  aliases?: string[];
  members?: Array<{ email: string; role: MemberRole }>;
}

const KEY = 'group-scenarios';

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  const err = body?.error;
  const message = typeof err === 'string' ? err : err?.message;
  const details: string[] = Array.isArray(err?.details) ? err.details.map((d: { message: string }) => d.message) : [];
  return new Error([message || fallback, ...details].join(' '));
}

export async function fetchGroupScenarios(): Promise<GroupScenario[]> {
  const response = await authFetch('/api/v1/group-scenarios');
  if (!response.ok) throw await readError(response, 'Failed to load group scenarios');
  return (await response.json()).data as GroupScenario[];
}

export async function fetchGroupScenarioStatus(): Promise<ScenarioStatus> {
  const response = await authFetch('/api/v1/group-scenarios/status');
  if (!response.ok) throw await readError(response, 'Failed to check the Groups Settings scope');
  return (await response.json()).data as ScenarioStatus;
}

export async function createGroupFromScenario(input: CreateFromScenarioInput): Promise<CreateFromScenarioResult> {
  const { scenarioKey, ...body } = input;
  const response = await authFetch(`/api/v1/group-scenarios/${encodeURIComponent(scenarioKey)}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // 201 verified, 207 created but not as asked: both carry a result to show.
  if (response.status === 201 || response.status === 207) {
    return (await response.json()).data as CreateFromScenarioResult;
  }
  throw await readError(response, 'Failed to create the group from the scenario');
}

export async function setScenarioDisabled(key: string, disabled: boolean): Promise<GroupScenario> {
  const response = await authFetch(`/api/v1/group-scenarios/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disabled }),
  });
  if (!response.ok) throw await readError(response, 'Failed to update the scenario');
  return (await response.json()).data as GroupScenario;
}

export function useGroupScenarios() {
  const { isEnabled } = useFeatureFlags();
  return useQuery({
    queryKey: [KEY, 'list'],
    queryFn: fetchGroupScenarios,
    enabled: isEnabled(GROUP_SCENARIOS_FLAG),
    staleTime: 60_000,
  });
}

export function useGroupScenarioStatus() {
  const { isEnabled } = useFeatureFlags();
  return useQuery({
    queryKey: [KEY, 'status'],
    queryFn: fetchGroupScenarioStatus,
    enabled: isEnabled(GROUP_SCENARIOS_FLAG),
    staleTime: 60_000,
  });
}

export function useCreateGroupFromScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createGroupFromScenario,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useSetScenarioDisabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, disabled }: { key: string; disabled: boolean }) => setScenarioDisabled(key, disabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
