/**
 * Record / Replay harness for outbound Google API calls.
 * =====================================================================
 *
 * The transparent proxy (middleware/transparent-proxy.ts) is the single choke
 * point through which every Google Workspace API call leaves Helios. It makes
 * exactly two outbound HTTP calls per proxied request:
 *
 *   1. POST https://oauth2.googleapis.com/token   (mint an access token)
 *   2. <METHOD> https://<host>/<path>             (the actual Google API call)
 *
 * This module is a thin, axios-compatible seam — `googleHttp` — that the proxy
 * uses in place of the raw `axios` for those two calls. It has THREE modes,
 * selected at call time:
 *
 *   - OFF (default, production + any test that doesn't opt in):
 *       `googleHttp` delegates straight to the real `axios`. Byte-for-byte the
 *       same behavior the proxy had before this seam existed. No fixtures are
 *       read or written, nothing is intercepted.
 *
 *   - REPLAY (the default inside a test that opts in via `useGoogleReplay`):
 *       the Google API call is served from a recorded JSON fixture WITHOUT
 *       touching the network, and the token exchange returns a synthetic token
 *       (also no network). A request with no matching fixture throws loudly so
 *       tests fail deterministically instead of silently reaching Google.
 *
 *   - RECORD (env `HELIOS_GOOGLE_RECORD=1`):
 *       the call hits real Google, and the sanitized request+response pair is
 *       written to `src/__tests__/fixtures/google/<family>/<name>.json`
 *       (tokens stripped, real emails mapped to stable `userN@example.com`
 *       aliases). Use this against a live tenant to capture a fixture, then
 *       commit the sanitized file so everyone else can REPLAY it offline.
 *
 * The match key is `{ method, host, path }` (see `fixtureKey`) — the query
 * string and body are stored in the fixture for fidelity but are not part of
 * the key, so a single fixture answers a call regardless of pagination params.
 *
 * Nothing here changes proxy behavior unless a test opts in or the record env
 * var is set: keep it that way.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The on-disk shape of a recorded Google request/response pair. */
export interface GoogleFixture {
  /** API family, becomes the fixture sub-directory, e.g. "admin.directory". */
  family: string;
  /** Fixture name, becomes the file name, e.g. "users.list". */
  name: string;
  /** ISO timestamp the fixture was recorded (informational). */
  recordedAt?: string;
  request: {
    /** HTTP method, upper-case. */
    method: string;
    /** Google API host, e.g. "admin.googleapis.com". */
    host: string;
    /** Request path WITHOUT a leading slash, e.g. "admin/directory/v1/users". */
    path: string;
    /** Query params (sanitized). Stored for fidelity; not part of the key. */
    query?: Record<string, unknown> | null;
    /** Request body (sanitized). `null` for GET/DELETE. */
    body?: unknown;
  };
  response: {
    status: number;
    data: unknown;
    headers?: Record<string, string>;
  };
}

/** Minimal axios-response shape the proxy consumes. */
interface MinimalResponse {
  status: number;
  data: any;
  headers: Record<string, string>;
}

type HarnessMode = 'off' | 'replay' | 'record';

// ---------------------------------------------------------------------------
// Module state (test-scoped; toggled by useGoogleReplay / resetGoogleReplay)
// ---------------------------------------------------------------------------

interface HarnessState {
  /** Loaded fixtures, keyed by `${METHOD} ${host}/${path}`. */
  replayMap: Map<string, GoogleFixture>;
  /** Whether a test has opted into replay for the current run. */
  replayActive: boolean;
  /** Optional record-naming overrides, keyed the same way as replayMap. */
  recordNames: Map<string, { family: string; name: string }>;
}

const state: HarnessState = {
  replayMap: new Map(),
  replayActive: false,
  recordNames: new Map(),
};

// ---------------------------------------------------------------------------
// Fixture root resolution
// ---------------------------------------------------------------------------

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

/** Absolute path to `backend/src/__tests__/fixtures/google` (overridable). */
export function fixturesRoot(): string {
  return (
    process.env.HELIOS_GOOGLE_FIXTURES_DIR ||
    resolve(THIS_DIR, '..', '__tests__', 'fixtures', 'google')
  );
}

// ---------------------------------------------------------------------------
// Mode helpers
// ---------------------------------------------------------------------------

/** RECORD mode is on when the env var is explicitly set to "1". */
export function isRecordMode(): boolean {
  return process.env.HELIOS_GOOGLE_RECORD === '1';
}

/**
 * Effective mode for the harness right now. Record wins over replay (you cannot
 * both capture and serve). If neither is engaged, the seam is a passthrough.
 */
function currentMode(): HarnessMode {
  if (isRecordMode()) return 'record';
  if (state.replayActive) return 'replay';
  return 'off';
}

// ---------------------------------------------------------------------------
// Keying
// ---------------------------------------------------------------------------

/** Strip a leading slash (or several) from a path. */
function stripLeadingSlash(path: string): string {
  return String(path || '').replace(/^\/+/, '');
}

/** The `{method, host, path}` match key for a fixture lookup. */
function fixtureKey(method: string, host: string, path: string): string {
  return `${method.toUpperCase()} ${host}/${stripLeadingSlash(path)}`;
}

function keyForFixture(fx: GoogleFixture): string {
  return fixtureKey(fx.request.method, fx.request.host, fx.request.path);
}

/** Parse an outbound axios `url` into `{ host, path }`. */
function splitUrl(url: string): { host: string; path: string } {
  const u = new URL(url);
  return { host: u.host, path: stripLeadingSlash(u.pathname) };
}

/** True for the Google OAuth token endpoint (the token exchange). */
function isTokenEndpoint(host: string, path: string): boolean {
  return host === 'oauth2.googleapis.com' || path === 'token' || path.endsWith('/token');
}

// ---------------------------------------------------------------------------
// Sanitization (record mode)
// ---------------------------------------------------------------------------

/** Object keys whose values are secrets and must never be persisted. */
const SECRET_KEYS = new Set(
  [
    'authorization',
    'access_token',
    'id_token',
    'refresh_token',
    'private_key',
    'client_secret',
    'assertion',
    'password',
  ].map((k) => k.toLowerCase()),
);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Build a fresh email→alias mapper. Each distinct real email gets a stable
 * `userN@example.com` alias (first-seen order), so a given address maps to the
 * same alias everywhere in one sanitize pass.
 */
function makeEmailAliaser(): (s: string) => string {
  const map = new Map<string, string>();
  return (s: string) =>
    s.replace(EMAIL_RE, (email) => {
      const existing = map.get(email);
      if (existing) return existing;
      const alias = `user${map.size + 1}@example.com`;
      map.set(email, alias);
      return alias;
    });
}

/** Deep-clone `value`, aliasing emails and redacting secret-keyed fields. */
function sanitize(value: unknown, aliasEmail: (s: string) => string): unknown {
  if (typeof value === 'string') return aliasEmail(value);
  if (Array.isArray(value)) return value.map((v) => sanitize(v, aliasEmail));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k.toLowerCase())) {
        out[k] = 'REDACTED';
      } else {
        out[k] = sanitize(v, aliasEmail);
      }
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Fixture naming (record mode auto-derive)
// ---------------------------------------------------------------------------

function looksLikeId(segment: string): boolean {
  const s = decodeURIComponent(segment);
  return s.includes('@') || /^\d+$/.test(s) || s.length > 25;
}

/**
 * Derive a `{ family, name }` from a request when the caller did not register
 * an explicit name via `recordGoogleAs`. Examples:
 *   GET  admin/directory/v1/users            -> admin.directory / users.list
 *   GET  admin/directory/v1/users/x@e.com    -> admin.directory / users.get
 *   POST admin/directory/v1/groups           -> admin.directory / groups.post
 *   GET  gmail/v1/users/me/settings/forwarding -> gmail / settings.forwarding.list
 */
export function deriveFixtureName(
  method: string,
  path: string,
): { family: string; name: string } {
  const rawSegs = stripLeadingSlash(path).split('/').filter(Boolean);
  const segs = rawSegs.filter((s) => !/^v\d+$/.test(s));
  const familyDepth = segs[0] === 'admin' ? 2 : 1;
  const family = segs.slice(0, familyDepth).join('.') || 'google';

  const resourceSegs = segs.slice(familyDepth).filter((s) => !looksLikeId(s));
  const resource = (resourceSegs.length ? resourceSegs : segs.slice(familyDepth))
    .join('.') || segs[segs.length - 1] || 'root';

  const lastRaw = rawSegs[rawSegs.length - 1] || '';
  const verb =
    method.toUpperCase() === 'GET'
      ? looksLikeId(lastRaw)
        ? 'get'
        : 'list'
      : method.toLowerCase();

  return { family, name: `${resource}.${verb}` };
}

// ---------------------------------------------------------------------------
// Public test API
// ---------------------------------------------------------------------------

/** Load a fixture from `<fixturesRoot>/<family>/<name>.json`. */
export function loadGoogleFixture(family: string, name: string): GoogleFixture {
  const file = join(fixturesRoot(), family, `${name}.json`);
  if (!existsSync(file)) {
    throw new Error(`[google-replay] fixture not found: ${file}`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as GoogleFixture;
}

/** Load every `*.json` fixture under `<fixturesRoot>/<family>/`. */
export function loadGoogleFixtureFamily(family: string): GoogleFixture[] {
  const dir = join(fixturesRoot(), family);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as GoogleFixture);
}

/**
 * Activate REPLAY for the current test with the given fixture(s) loaded into
 * the match map. Accepts a single fixture, an array, or `{ family, name }`
 * descriptors that are loaded from disk. Call `resetGoogleReplay()` in an
 * `afterEach` to deactivate.
 */
export function useGoogleReplay(
  fixtures:
    | GoogleFixture
    | GoogleFixture[]
    | { family: string; name: string }
    | Array<{ family: string; name: string }>,
): void {
  const list = Array.isArray(fixtures) ? fixtures : [fixtures];
  for (const item of list) {
    const fx =
      'request' in item
        ? (item as GoogleFixture)
        : loadGoogleFixture(item.family, item.name);
    state.replayMap.set(keyForFixture(fx), fx);
  }
  state.replayActive = true;
}

/** Deactivate replay and clear all loaded fixtures / naming overrides. */
export function resetGoogleReplay(): void {
  state.replayMap.clear();
  state.recordNames.clear();
  state.replayActive = false;
}

/**
 * RECORD-mode helper: register the `{ family, name }` a specific upcoming call
 * should be written as, so recorded fixtures get canonical Google method names
 * (e.g. `users.list`) instead of the auto-derived guess. Keyed on
 * `{ method, host, path }`.
 */
export function recordGoogleAs(
  match: { method: string; host: string; path: string },
  target: { family: string; name: string },
): void {
  state.recordNames.set(
    fixtureKey(match.method, match.host, match.path),
    target,
  );
}

// ---------------------------------------------------------------------------
// Record-mode writer
// ---------------------------------------------------------------------------

function writeFixture(fx: GoogleFixture): string {
  const dir = join(fixturesRoot(), fx.family);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${fx.name}.json`);
  writeFileSync(file, JSON.stringify(fx, null, 2) + '\n', 'utf8');
  return file;
}

function recordFrom(
  config: any,
  host: string,
  path: string,
  response: MinimalResponse,
): void {
  const method = String(config.method || 'GET').toUpperCase();
  const aliasEmail = makeEmailAliaser();
  const key = fixtureKey(method, host, path);
  const target =
    state.recordNames.get(key) ?? deriveFixtureName(method, path);

  const fx: GoogleFixture = {
    family: target.family,
    name: target.name,
    recordedAt: new Date().toISOString(),
    request: {
      method,
      host,
      path,
      query: config.params
        ? (sanitize(config.params, aliasEmail) as Record<string, unknown>)
        : null,
      body: config.data != null ? sanitize(config.data, aliasEmail) : null,
    },
    response: {
      status: response.status,
      data: sanitize(response.data, aliasEmail),
      headers: response.headers,
    },
  };
  const file = writeFixture(fx);
  // eslint-disable-next-line no-console
  console.log(`[google-replay] recorded ${key} -> ${file}`);
}

// ---------------------------------------------------------------------------
// The seam: an axios-compatible callable with `.post`
// ---------------------------------------------------------------------------

/** Synthetic access-token response used in replay (no network, not persisted). */
function syntheticToken(): MinimalResponse {
  return {
    status: 200,
    data: { access_token: 'replay-access-token', expires_in: 3600 },
    headers: {},
  };
}

/**
 * REPLAY/RECORD handling for a NON-token Google API call. `mode` is guaranteed
 * to be 'replay' or 'record' here; the off-mode and token paths are handled at
 * the entry points below so that OFF is a byte-for-byte axios passthrough.
 */
async function handleApiCall(
  config: any,
  mode: Exclude<HarnessMode, 'off'>,
  host: string,
  path: string,
): Promise<MinimalResponse | any> {
  const method = String(config.method || 'GET').toUpperCase();

  if (mode === 'replay') {
    const fx = state.replayMap.get(fixtureKey(method, host, path));
    if (!fx) {
      const known = [...state.replayMap.keys()];
      throw new Error(
        `[google-replay] no fixture for ${fixtureKey(method, host, path)}. ` +
          `Loaded fixtures: ${known.length ? known.join(', ') : '(none)'}. ` +
          `Record one with HELIOS_GOOGLE_RECORD=1 or load it via useGoogleReplay().`,
      );
    }
    return {
      status: fx.response.status,
      data: fx.response.data,
      headers: fx.response.headers ?? {},
    };
  }

  // record: hit real Google, persist the sanitized pair, return the response.
  const real = (await axios(config)) as MinimalResponse;
  recordFrom(config, host, path, real);
  return real;
}

/**
 * Drop-in replacement for the `axios` the proxy uses for Google calls. Callable
 * as `googleHttp(config)` and via `googleHttp.post(url, body[, config])`.
 *
 * When the harness is OFF, each entry point delegates to the EXACT same axios
 * function it replaces (`axios(config)` / `axios.post(url, data)`), so behavior
 * — and any test that mocks axios — is unchanged. The token endpoint is always
 * special-cased so a single directory fixture doesn't also need a token fixture.
 */
export const googleHttp = Object.assign(
  (config: any): Promise<any> => {
    const mode = currentMode();
    if (mode === 'off') return axios(config);
    const { host, path } = splitUrl(config.url);
    if (isTokenEndpoint(host, path)) {
      return mode === 'replay' ? Promise.resolve(syntheticToken()) : axios(config);
    }
    return handleApiCall(config, mode, host, path);
  },
  {
    post: (url: string, data?: any, config: any = {}): Promise<any> => {
      const mode = currentMode();
      const { host, path } = splitUrl(url);
      if (isTokenEndpoint(host, path)) {
        return mode === 'replay'
          ? Promise.resolve(syntheticToken())
          : axios.post(url, data, config);
      }
      if (mode === 'off') return axios.post(url, data, config);
      return handleApiCall({ ...config, method: 'POST', url, data }, mode, host, path);
    },
  },
);

export default googleHttp;
