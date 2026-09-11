/**
 * Google DWD scope contract (Phase 02 bone, frozen 2026-09-08).
 *
 * Two guarantees, both offline:
 *
 *   1. The base scope list an admin authorises at setup is a wire contract.
 *      Its hash is pinned here. If this test fails you changed the contract:
 *      every already-connected workspace must re-authorise. Record the decision
 *      in the north-star tracker, bump SCOPE_CONTRACT_VERSION, then update the
 *      pin. Never "just fix the hash".
 *
 *   2. No call mints the full list. Every Google API path Helios uses resolves
 *      to a minimal scope set, and an unknown path falls back to the frozen
 *      contract, never to anything wider. That is what makes adding an optional
 *      scope (userschema, ediscovery) safe for existing tenants: only the path
 *      that needs it ever asks for it.
 */
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import {
  REQUIRED_SCOPES,
  OPTIONAL_SCOPE_DETAILS,
  DELEGATION_SCOPES,
  SCOPE_CONTRACT_VERSION,
  ADMIN_SDK_CLIENT_SCOPES,
  googleScopesForPath,
  googleScopesForPaths,
  normaliseGooglePath,
} from '../config/google-scopes.js';

const G = 'https://www.googleapis.com/auth/';

// sha256 of REQUIRED_SCOPES joined by '\n', in declaration order.
const CONTRACT_V1_SHA256 = 'f8b3d7c07780800930e9cdb45eddff4475becc33bfb0dca560ed646464b22c24';

describe('scope contract v1 is frozen', () => {
  it('REQUIRED_SCOPES hash matches the pinned contract', () => {
    const digest = createHash('sha256').update(REQUIRED_SCOPES.join('\n')).digest('hex');
    expect(SCOPE_CONTRACT_VERSION).toBe(1);
    expect(REQUIRED_SCOPES).toHaveLength(17);
    expect(digest).toBe(CONTRACT_V1_SHA256);
  });

  it('optional scopes are advertised for setup but never part of the contract', () => {
    for (const { scope } of OPTIONAL_SCOPE_DETAILS) {
      expect(REQUIRED_SCOPES).not.toContain(scope);
      expect(DELEGATION_SCOPES).toContain(scope);
    }
    expect(OPTIONAL_SCOPE_DETAILS.map((s) => s.scope)).toContain(`${G}admin.directory.userschema`);
  });

  it('every scope a path can mint is exactly an advertised scope (DWD matches strings exactly)', () => {
    // A path that minted something outside the advertised set would fail on
    // every tenant, since nobody was ever asked to authorise it. That includes
    // readonly variants: `admin.directory.user.readonly` is refused by a tenant
    // that authorised `admin.directory.user`.
    const advertised = new Set(DELEGATION_SCOPES);
    const paths: Array<[string, string]> = [
      ['GET', 'admin/directory/v1/users'],
      ['POST', 'admin/directory/v1/users'],
      ['GET', 'admin/directory/v1/users/a%40b.example/tokens'],
      ['POST', 'admin/directory/v1/users/a%40b.example/signOut'],
      ['GET', 'admin/directory/v1/groups/g/members'],
      ['GET', 'admin/directory/v1/customer/my_customer/orgunits'],
      ['GET', 'admin/directory/v1/customer/my_customer/domains'],
      ['GET', 'admin/directory/v1/customer/my_customer/devices/mobile'],
      ['GET', 'admin/directory/v1/customer/my_customer/schemas'],
      ['GET', 'admin/directory/v1/customer/my_customer/resources/calendars'],
      ['POST', 'admin/directory/v1/customer/my_customer/resources/calendars'],
      ['GET', 'admin/directory/v1/customer/my_customer/resources/buildings'],
      ['GET', 'admin/reports/v1/activity/users/all/applications/admin'],
      ['GET', 'admin/reports/v1/usage/dates/2026-01-01'],
      ['POST', 'admin/datatransfer/v1/transfers'],
      ['GET', 'apps/licensing/v1/product/Google-Apps/users'],
      ['PUT', 'gmail/v1/users/me/settings/vacation'],
      ['POST', 'gmail/v1/users/me/settings/delegates'],
      ['GET', 'calendar/v3/calendars/primary/events'],
      ['GET', 'drive/v3/files'],
    ];
    for (const [method, path] of paths) {
      const { scopes, fellBack } = googleScopesForPath(method, path);
      expect(fellBack).toBe(false);
      for (const s of scopes) expect(advertised.has(s)).toBe(true);
    }
  });
});

describe('relay enforcement scopes are advertised', () => {
  it('every scope the relay map can mint is in the delegation list', async () => {
    // The relay narrows reads to readonly tokens. Google refuses a readonly
    // variant a tenant never authorised, so each one must be advertised at setup.
    const { selectScopes } = await import('../services/relay/scopes.js');
    const advertised = new Set(DELEGATION_SCOPES);
    for (const resource of ['admin.directory.users', 'admin.directory.groups', 'admin.directory.orgunits', 'admin.directory.domains']) {
      for (const cls of ['read', 'write'] as const) {
        const scopes = selectScopes(resource, cls);
        expect(scopes.length).toBeGreaterThan(0);
        for (const s of scopes) expect(advertised.has(s)).toBe(true);
      }
    }
  });
});

describe('per-call minting', () => {
  it('strips the leading slash and the version segment', () => {
    expect(normaliseGooglePath('/admin/directory/v1/users/x')).toBe('admin/directory/users/x');
    expect(normaliseGooglePath('calendar/v3/calendars')).toBe('calendar/calendars');
    expect(normaliseGooglePath('drive/v3/files')).toBe('drive/files');
  });

  it('a directory read mints the user scope only (no readonly variant: DWD would refuse it)', () => {
    expect(googleScopesForPath('GET', 'admin/directory/v1/users')).toEqual({
      scopes: [`${G}admin.directory.user`],
      fellBack: false,
    });
  });

  it('a directory write mints the user scope only, never the whole contract', () => {
    const { scopes } = googleScopesForPath('PUT', 'admin/directory/v1/users/a%40b.example');
    expect(scopes).toEqual([`${G}admin.directory.user`]);
    expect(scopes.length).toBeLessThan(REQUIRED_SCOPES.length);
  });

  it('security sub-resources mint user.security (tokens, signOut)', () => {
    expect(googleScopesForPath('GET', 'admin/directory/v1/users/a/tokens').scopes).toEqual([`${G}admin.directory.user.security`]);
    expect(googleScopesForPath('POST', 'admin/directory/v1/users/a/signOut').scopes).toEqual([`${G}admin.directory.user.security`]);
  });

  it('schemas mint userschema and nothing else (the August 2026 breakage, contained)', () => {
    const r = googleScopesForPath('POST', 'admin/directory/v1/customer/my_customer/schemas');
    expect(r).toEqual({ scopes: [`${G}admin.directory.userschema`], fellBack: false });
    expect(REQUIRED_SCOPES).not.toContain(`${G}admin.directory.userschema`);
    // A users call in the same tenant does not carry it.
    expect(googleScopesForPath('GET', 'admin/directory/v1/users').scopes).not.toContain(`${G}admin.directory.userschema`);
  });

  it('group member calls mint the member scope; group calls the group scope', () => {
    expect(googleScopesForPath('POST', 'admin/directory/v1/groups/g/members').scopes).toEqual([`${G}admin.directory.group.member`]);
    expect(googleScopesForPath('PATCH', 'admin/directory/v1/groups/g').scopes).toEqual([`${G}admin.directory.group`]);
  });

  it('gmail sharing settings add the sharing scope; other settings do not', () => {
    expect(googleScopesForPath('POST', 'gmail/v1/users/me/settings/delegates').scopes).toEqual([`${G}gmail.settings.basic`, `${G}gmail.settings.sharing`]);
    expect(googleScopesForPath('PUT', 'gmail/v1/users/me/settings/vacation').scopes).toEqual([`${G}gmail.settings.basic`]);
  });

  it('calendar resources mint only the resource scope: readonly for reads, full for writes', () => {
    // Before 2026-09-11 this path fell back to the contract, whose `calendar`
    // scope Google does not accept for resources.calendars.list
    // (403 ACCESS_TOKEN_SCOPE_INSUFFICIENT on every tenant, verified live).
    const read = `${G}admin.directory.resource.calendar.readonly`;
    const write = `${G}admin.directory.resource.calendar`;
    const P = 'admin/directory/v1/customer/my_customer/resources';
    expect(googleScopesForPath('GET', `${P}/calendars`)).toEqual({ scopes: [read], fellBack: false });
    expect(googleScopesForPath('GET', `/${P}/calendars/room-1`)).toEqual({ scopes: [read], fellBack: false });
    expect(googleScopesForPath('GET', `${P}/buildings`).scopes).toEqual([read]);
    expect(googleScopesForPath('GET', `${P}/features`).scopes).toEqual([read]);
    expect(googleScopesForPath('POST', `${P}/calendars`).scopes).toEqual([write]);
    expect(googleScopesForPath('PATCH', `${P}/calendars/room-1`).scopes).toEqual([write]);
    expect(googleScopesForPath('DELETE', `${P}/buildings/b1`).scopes).toEqual([write]);
    // Optional, never contract: a tenant that has not authorised them loses
    // only this feature.
    expect(OPTIONAL_SCOPE_DETAILS.map((s) => s.scope)).toEqual(expect.arrayContaining([read, write]));
    expect(REQUIRED_SCOPES).not.toContain(read);
    expect(REQUIRED_SCOPES).not.toContain(write);
    // Sibling customer paths are not captured by the new rule.
    expect(googleScopesForPath('GET', 'admin/directory/v1/customer/my_customer/orgunits').scopes).toEqual([`${G}admin.directory.orgunit`]);
    expect(googleScopesForPath('GET', 'admin/directory/v1/users').scopes).not.toContain(read);
  });

  it('an unknown path falls back to the frozen contract and says so', () => {
    const r = googleScopesForPath('GET', 'chat/v1/spaces');
    expect(googleScopesForPath('GET', 'admin/directory/v1/customers/my_customer').fellBack).toBe(true);
    expect(r.fellBack).toBe(true);
    expect(r.scopes).toBe(REQUIRED_SCOPES);
  });
});

describe('Admin SDK client scopes come from this module', () => {
  it('each service client keeps exactly the set it used to hard-code', () => {
    expect(ADMIN_SDK_CLIENT_SCOPES.workspace).toEqual([
      `${G}admin.directory.user`,
      `${G}admin.directory.group`,
      `${G}admin.directory.orgunit`,
      `${G}admin.directory.domain`,
      `${G}admin.reports.audit.readonly`,
    ]);
    expect(ADMIN_SDK_CLIENT_SCOPES.onboarding).toEqual([
      `${G}admin.directory.user`,
      `${G}admin.directory.group`,
      `${G}admin.directory.orgunit`,
    ]);
    expect(ADMIN_SDK_CLIENT_SCOPES.offboarding).toEqual([
      `${G}admin.directory.user`,
      `${G}admin.directory.user.security`,
      `${G}admin.directory.group`,
      `${G}admin.directory.device.mobile`,
    ]);
  });

  it('default clients carry contract scopes only (an optional one would fail every call on some tenants)', () => {
    for (const scopes of Object.values(ADMIN_SDK_CLIENT_SCOPES)) {
      for (const s of scopes) expect(REQUIRED_SCOPES).toContain(s);
    }
  });

  it('a client declared with an unmapped path throws rather than widening to the contract', () => {
    expect(() => googleScopesForPaths('GET', ['admin/directory/v1/users', 'chat/v1/spaces'])).toThrow(/no PATH_SCOPES rule/);
  });
});
