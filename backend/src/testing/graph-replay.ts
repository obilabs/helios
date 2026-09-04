/**
 * Record / Replay harness for outbound Microsoft Graph API calls.
 * =====================================================================
 *
 * Microsoft Graph traffic leaves Helios through TWO code paths, and this module
 * gives both the same OFF / REPLAY / RECORD seam as the Google harness:
 *
 *   1. The transparent proxy (middleware/microsoft-transparent-proxy.ts) uses
 *      raw `axios` for the token exchange and the Graph call. Those two calls
 *      go through the axios-compatible `graphHttp` seam (identical shape to
 *      `googleHttp`).
 *
 *   2. The Graph SDK service (services/microsoft-graph.service.ts) uses the
 *      fetch-based `@microsoft/microsoft-graph-client`, which is invisible to
 *      axios. `GraphRecordReplayHandler` is a custom SDK middleware, backed by
 *      the SAME `createHttpReplay` instance, that records/replays at the fetch
 *      level.
 *
 * Both paths share ONE `createHttpReplay` instance (`graph`), so a fixture
 * recorded via either path replays for the other. Everything is INERT in
 * production exactly like the Google seam — OFF mode is a straight passthrough.
 *
 * Graph-specific config:
 *   - fixtures live under `src/__tests__/fixtures/graph/<family>/<name>.json`
 *   - RECORD mode is engaged by `HELIOS_GRAPH_RECORD=1`
 *   - the token endpoint is `login.microsoftonline.com` (or any `/token` path)
 *   - fixture names auto-derive via `deriveGraphFixtureName`
 *   - a Graph-aware sanitizer redacts Entra ID PII BEFORE anything is written
 *     (see `graphSanitize`).
 */
import type { Context } from '@microsoft/microsoft-graph-client';
import type { Middleware } from '@microsoft/microsoft-graph-client';
import {
  createHttpReplay,
  looksLikeId,
  makeEmailAliaser,
  stripLeadingSlash,
  SECRET_KEYS,
  type HttpFixture,
  type HttpReplayInstance,
} from './http-replay.js';

/** The on-disk shape of a recorded Graph request/response pair. */
export type GraphFixture = HttpFixture;

// ---------------------------------------------------------------------------
// Graph-aware sanitization
// ---------------------------------------------------------------------------
//
// Entra ID responses carry a lot of tenant-identifying PII. We redact it BEFORE
// any fixture is written so committed fixtures leak nothing:
//   - object-id + tenant GUIDs (including those embedded inside @odata.context /
//     @odata.nextLink / $skiptoken strings) are replaced with stable synthetic
//     GUIDs that preserve the GUID shape downstream code expects;
//   - names, phones, location and directory-sync identifiers are redacted;
//   - request correlation ids are stripped from persisted response headers.
// skuId / servicePlanId are PUBLIC catalog identifiers and are kept verbatim so
// license fixtures stay meaningful.

const GUID_RE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

/**
 * Build a fresh GUID→synthetic-GUID mapper. Each distinct real GUID gets a
 * stable `00000000-0000-0000-0000-0000000000NN` alias (first-seen order), so a
 * given object/tenant id maps to the same synthetic id everywhere in one pass —
 * including GUIDs embedded in @odata.context / @odata.nextLink / $skiptoken.
 */
export function makeGuidAliaser(): (s: string) => string {
  const map = new Map<string, string>();
  return (s: string) =>
    s.replace(GUID_RE, (guid) => {
      const key = guid.toLowerCase();
      const existing = map.get(key);
      if (existing) return existing;
      const alias = `00000000-0000-0000-0000-${String(map.size + 1).padStart(
        12,
        '0',
      )}`;
      map.set(key, alias);
      return alias;
    });
}

/** Keys whose values are Entra ID PII and must be redacted outright. */
const GRAPH_REDACT_KEYS = new Set(
  [
    'displayName',
    'givenName',
    'surname',
    'officeLocation',
    'mobilePhone',
    'businessPhones',
    'onPremisesImmutableId',
    'proxyAddresses',
    // Identity/domain-bearing fields. userPrincipalName/mail are redacted (not
    // aliased) because guest UPNs use the `<orig-email>#EXT#@tenant` form that
    // embeds a real external address and slips past the email aliaser.
    'userPrincipalName',
    'mail',
    'otherMails',
    'imAddresses',
    'mailNickname',
    // Tenant-identifying: the verified-domains array (onmicrosoft.com + custom
    // domains) and the license accountName reveal the real tenant.
    'verifiedDomains',
    'accountName',
  ].map((k) => k.toLowerCase()),
);

/** Replace any `<label>.onmicrosoft.com` host with a stable synthetic tenant. */
function stripOnmicrosoftDomain(s: string): string {
  return s.replace(/\b[a-z0-9][a-z0-9-]*\.onmicrosoft\.com\b/gi, 'tenant.onmicrosoft.com');
}

/** Keys whose values are PUBLIC catalog GUIDs and must be kept verbatim. */
const GRAPH_KEEP_KEYS = new Set(['skuId', 'servicePlanId'].map((k) => k.toLowerCase()));

/** Redact a PII field, preserving array shape (e.g. businessPhones). */
function redactField(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(() => 'REDACTED');
  if (value == null) return value;
  return 'REDACTED';
}

function graphSanitizeValue(
  value: unknown,
  aliasEmail: (s: string) => string,
  aliasGuid: (s: string) => string,
): unknown {
  if (typeof value === 'string')
    return aliasGuid(aliasEmail(stripOnmicrosoftDomain(value)));
  if (Array.isArray(value))
    return value.map((v) => graphSanitizeValue(v, aliasEmail, aliasGuid));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (SECRET_KEYS.has(lk)) {
        out[k] = 'REDACTED';
      } else if (GRAPH_REDACT_KEYS.has(lk)) {
        out[k] = redactField(v);
      } else if (GRAPH_KEEP_KEYS.has(lk)) {
        // Public catalog id — keep the real value (do NOT GUID-alias it).
        out[k] = v;
      } else {
        out[k] = graphSanitizeValue(v, aliasEmail, aliasGuid);
      }
    }
    return out;
  }
  return value;
}

/** Strip request-correlation ids from persisted response headers. */
function stripGraphHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (lk === 'request-id' || lk === 'client-request-id') continue;
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fixture naming (record mode auto-derive) — Graph-specific
// ---------------------------------------------------------------------------

/**
 * Derive a `{ family, name }` from a Graph request. Strips a leading `v1.0` /
 * `beta` segment; the family is the first resource segment. Examples:
 *   GET  v1.0/users                       -> users / users.list
 *   GET  v1.0/users/{id}                  -> users / users.get
 *   POST v1.0/groups                      -> groups / groups.post
 *   GET  v1.0/subscribedSkus              -> subscribedSkus / subscribedSkus.list
 *   GET  v1.0/users/{id}/licenseDetails   -> users / licenseDetails.list
 */
export function deriveGraphFixtureName(
  method: string,
  _host: string,
  path: string,
): { family: string; name: string } {
  const segs = stripLeadingSlash(path).split('/').filter(Boolean);
  // Strip a LEADING version segment only.
  if (segs.length && /^(v1\.0|beta)$/i.test(segs[0])) segs.shift();

  const family = segs[0] || 'graph';
  const rest = segs.slice(1);
  const resourceSegs = rest.filter((s) => !looksLikeId(s));
  // When every trailing segment is an id (e.g. `users/{id}`), the resource name
  // is the collection itself (`users`), NOT the id — so fall back to `family`.
  const resource = resourceSegs.length ? resourceSegs.join('.') : family;

  const lastSeg = segs[segs.length - 1] || '';
  const verb =
    method.toUpperCase() === 'GET'
      ? looksLikeId(lastSeg)
        ? 'get'
        : 'list'
      : method.toLowerCase();

  return { family, name: `${resource}.${verb}` };
}

// ---------------------------------------------------------------------------
// The Graph instance
// ---------------------------------------------------------------------------

export const graph: HttpReplayInstance = createHttpReplay({
  namespace: 'graph',
  fixturesDirName: 'graph',
  recordEnvVar: 'HELIOS_GRAPH_RECORD',
  verifyEnvVar: 'HELIOS_GRAPH_VERIFY',
  fixturesDirEnvVar: 'HELIOS_GRAPH_FIXTURES_DIR',
  isTokenEndpoint: (host, path) =>
    host === 'login.microsoftonline.com' || path.endsWith('/token'),
  deriveName: deriveGraphFixtureName,
  createSanitizer: () => {
    const aliasEmail = makeEmailAliaser();
    const aliasGuid = makeGuidAliaser();
    return (v: unknown) => graphSanitizeValue(v, aliasEmail, aliasGuid);
  },
  sanitizeHeaders: stripGraphHeaders,
});

// ---------------------------------------------------------------------------
// Thin public adapters
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for the `axios` the Microsoft proxy uses. Callable as
 * `graphHttp(config)` and via `graphHttp.post(url, body[, config])`.
 */
export const graphHttp = graph.http;

/** Load a fixture from `<graph fixturesRoot>/<family>/<name>.json`. */
export const loadGraphFixture = graph.loadFixture;

/** Load every `*.json` fixture under `<graph fixturesRoot>/<family>/`. */
export const loadGraphFixtureFamily = graph.loadFixtureFamily;

/** Activate REPLAY for the current test with the given fixture(s). */
export const useGraphReplay = graph.useReplay;

/** Deactivate replay and clear all loaded fixtures / naming overrides. */
export const resetGraphReplay = graph.resetReplay;

/** RECORD-mode helper: pin the `{family,name}` a specific call records as. */
export const recordGraphAs = graph.recordAs;

/** Absolute path to `backend/src/__tests__/fixtures/graph` (overridable). */
export function graphFixturesRoot(): string {
  return graph.fixturesRoot();
}

/** RECORD mode is on when `HELIOS_GRAPH_RECORD=1`. */
export function isGraphRecordMode(): boolean {
  return graph.isRecordMode();
}

// ---------------------------------------------------------------------------
// FETCH-LEVEL seam: a Graph SDK middleware backed by the same instance
// ---------------------------------------------------------------------------

/** Build a fetch `Response` for a replayed fixture. */
function buildReplayResponse(
  status: number,
  data: unknown,
  headers: Record<string, string>,
): Response {
  const noBody = status === 204 || status === 304;
  const h = new Headers();
  for (const [k, v] of Object.entries(headers || {})) h.set(k, String(v));
  if (!h.has('content-type')) h.set('content-type', 'application/json');
  const body = noBody ? null : JSON.stringify(data ?? null);
  return new Response(body, { status, headers: h });
}

function parseQueryFromUrl(url: string): Record<string, unknown> | null {
  const u = new URL(url);
  if ([...u.searchParams.keys()].length === 0) return null;
  const q: Record<string, unknown> = {};
  u.searchParams.forEach((v, k) => {
    q[k] = v;
  });
  return q;
}

function parseBody(body: unknown): unknown {
  if (body == null) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    headers.forEach((v, k) => {
      out[k] = v;
    });
  } catch {
    /* non-standard Headers impl — best effort */
  }
  return out;
}

/**
 * Graph SDK middleware implementing the OFF / REPLAY / RECORD seam at the fetch
 * layer, backed by the shared `graph` instance:
 *   - OFF     -> passthrough (call next; production behavior is untouched).
 *   - REPLAY  -> short-circuit: build `context.response` from the fixture; the
 *                downstream HTTP handler never runs, so no network is touched.
 *   - RECORD  -> call next (real fetch), then persist the sanitized response.
 *
 * Placed BETWEEN `AuthenticationHandler` and `HTTPMessageHandler` in the chain.
 */
export class GraphRecordReplayHandler implements Middleware {
  private nextMiddleware!: Middleware;

  constructor(private readonly seam: HttpReplayInstance = graph) {}

  public setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }

  public async execute(context: Context): Promise<void> {
    const mode = this.seam.currentMode();

    // OFF: exact passthrough — production and non-opted-in tests.
    if (mode === 'off') {
      await this.nextMiddleware.execute(context);
      return;
    }

    const url =
      typeof context.request === 'string'
        ? context.request
        : context.request.url;
    const { host, path } = this.seam.splitUrl(url);
    const method = String(context.options?.method || 'GET').toUpperCase();

    // Token endpoints never carry fixtures; let them pass through. (In the SDK
    // path the token is minted by @azure/identity outside this chain anyway.)
    if (this.seam.isTokenEndpoint(host, path)) {
      await this.nextMiddleware.execute(context);
      return;
    }

    if (mode === 'replay') {
      const fx = this.seam.replayLookup(method, host, path);
      context.response = buildReplayResponse(fx.status, fx.data, fx.headers);
      return;
    }

    // RECORD: run the real request, then persist the sanitized pair.
    await this.nextMiddleware.execute(context);
    const raw = context.response;
    if (!raw) return;

    let data: unknown = null;
    try {
      const text = await raw.clone().text();
      data = text ? safeJsonParse(text) : null;
    } catch {
      /* body not readable (stream / already consumed) — record null */
    }

    this.seam.record({
      method,
      host,
      path,
      query: parseQueryFromUrl(url),
      body: parseBody(context.options?.body),
      response: {
        status: raw.status,
        data,
        headers: headersToObject(raw.headers),
      },
    });
  }
}
