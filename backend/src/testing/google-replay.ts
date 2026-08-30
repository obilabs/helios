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
