/**
 * ============================================================================
 *  THROWAWAY PROOF-OF-CONCEPT — migrate ONE user's MAIL + OneDrive from
 *  Microsoft 365 to Google Workspace using Helios's existing pieces.
 * ============================================================================
 *
 *  This is NOT a product feature and is NOT wired into the Helios app. It is a
 *  disposable script for the disposable-tenant window: it proves the end-to-end
 *  path works against a real M365 tenant and a real Google Workspace, by
 *  EXERCISING the two Helios transparent proxies where they can carry the
 *  payload (JSON) and BYPASSING them where they cannot (raw binary).
 *
 *  What runs THROUGH the Helios proxies (JSON — the proxy handles it):
 *    - M365 mail LIST      : GET  {helios}/api/microsoft/graph/v1.0/users/{id}/messages
 *    - OneDrive file LIST   : GET  {helios}/api/microsoft/graph/v1.0/drives/{driveId}/.../children
 *    - Google mail IMPORT   : POST {helios}/api/google/gmail/v1/users/{target}/messages/import
 *                             with header  X-Impersonate-User: {target}
 *                             and body     { raw: base64url(mime) }
 *                             (the gmailImport builder shape — internalDateSource
 *                              = dateHeader so the copy keeps its original date)
 *
 *  What BYPASSES the proxies and talks to the vendor DIRECTLY (binary — the
 *  transparent proxies re-serialize JSON and corrupt raw bytes):
 *    - M365 mail RFC822 body: GET graph.microsoft.com/v1.0/users/{id}/messages/{mid}/$value
 *                             (axios/fetch arraybuffer) — needs app perm Mail.Read
 *    - OneDrive file content : GET graph.microsoft.com/v1.0/drives/{driveId}/items/{id}/content
 *                             (arraybuffer) — needs app perm Files.Read.All
 *    - Google Drive UPLOAD   : POST googleapis.com/upload/drive/v3/files (multipart/related)
 *                             impersonating {target} via domain-wide delegation
 *                             (subject=target), mirroring GoogleDriveService.uploadFile's
 *                             new `subject` param, so the file lands in and is
 *                             OWNED BY the target user's own My Drive.
 *
 *  KNOWN GAPS (documented on purpose — this is a PoC, not a product):
 *    1. PROXY BINARY HANDLING. Both transparent proxies (backend/src/middleware/
 *       transparent-proxy.ts and microsoft-transparent-proxy.ts) JSON-parse the
 *       body and re-serialize the response, so they cannot faithfully carry raw
 *       message bytes or file blobs. That is why every binary read/write here
 *       goes direct to the vendor. Productizing means teaching the proxies a
 *       binary/streaming passthrough mode (content-type aware, no JSON round-trip)
 *       or adding dedicated streaming migration endpoints that still audit.
 *    2. SCOPES / CONSENT.
 *         - Google (import path, via the proxy): the org service account needs
 *           gmail.insert (present in backend/src/config/google-scopes.ts) AND the
 *           Workspace admin must RE-CONSENT the domain-wide-delegation client so
 *           the newly-added scope is actually granted — otherwise every import
 *           silently 403s. The proxy also mints scopes from google-scopes.ts only
 *           while the api_relay flag is OFF (passthrough); with relay ON an allow
 *           rule for gmail messages.import must exist.
 *         - Google (Drive upload, direct): the service account used here needs the
 *           https://www.googleapis.com/auth/drive scope on the DWD client.
 *         - Microsoft (direct reads): the app registration needs APPLICATION
 *           permissions Mail.Read and Files.Read.All, admin-consented on the
 *           source tenant.
 *    3. FIDELITY. Mail labels/folders, read/unread + flags, calendar, contacts,
 *       Google-native file conversion, shared/other drives, item versions, and
 *       >4MB streaming uploads (this uses a single multipart request) are all out
 *       of scope. Mailbox enumeration uses /users/{id}/messages (a flat view);
 *       a real migration would walk mailFolders. Throttling/retry (Graph 429 +
 *       Retry-After, Google exponential backoff) is minimal.
 *    4. IDENTITY. A real migration needs a vetted UPN->Google map with alias and
 *       display-name reconciliation; here it is a hardcodable single-user map.
 *
 *  Productizing would additionally require: durable job/state (not a local JSON
 *  file), resumable/parallel transfer with rate limiting, per-item error
 *  classification + dead-letter, verification (compare source vs target counts /
 *  hashes), full audit through Helios rather than direct vendor calls, and
 *  secret handling via the org's stored credentials rather than env/CLI.
 *
 *  RUN (needs Node >= 18 for global fetch; run with tsx or ts-node):
 *    # dry run (default — prints what it WOULD do, writes nothing):
 *    npx tsx scripts/migrate-m365-to-google.ts \
 *        --source user@old-tenant.onmicrosoft.com --target user@newdomain.com
 *    # execute (actually imports mail + uploads files):
 *    npx tsx scripts/migrate-m365-to-google.ts \
 *        --source user@old-tenant.onmicrosoft.com --target user@newdomain.com --execute
 *
 *  CONFIG (CLI flag OR env var; CLI wins):
 *    --source            / M365_SOURCE_UPN     source M365 user (UPN)
 *    --target            / GOOGLE_TARGET_EMAIL target Google Workspace email
 *    --map               / IDENTITY_MAP        JSON {"upn":"google"} or "upn=google,.."
 *    --helios            / HELIOS_BASE_URL     Helios backend base URL (default http://localhost:3001)
 *    --helios-token      / HELIOS_TOKEN        Bearer token (admin JWT or service API key) for the proxies
 *    --ms-tenant         / MS_TENANT_ID        Azure tenant id (direct Graph token)
 *    --ms-client         / MS_CLIENT_ID        Azure app (client) id
 *    --ms-secret         / MS_CLIENT_SECRET    Azure app client secret
 *    --google-key        / GOOGLE_SA_KEY_PATH  path to Google service-account JSON (direct Drive upload)
 *    --drive-id          / ONEDRIVE_DRIVE_ID   optional: skip drive lookup, use this driveId
 *    --checkpoint        / MIGRATE_CHECKPOINT  checkpoint file (default ./migrate-checkpoint.json)
 *    --max-messages      / MAX_MESSAGES        cap messages (default 100; 0 = no cap)
 *    --max-files         / MAX_FILES           cap files (default 100; 0 = no cap)
 *    --page-size         / PAGE_SIZE           Graph page size (default 50)
 *    --execute                                 perform writes (otherwise DRY RUN)
 *
 *  IDEMPOTENCY: a local JSON checkpoint keyed by RFC822 Message-Id (mail) and
 *  OneDrive itemId (files). Already-migrated items are skipped, so re-runs do not
 *  duplicate. Delete the checkpoint file to force a full re-migration.
 * ============================================================================
 */

import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ============================================================================
//  PURE HELPERS (exported for scripts/migrate-m365-to-google.test.ts)
// ============================================================================

/** base64url encode a Buffer or a UTF-8 string, no padding (RFC 4648 §5). */
export function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Encode a single URL path segment (emails contain @, +, .). */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

type QueryValue = string | number | boolean | undefined | null;

/**
 * Append an encoded query string, skipping undefined/null, preserving order.
 * Mirrors frontend/src/lib/googleApiRequests.ts::withQuery so the request the
 * proxy receives is byte-identical to what the app builds.
 */
export function withQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
}

/**
 * Convert an absolute Graph `@odata.nextLink` into the RELATIVE graph path+query
 * the Helios MS proxy expects (everything after `graph.microsoft.com/`). This is
 * how paging is driven THROUGH the proxy: Graph hands back a link pointing at
 * itself, we strip the host and re-issue it via /api/microsoft/graph/{...}.
 */
export function graphPathFromNextLink(nextLink: string): string {
  const u = new URL(nextLink);
  return u.pathname.replace(/^\/+/, '') + u.search;
}

/**
 * Parse a OneDrive item's `parentReference.path` (e.g. `/drive/root:/A/B`) into
 * ordered folder segments (`['A','B']`). Available to derive an item's folder
 * path from its parentReference in isolation; the recursive walk in
 * `iterateFiles` tracks the live path directly, so this is the standalone
 * equivalent (and is unit-tested against Graph's path shapes). Empty for root.
 */
export function oneDriveFolderSegments(parentReferencePath?: string): string[] {
  if (!parentReferencePath) return [];
  const marker = 'root:';
  const idx = parentReferencePath.indexOf(marker);
  if (idx === -1) return [];
  const rest = parentReferencePath.slice(idx + marker.length); // "/A/B" or "" or "/"
  return rest
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

export interface GmailImportRequest {
  method: 'POST';
  /** Relative path (with query) for the Helios Google proxy. */
  path: string;
  body: { raw: string };
  /** X-Impersonate-User target (email) or undefined (no header). */
  impersonate?: string;
}

/**
 * Build the Gmail users.messages.import request in the exact shape of
 * frontend/src/lib/googleApiRequests.ts::gmailImport: the query params live in
 * the PATH (the proxy forwards only path + body + the impersonation header), the
 * body is `{ raw }`, and the proxy impersonates the target so the message lands
 * in that user's own mailbox.
 */
export function buildGmailImportRequest(target: string, raw: string): GmailImportRequest {
  return {
    method: 'POST',
    path: withQuery(`/api/google/gmail/v1/users/${seg(target)}/messages/import`, {
      internalDateSource: 'dateHeader',
      neverMarkSpam: true,
    }),
    body: { raw },
    impersonate: target.includes('@') ? target : undefined,
  };
}

export interface MultipartRelated {
  body: Buffer;
  /** Value for the Content-Type request header (carries the boundary). */
  contentType: string;
  boundary: string;
}

/**
 * Build a Google Drive `multipart/related` upload body: a JSON metadata part
 * followed by the raw binary media part. Constructed as Buffers so the binary is
 * never passed through a string (which is precisely how the JSON proxies corrupt
 * it). See Google's "Multipart upload" for drive.files.create.
 */
export function buildMultipartRelated(
  metadata: Record<string, unknown>,
  mimeType: string,
  content: Buffer,
  boundarySeed = 'helios-migrate',
): MultipartRelated {
  const boundary = `${boundarySeed}-${Buffer.from(String(Math.random())).toString('hex').slice(0, 16)}`;
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  return {
    body: Buffer.concat([preamble, content, closing]),
    contentType: `multipart/related; boundary=${boundary}`,
    boundary,
  };
}

// ---- Checkpoint (idempotency) ----------------------------------------------

export interface Checkpoint {
  version: 1;
  /** RFC822 Message-Id -> record of the imported mail. */
  mail: Record<string, { graphId: string; gmailId?: string; at: string }>;
  /** OneDrive itemId -> record of the uploaded file. */
  files: Record<string, { name: string; path: string; driveFileId?: string; at: string }>;
}

export function emptyCheckpoint(): Checkpoint {
  return { version: 1, mail: {}, files: {} };
}

export function isMailDone(cp: Checkpoint, messageId: string): boolean {
  return Boolean(cp.mail[messageId]);
}

export function isFileDone(cp: Checkpoint, itemId: string): boolean {
  return Boolean(cp.files[itemId]);
}

// ============================================================================
//  CONFIG
// ============================================================================

export interface RawArgs {
  flags: Record<string, string>;
  bools: Set<string>;
}

/** Minimal `--flag value`, `--flag=value`, and boolean `--flag` parser. */
export function parseArgs(argv: string[]): RawArgs {
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const eq = tok.indexOf('=');
    if (eq !== -1) {
      flags[tok.slice(2, eq)] = tok.slice(eq + 1);
      continue;
    }
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      bools.add(key);
    }
  }
  return { flags, bools };
}

/** Parse an identity map from `--map` / IDENTITY_MAP (JSON or `a=b,c=d`). */
export function parseIdentityMap(raw?: string): Record<string, string> {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as Record<string, string>;
  }
  const out: Record<string, string> = {};
  for (const pair of trimmed.split(',')) {
    const [k, v] = pair.split('=').map((s) => s.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

export interface Config {
  identity: Record<string, string>; // UPN -> Google email
  heliosBaseUrl: string;
  heliosToken: string;
  ms: { tenantId: string; clientId: string; clientSecret: string };
  googleSaKeyPath: string;
  driveId?: string;
  checkpointPath: string;
  maxMessages: number;
  maxFiles: number;
  pageSize: number;
  execute: boolean;
}

function pick(args: RawArgs, flag: string, env: string | undefined): string | undefined {
  return args.flags[flag] ?? env;
}

/** Resolve config from argv + process.env. Validates only what each mode needs. */
export function resolveConfig(argv: string[], environ: NodeJS.ProcessEnv): Config {
  const args = parseArgs(argv);
  const execute = args.bools.has('execute');

  const identity = parseIdentityMap(pick(args, 'map', environ.IDENTITY_MAP));
  const source = pick(args, 'source', environ.M365_SOURCE_UPN);
  const target = pick(args, 'target', environ.GOOGLE_TARGET_EMAIL);
  if (source && target) identity[source] = target;

  const missing: string[] = [];
  if (Object.keys(identity).length === 0) missing.push('--source/--target (or --map)');

  const heliosToken = pick(args, 'helios-token', environ.HELIOS_TOKEN);
  if (!heliosToken) missing.push('--helios-token');

  const tenantId = pick(args, 'ms-tenant', environ.MS_TENANT_ID);
  const clientId = pick(args, 'ms-client', environ.MS_CLIENT_ID);
  const clientSecret = pick(args, 'ms-secret', environ.MS_CLIENT_SECRET);
  if (!tenantId || !clientId || !clientSecret) {
    missing.push('--ms-tenant/--ms-client/--ms-secret (Azure app for direct Graph reads)');
  }

  // The Google service-account key is only needed to WRITE Drive files.
  const googleSaKeyPath = pick(args, 'google-key', environ.GOOGLE_SA_KEY_PATH) ?? '';
  if (execute && !googleSaKeyPath) {
    missing.push('--google-key (service-account JSON, required with --execute for Drive upload)');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration:\n  - ${missing.join('\n  - ')}`);
  }

  const num = (v: string | undefined, d: number): number => {
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
  };

  return {
    identity,
    heliosBaseUrl: (pick(args, 'helios', environ.HELIOS_BASE_URL) ?? 'http://localhost:3001').replace(/\/+$/, ''),
    heliosToken: heliosToken!,
    ms: { tenantId: tenantId!, clientId: clientId!, clientSecret: clientSecret! },
    googleSaKeyPath,
    driveId: pick(args, 'drive-id', environ.ONEDRIVE_DRIVE_ID),
    checkpointPath: resolve(pick(args, 'checkpoint', environ.MIGRATE_CHECKPOINT) ?? './migrate-checkpoint.json'),
    maxMessages: num(pick(args, 'max-messages', environ.MAX_MESSAGES), 100),
    maxFiles: num(pick(args, 'max-files', environ.MAX_FILES), 100),
    pageSize: num(pick(args, 'page-size', environ.PAGE_SIZE), 50),
    execute,
  };
}

// ============================================================================
//  STRUCTURED LOGGING + SUMMARY
// ============================================================================

type Level = 'info' | 'warn' | 'error' | 'debug';

function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

interface Summary {
  mail: { listed: number; skipped: number; migrated: number; failed: number };
  files: { listed: number; skipped: number; migrated: number; failed: number };
}

function newSummary(): Summary {
  return {
    mail: { listed: 0, skipped: 0, migrated: 0, failed: 0 },
    files: { listed: 0, skipped: 0, migrated: 0, failed: 0 },
  };
}

// ============================================================================
//  HTTP HELPERS (thin wrappers over global fetch)
// ============================================================================

/**
 * A Graph collection page: `value[]` plus an optional absolute `@odata.nextLink`.
 * Annotating the paged locals with this breaks a control-flow inference cycle
 * (the page type flows into the loop's `rel`, which flows back via nextLink).
 */
interface GraphPage<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

async function httpJson<T = any>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${init.method ?? 'GET'} ${url}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function httpBinary(url: string, init: RequestInit): Promise<Buffer> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${init.method ?? 'GET'} ${url}: ${text.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ============================================================================
//  RUNTIME CONTEXT (tokens, credentials, folder cache)
// ============================================================================

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface Ctx {
  cfg: Config;
  cp: Checkpoint;
  summary: Summary;
  /** Cached Microsoft Graph app token (client-credentials). */
  msToken?: { value: string; exp: number };
  /** Google service-account key (loaded lazily; only for --execute Drive upload). */
  saKey?: ServiceAccountKey;
  /** Cached Google DWD access tokens, keyed by impersonation subject. */
  googleTokens: Map<string, { value: string; exp: number }>;
  /** Drive folder id cache, keyed by `${parentId}/${name}`. */
  folderCache: Map<string, string>;
}

// ---- Microsoft: direct app token (client credentials) ----------------------

async function getMsAppToken(ctx: Ctx): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (ctx.msToken && ctx.msToken.exp > now + 60) return ctx.msToken.value;

  const { tenantId, clientId, clientSecret } = ctx.cfg.ms;
  const data = await httpJson<{ access_token: string; expires_in: number }>(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  ctx.msToken = { value: data.access_token, exp: now + (data.expires_in || 3600) };
  return ctx.msToken.value;
}

// ---- Helios MS Graph proxy: JSON GET ---------------------------------------

/** GET through the Helios MS Graph proxy. `relPath` is the graph path (+query). */
async function graphProxyGet<T = any>(ctx: Ctx, relPath: string): Promise<T> {
  const url = `${ctx.cfg.heliosBaseUrl}/api/microsoft/graph/${relPath}`;
  return httpJson<T>(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${ctx.cfg.heliosToken}` },
  });
}

// ---- Google: direct DWD token (for direct Drive upload) --------------------

function loadServiceAccountKey(ctx: Ctx): ServiceAccountKey {
  if (ctx.saKey) return ctx.saKey;
  const raw = readFileSync(ctx.cfg.googleSaKeyPath, 'utf8');
  const parsed = JSON.parse(raw) as ServiceAccountKey;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Service-account JSON is missing client_email / private_key');
  }
  ctx.saKey = parsed;
  return parsed;
}

/**
 * Mint a Google access token via domain-wide delegation, impersonating
 * `subject`. Same manual-JWT approach as backend/src/middleware/transparent-
 * proxy.ts::proxyToGoogle, but self-contained (Node crypto, no jsonwebtoken).
 */
async function getGoogleToken(ctx: Ctx, subject: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = ctx.googleTokens.get(subject);
  if (cached && cached.exp > now + 60) return cached.value;

  const sa = loadServiceAccountKey(ctx);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
    sub: subject,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const assertion = `${signingInput}.${base64url(signer.sign(sa.private_key))}`;

  const data = await httpJson<{ access_token: string; expires_in: number }>(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    },
  );
  if (!data.access_token) throw new Error('Google token exchange returned no access_token');
  ctx.googleTokens.set(subject, { value: data.access_token, exp: now + (data.expires_in || 3600) });
  return data.access_token;
}

// ---- Google Drive: find-or-create folder, upload (direct) ------------------

/** Escape a value for use inside a Drive `q` string literal. */
function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder(ctx: Ctx, subject: string, name: string, parentId: string): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const hit = ctx.folderCache.get(cacheKey);
  if (hit) return hit;

  const token = await getGoogleToken(ctx, subject);
  const q =
    `name = '${escapeDriveQuery(name)}' and '${escapeDriveQuery(parentId)}' in parents ` +
    `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listUrl =
    'https://www.googleapis.com/drive/v3/files?' +
    new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '1' }).toString();

  const found = await httpJson<{ files?: Array<{ id: string }> }>(listUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  let id = found.files?.[0]?.id;
  if (!id) {
    const created = await httpJson<{ id: string }>('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    });
    id = created.id;
  }
  ctx.folderCache.set(cacheKey, id);
  return id;
}

/** Ensure a folder path exists under the target's My Drive; return the leaf id. */
async function ensureFolderPath(ctx: Ctx, subject: string, segments: string[]): Promise<string> {
  let parent = 'root';
  for (const s of segments) {
    parent = await findOrCreateFolder(ctx, subject, s, parent);
  }
  return parent;
}

/** Multipart upload a file into the target user's Drive (direct — bypasses proxy). */
async function driveUpload(
  ctx: Ctx,
  subject: string,
  name: string,
  mimeType: string,
  content: Buffer,
  parentId: string,
): Promise<string> {
  const token = await getGoogleToken(ctx, subject);
  const { body, contentType } = buildMultipartRelated(
    { name, parents: [parentId] },
    mimeType || 'application/octet-stream',
    content,
  );
  const data = await httpJson<{ id: string }>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      body: body as unknown as BodyInit,
    },
  );
  return data.id;
}

// ============================================================================
//  MAIL MIGRATION
// ============================================================================

interface GraphMessage {
  id: string;
  internetMessageId?: string;
}

async function migrateMail(ctx: Ctx, sourceUpn: string, target: string): Promise<void> {
  const { cfg, summary } = ctx;
  log('info', 'mail.start', { sourceUpn, target, execute: cfg.execute });

  // First page THROUGH the Helios MS Graph proxy (JSON). OData params live in the
  // path; subsequent pages follow @odata.nextLink, re-routed via the proxy.
  let rel: string | null =
    `v1.0/users/${seg(sourceUpn)}/messages?$top=${cfg.pageSize}&$select=id,internetMessageId`;

  while (rel) {
    const page: GraphPage<GraphMessage> = await graphProxyGet(ctx, rel);
    for (const msg of page.value ?? []) {
      if (cfg.maxMessages > 0 && summary.mail.listed >= cfg.maxMessages) {
        log('info', 'mail.cap-reached', { cap: cfg.maxMessages });
        return;
      }
      summary.mail.listed++;

      // RFC822 Message-Id is the idempotency key; fall back to the Graph id.
      const messageId = msg.internetMessageId || `graph:${msg.id}`;

      if (isMailDone(ctx.cp, messageId)) {
        summary.mail.skipped++;
        log('debug', 'mail.skip', { messageId, reason: 'already-migrated' });
        continue;
      }

      if (!cfg.execute) {
        summary.mail.migrated++; // count as "would migrate" in dry-run
        log('info', 'mail.plan', { messageId, graphId: msg.id, action: 'import' });
        continue;
      }

      try {
        // BINARY read — direct to Graph (the proxy would corrupt raw MIME).
        const msToken = await getMsAppToken(ctx);
        const mime = await httpBinary(
          `https://graph.microsoft.com/v1.0/users/${seg(sourceUpn)}/messages/${seg(msg.id)}/$value`,
          { method: 'GET', headers: { Authorization: `Bearer ${msToken}` } },
        );

        // WRITE — through the Helios Google proxy (base64url text is proxy-safe).
        const req = buildGmailImportRequest(target, base64url(mime));
        const headers: Record<string, string> = {
          Authorization: `Bearer ${cfg.heliosToken}`,
          'Content-Type': 'application/json',
        };
        if (req.impersonate) headers['X-Impersonate-User'] = req.impersonate;

        const resp = await httpJson<{ id?: string }>(`${cfg.heliosBaseUrl}${req.path}`, {
          method: req.method,
          headers,
          body: JSON.stringify(req.body),
        });

        ctx.cp.mail[messageId] = { graphId: msg.id, gmailId: resp.id, at: new Date().toISOString() };
        persistCheckpoint(ctx);
        summary.mail.migrated++;
        log('info', 'mail.import.ok', { messageId, bytes: mime.length, gmailId: resp.id });
      } catch (err: any) {
        summary.mail.failed++;
        log('error', 'mail.import.fail', { messageId, graphId: msg.id, error: err?.message ?? String(err) });
      }
    }

    const next: string | undefined = page['@odata.nextLink'];
    rel = next ? graphPathFromNextLink(next) : null;
  }

  log('info', 'mail.done', summary.mail as unknown as Record<string, unknown>);
}

// ============================================================================
//  FILE (OneDrive -> Drive) MIGRATION
// ============================================================================

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  parentReference?: { path?: string };
}

async function resolveDriveId(ctx: Ctx, sourceUpn: string): Promise<string> {
  if (ctx.cfg.driveId) return ctx.cfg.driveId;
  const drive = await graphProxyGet<{ id: string }>(ctx, `v1.0/users/${seg(sourceUpn)}/drive?$select=id`);
  if (!drive.id) throw new Error(`Could not resolve OneDrive driveId for ${sourceUpn}`);
  return drive.id;
}

/** Recursively yield FILE items (folders are descended into), with folder path. */
async function* iterateFiles(
  ctx: Ctx,
  driveId: string,
  itemId: string,
  pathSegments: string[],
): AsyncGenerator<{ item: GraphDriveItem; pathSegments: string[] }> {
  let rel: string | null =
    itemId === 'root'
      ? `v1.0/drives/${seg(driveId)}/root/children?$top=${ctx.cfg.pageSize}`
      : `v1.0/drives/${seg(driveId)}/items/${seg(itemId)}/children?$top=${ctx.cfg.pageSize}`;

  while (rel) {
    const page: GraphPage<GraphDriveItem> = await graphProxyGet(ctx, rel);
    for (const item of page.value ?? []) {
      if (item.folder) {
        yield* iterateFiles(ctx, driveId, item.id, [...pathSegments, item.name]);
      } else if (item.file) {
        yield { item, pathSegments };
      } else {
        log('debug', 'files.skip-nonfile', { name: item.name, id: item.id });
      }
    }
    const next: string | undefined = page['@odata.nextLink'];
    rel = next ? graphPathFromNextLink(next) : null;
  }
}

async function migrateFiles(ctx: Ctx, sourceUpn: string, target: string): Promise<void> {
  const { cfg, summary } = ctx;
  log('info', 'files.start', { sourceUpn, target, execute: cfg.execute });

  const driveId = await resolveDriveId(ctx, sourceUpn);
  log('info', 'files.drive', { driveId });

  for await (const { item, pathSegments } of iterateFiles(ctx, driveId, 'root', [])) {
    if (cfg.maxFiles > 0 && summary.files.listed >= cfg.maxFiles) {
      log('info', 'files.cap-reached', { cap: cfg.maxFiles });
      break;
    }
    summary.files.listed++;

    const itemId = item.id;
    const displayPath = '/' + [...pathSegments, item.name].join('/');

    if (isFileDone(ctx.cp, itemId)) {
      summary.files.skipped++;
      log('debug', 'files.skip', { itemId, path: displayPath, reason: 'already-migrated' });
      continue;
    }

    if (!cfg.execute) {
      summary.files.migrated++; // "would migrate"
      log('info', 'files.plan', { itemId, path: displayPath, bytes: item.size ?? 0, action: 'upload' });
      continue;
    }

    try {
      // BINARY read — direct to Graph (the proxy would corrupt the blob).
      const msToken = await getMsAppToken(ctx);
      const content = await httpBinary(
        `https://graph.microsoft.com/v1.0/drives/${seg(driveId)}/items/${seg(itemId)}/content`,
        { method: 'GET', headers: { Authorization: `Bearer ${msToken}` } },
      );

      // Recreate folder structure, then upload into the TARGET user's My Drive
      // (subject=target) — direct multipart, bypassing the JSON proxy.
      const parentId = await ensureFolderPath(ctx, target, pathSegments);
      const driveFileId = await driveUpload(
        ctx,
        target,
        item.name,
        item.file?.mimeType || 'application/octet-stream',
        content,
        parentId,
      );

      ctx.cp.files[itemId] = { name: item.name, path: displayPath, driveFileId, at: new Date().toISOString() };
      persistCheckpoint(ctx);
      summary.files.migrated++;
      log('info', 'files.upload.ok', { itemId, path: displayPath, bytes: content.length, driveFileId });
    } catch (err: any) {
      summary.files.failed++;
      log('error', 'files.upload.fail', { itemId, path: displayPath, error: err?.message ?? String(err) });
    }
  }

  log('info', 'files.done', summary.files as unknown as Record<string, unknown>);
}

// ============================================================================
//  CHECKPOINT PERSISTENCE
// ============================================================================

function loadCheckpoint(path: string): Checkpoint {
  if (!existsSync(path)) return emptyCheckpoint();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Checkpoint>;
    return {
      version: 1,
      mail: parsed.mail ?? {},
      files: parsed.files ?? {},
    };
  } catch (err: any) {
    log('warn', 'checkpoint.load-failed', { path, error: err?.message ?? String(err) });
    return emptyCheckpoint();
  }
}

function persistCheckpoint(ctx: Ctx): void {
  writeFileSync(ctx.cfg.checkpointPath, JSON.stringify(ctx.cp, null, 2), 'utf8');
}

// ============================================================================
//  MAIN
// ============================================================================

async function main(): Promise<void> {
  const cfg = resolveConfig(process.argv.slice(2), process.env);
  const cp = loadCheckpoint(cfg.checkpointPath);
  const ctx: Ctx = {
    cfg,
    cp,
    summary: newSummary(),
    googleTokens: new Map(),
    folderCache: new Map(),
  };

  log('info', 'migration.start', {
    mode: cfg.execute ? 'EXECUTE' : 'DRY-RUN',
    helios: cfg.heliosBaseUrl,
    users: Object.keys(cfg.identity).length,
    checkpoint: cfg.checkpointPath,
    caps: { messages: cfg.maxMessages, files: cfg.maxFiles },
  });
  if (!cfg.execute) {
    log('warn', 'migration.dry-run', {
      note: 'No writes will be performed. Re-run with --execute to migrate.',
    });
  }

  for (const [sourceUpn, target] of Object.entries(cfg.identity)) {
    log('info', 'user.start', { sourceUpn, target });
    await migrateMail(ctx, sourceUpn, target);
    await migrateFiles(ctx, sourceUpn, target);
    log('info', 'user.done', { sourceUpn, target });
  }

  persistCheckpoint(ctx);

  // Final structured summary.
  log('info', 'migration.summary', {
    mode: cfg.execute ? 'EXECUTE' : 'DRY-RUN',
    mail: ctx.summary.mail,
    files: ctx.summary.files,
    checkpoint: cfg.checkpointPath,
  });

  const failed = ctx.summary.mail.failed + ctx.summary.files.failed;
  if (failed > 0) {
    log('warn', 'migration.completed-with-failures', { failed });
    process.exitCode = 1;
  } else {
    log('info', 'migration.completed', {});
  }
}

// Run only when invoked directly (not when imported by the test file).
const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    log('error', 'migration.fatal', { error: err?.message ?? String(err) });
    process.exitCode = 1;
  });
}
