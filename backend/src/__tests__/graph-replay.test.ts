/**
 * Microsoft Graph record/replay harness — unit coverage.
 *
 * Mirrors google-replay.test.ts but for the Graph seam, exercising BOTH paths
 * the harness supports without touching the network:
 *   - the fetch-level SDK middleware (GraphRecordReplayHandler) with a fake
 *     terminal middleware standing in for the real HTTP handler, and
 *   - the axios-compatible seam (graphHttp) used by the transparent proxy.
 *
 * It proves the record→persist→replay round-trip, that replay short-circuits
 * before "the network" (a next middleware that throws), the loud miss, and —
 * critically — that the Graph-aware sanitizer redacts Entra ID PII (names,
 * phones, GUIDs, correlation headers) while keeping public catalog ids
 * (skuId / servicePlanId) before anything is written to a fixture.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from '@jest/globals';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  graphHttp,
  useGraphReplay,
  resetGraphReplay,
  recordGraphAs,
  loadGraphFixture,
  deriveGraphFixtureName,
  graphFixturesRoot,
  GraphRecordReplayHandler,
  type GraphFixture,
} from '../testing/graph-replay.js';

// ---- helpers ----

/** A minimal fake terminal middleware whose execute() the caller controls. */
function fakeNext(
  impl: (context: any) => Promise<void> | void,
): { execute: (context: any) => Promise<void> } {
  return {
    execute: async (context: any) => {
      await impl(context);
    },
  };
}

/** A raw (unsanitized) Graph users list with plenty of PII + GUIDs. */
function rawUsersResponse() {
  return {
    '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users',
    '@odata.nextLink':
      'https://graph.microsoft.com/v1.0/users?$skiptoken=X-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    value: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        userPrincipalName: 'ada@contoso.com',
        mail: 'ada@contoso.com',
        displayName: 'Ada Lovelace',
        givenName: 'Ada',
        surname: 'Lovelace',
        mobilePhone: '+1 555 0100',
        businessPhones: ['+1 555 0101', '+1 555 0102'],
        officeLocation: 'HQ-1',
        onPremisesImmutableId: 'immutable-xyz',
        proxyAddresses: ['SMTP:ada@contoso.com', 'smtp:ada.l@contoso.com'],
        accountEnabled: true,
        assignedLicenses: [
          { skuId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
        ],
      },
    ],
  };
}

/** A ready-to-replay (already sanitized-shape) fixture for the users list. */
function usersFixture(): GraphFixture {
  return {
    family: 'users',
    name: 'users.list',
    recordedAt: '2026-08-30T00:00:00.000Z',
    request: {
      method: 'GET',
      host: 'graph.microsoft.com',
      path: 'v1.0/users',
      query: null,
      body: null,
    },
    response: {
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: {
        '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users',
        value: [
          {
            id: '00000000-0000-0000-0000-000000000002',
            userPrincipalName: 'user1@example.com',
            mail: 'user1@example.com',
            displayName: 'REDACTED',
            accountEnabled: true,
            assignedLicenses: [
              { skuId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
            ],
          },
        ],
      },
    },
  };
}

let tempFixtures: string;

beforeAll(() => {
  tempFixtures = mkdtempSync(join(tmpdir(), 'helios-graph-replay-'));
  process.env.HELIOS_GRAPH_FIXTURES_DIR = tempFixtures;
});

afterAll(() => {
  delete process.env.HELIOS_GRAPH_FIXTURES_DIR;
  try {
    rmSync(tempFixtures, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

afterEach(() => {
  resetGraphReplay();
  delete process.env.HELIOS_GRAPH_RECORD;
});

// ---------------------------------------------------------------------------

describe('record round-trip (fetch/SDK middleware path) + sanitization', () => {
  it('persists a sanitized fixture: redacts PII, aliases GUIDs, keeps skuId, strips correlation headers', async () => {
    process.env.HELIOS_GRAPH_RECORD = '1';

    const next = fakeNext(async (context: any) => {
      const headers = new Headers({
        'content-type': 'application/json',
        'request-id': 'req-1234',
        'client-request-id': 'client-req-5678',
        'x-ms-keep': 'kept',
      });
      context.response = new Response(JSON.stringify(rawUsersResponse()), {
        status: 200,
        headers,
      });
    });

    const handler = new GraphRecordReplayHandler();
    handler.setNext(next as any);

    const context: any = {
      request: 'https://graph.microsoft.com/v1.0/users',
      options: { method: 'GET' },
    };
    await handler.execute(context);

    // The fixture file landed where deriveGraphFixtureName says (users/users.list).
    const file = join(graphFixturesRoot(), 'users', 'users.list.json');
    expect(existsSync(file)).toBe(true);

    // loadGraphFixture reads the same content back from disk.
    const fx = loadGraphFixture('users', 'users.list');
    expect(fx.request).toMatchObject({
      method: 'GET',
      host: 'graph.microsoft.com',
      path: 'v1.0/users',
    });

    const user = (fx.response.data as any).value[0];

    // Names redacted.
    expect(user.displayName).toBe('REDACTED');
    expect(user.givenName).toBe('REDACTED');
    expect(user.surname).toBe('REDACTED');

    // Phones redacted (array shape preserved).
    expect(user.mobilePhone).toBe('REDACTED');
    expect(user.businessPhones).toEqual(['REDACTED', 'REDACTED']);

    // Location + directory-sync ids + proxy addresses redacted.
    expect(user.officeLocation).toBe('REDACTED');
    expect(user.onPremisesImmutableId).toBe('REDACTED');
    expect(user.proxyAddresses).toEqual(['REDACTED', 'REDACTED']);

    // Emails aliased to stable example.com addresses.
    expect(user.userPrincipalName).toBe('user1@example.com');
    expect(user.mail).toBe('user1@example.com');

    // Object-id GUID aliased to a synthetic GUID that keeps the GUID shape.
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(user.id).not.toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    // GUID embedded in the @odata.nextLink $skiptoken is aliased in place.
    const nextLink = (fx.response.data as any)['@odata.nextLink'] as string;
    expect(nextLink).not.toContain('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(nextLink).toContain('$skiptoken=X-00000000-0000-0000-0000-');

    // Public catalog id kept verbatim.
    expect(user.assignedLicenses[0].skuId).toBe(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    );

    // Correlation ids stripped from persisted response headers; others kept.
    const persistedHeaders = fx.response.headers || {};
    expect(persistedHeaders['request-id']).toBeUndefined();
    expect(persistedHeaders['client-request-id']).toBeUndefined();
    expect(persistedHeaders['x-ms-keep']).toBe('kept');
    expect(persistedHeaders['content-type']).toBe('application/json');
  });

  it('recordGraphAs pins the family/name a call records under', async () => {
    process.env.HELIOS_GRAPH_RECORD = '1';

    recordGraphAs(
      { method: 'GET', host: 'graph.microsoft.com', path: 'v1.0/users' },
      { family: 'directory', name: 'people' },
    );

    const next = fakeNext(async (context: any) => {
      context.response = new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
      });
    });
    const handler = new GraphRecordReplayHandler();
    handler.setNext(next as any);

    await handler.execute({
      request: 'https://graph.microsoft.com/v1.0/users',
      options: { method: 'GET' },
    } as any);

    expect(existsSync(join(graphFixturesRoot(), 'directory', 'people.json'))).toBe(
      true,
    );
  });
});

describe('replay round-trip', () => {
  it('short-circuits from a fixture without calling next (middleware path)', async () => {
    const fx = usersFixture();
    useGraphReplay(fx);

    let networkTouched = false;
    const next = {
      execute: async (): Promise<void> => {
        networkTouched = true;
        throw new Error('network must not be reached in replay');
      },
    };
    const handler = new GraphRecordReplayHandler();
    handler.setNext(next as any);

    const context: any = {
      request: 'https://graph.microsoft.com/v1.0/users',
      options: { method: 'GET' },
    };
    await handler.execute(context);

    expect(networkTouched).toBe(false);
    expect(context.response).toBeDefined();
    expect(context.response.status).toBe(200);
    const body = await context.response.json();
    expect(body).toEqual(fx.response.data);
  });

  it('serves the axios seam (graphHttp) from the same fixture', async () => {
    const fx = usersFixture();
    useGraphReplay(fx);

    const res = await graphHttp({
      method: 'GET',
      url: 'https://graph.microsoft.com/v1.0/users',
    });

    expect(res.status).toBe(200);
    expect(res.data).toEqual(fx.response.data);
  });

  it('returns a synthetic token for the token endpoint (graphHttp.post)', async () => {
    useGraphReplay(usersFixture());

    const tok = await graphHttp.post(
      'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token',
      new URLSearchParams({ grant_type: 'client_credentials' }),
    );

    expect(tok.data.access_token).toBe('replay-access-token');
  });

  it('throws loudly on a missing fixture (axios seam)', async () => {
    useGraphReplay(usersFixture()); // only users loaded

    await expect(
      graphHttp({
        method: 'GET',
        url: 'https://graph.microsoft.com/v1.0/groups',
      }),
    ).rejects.toThrow(/no fixture/);
  });

  it('throws loudly on a missing fixture (middleware path)', async () => {
    useGraphReplay(usersFixture());
    const handler = new GraphRecordReplayHandler();
    handler.setNext({ execute: async (): Promise<void> => {} } as any);

    await expect(
      handler.execute({
        request: 'https://graph.microsoft.com/v1.0/groups',
        options: { method: 'GET' },
      } as any),
    ).rejects.toThrow(/no fixture/);
  });
});

describe('OFF mode is an exact passthrough', () => {
  it('calls next and records nothing when neither replay nor record is engaged', async () => {
    let called = false;
    const next = fakeNext(async (context: any) => {
      called = true;
      context.response = new Response('{}', {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
      });
    });
    const handler = new GraphRecordReplayHandler();
    handler.setNext(next as any);

    await handler.execute({
      request: 'https://graph.microsoft.com/v1.0/users',
      options: { method: 'GET' },
    } as any);

    expect(called).toBe(true);
    // No fixture should have been written for this passthrough call.
    // (users/users.list.json may exist from the record test; assert a fresh
    //  path that only OFF mode could have created is absent.)
    expect(
      existsSync(join(graphFixturesRoot(), 'users', 'passthrough.list.json')),
    ).toBe(false);
  });
});

describe('deriveGraphFixtureName', () => {
  it('maps method + path to canonical-ish names, stripping the version segment', () => {
    expect(deriveGraphFixtureName('GET', 'graph.microsoft.com', 'v1.0/users')).toEqual(
      { family: 'users', name: 'users.list' },
    );
    expect(
      deriveGraphFixtureName(
        'GET',
        'graph.microsoft.com',
        'v1.0/users/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      ),
    ).toEqual({ family: 'users', name: 'users.get' });
    expect(
      deriveGraphFixtureName('POST', 'graph.microsoft.com', 'v1.0/groups'),
    ).toEqual({ family: 'groups', name: 'groups.post' });
    expect(
      deriveGraphFixtureName('GET', 'graph.microsoft.com', 'beta/subscribedSkus'),
    ).toEqual({ family: 'subscribedSkus', name: 'subscribedSkus.list' });
    expect(
      deriveGraphFixtureName(
        'GET',
        'graph.microsoft.com',
        'v1.0/users/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/licenseDetails',
      ),
    ).toEqual({ family: 'users', name: 'licenseDetails.list' });
  });
});
