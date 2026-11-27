/**
 * The Google calls a group scenario needs, behind one small interface so the
 * scenario service can be tested with a fake and the real calls can be replayed
 * from fixtures (testing/google-replay.ts hooks the googleapis SDK transport).
 *
 * Scopes: every client is built from googleScopesForPath(), one API family at a
 * time. Directory calls use contract scopes. Groups Settings calls mint ONLY the
 * optional `apps.groups.settings` scope (D-005, D-048), so a workspace that has
 * not authorised it loses the settings step and nothing else.
 */
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { googleScopesForPath } from '../../config/google-scopes.js';
import { db } from '../../database/connection.js';
import { decodeServiceAccountKey } from '../gw-credentials.js';
import type { MemberDelivery, MemberRole } from '../../config/group-scenarios.js';

export type ScopeState = 'authorised' | 'not_authorised' | 'unknown';

export interface ScopeProbe {
  state: ScopeState;
  scope: string;
  message?: string;
}

export interface GroupMemberRecord {
  email: string;
  role: string | null;
  delivery: string | null;
}

export interface GroupsGateway {
  /** Mint a token for the Groups Settings scope only. No API call. */
  probeSettingsScope(): Promise<ScopeProbe>;
  createGroup(input: { email: string; name: string; description: string }): Promise<{ id: string; email: string }>;
  patchSettings(groupEmail: string, settings: Record<string, string>): Promise<void>;
  getSettings(groupEmail: string): Promise<Record<string, unknown>>;
  insertAlias(groupKey: string, alias: string): Promise<void>;
  listAliases(groupKey: string): Promise<string[]>;
  insertMember(groupKey: string, member: { email: string; role: MemberRole; delivery?: MemberDelivery }): Promise<void>;
  getMember(groupKey: string, memberEmail: string): Promise<GroupMemberRecord>;
  deleteGroup(groupKey: string): Promise<void>;
}

export const GROUPS_SETTINGS_PATH = 'groups/v1/groups/{groupUniqueId}';

/** Scopes per API family, resolved once from the canonical module. */
export function gatewayScopes(): { directory: string[]; members: string[]; settings: string[] } {
  return {
    directory: googleScopesForPath('POST', 'admin/directory/v1/groups').scopes,
    members: googleScopesForPath('POST', 'admin/directory/v1/groups/{groupKey}/members').scopes,
    settings: googleScopesForPath('PATCH', GROUPS_SETTINGS_PATH).scopes,
  };
}

/** Status and message from a googleapis / gaxios error. */
export function googleErrorInfo(error: unknown): { status: number | null; message: string; reason: string | null } {
  const e = error as any;
  const status = Number(e?.response?.status ?? e?.status ?? e?.code);
  const data = e?.response?.data;
  const apiMessage = data?.error?.message || data?.error_description;
  const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || (typeof data?.error === 'string' ? data.error : null);
  return {
    status: Number.isFinite(status) && status >= 100 ? status : null,
    message: String(apiMessage || e?.message || e),
    reason: reason ?? null,
  };
}

/** A token exchange refused because the delegation lacks the scope. */
export function isUnauthorisedClient(error: unknown): boolean {
  const { message, reason } = googleErrorInfo(error);
  return /unauthorized_client/i.test(message) || reason === 'unauthorized_client';
}

/** Google's "API not enabled in the Cloud project" error. */
export function isApiNotEnabled(error: unknown): boolean {
  const { message, reason } = googleErrorInfo(error);
  return reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED' || /has not been used in project|is disabled/i.test(message);
}

export type AuthFactory = (scopes: string[]) => JWT | undefined;

/**
 * Build the gateway. `authFor` returns the auth client for a scope set; the
 * replay tests pass one that returns `undefined` so no token exchange happens.
 */
export function createGoogleGroupsGateway(authFor: AuthFactory): GroupsGateway {
  const scopes = gatewayScopes();
  const directory = () => google.admin({ version: 'directory_v1', auth: authFor(scopes.directory) });
  const members = () => google.admin({ version: 'directory_v1', auth: authFor(scopes.members) });
  const settings = () => google.groupssettings({ version: 'v1', auth: authFor(scopes.settings) });

  return {
    async probeSettingsScope() {
      const scope = scopes.settings.join(' ');
      const auth = authFor(scopes.settings);
      if (!auth) return { state: 'unknown', scope, message: 'No credentials available to test the scope.' };
      try {
        await auth.authorize();
        return { state: 'authorised', scope };
      } catch (error) {
        if (isUnauthorisedClient(error)) {
          return {
            state: 'not_authorised',
            scope,
            message: `This workspace has not authorised ${scope} for the Helios service account. Group settings cannot be applied; plain groups still work.`,
          };
        }
        return { state: 'unknown', scope, message: googleErrorInfo(error).message };
      }
    },

    async createGroup({ email, name, description }) {
      const res = await directory().groups.insert({ requestBody: { email, name, description } });
      return { id: String(res.data.id), email: String(res.data.email || email) };
    },

    async patchSettings(groupEmail, values) {
      await settings().groups.patch({ groupUniqueId: groupEmail, requestBody: values });
    },

    async getSettings(groupEmail) {
      const res = await settings().groups.get({ groupUniqueId: groupEmail, alt: 'json' });
      return (res.data || {}) as Record<string, unknown>;
    },

    async insertAlias(groupKey, alias) {
      await directory().groups.aliases.insert({ groupKey, requestBody: { alias } });
    },

    async listAliases(groupKey) {
      const res = await directory().groups.aliases.list({ groupKey });
      const items = ((res.data as any)?.aliases || []) as Array<{ alias?: string }>;
      return items.map((a) => String(a.alias || '')).filter(Boolean);
    },

    async insertMember(groupKey, { email, role, delivery }) {
      await members().members.insert({
        groupKey,
        requestBody: { email, role, ...(delivery ? { delivery_settings: delivery } : {}) },
      });
    },

    async getMember(groupKey, memberEmail) {
      const res = await members().members.get({ groupKey, memberKey: memberEmail });
      return {
        email: String(res.data.email || memberEmail),
        role: res.data.role ?? null,
        delivery: res.data.delivery_settings ?? null,
      };
    },

    async deleteGroup(groupKey) {
      await directory().groups.delete({ groupKey });
    },
  };
}

/**
 * The gateway for an organization's stored Google credentials, or null when
 * Google Workspace is not configured.
 */
export async function gatewayForOrganization(organizationId: string): Promise<GroupsGateway | null> {
  const r = await db.query(
    'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
    [organizationId],
  );
  if (r.rows.length === 0 || !r.rows[0].admin_email) return null;
  const key = decodeServiceAccountKey<{ client_email: string; private_key: string }>(r.rows[0].service_account_key);
  const subject = r.rows[0].admin_email as string;
  return createGoogleGroupsGateway(
    (scopes) => new JWT({ email: key.client_email, key: key.private_key, scopes, subject }),
  );
}
