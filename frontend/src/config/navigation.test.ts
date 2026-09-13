import { describe, it, expect } from 'vitest';
import { FEATURE_REGISTRY } from '../../../backend/src/config/feature-registry';
import {
  ADMIN_NAV,
  USER_NAV,
  PAGES,
  NOT_FOUND_PAGE,
  getPageFromPath,
  getPathForPage,
  type NavSectionDef,
  type PageDef,
} from './navigation';

/**
 * Navigation invariants (docs/RELEASING.md). A failure here means turning a
 * feature off would NOT remove it everywhere, or the same page is reachable
 * from two places in the menu.
 */

const REGISTERED = new Map(FEATURE_REGISTRY.map((f) => [f.key, f]));
const pages = Object.entries(PAGES) as Array<[string, PageDef]>;
const navItems = (nav: NavSectionDef[]) => nav.flatMap((s) => s.items);

describe('every page and nav item is tied to a registered feature flag', () => {
  it.each(pages)('page %s gates on a registered flag', (_id, def) => {
    expect(REGISTERED.has(def.flag), `flag "${def.flag}" is not in backend/src/config/feature-registry.ts`).toBe(true);
  });

  it('every admin nav item maps to a registered flag', () => {
    for (const item of navItems(ADMIN_NAV)) {
      const flag = PAGES[item.page]?.flag;
      expect(flag, `admin nav item ${item.page} has no page definition`).toBeDefined();
      expect(REGISTERED.has(flag), `admin nav item ${item.page} -> unregistered flag "${flag}"`).toBe(true);
    }
  });

  it('every employee nav item maps to a registered flag', () => {
    for (const item of navItems(USER_NAV)) {
      expect(REGISTERED.has(PAGES[item.page].flag)).toBe(true);
    }
  });

  it('every page has at least one route', () => {
    for (const [id, def] of pages) {
      expect(def.adminPath ?? def.userPath, `page ${id} has no route`).toBeDefined();
    }
  });
});

describe('one canonical nav path per function', () => {
  it.each([['admin', ADMIN_NAV], ['employee', USER_NAV]] as const)('no two %s nav entries point to the same page', (_name, nav) => {
    const ids = navItems(nav).map((i) => i.page);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('no two nav entries share a test id', () => {
    const ids = [...navItems(ADMIN_NAV), ...navItems(USER_NAV)].map((i) => i.testId);
    // The same page in both navs (Home, Org Chart) may reuse an id only if it is the same page.
    const byId = new Map<string, Set<string>>();
    for (const item of [...navItems(ADMIN_NAV), ...navItems(USER_NAV)]) {
      byId.set(item.testId, (byId.get(item.testId) ?? new Set()).add(item.page));
    }
    for (const [testId, pageIds] of byId) expect([testId, pageIds.size]).toEqual([testId, 1]);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('no two pages claim the same URL', () => {
    const seen = new Map<string, string>();
    for (const [id, def] of pages) {
      for (const path of [def.adminPath, def.userPath, ...(def.aliases ?? [])]) {
        if (!path) continue;
        expect(seen.get(path) ?? id, `${path} is claimed by both ${seen.get(path)} and ${id}`).toBe(id);
        seen.set(path, id);
      }
    }
  });
});

describe('URL <-> page mapping', () => {
  it('every route and alias resolves back to its own page', () => {
    for (const [id, def] of pages) {
      for (const path of [def.adminPath, def.userPath, ...(def.aliases ?? [])]) {
        if (path) expect([path, getPageFromPath(path)]).toEqual([path, id]);
      }
    }
  });

  it('sub-paths resolve to the most specific page', () => {
    expect(getPageFromPath('/admin/onboarding-templates/edit')).toBe('edit-onboarding-template');
    expect(getPageFromPath('/admin/onboarding-templates/new')).toBe('new-onboarding-template');
    expect(getPageFromPath('/admin/users/123')).toBe('users');
    expect(getPageFromPath('/admin/org-chart/')).toBe('orgChart');
  });

  it('unknown URLs are "not found", not silently the dashboard', () => {
    expect(getPageFromPath('/admin/org-chart-typo')).toBe(NOT_FOUND_PAGE);
    expect(getPageFromPath('/admin/nope')).toBe(NOT_FOUND_PAGE);
    expect(getPageFromPath('/nope')).toBe(NOT_FOUND_PAGE);
  });

  it('navigating to a page id lands on that page (the old "org-chart" id did not exist)', () => {
    for (const [id] of pages) {
      for (const view of ['admin', 'user'] as const) {
        const path = getPathForPage(id, view);
        expect(path && getPageFromPath(path)).toBe(id);
      }
    }
    expect(getPathForPage('org-chart', 'admin')).toBeUndefined();
  });
});

/** Raw source of the app, for checks that are about text rather than behaviour. */
const SOURCES = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('flag registry is used', () => {
  it('every non-operational registered flag gates something in the frontend', () => {
    // Guard against the glob silently matching nothing (which would pass everything).
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(Object.keys(SOURCES)).toContain('../App.tsx');
    const all = Object.values(SOURCES).join('\n');
    const unused = FEATURE_REGISTRY
      .filter((f) => !f.operational)
      .filter((f) => !all.includes(`'${f.key}'`))
      .map((f) => f.key);
    expect(unused).toEqual([]);
  });
});

/**
 * No "coming soon" on a release surface. Placeholders may exist only in files
 * that are reachable solely through a NON-stable feature, listed here with the
 * flag that hides them. Ratchet: removing the placeholder means deleting the
 * entry; a new placeholder on a stable surface fails the build.
 */
const PLACEHOLDERS_BEHIND_FLAGS: Record<string, string> = {
  'pages/RulesEngine.tsx': 'automation.rules_engine',
  'pages/UserOnboardingPortal.tsx': 'employee.onboarding_portal',
  'pages/UserSettings.tsx': 'employee.settings',
};

describe('release surfaces carry no "coming soon" placeholders', () => {
  it('only files behind non-stable flags mention "coming soon"', () => {
    const offenders: string[] = [];
    const matched = new Set<string>();
    for (const [path, raw] of Object.entries(SOURCES)) {
      // Comments are not UI; strip them before looking.
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      if (!/coming soon/i.test(code)) continue;
      const rel = path.replace(/^\.\.\//, '');
      if (rel in PLACEHOLDERS_BEHIND_FLAGS) matched.add(rel);
      else offenders.push(rel);
    }
    expect(offenders).toEqual([]);
    expect([...matched].sort()).toEqual(Object.keys(PLACEHOLDERS_BEHIND_FLAGS).sort());
  });

  it.each(Object.entries(PLACEHOLDERS_BEHIND_FLAGS))('%s is only reachable through non-stable flag %s', (_file, flag) => {
    const def = REGISTERED.get(flag);
    expect(def).toBeDefined();
    expect(def?.maturity).not.toBe('stable');
  });
});
