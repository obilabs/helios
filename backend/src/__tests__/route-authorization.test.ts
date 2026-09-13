/**
 * Route Authorization Coverage — admin-by-default for org-wide mutations.
 *
 * WHY THIS EXISTS
 * ---------------
 * route-auth-coverage.test.ts proves every route is AUTHENTICATED. That is not
 * enough: a router that only runs `authenticateToken` lets every signed-in user,
 * whatever their role, run the handler. Routes that change organization-wide
 * state (users, groups, lifecycle actions, bulk jobs, credentials, settings)
 * must also require an admin.
 *
 * WHAT THIS TESTS (source analysis, no build / DB / network)
 * ----------------------------------------------------------
 * For every router mounted in index.ts:
 *   1. every POST / PUT / PATCH / DELETE route carries an admin guard —
 *      `requireAdmin` (the canonical guard, middleware/auth.ts),
 *      `requirePermission('admin')`, or automation's `requireRole([...])`
 *      (admin roles always pass, utils/roles.ts) — either on the route or via
 *      `router.use(requireAdmin)` — OR it is in NON_ADMIN_MUTATIONS /
 *      SELF_SERVICE_ROUTERS below with the reason it is legitimately open to
 *      non-admins;
 *   2. every route in ADMIN_ONLY_READS (sensitive org-wide GETs) is admin-guarded;
 *   3. route definitions use the `router.METHOD('path', ...)` form at column 0,
 *      so nothing escapes the analysis;
 *   4. the allowlists contain no stale entries.
 *
 * Behavioural 403 checks for a sample of these routes live in
 * route-authorization.behaviour.test.ts.
 *
 * WHEN THIS FAILS
 * ---------------
 * You added a mutating route without `requireAdmin`. Add it. If non-admins
 * genuinely need the route (self-service, assignee workflow), add an entry to
 * NON_ADMIN_MUTATIONS explaining why, and make sure the handler itself limits
 * what the caller can touch. Do not loosen the matcher.
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(HERE, '..', 'routes');
const INDEX_TS = join(HERE, '..', 'index.ts');

const ADMIN_GUARD = /\brequireAdmin\b|\brequirePermission\(\s*['"]admin['"]\s*\)|\brequireRole\(/;
const ROUTER_LEVEL_ADMIN = /^router\.use\(\s*requireAdmin\b/m;
const ROUTE_DEF = /^router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]*)\2/;
const INDENTED_ROUTE_DEF = /^\s+router\.(get|post|put|patch|delete)\(/;

/**
 * Whole routers whose every route acts only on the caller (or is pre-session
 * / separately authenticated). Their handlers derive the target from the
 * session, never from a path/body id.
 */
const SELF_SERVICE_ROUTERS: Record<string, string> = {
  'auth.routes.ts': 'Login/logout/password setup — runs before or for the caller\'s own session.',
  'me.routes.ts': 'Caller\'s own profile, media, privacy and preferences (req.user.userId).',
  'user-preferences.routes.ts': 'Caller\'s own UI preferences.',
  'user.routes.ts': 'Caller\'s own account (change own password).',
  'mtp.routes.ts': 'Authenticated by the MTP pairing key (router.use(authenticateMtpPairing)), not a user session.',
};

/**
 * Individual mutating routes that are deliberately NOT admin-only. Key format:
 * "<file> <METHOD> <path>". Each needs a reason, and the handler must scope the
 * action itself.
 */
const NON_ADMIN_MUTATIONS: Record<string, string> = {
  'organization.routes.ts POST /setup':
    'First-run bootstrap: public, but requires the one-time setup token and is closed (409) once an organization exists.',
  'organization.routes.ts PATCH /users/:userId/status':
    'Admin, or a manager changing the status of their OWN direct report (checked in the handler against reporting_manager_id).',
  'custom-fields.routes.ts PUT /user/:userId':
    'A user may update their own custom field values; anyone else requires admin (checked in the handler).',
  'dashboard.routes.ts PUT /widgets': 'Caller\'s own dashboard layout (keyed by req.user.userId).',
  'ai.routes.ts POST /chat':
    'Per-user assistant chat; tool availability is limited by the AI role in the handler. No org-wide write.',
  'audit-logs.routes.ts POST /console':
    'Appends the caller\'s own console command to the activity log; no other state changes.',
  'lifecycle.routes.ts POST /requests':
    'Managers/HR submit onboarding or offboarding requests; nothing runs until an admin approves (approve/reject are admin-only).',
  'lifecycle.routes.ts POST /tasks/:id/complete': 'Lifecycle task assignees (manager, HR, the new hire) complete their own checklist items.',
  'lifecycle.routes.ts POST /tasks/:id/skip': 'Lifecycle task assignees may skip their own checklist items.',
  'lifecycle.routes.ts POST /tasks/:id/start': 'Lifecycle task assignees may start their own checklist items.',
  'training.routes.ts POST /progress/:contentId/start': 'Caller\'s own training progress.',
  'training.routes.ts POST /progress/:contentId/update': 'Caller\'s own training progress.',
  'training.routes.ts POST /progress/:contentId/complete': 'Caller\'s own training progress.',
  'training.routes.ts POST /progress/:contentId/acknowledge': 'Caller\'s own training acknowledgement.',
  'training.routes.ts POST /progress/:contentId/submit-quiz': 'Caller\'s own quiz submission.',
};

/** Org-wide sensitive reads that must be admin-only. */
const ADMIN_ONLY_READS: string[] = [
  'organization.routes.ts GET /users/export',
  'organization.routes.ts GET /users/:userId/email-settings',
  'organization.routes.ts GET /users/:userId/snapshots',
  'organization.routes.ts GET /users/:userId/google-license',
  'organization.routes.ts GET /delegations',
  'audit-logs.routes.ts GET /',
  'audit-logs.routes.ts GET /export',
  'email-security.routes.ts GET /search',
  'email-security.routes.ts GET /history',
  'login-activity.routes.ts GET /',
  'login-activity.routes.ts GET /map',
  'login-activity.routes.ts GET /stats',
  'bulk-operations.routes.ts GET /history',
  'bulk-operations.routes.ts GET /status/:id',
  'api-keys.routes.ts GET /',
  'external-sharing.routes.ts GET /summary',
  'microsoft.routes.ts GET /migration/plan',
  'relay.routes.ts GET /config',
  'initial-passwords.routes.ts GET /:email',
];

interface RouteDef {
  file: string;
  method: string;
  path: string;
  line: number;
  adminGuarded: boolean;
}

const indexSource = readFileSync(INDEX_TS, 'utf8');

function isMounted(file: string): boolean {
  const needle = `routes/${file.replace(/\.ts$/, '')}.js`;
  return indexSource.split('\n').some((line) => {
    const t = line.trim();
    return !t.startsWith('//') && !t.startsWith('*') && line.includes(needle);
  });
}

function parseRoutes(file: string): { routes: RouteDef[]; indented: number[] } {
  const source = readFileSync(join(ROUTES_DIR, file), 'utf8');
  const lines = source.split('\n');
  const routerLevel = ROUTER_LEVEL_ADMIN.test(source);
  const routes: RouteDef[] = [];
  const indented: number[] = [];
  lines.forEach((line, i) => {
    if (INDENTED_ROUTE_DEF.test(line)) indented.push(i + 1);
    const m = line.match(ROUTE_DEF);
    if (!m) return;
    // The middleware chain is everything before the handler function starts.
    const head = lines
      .slice(i, i + 12)
      .join('\n')
      .split(/async\s*\(|\(\s*req\b|asyncHandler\(/)[0];
    routes.push({
      file,
      method: m[1].toUpperCase(),
      path: m[3],
      line: i + 1,
      adminGuarded: routerLevel || ADMIN_GUARD.test(head),
    });
  });
  return { routes, indented };
}

const mountedFiles = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith('.routes.ts'))
  .filter(isMounted);

const parsed = new Map(mountedFiles.map((f) => [f, parseRoutes(f)]));
const allRoutes = [...parsed.values()].flatMap((p) => p.routes);
const key = (r: RouteDef) => `${r.file} ${r.method} ${r.path}`;

describe('Route authorization coverage (admin guard on org-wide routes)', () => {
  it('found mounted routers and routes to analyse', () => {
    expect(mountedFiles.length).toBeGreaterThan(40);
    expect(allRoutes.length).toBeGreaterThan(300);
  });

  it('route definitions are all at column 0 (nothing escapes the analysis)', () => {
    const offenders = [...parsed.entries()]
      .filter(([, p]) => p.indented.length > 0)
      .map(([f, p]) => `${f}: lines ${p.indented.join(', ')}`);
    expect(offenders).toEqual([]);
  });

  describe('every mutating route requires admin or is an allowlisted exception', () => {
    for (const file of mountedFiles) {
      it(file, () => {
        if (SELF_SERVICE_ROUTERS[file]) return;
        const gaps = parsed
          .get(file)!
          .routes.filter((r) => r.method !== 'GET' && !r.adminGuarded && !NON_ADMIN_MUTATIONS[key(r)])
          .map((r) => `    line ${r.line}: ${r.method} ${r.path}`);
        if (gaps.length > 0) {
          throw new Error(
            `${file} has ${gaps.length} mutating route(s) without an admin guard:\n${gaps.join('\n')}\n\n` +
              '  Add requireAdmin (middleware/auth.ts), or — if non-admins legitimately need it — ' +
              'add "<file> <METHOD> <path>" to NON_ADMIN_MUTATIONS with the reason.',
          );
        }
      });
    }
  });

  it('sensitive org-wide reads are admin-only', () => {
    const byKey = new Map(allRoutes.map((r) => [key(r), r]));
    const problems = ADMIN_ONLY_READS.flatMap((k) => {
      const r = byKey.get(k);
      if (!r) return [`${k}: route not found (renamed? update ADMIN_ONLY_READS)`];
      return r.adminGuarded ? [] : [`${k}: not admin-guarded`];
    });
    expect(problems).toEqual([]);
  });

  it('allowlists have no stale entries', () => {
    const byKey = new Map(allRoutes.map((r) => [key(r), r]));
    const stale: string[] = [];
    for (const k of Object.keys(NON_ADMIN_MUTATIONS)) {
      const r = byKey.get(k);
      if (!r) stale.push(`${k}: route no longer exists`);
      else if (r.adminGuarded) stale.push(`${k}: now admin-guarded — remove it from NON_ADMIN_MUTATIONS`);
    }
    for (const file of Object.keys(SELF_SERVICE_ROUTERS)) {
      if (!mountedFiles.includes(file)) stale.push(`${file}: not a mounted router`);
    }
    expect(stale).toEqual([]);
  });

  it('no route checks the caller with role !== \'admin\' (use isAdminRole from utils/roles.ts)', () => {
    // Authorization refusals compare the caller's role (req.user.role / userRole)
    // with !== 'admin'; equality checks elsewhere describe a TARGET role.
    const direct = /(req\.user\??\.role|\buserRole)\s*!==?\s*['"](admin|super_admin)['"]/;
    const offenders = mountedFiles.flatMap((file) =>
      readFileSync(join(ROUTES_DIR, file), 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => direct.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .map(({ n, line }) => `${file}:${n}: ${line.trim().slice(0, 80)}`),
    );
    expect(offenders).toEqual([]);
  });
});
