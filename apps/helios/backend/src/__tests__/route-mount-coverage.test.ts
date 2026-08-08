/**
 * Route Mount Coverage — no silent dead route files.
 *
 * WHY THIS EXISTS
 * ---------------
 * A `*.routes.ts` file that defines handlers but is never imported/mounted in
 * index.ts is dead code. That is bad in two directions:
 *
 *   1. False severity — a security review flags "unauthenticated upload in
 *      photos.routes.ts" as critical, when the router is not wired up at all and
 *      is unreachable. Effort is misdirected. (This happened in the 2026-07-23
 *      audit: photos.routes.ts was called CRITICAL, then runtime probing on
 *      2026-07-25 returned 404 — it is not mounted.)
 *   2. Latent risk — the file sits there looking legitimate. Someone later wires
 *      it up with a one-line registerRoute() and, if it lacked a guard, ships a
 *      hole with no fresh review.
 *
 * WHAT THIS TESTS
 * ---------------
 * Every `routes/*.routes.ts` file must be EITHER imported by index.ts OR listed
 * in KNOWN_UNMOUNTED below with a reason. Source-analysis only — no build, no DB.
 *
 * WHEN THIS FAILS
 * ---------------
 * - You added a route file and forgot to mount it → mount it, or list it here.
 * - You listed a file here but then mounted it → remove it from the list.
 * The point is that "this router is not wired up" is always a CONSCIOUS, recorded
 * decision, never an accident.
 *
 * DECISION STILL OWED (owner): each entry below is dead code today. It should be
 * either wired up (after an auth review) or deleted. Until then it is quarantined
 * here so it cannot be forgotten.
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTES_DIR = join(HERE, '..', 'routes');
const INDEX_TS = join(HERE, '..', 'index.ts');

/**
 * Route files that are deliberately NOT mounted, with the reason. Every one is
 * dead code pending an owner decision to wire-up-and-review or delete.
 */
const KNOWN_UNMOUNTED: Record<string, string> = {
  // contacts/users/setup deleted 2026-07-27 — superseded dead code (people /
  // singular user / organization bootstrap). Removed from the tree, so removed here.
  'photos.routes.ts': 'Never wired up. Guarded defensively (route-auth-coverage) but unreachable. Wire-and-review or delete.',
  'helpdesk.routes.ts': 'Not mounted. Likely a planned feature. Wire-and-review or delete.',
  'domains.routes.ts': 'Not mounted. Wire-and-review or delete.',
  'assets-public.routes.ts': 'Not mounted. Public asset serving — if wired, must stay public-by-design and be reviewed.',
  'assets-simple.routes.ts': 'Not mounted. Wire-and-review or delete.',
  'public-assets.routes.ts': 'Not mounted. Public-by-design if wired; review.',
  'public-files.routes.ts': 'Not mounted. Public-by-design if wired; review.',
  'signature-templates.routes.ts': 'Not mounted; signature surface is served by signatures.routes.ts and the signature-* family. Wire-and-review or delete.',
};

const routeFiles = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts'));
const indexSource = readFileSync(INDEX_TS, 'utf8');

/**
 * A router is "mounted" if index.ts imports it by filename on a NON-COMMENTED
 * line. `import x from './routes/foo.routes.js'` — we match the `foo.routes`
 * stem and require the line to not be commented out.
 */
function isMountedInIndex(routeFile: string): boolean {
  const stem = routeFile.replace(/\.ts$/, ''); // e.g. "photos.routes"
  const needle = `routes/${stem}.js`;
  return indexSource.split('\n').some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
    return line.includes(needle);
  });
}

describe('Route mount coverage (no silent dead route files)', () => {
  it('found route files to analyse', () => {
    expect(routeFiles.length).toBeGreaterThan(40);
  });

  describe('every route file is either mounted or explicitly known-unmounted', () => {
    for (const file of routeFiles) {
      it(`${file}`, () => {
        const mounted = isMountedInIndex(file);
        const listed = file in KNOWN_UNMOUNTED;

        if (mounted && listed) {
          throw new Error(
            `${file} is BOTH mounted in index.ts AND listed in KNOWN_UNMOUNTED. ` +
              `It is now wired up — remove it from KNOWN_UNMOUNTED (and confirm it ` +
              `has an auth guard: see route-auth-coverage.test.ts).`,
          );
        }

        if (!mounted && !listed) {
          throw new Error(
            `${file} is DEAD CODE — defined but never imported/mounted in index.ts.\n` +
              `  Either mount it (and add an auth guard), or add it to ` +
              `KNOWN_UNMOUNTED with a reason.\n` +
              `  Do not leave a route file unmounted and unrecorded — that is how a ` +
              `hole ships when someone wires it up later without review.`,
          );
        }

        expect(mounted || listed).toBe(true);
      });
    }
  });

  it('KNOWN_UNMOUNTED has no stale entries (all still exist and are still unmounted)', () => {
    for (const file of Object.keys(KNOWN_UNMOUNTED)) {
      expect(routeFiles).toContain(file);
      expect(isMountedInIndex(file)).toBe(false);
    }
  });
});
