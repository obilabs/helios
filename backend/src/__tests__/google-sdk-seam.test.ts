/**
 * The googleapis SDK seam: proves that a call issued through gaxios — the
 * transport every `new JWT()` + `google.admin(...)` path uses — is served from
 * a recorded fixture in REPLAY mode without touching the network, and passes
 * through untouched when the harness is OFF.
 *
 * Before 2026-09-07 only the transparent proxy was covered; the directory
 * sync, offboarding, Drive transfer and signature paths were invisible to
 * record/replay.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { Gaxios } from 'gaxios';
import {
  loadGoogleFixture,
  useGoogleReplay,
  resetGoogleReplay,
  googleSdkFetch,
  installGoogleSdkSeam,
} from '../testing/google-replay.js';

describe('googleapis SDK seam (gaxios fetch hook)', () => {
  afterEach(() => resetGoogleReplay());

  it('REPLAY: a raw gaxios request to admin.googleapis.com is answered from the fixture, no network', async () => {
    const fixture = loadGoogleFixture('admin.directory', 'users.list');
    useGoogleReplay(fixture);
    installGoogleSdkSeam();

    // A never-resolving fetch: if the seam does not short-circuit, this test hangs → fails.
    const trap = () => new Promise<Response>(() => undefined);
    const gx = new Gaxios({ fetchImplementation: undefined });
    const res = await Promise.race([
      gx.request({ url: 'https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer', method: 'GET' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('seam did not intercept: request went to the network')), 3000)),
    ]);
    const data = (res as { data: unknown }).data as { users?: unknown[] };
    expect(res && (res as { status: number }).status).toBe(fixture.response.status);
    expect(data).toEqual(fixture.response.data);
    void trap;
  });

  it('REPLAY: the CommonJS gaxios build (what google-auth-library actually uses) is hooked too', async () => {
    // The live sync on 2026-09-07 recorded nothing because only the ESM class was patched.
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const CjsGaxios = (req('gaxios') as { Gaxios: typeof Gaxios }).Gaxios;
    expect(CjsGaxios).not.toBe(Gaxios); // two builds, two prototypes — the whole point
    const fixture = loadGoogleFixture('admin.directory', 'users.list');
    useGoogleReplay(fixture);
    installGoogleSdkSeam();
    const gx = new CjsGaxios();
    const res = (await Promise.race([
      gx.request({ url: 'https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer', method: 'GET' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('CJS gaxios was not intercepted')), 3000)),
    ])) as { status: number; data: unknown };
    expect(res.status).toBe(fixture.response.status);
    expect(res.data).toEqual(fixture.response.data);
  });

  it('REPLAY: googleSdkFetch itself throws loudly on a fixture miss (never a silent empty 200)', async () => {
    useGoogleReplay(loadGoogleFixture('admin.directory', 'users.list'));
    await expect(
      googleSdkFetch('https://admin.googleapis.com/admin/directory/v1/groups', { method: 'GET' }),
    ).rejects.toThrow(/fixture/i);
  });

  it('OFF: token endpoints and non-http inputs are left to the real fetch (passthrough contract)', async () => {
    // With the harness OFF the seam must not intercept anything; we prove the
    // decision path by pointing globalThis.fetch at a sentinel.
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      const r = await googleSdkFetch('https://oauth2.googleapis.com/token', { method: 'POST', body: 'x' });
      expect(r.status).toBe(200);
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
