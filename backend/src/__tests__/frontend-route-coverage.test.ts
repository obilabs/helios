/**
 * Every API path the frontend calls must resolve to a route the backend mounts.
 *
 * This is the most expensive bug class in this codebase's history. A button
 * calls an endpoint that was renamed or never existed, the fetch 404s, the
 * component swallows it, and the screen looks like it worked. Found by hand on
 * 2026-09-08 (the entire Email tab, a template editor reading /api/v1/users)
 * and again on 2026-09-10 (Sync Groups). Every time it took a person driving
 * the real UI to notice, because nothing else looks wrong.
 *
 * So: enumerate what the frontend asks for, enumerate what the backend serves,
 * and fail the build when they disagree. A rename now breaks CI instead of
 * breaking a screen nobody has opened yet.
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = join(HERE, '..');
const FRONTEND_SRC = join(HERE, '..', '..', '..', 'frontend', 'src');
const INDEX_TS = join(BACKEND_SRC, 'index.ts');
const ROUTES_DIR = join(BACKEND_SRC, 'routes');

/**
 * Calls that already point at nothing, found the day this test was written.
 * These are real breakage, not exceptions: `/user` serves only `/me` and
 * `/change-password`, so the whole user-profile screen (profile, password,
 * sessions, 2FA) talks to endpoints that do not exist; `/settings` mounts the
 * tracking ANALYTICS router, so the tracking settings panel 404s; `/training`
 * serves `/content`, not `/courses`.
 *
 * This list is a ratchet, not an amnesty. The build fails if a NEW orphan
 * appears, and fails again if an entry here starts resolving or stops being
 * called without its line being deleted. The debt can only shrink. Do not add
 * to this list to make CI pass.
 */
const KNOWN_BROKEN = new Set([
  '/departments',
  '/groups',
  '/helpdesk/stats',
  '/helpdesk/tickets',
  '/media/upload',
  '/organization/domains',
  '/public-files',
  '/public-files/upload',
  '/security/2fa-status',
  '/security/oauth-apps',
  '/settings/tracking',
  '/templates',
  '/training/courses',
  '/user/2fa/disable',
  '/user/2fa/setup',
  '/user/2fa/verify',
  '/user/password',
  '/user/profile',
  '/user/sessions',
  '/users',
]);

/** Express path -> regex. `:id` matches one segment. */
function patternToRegex(path: string): RegExp {
  const escaped = path
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/:[A-Za-z0-9_]+\??/g, '[^/]+')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}/?$`);
}

/** `registerRoute('/organization', organizationRoutes)` -> prefix per router variable. */
function readMounts(): Array<{ prefix: string; variable: string }> {
  const src = readFileSync(INDEX_TS, 'utf8');
  const mounts: Array<{ prefix: string; variable: string }> = [];
  for (const m of src.matchAll(/registerRoute\(\s*'([^']+)'\s*,\s*([A-Za-z0-9_]+)/g)) {
    mounts.push({ prefix: m[1], variable: m[2] });
  }
  for (const m of src.matchAll(/app\.use\(\s*'(\/api[^']*)'\s*,\s*([A-Za-z0-9_]+Routes)\s*\)/g)) {
    mounts.push({ prefix: m[1].replace(/^\/api(\/v1)?/, ''), variable: m[2] });
  }
  return mounts;
}

/** `import organizationRoutes from './routes/organization.routes.js'` -> file name. */
function readRouterImports(): Map<string, string> {
  const src = readFileSync(INDEX_TS, 'utf8');
  const byVariable = new Map<string, string>();
  for (const m of src.matchAll(/import\s+([A-Za-z0-9_]+)\s+from\s+'\.\/routes\/([^']+)\.js'/g)) {
    byVariable.set(m[1], `${m[2]}.ts`);
  }
  return byVariable;
}

/** Every `router.<verb>('<path>'` a route file declares. */
function readRoutePaths(file: string): string[] {
  const full = join(ROUTES_DIR, file);
  try {
    if (!statSync(full).isFile()) return [];
  } catch {
    return [];
  }
  const src = readFileSync(full, 'utf8');
  const paths: string[] = [];
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete|all)\(\s*['`]([^'`]+)['`]/g)) {
    paths.push(m[2]);
  }
  return paths;
}

function buildServedPatterns(): RegExp[] {
  const imports = readRouterImports();
  const patterns: RegExp[] = [];
  for (const { prefix, variable } of readMounts()) {
    const file = imports.get(variable);
    if (!file) continue;
    for (const p of readRoutePaths(file)) {
      const joined = `${prefix}${p === '/' ? '' : p}`.replace(/\/+/g, '/');
      patterns.push(patternToRegex(joined));
    }
  }
  return patterns;
}

function walkFrontend(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFrontend(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\./.test(entry)) out.push(full);
  }
  return out;
}

/**
 * API paths the frontend requests. Literal ones only: a path assembled from a
 * variable cannot be checked here and is left to the browser tests.
 */
function readRequestedPaths(): Array<{ path: string; file: string }> {
  const found: Array<{ path: string; file: string }> = [];
  const call = /(?:authFetch|apiRequest|fetch)\(\s*(?:'|`)([^'`$]*\/api\/[^'`$]*)(?:'|`)/g;
  const apiPathHelper = /apiPath\(\s*(?:'|`)([^'`$]+)(?:'|`)/g;
  for (const file of walkFrontend(FRONTEND_SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(call)) found.push({ path: m[1], file });
    for (const m of src.matchAll(apiPathHelper)) {
      // apiPath() accepts a path with or without its leading slash.
      const rel = m[1].startsWith('/') ? m[1] : `/${m[1]}`;
      found.push({ path: `/api/v1${rel}`, file });
    }
  }
  return found;
}

/** Strip origin, query and the /api or /api/v1 prefix. */
function normalise(raw: string): string | null {
  let p = raw.trim();
  if (/^https?:\/\//.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return null;
    }
  }
  p = p.split('?')[0].split('#')[0];
  if (!p.startsWith('/api')) return null;
  p = p.replace(/^\/api\/v1/, '').replace(/^\/api/, '');
  if (p === '') p = '/';
  return p.replace(/\/+$/, '') || '/';
}

/**
 * Served outside the registerRoute helper: docs, tracking pixels, the
 * transparent cloud proxies (generic passthrough with no declared route table),
 * better-auth's own handler, health and first-run setup.
 */
const SERVED_ELSEWHERE = [/^\/docs/, /^\/t\//, /^\/google\//, /^\/microsoft\//, /^\/auth\//, /^\/health/, /^\/setup/];

function shortPath(file: string): string {
  const marker = `frontend${/\\/.test(file) ? '\\' : '/'}`;
  const i = file.lastIndexOf(marker);
  return i === -1 ? file : file.slice(i);
}

describe('every API path the frontend calls is served by the backend', () => {
  const patterns = buildServedPatterns();
  const requested = readRequestedPaths();

  it('found routes and frontend calls to compare', () => {
    expect(patterns.length).toBeGreaterThan(100);
    expect(requested.length).toBeGreaterThan(50);
  });

  it('no NEW frontend call points at a route that does not exist', () => {
    const orphans: string[] = [];
    for (const { path, file } of requested) {
      const p = normalise(path);
      if (!p) continue;
      if (SERVED_ELSEWHERE.some((re) => re.test(p))) continue;
      if (KNOWN_BROKEN.has(p)) continue;
      if (!patterns.some((re) => re.test(p))) {
        orphans.push(`${p}   <- ${shortPath(file)}`);
      }
    }
    expect(orphans.sort()).toEqual([]);
  });

  it('the known-broken list only shrinks: every entry is still broken', () => {
    // A fixed endpoint must be deleted from KNOWN_BROKEN, or the list rots into
    // an amnesty nobody rereads.
    const nowServed = [...KNOWN_BROKEN].filter((p) => patterns.some((re) => re.test(p)));
    expect(nowServed.sort()).toEqual([]);
  });

  it('every known-broken entry is still called by the frontend', () => {
    // If nothing calls it any more the line is stale; delete it.
    const called = new Set(
      requested.map(({ path }) => normalise(path)).filter((p): p is string => p !== null),
    );
    const stale = [...KNOWN_BROKEN].filter((p) => !called.has(p));
    expect(stale.sort()).toEqual([]);
  });
});
