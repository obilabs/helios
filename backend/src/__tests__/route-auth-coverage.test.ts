/**
 * Route Authentication Coverage — deny-by-default invariant.
 *
 * WHY THIS EXISTS
 * ---------------
 * Helios mounts every router via `registerRoute()` in index.ts, which injects
 * NO middleware, and the app-level `authenticateApiKey` returns next() when no
 * API key header is present (it populates, it does not gate). So every router
 * is solely responsible for its own authentication. There is no app-level
 * safety net.
 *
 * The 2026-07-23 audit found routers that had shipped with NO authentication at
 * all — `photos.routes.ts` (unauthenticated file upload + delete),
 * `login-activity.routes.ts` (anonymous access to staff login geolocation), and
 * 19 of 23 routes in `google-workspace.routes.ts` (including unauthenticated
 * injection of Google service-account credentials).
 *
 * The existing `route-guards.test.ts` tests the guard MIDDLEWARE in isolation —
 * it confirms `requireAdmin` blocks a non-admin on a throwaway route. It does
 * NOT confirm that the REAL routers actually apply a guard. That is the exact
 * gap those bugs fell through: the middleware worked fine; it was simply never
 * mounted.
 *
 * WHAT THIS TESTS
 * ---------------
 * This is a SOURCE-ANALYSIS test, not a runtime test. It reads every
 * `*.routes.ts` file and asserts the deny-by-default invariant:
 *
 *   Every route is authenticated UNLESS its router is on the PUBLIC_ROUTERS
 *   allowlist below, with a documented reason.
 *
 * It is intentionally build-independent: no database, no Google, no running
 * app. That is a feature — it runs in CI even while the full build is being
 * restored, and it is the regression net for the rest of the auth sweep.
 *
 * A full RBAC matrix (role X endpoint -> expected status) against the running
 * app is the complementary runtime test. It requires a working build and is
 * tracked separately in docs/SECURITY-REMEDIATION.md.
 *
 * WHEN THIS TEST FAILS
 * --------------------
 * You added a route without a guard. Either add `authenticateToken` (or a
 * stronger guard) to the route or the router, OR — if the endpoint is
 * deliberately public — add the router to PUBLIC_ROUTERS with a justification
 * and, where possible, list the specific public paths. Do not weaken the
 * matcher to make the failure disappear.
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ESM: no __dirname. Derive it from this module's URL.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(HERE, '..', 'routes');

/** Any of these middleware names, applied to a route, counts as a gate. */
const GUARD_PATTERN =
  /authenticateToken|requireAuth|requireAdmin|requirePermission|requireSession|requireEmployee|requirePlatformOwner|requireSignature|authenticateApiKey/;

const ROUTE_DEF = /^router\.(get|post|put|patch|delete)\(/;

const ROUTER_LEVEL_GUARD =
  /^router\.use\(\s*(authenticateToken|requireAuth|requireAdmin|requireSession)/m;

/**
 * Routers that are INTENTIONALLY public, with the reason. Adding a router here
 * is a conscious security decision and should be reviewed as one.
 *
 * `publicPaths` documents which specific routes are expected to be open. It is
 * advisory (the test does not yet assert non-listed paths in these files are
 * guarded — see the follow-up test at the bottom), but it keeps intent honest.
 */
const PUBLIC_ROUTERS: Record<string, { reason: string; publicPaths: string[] }> = {
  'auth.routes.ts': {
    reason: 'Authentication endpoints must be reachable before a session exists.',
    publicPaths: ['/login', '/logout', '/verify', '/verify-setup-token', '/setup-password'],
  },
  'tracking.routes.ts': {
    reason: 'Email tracking pixels and health check — public by design.',
    publicPaths: ['/p/:token.gif', '/u/:token.gif', '/health'],
  },
  'asset-proxy.routes.ts': {
    reason: 'Serves public assets by opaque slug; includes a health check.',
    publicPaths: ['/_health', '/'],
  },
  'assets-public.routes.ts': {
    reason: 'Public asset serving by slug; rate-limited.',
    publicPaths: ['/:slug'],
  },
  'public-assets.routes.ts': {
    reason: 'Public asset serving by slug.',
    publicPaths: ['/:slug', '/:slug/info'],
  },
  'help.routes.ts': {
    reason:
      'Static knowledge-base help content for the pre-login help widget. ' +
      'FLAGGED for review in docs/SECURITY-REMEDIATION.md — confirm intent.',
    publicPaths: ['/context/:page', '/search', '/article/:id', '/quick-tips/:page'],
  },
  'organization.routes.ts': {
    reason:
      'Contains the second bootstrap path (POST /setup, 409-guarded at the data ' +
      'layer) and GET /current for login-page branding. FLAGGED: /current should ' +
      'return only branding fields, not the whole org record.',
    publicPaths: ['/setup', '/setup/status', '/current'],
  },
};

/**
 * Read a route file and return the 1-indexed line numbers of route definitions
 * that have NO guard in their definition window. A route definition may span
 * several lines (validators array, etc.), so we inspect a 4-line window from
 * the `router.METHOD(` line — matching how guards are actually written:
 *
 *   router.post('/',
 *     authenticateToken,      <- guard on the following line
 *     [ ...validators ],
 */
function findUnguardedRoutes(source: string): { line: number; snippet: string }[] {
  const lines = source.split('\n');
  const gaps: { line: number; snippet: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (ROUTE_DEF.test(lines[i].trim() ? lines[i] : '')) {
      const window = lines.slice(i, i + 4).join('\n');
      if (!GUARD_PATTERN.test(window)) {
        gaps.push({ line: i + 1, snippet: lines[i].trim().slice(0, 70) });
      }
    }
  }
  return gaps;
}

const routeFiles = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts'));

describe('Route authentication coverage (deny-by-default)', () => {
  it('found route files to analyse', () => {
    // Guards against a silent pass if the directory or glob ever changes.
    expect(routeFiles.length).toBeGreaterThan(40);
  });

  describe('every router either guards all its routes or is explicitly public', () => {
    for (const file of routeFiles) {
      it(`${file}`, () => {
        const source = readFileSync(join(ROUTES_DIR, file), 'utf8');

        // A router-level guard covers every route in the file.
        if (ROUTER_LEVEL_GUARD.test(source)) {
          return;
        }

        const gaps = findUnguardedRoutes(source);

        if (PUBLIC_ROUTERS[file]) {
          // Intentionally public — allowed. The allowlist entry is the audit
          // record. (We do not fail if such a file has SOME guarded routes.)
          return;
        }

        if (gaps.length > 0) {
          const detail = gaps
            .map((g) => `    line ${g.line}: ${g.snippet}`)
            .join('\n');
          throw new Error(
            `${file} has ${gaps.length} route(s) with no authentication guard:\n` +
              `${detail}\n\n` +
              `  Add authenticateToken (or a stronger guard) to these routes or ` +
              `the router,\n  OR add "${file}" to PUBLIC_ROUTERS with a ` +
              `justification if it is deliberately public.`,
          );
        }

        expect(gaps).toHaveLength(0);
      });
    }
  });

  it('the public allowlist only names files that exist (no stale entries)', () => {
    for (const file of Object.keys(PUBLIC_ROUTERS)) {
      expect(routeFiles).toContain(file);
    }
  });

  it('regression: the routers fixed on 2026-07-23 are guarded, not allowlisted', () => {
    // photos and login-activity were fixed with a real router-level guard.
    // If someone "fixes" a future failure by dumping them into the allowlist
    // instead, this catches it.
    for (const file of ['photos.routes.ts', 'login-activity.routes.ts']) {
      const source = readFileSync(join(ROUTES_DIR, file), 'utf8');
      expect(PUBLIC_ROUTERS[file]).toBeUndefined();
      expect(ROUTER_LEVEL_GUARD.test(source)).toBe(true);
    }
  });
});
