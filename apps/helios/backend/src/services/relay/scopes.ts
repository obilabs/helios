/**
 * API Relay Authorization — minimal OAuth scope selection (design §6, ceiling 2).
 *
 * The transport previously minted a JWT carrying ALL directory scopes for every
 * request. Under enforcement, a request gets only the scopes its resource +
 * method class actually needs: a directory read mints
 * `admin.directory.user.readonly`, never write scopes.
 *
 * Pure and offline-testable: resource + method class in, scope list out. The
 * token exchange itself stays in the transport.
 *
 * Fail-closed: a resource with no mapping returns [] and the transport MUST
 * refuse to mint/forward (deny with 'no-scope-mapping') rather than fall back
 * to broad scopes.
 */
import { classifyMethod, type MethodClass } from './policy.js';

const G = 'https://www.googleapis.com/auth/';

/**
 * resource -> { read scope, write scope }. Deletes use the write scope (Google
 * has no finer-grained delete scope); the policy engine has already required an
 * explicit `:DELETE` rule before a delete gets this far.
 *
 * Only the admin-directory families the proxy has ever supported are mapped
 * (the legacy hardcoded JWT carried exactly user/group/orgunit/domain write
 * scopes). Sub-resources collapse into their parent by descriptorFromPath
 * (e.g. `/admin/directory/v1/groups/x/members` -> `admin.directory.groups`),
 * and the group scope covers member management.
 */
const SCOPE_MAP: Record<string, { read: string; write: string }> = {
  'admin.directory.users': {
    read: `${G}admin.directory.user.readonly`,
    write: `${G}admin.directory.user`,
  },
  'admin.directory.groups': {
    read: `${G}admin.directory.group.readonly`,
    write: `${G}admin.directory.group`,
  },
  'admin.directory.orgunits': {
    read: `${G}admin.directory.orgunit.readonly`,
    write: `${G}admin.directory.orgunit`,
  },
  'admin.directory.domains': {
    read: `${G}admin.directory.domain.readonly`,
    write: `${G}admin.directory.domain`,
  },
};

/**
 * Select the minimal OAuth scopes for one resource + method class.
 * Returns [] when the resource has no mapping — the caller must treat that as
 * a denial, never substitute broad scopes.
 */
export function selectScopes(resource: string, cls: MethodClass): string[] {
  const entry = SCOPE_MAP[resource];
  if (!entry) return [];
  return cls === 'read' ? [entry.read] : [entry.write];
}

/** Convenience overload working from a raw HTTP method. */
export function selectScopesForRequest(resource: string, method: string): string[] {
  return selectScopes(resource, classifyMethod(method));
}

/**
 * Union of minimal scopes across several sub-requests (batch). Returns null if
 * ANY sub-request has no mapping — the whole batch must then be denied rather
 * than partially scoped.
 */
export function selectScopesForBatch(
  subs: Array<{ resource: string; method: string }>,
): string[] | null {
  const scopes = new Set<string>();
  for (const sub of subs) {
    const s = selectScopesForRequest(sub.resource, sub.method);
    if (s.length === 0) return null;
    for (const scope of s) scopes.add(scope);
  }
  return [...scopes];
}
