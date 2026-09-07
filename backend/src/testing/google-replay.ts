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
 * This module is a THIN ADAPTER over the provider-agnostic core in
 * `http-replay.ts`. It builds one `createHttpReplay` instance configured for
 * Google and re-exports the historical names (`googleHttp`, `useGoogleReplay`,
 * …) unchanged, so the proxy and the existing tests keep the exact same public
 * surface. See `http-replay.ts` for the OFF / REPLAY / RECORD mechanics.
 *
 * Google-specific config:
 *   - fixtures live under `src/__tests__/fixtures/google/<family>/<name>.json`
 *   - RECORD mode is engaged by `HELIOS_GOOGLE_RECORD=1`
 *   - the token endpoint is `oauth2.googleapis.com` (or any `/token` path)
 *   - fixture names auto-derive via `deriveFixtureName(method, path)`
 *   - sanitization aliases emails and redacts secret-keyed fields (the default)
 */
import {
  createHttpReplay,
  looksLikeId,
  stripLeadingSlash,
  type HttpFixture,
} from './http-replay.js';

/** The on-disk shape of a recorded Google request/response pair. */
export type GoogleFixture = HttpFixture;

// ---------------------------------------------------------------------------
// Fixture naming (record mode auto-derive) — Google-specific
// ---------------------------------------------------------------------------

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
  const resource =
    (resourceSegs.length ? resourceSegs : segs.slice(familyDepth)).join('.') ||
    segs[segs.length - 1] ||
    'root';

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
// The Google instance
// ---------------------------------------------------------------------------

const google = createHttpReplay({
  namespace: 'google',
  fixturesDirName: 'google',
  recordEnvVar: 'HELIOS_GOOGLE_RECORD',
  fixturesDirEnvVar: 'HELIOS_GOOGLE_FIXTURES_DIR',
  isTokenEndpoint: (host, path) =>
    host === 'oauth2.googleapis.com' ||
    path === 'token' ||
    path.endsWith('/token'),
  deriveName: (method, _host, path) => deriveFixtureName(method, path),
  // No sanitizer / header overrides: the default (email aliasing + secret-key
  // redaction, headers stored as received) is the historical Google behavior.
});

// ---------------------------------------------------------------------------
// Thin public adapters (unchanged names/signatures)
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for the `axios` the proxy uses for Google calls. Callable
 * as `googleHttp(config)` and via `googleHttp.post(url, body[, config])`.
 */
export const googleHttp = google.http;

/** Absolute path to `backend/src/__tests__/fixtures/google` (overridable). */
export function fixturesRoot(): string {
  return google.fixturesRoot();
}

/** RECORD mode is on when the env var is explicitly set to "1". */
export function isRecordMode(): boolean {
  return google.isRecordMode();
}

/** Load a fixture from `<fixturesRoot>/<family>/<name>.json`. */
export const loadGoogleFixture = google.loadFixture;

/** Load every `*.json` fixture under `<fixturesRoot>/<family>/`. */
export const loadGoogleFixtureFamily = google.loadFixtureFamily;

/**
 * Activate REPLAY for the current test with the given fixture(s) loaded into
 * the match map. Accepts a single fixture, an array, or `{ family, name }`
 * descriptors that are loaded from disk. Call `resetGoogleReplay()` in an
 * `afterEach` to deactivate.
 */
export const useGoogleReplay = google.useReplay;

/** Deactivate replay and clear all loaded fixtures / naming overrides. */
export const resetGoogleReplay = google.resetReplay;

/**
 * RECORD-mode helper: register the `{ family, name }` a specific upcoming call
 * should be written as, so recorded fixtures get canonical Google method names
 * (e.g. `users.list`) instead of the auto-derived guess. Keyed on
 * `{ method, host, path }`.
 */
export const recordGoogleAs = google.recordAs;

export default googleHttp;

// ---------------------------------------------------------------------------
// googleapis SDK seam (gaxios fetch hook) — added 2026-09-07
// ---------------------------------------------------------------------------
//
// Until now only the transparent proxy (axios via `googleHttp`) went through the
// harness. Every service that builds a `new JWT()` and calls `google.admin(...)`
// / `google.gmail(...)` / `google.drive(...)` — the directory sync, the
// offboarding orchestrator, Drive transfers, signatures — talked to Google
// through googleapis' own transport (gaxios) and was invisible to record/replay.
//
// gaxios resolves its fetch as `config.fetchImplementation || defaults.fetchImplementation
// || fetch`, and google-auth-library builds one Gaxios per auth client, so the
// only global hook is Gaxios.prototype.request itself. We wrap it ONCE: when the
// harness is OFF it is a pure passthrough; in RECORD/REPLAY it injects a fetch
// that consults the same `google` instance the proxy uses. Token exchanges
// (oauth2.googleapis.com) are never recorded and pass straight through.
import { Gaxios } from 'gaxios';

let sdkSeamInstalled = false;

function toUrlString(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  const anyIn = input as { url?: string } | null;
  return String(anyIn?.url ?? input);
}

function headersToRecord(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  try {
    if (typeof (h as Headers).forEach === 'function') {
      (h as Headers).forEach((v, k) => {
        out[k] = v;
      });
      return out;
    }
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) out[k] = String(v);
  } catch {
    /* best effort */
  }
  return out;
}

function parseBodyText(body: unknown): unknown {
  if (body == null) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  return body;
}

function queryOf(url: string): Record<string, unknown> | null {
  const u = new URL(url);
  if ([...u.searchParams.keys()].length === 0) return null;
  const q: Record<string, unknown> = {};
  u.searchParams.forEach((v, k) => {
    q[k] = v;
  });
  return q;
}

/**
 * A `fetch`-compatible function implementing OFF / REPLAY / RECORD for any
 * googleapis SDK call. Exported for tests; installed globally by
 * `installGoogleSdkSeam()`.
 */
export async function googleSdkFetch(input: unknown, init?: RequestInit): Promise<Response> {
  const realFetch = globalThis.fetch;
  const mode = google.currentMode();
  const url = toUrlString(input);
  if (mode === 'off' || !/^https?:/.test(url)) return realFetch(input as string, init);
  const { host, path } = google.splitUrl(url);
  if (google.isTokenEndpoint(host, path)) return realFetch(input as string, init);
  const method = String(init?.method || 'GET').toUpperCase();

  if (mode === 'replay') {
    const fx = google.replayLookup(method, host, path);
    const noBody = fx.status === 204 || fx.status === 304;
    const h = new Headers();
    for (const [k, v] of Object.entries(fx.headers || {})) h.set(k, String(v));
    if (!h.has('content-type')) h.set('content-type', 'application/json');
    return new Response(noBody ? null : JSON.stringify(fx.data ?? null), { status: fx.status, headers: h });
  }

  // RECORD: real call, then persist the sanitized pair.
  const res = await realFetch(input as string, init);
  let data: unknown = null;
  try {
    const text = await res.clone().text();
    data = text ? parseBodyText(text) : null;
  } catch {
    /* unreadable body — record null */
  }
  google.record({
    method,
    host,
    path,
    query: queryOf(url),
    body: parseBodyText(init?.body),
    response: { status: res.status, data, headers: headersToRecord(res.headers) },
  });
  return res;
}

/**
 * Wrap Gaxios.prototype.request so every googleapis SDK call goes through
 * `googleSdkFetch`. Idempotent. OFF mode adds one property assignment per call
 * and nothing else — production behaviour is unchanged.
 */
export function installGoogleSdkSeam(): void {
  if (sdkSeamInstalled) return;
  sdkSeamInstalled = true;
  const proto = Gaxios.prototype as unknown as {
    request: (opts?: Record<string, unknown>) => Promise<unknown>;
  };
  const original = proto.request;
  proto.request = function patchedRequest(this: unknown, opts: Record<string, unknown> = {}) {
    if (google.currentMode() !== 'off' && !opts.fetchImplementation) {
      opts = { ...opts, fetchImplementation: googleSdkFetch as unknown as typeof fetch };
    }
    return original.call(this, opts);
  };
}

// Install on import: this module is loaded at boot by the transparent proxy and
// by every test that touches the harness, so SDK calls are covered wherever the
// proxy is. In OFF mode this is a no-op wrapper.
installGoogleSdkSeam();
