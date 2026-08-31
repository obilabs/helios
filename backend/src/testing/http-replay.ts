/**
 * Provider-agnostic record / replay harness for outbound API calls.
 * =====================================================================
 *
 * Helios routes every outbound call to a cloud provider (Google Workspace,
 * Microsoft Graph, …) through a transparent proxy. Each proxied request makes
 * a small, fixed number of outbound HTTP calls:
 *
 *   1. a token exchange (mint an access token), and
 *   2. the actual provider API call.
 *
 * `createHttpReplay(config)` builds ONE self-contained seam for a provider. The
 * returned `http` is an axios-compatible callable the proxy uses in place of the
 * raw `axios` for those calls. It has THREE modes, selected at call time:
 *
 *   - OFF (default, production + any test that doesn't opt in):
 *       `http` delegates straight to the real `axios`. Byte-for-byte the same
 *       behavior the proxy had before the seam existed. Nothing is intercepted.
 *
 *   - REPLAY (a test opts in via `useReplay`):
 *       the API call is served from a recorded JSON fixture WITHOUT touching the
 *       network, and the token exchange returns a synthetic token (also no
 *       network). A request with no matching fixture throws loudly so tests fail
 *       deterministically instead of silently reaching the provider.
 *
 *   - RECORD (env `config.recordEnvVar=1`):
 *       the call hits the real provider, and the sanitized request+response pair
 *       is written to `src/__tests__/fixtures/<fixturesDirName>/<family>/<name>.json`.
 *       Use this against a live tenant to capture a fixture, then commit the
 *       sanitized file so everyone else can REPLAY it offline.
 *
 * The match key is `{ method, host, path }` (see `fixtureKey`) — the query
 * string and body are stored for fidelity but are not part of the key, so a
 * single fixture answers a call regardless of pagination params.
 *
 * Each instance closes over its OWN `state` object; there is no shared module
 * singleton, so a Google instance and a Graph instance never see each other's
 * fixtures. Nothing here changes proxy behavior unless a test opts in or the
 * record env var is set: keep it that way.
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

/** The on-disk shape of a recorded request/response pair. */
export interface HttpFixture {
  /** API family, becomes the fixture sub-directory, e.g. "admin.directory". */
  family: string;
  /** Fixture name, becomes the file name, e.g. "users.list". */
  name: string;
  /** ISO timestamp the fixture was recorded (informational). */
  recordedAt?: string;
  request: {
    /** HTTP method, upper-case. */
    method: string;
    /** API host, e.g. "admin.googleapis.com" or "graph.microsoft.com". */
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
export interface MinimalResponse {
  status: number;
  data: any;
  headers: Record<string, string>;
}

export type HarnessMode = 'off' | 'replay' | 'record' | 'verify';

/** Config that specializes the generic harness core for one provider. */
export interface HttpReplayConfig {
  /** Short provider label used in log lines / error messages, e.g. "google". */
  namespace: string;
  /** Fixtures sub-directory under `src/__tests__/fixtures`, e.g. "google". */
  fixturesDirName: string;
  /** Env var (`=1`) that turns on RECORD mode for this provider. */
  recordEnvVar: string;
  /**
   * Optional env var (`=1`) that turns on VERIFY mode: hit the LIVE provider,
   * structurally diff the response against the committed fixture, and report
   * drift. Never overwrites the fixture; the live response is returned so the
   * app keeps working. This is the drift/canary check — a stale fixture that
   * still "passes" replay is the silent-failure mode this catches.
   */
  verifyEnvVar?: string;
  /** Optional env var that overrides the fixtures root directory. */
  fixturesDirEnvVar?: string;
  /** True for the provider's token endpoint (served synthetically in replay). */
  isTokenEndpoint: (host: string, path: string) => boolean;
  /** Derive `{ family, name }` for a request when no explicit name is set. */
  deriveName: (method: string, host: string, path: string) => {
    family: string;
    name: string;
  };
  /**
   * Build a per-record sanitizer closure. Called once per recorded fixture so
   * the same alias mapping applies across that fixture's query, body and
   * response. Defaults to email-aliasing + secret-key redaction.
   */
  createSanitizer?: () => (value: unknown) => unknown;
  /**
   * Sanitize / strip the response headers before they are persisted. Defaults
   * to identity (headers stored as received).
   */
  sanitizeHeaders?: (
    headers: Record<string, string> | undefined,
  ) => Record<string, string> | undefined;
}

/** Everything one provider instance exposes. */
export interface HttpReplayInstance {
  /** axios-compatible seam: `http(config)` and `http.post(url, data[, config])`. */
  http: ((config: any) => Promise<any>) & {
    post: (url: string, data?: any, config?: any) => Promise<any>;
  };
  /** Activate REPLAY with the given fixture(s). */
  useReplay: (
    fixtures:
      | HttpFixture
      | HttpFixture[]
      | { family: string; name: string }
      | Array<{ family: string; name: string }>,
  ) => void;
  /** Deactivate replay and clear all loaded fixtures / naming overrides. */
  resetReplay: () => void;
  /** RECORD-mode helper: pin the `{family,name}` a specific call records as. */
  recordAs: (
    match: { method: string; host: string; path: string },
    target: { family: string; name: string },
  ) => void;
  loadFixture: (family: string, name: string) => HttpFixture;
  loadFixtureFamily: (family: string) => HttpFixture[];
  fixturesRoot: () => string;
  isRecordMode: () => boolean;
  isVerifyMode: () => boolean;
  /** VERIFY-mode drift report: structural differences found between live responses and fixtures. */
  getDrift: () => Array<{ key: string; diffs: string[] }>;
  resetDrift: () => void;
  // ----- lower-level primitives (used by non-axios seams, e.g. fetch/SDK) -----
  deriveName: HttpReplayConfig['deriveName'];
  isTokenEndpoint: HttpReplayConfig['isTokenEndpoint'];
  currentMode: () => HarnessMode;
  splitUrl: (url: string) => { host: string; path: string };
  /** REPLAY lookup — returns the fixture response or throws loudly on a miss. */
  replayLookup: (method: string, host: string, path: string) => MinimalResponse;
  /** Persist a sanitized fixture for a completed call. Returns the file path. */
  record: (entry: {
    method: string;
    host: string;
    path: string;
    query?: Record<string, unknown> | null;
    body?: unknown;
    response: MinimalResponse;
  }) => string;
}

// ---------------------------------------------------------------------------
// Shared, provider-independent sanitization helpers
// ---------------------------------------------------------------------------

/** Object keys whose values are secrets and must never be persisted. */
export const SECRET_KEYS = new Set(
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
export function makeEmailAliaser(): (s: string) => string {
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
export function sanitize(
  value: unknown,
  aliasEmail: (s: string) => string,
): unknown {
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
// Shared path helpers
// ---------------------------------------------------------------------------

/** Strip a leading slash (or several) from a path. */
export function stripLeadingSlash(path: string): string {
  return String(path || '').replace(/^\/+/, '');
}

/** Heuristic: does a URL segment look like an id (email / numeric / long)? */
export function looksLikeId(segment: string): boolean {
  const s = decodeURIComponent(segment);
  return s.includes('@') || /^\d+$/.test(s) || s.length > 25;
}

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------

/**
 * Structural diff between a live response and a committed fixture — reports
 * missing keys, new keys, and type mismatches, IGNORING values (values change
 * legitimately; shape/type drift is what silently breaks replay). Used by VERIFY
 * mode as the drift/canary check. Returns [] when the shapes match.
 */
export function diffShape(live: unknown, fixture: unknown, path = ''): string[] {
  const t = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  const tl = t(live);
  const tf = t(fixture);
  if (tl !== tf) return [`${path || '(root)'}: type ${tf} -> ${tl}`];
  if (tl === 'object') {
    const out: string[] = [];
    const kl = new Set(Object.keys(live as object));
    const kf = new Set(Object.keys(fixture as object));
    const p = (k: string) => `${path}${path ? '.' : ''}${k}`;
    for (const k of kf) if (!kl.has(k)) out.push(`${p(k)}: removed by API`);
    for (const k of kl) if (!kf.has(k)) out.push(`${p(k)}: new field in API`);
    for (const k of kf) if (kl.has(k)) out.push(...diffShape((live as any)[k], (fixture as any)[k], p(k)));
    return out;
  }
  if (tl === 'array') {
    const a = (live as unknown[])[0];
    const b = (fixture as unknown[])[0];
    if (a === undefined || b === undefined) return [];
    return diffShape(a, b, `${path}[]`);
  }
  return [];
}

export function createHttpReplay(config: HttpReplayConfig): HttpReplayInstance {
  // Per-instance state — NO shared module singleton.
  const state = {
    /** Loaded fixtures, keyed by `${METHOD} ${host}/${path}`. */
    replayMap: new Map<string, HttpFixture>(),
    /** Whether a test has opted into replay for the current run. */
    replayActive: false,
    /** Optional record-naming overrides, keyed the same way as replayMap. */
    recordNames: new Map<string, { family: string; name: string }>(),
    /** VERIFY-mode structural drift found between live responses and fixtures. */
    drift: [] as Array<{ key: string; diffs: string[] }>,
  };

  const buildSanitizer =
    config.createSanitizer ??
    (() => {
      const aliasEmail = makeEmailAliaser();
      return (v: unknown) => sanitize(v, aliasEmail);
    });

  const sanitizeHeaders =
    config.sanitizeHeaders ?? ((h: Record<string, string> | undefined) => h);

  // ----- fixture root -----

  function fixturesRoot(): string {
    return (
      (config.fixturesDirEnvVar && process.env[config.fixturesDirEnvVar]) ||
      resolve(THIS_DIR, '..', '__tests__', 'fixtures', config.fixturesDirName)
    );
  }

  // ----- mode -----

  function isRecordMode(): boolean {
    return process.env[config.recordEnvVar] === '1';
  }

  function isVerifyMode(): boolean {
    return !!config.verifyEnvVar && process.env[config.verifyEnvVar] === '1';
  }

  function currentMode(): HarnessMode {
    if (isRecordMode()) return 'record';
    if (isVerifyMode()) return 'verify';
    if (state.replayActive) return 'replay';
    return 'off';
  }

  // ----- keying -----

  function fixtureKey(method: string, host: string, path: string): string {
    return `${method.toUpperCase()} ${host}/${stripLeadingSlash(path)}`;
  }

  function keyForFixture(fx: HttpFixture): string {
    return fixtureKey(fx.request.method, fx.request.host, fx.request.path);
  }

  function splitUrl(url: string): { host: string; path: string } {
    const u = new URL(url);
    return { host: u.host, path: stripLeadingSlash(u.pathname) };
  }

  // ----- fixture IO -----

  function loadFixture(family: string, name: string): HttpFixture {
    const file = join(fixturesRoot(), family, `${name}.json`);
    if (!existsSync(file)) {
      throw new Error(`[${config.namespace}-replay] fixture not found: ${file}`);
    }
    return JSON.parse(readFileSync(file, 'utf8')) as HttpFixture;
  }

  function loadFixtureFamily(family: string): HttpFixture[] {
    const dir = join(fixturesRoot(), family);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as HttpFixture);
  }

  function writeFixture(fx: HttpFixture): string {
    const dir = join(fixturesRoot(), fx.family);
    const file = join(dir, `${fx.name}.json`);
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(fx, null, 2) + '\n', 'utf8');
    } catch (err) {
      // Record mode must never break the live request path. A read-only
      // fixtures directory (e.g. a production container where dist/ is not
      // writable) must degrade to serving the real response, not a 500.
      // eslint-disable-next-line no-console
      console.warn(
        `[${config.namespace}-replay] could not persist fixture ${file}: ${(err as Error).message}`,
      );
      return '';
    }
    return file;
  }

  // ----- test API -----

  function useReplay(
    fixtures:
      | HttpFixture
      | HttpFixture[]
      | { family: string; name: string }
      | Array<{ family: string; name: string }>,
  ): void {
    const list = Array.isArray(fixtures) ? fixtures : [fixtures];
    for (const item of list) {
      const fx =
        'request' in item
          ? (item as HttpFixture)
          : loadFixture(item.family, item.name);
      state.replayMap.set(keyForFixture(fx), fx);
    }
    state.replayActive = true;
  }

  function resetReplay(): void {
    state.replayMap.clear();
    state.recordNames.clear();
    state.replayActive = false;
  }

  function recordAs(
    match: { method: string; host: string; path: string },
    target: { family: string; name: string },
  ): void {
    state.recordNames.set(
      fixtureKey(match.method, match.host, match.path),
      target,
    );
  }

  // ----- record -----

  function record(entry: {
    method: string;
    host: string;
    path: string;
    query?: Record<string, unknown> | null;
    body?: unknown;
    response: MinimalResponse;
  }): string {
    const method = String(entry.method || 'GET').toUpperCase();
    const s = buildSanitizer();
    const key = fixtureKey(method, entry.host, entry.path);
    const target =
      state.recordNames.get(key) ??
      config.deriveName(method, entry.host, entry.path);

    const fx: HttpFixture = {
      family: target.family,
      name: target.name,
      recordedAt: new Date().toISOString(),
      request: {
        method,
        host: entry.host,
        path: entry.path,
        query: entry.query
          ? (s(entry.query) as Record<string, unknown>)
          : null,
        body: entry.body != null ? s(entry.body) : null,
      },
      response: {
        status: entry.response.status,
        data: s(entry.response.data),
        headers: sanitizeHeaders(entry.response.headers),
      },
    };
    const file = writeFixture(fx);
    if (file) {
      // eslint-disable-next-line no-console
      console.log(`[${config.namespace}-replay] recorded ${key} -> ${file}`);
    }
    return file;
  }

  // ----- replay lookup -----

  function replayLookup(
    method: string,
    host: string,
    path: string,
  ): MinimalResponse {
    const fx = state.replayMap.get(fixtureKey(method, host, path));
    if (!fx) {
      const known = [...state.replayMap.keys()];
      throw new Error(
        `[${config.namespace}-replay] no fixture for ${fixtureKey(method, host, path)}. ` +
          `Loaded fixtures: ${known.length ? known.join(', ') : '(none)'}. ` +
          `Record one with ${config.recordEnvVar}=1 or load it via useReplay().`,
      );
    }
    return {
      status: fx.response.status,
      data: fx.response.data,
      headers: fx.response.headers ?? {},
    };
  }

  // ----- the axios seam -----

  /** Synthetic access-token response used in replay (no network, not persisted). */
  function syntheticToken(): MinimalResponse {
    return {
      status: 200,
      data: { access_token: 'replay-access-token', expires_in: 3600 },
      headers: {},
    };
  }

  async function handleApiCall(
    cfg: any,
    mode: Exclude<HarnessMode, 'off'>,
    host: string,
    path: string,
  ): Promise<MinimalResponse | any> {
    const method = String(cfg.method || 'GET').toUpperCase();

    if (mode === 'replay') {
      return replayLookup(method, host, path);
    }

    if (mode === 'verify') {
      // Hit live, structurally diff against the committed fixture, report drift.
      // Never overwrites the fixture; returns the live response so nothing breaks.
      const real = (await axios(cfg)) as MinimalResponse;
      try {
        const key = fixtureKey(method, host, path);
        const target =
          state.recordNames.get(key) ?? config.deriveName(method, host, path);
        const file = join(fixturesRoot(), target.family, `${target.name}.json`);
        if (!existsSync(file)) {
          state.drift.push({ key, diffs: ['no committed fixture to verify against'] });
        } else {
          const fx = JSON.parse(readFileSync(file, 'utf8')) as HttpFixture;
          const liveSanitized = buildSanitizer()(real.data);
          const diffs = diffShape(liveSanitized, fx.response.data, '');
          if (diffs.length) {
            state.drift.push({ key, diffs });
            // eslint-disable-next-line no-console
            console.warn(
              `[${config.namespace}-replay] FIXTURE DRIFT ${key}:\n  ${diffs.join('\n  ')}`,
            );
          }
        }
      } catch {
        // verify must never break the live request path
      }
      return real;
    }

    // record: hit the real provider, persist the sanitized pair, return it.
    const real = (await axios(cfg)) as MinimalResponse;
    record({
      method,
      host,
      path,
      query: cfg.params ?? null,
      body: cfg.data ?? null,
      response: real,
    });
    return real;
  }

  const http = Object.assign(
    (cfg: any): Promise<any> => {
      const mode = currentMode();
      if (mode === 'off') return axios(cfg);
      const { host, path } = splitUrl(cfg.url);
      if (config.isTokenEndpoint(host, path)) {
        return mode === 'replay'
          ? Promise.resolve(syntheticToken())
          : axios(cfg);
      }
      return handleApiCall(cfg, mode, host, path);
    },
    {
      post: (url: string, data?: any, cfg: any = {}): Promise<any> => {
        const mode = currentMode();
        const { host, path } = splitUrl(url);
        if (config.isTokenEndpoint(host, path)) {
          return mode === 'replay'
            ? Promise.resolve(syntheticToken())
            : axios.post(url, data, cfg);
        }
        if (mode === 'off') return axios.post(url, data, cfg);
        return handleApiCall(
          { ...cfg, method: 'POST', url, data },
          mode,
          host,
          path,
        );
      },
    },
  );

  return {
    http,
    useReplay,
    resetReplay,
    recordAs,
    loadFixture,
    loadFixtureFamily,
    fixturesRoot,
    isRecordMode,
    isVerifyMode,
    getDrift: () => state.drift,
    resetDrift: () => {
      state.drift = [];
    },
    deriveName: config.deriveName,
    isTokenEndpoint: config.isTokenEndpoint,
    currentMode,
    splitUrl,
    replayLookup,
    record,
  };
}
