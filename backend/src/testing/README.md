# Google API Record / Replay harness

Deterministic, offline tests for anything that goes through the transparent
proxy (`middleware/transparent-proxy.ts`) — the single choke point for every
Google Workspace API call Helios makes (directory, Gmail, Calendar, Drive,
Data Transfer, licensing).

The live test tenant (gridworx.io) is Cloud Identity Free, so Gmail / Calendar /
paid‑licensing calls **cannot** be live‑verified. Record a real response once
(against any capable tenant), commit the sanitized fixture, and every other
agent replays it with no network and no credentials.

- Harness: `backend/src/testing/google-replay.ts`
- Fixtures: `backend/src/__tests__/fixtures/google/<family>/<name>.json`
- Worked example: `backend/src/__tests__/google-replay.test.ts`
  (replays `admin.directory/users.list` and asserts the proxy parses it)

---

## How it hooks in (the seam)

The proxy makes exactly two outbound calls per request: the OAuth **token
exchange**, then the **Google API call**. Both go through `googleHttp` — a thin,
axios‑compatible shim — instead of raw `axios`:

```ts
// transparent-proxy.ts
const tokenResponse = await googleHttp.post('https://oauth2.googleapis.com/token', { … });
const response      = await googleHttp(requestConfig);
```

Three modes, chosen at call time:

| Mode | When | Behavior |
|------|------|----------|
| **off** | production, and any test that doesn't opt in | straight passthrough to `axios` — **zero** behavior change |
| **replay** | a test calls `useGoogleReplay(...)` | API call served from a fixture; token returns a synthetic value; **no network** |
| **record** | env `HELIOS_GOOGLE_RECORD=1` | hits real Google, writes a sanitized fixture, returns the real response |

Match key is `{ method, host, path }`. The token endpoint is always
special‑cased, so a directory fixture never also needs a token fixture.

---

## Replaying in a test

Mock the same externals the proxy needs (DB, auth, credentials, feature flags,
`jwt.sign`) but **do not mock `axios`** — activate replay instead.

```ts
const { loadGoogleFixture, useGoogleReplay, resetGoogleReplay } =
  await import('../testing/google-replay.js');

afterEach(() => resetGoogleReplay());

it('replays users.list', async () => {
  const fx = loadGoogleFixture('admin.directory', 'users.list');
  useGoogleReplay(fx);                       // or: useGoogleReplay({ family, name })

  const res = await request(app)
    .get('/api/google/admin/directory/v1/users')
    .expect(200);

  expect(res.body).toEqual(fx.response.data);
});
```

Required mocks for the proxy path (see `google-replay.test.ts` for the full
set): `jsonwebtoken` (`sign → 'signed-jwt'`, because the test private key is
fake), `feature-flags.service` (`isEnabled → false` to exercise the flag‑off
passthrough, or `true` to exercise enforcement), the `db` connection, `auth`,
and `gw-credentials`.

A request with **no** matching fixture throws loudly (`no fixture for …`) rather
than silently reaching the network, so a missing recording fails the test.

Load several at once — pass an array of fixtures or `{ family, name }`
descriptors to `useGoogleReplay`.

---

## Recording a new fixture

Run the recording against a tenant where the API actually works:

```bash
HELIOS_GOOGLE_RECORD=1 npm test -- <your.test.ts>
```

In record mode the harness calls real Google, then writes
`<family>/<name>.json` (sanitized). For canonical Google method names, register
the target before the call:

```ts
recordGoogleAs(
  { method: 'GET', host: 'gmail.googleapis.com', path: 'gmail/v1/users/me/settings/forwarding' },
  { family: 'gmail', name: 'settings.forwarding.get' },
);
```

Without an override the name is auto‑derived (`deriveFixtureName`):
`GET admin/directory/v1/users → admin.directory / users.list`,
`GET …/users/x@e.com → users.get`, `POST …/groups → groups.post`.

**Always review a recorded fixture before committing.** Sanitization strips
Authorization headers and secret‑keyed fields (`access_token`, `id_token`,
`refresh_token`, `private_key`, `client_secret`, `assertion`, `password`) and
maps every real email to a stable `userN@example.com` alias — but it does not
know your tenant's every PII shape (display names, phone numbers, custom
schema). Scrub anything else by hand.

---

## Fixture format

```jsonc
{
  "family": "admin.directory",     // sub-directory
  "name": "users.list",            // file name (…/users.list.json)
  "recordedAt": "2026-08-25T…Z",
  "request": {
    "method": "GET",
    "host": "admin.googleapis.com",// part of the match key
    "path": "admin/directory/v1/users", // no leading slash; part of the key
    "query": { "domain": "example.com" },// stored for fidelity; NOT part of the key
    "body": null
  },
  "response": { "status": 200, "data": { /* sanitized Google body */ }, "headers": {} }
}
```

---

## API reference (`testing/google-replay.ts`)

| Export | Purpose |
|--------|---------|
| `loadGoogleFixture(family, name)` | read one fixture from disk |
| `loadGoogleFixtureFamily(family)` | read every `*.json` under a family |
| `useGoogleReplay(fixtures)` | activate replay with one/many fixtures or `{family,name}` descriptors |
| `resetGoogleReplay()` | deactivate + clear (call in `afterEach`) |
| `recordGoogleAs(match, target)` | name a recording explicitly (record mode) |
| `deriveFixtureName(method, path)` | the auto‑naming rule (also unit‑tested) |
| `isRecordMode()` | `true` when `HELIOS_GOOGLE_RECORD=1` |
| `fixturesRoot()` | absolute fixtures dir (override with `HELIOS_GOOGLE_FIXTURES_DIR`) |
| `googleHttp` | the axios‑compatible seam the proxy uses (you won't call this directly) |

---

## Rules

- The harness is **inert unless opted in**. Never assume it's active from
  `NODE_ENV` alone — tests that mock `axios` themselves keep working untouched.
- Replay never touches the network. If you see a real request in a replay test,
  a fixture is missing — it will have thrown.
- Fixtures are committed test data: keep them **sanitized** and small.
