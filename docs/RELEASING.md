# Releasing Helios

Helios is developed with everything switched on and released with only finished
work switched on. The mechanism is a **feature registry** plus a **release
profile**.

## The rule

- **While developing or testing:** every feature is enabled.
- **A versioned release (v1.0.0, v2.0.0, ...)** ships with only finished
  (`stable`) features enabled.

## How it works

### One registry

Every feature flag is defined once, in
[`backend/src/config/feature-registry.ts`](../backend/src/config/feature-registry.ts),
with a **maturity**:

| Maturity       | `development` profile | `release` profile                                                     |
|----------------|-----------------------|-----------------------------------------------------------------------|
| `stable`       | on                    | on                                                                    |
| `preview`      | on                    | off by default; an admin can enable it in **Settings > Advanced > Features** (shown with a "Preview" badge) |
| `experimental` | on                    | unavailable: hidden, cannot be enabled, stored overrides are ignored  |

- `core.*` flags (Home, Users, Settings, My Profile) are required and always on.
- `operational` flags (e.g. `api_relay`) are runtime switches, not product
  surfaces; the profile does not change them.
- The `feature_flags` table stores **only an organization's overrides**
  (`is_override = true`). Defaults are never written to SQL.

### One profile switch

The backend reads `HELIOS_FEATURE_PROFILE`:

| Where                                  | Profile       |
|----------------------------------------|---------------|
| Published image (`backend/Dockerfile.prod`) | `release` |
| `docker-compose.yml` (production)      | `release` (override with `HELIOS_FEATURE_PROFILE`) |
| `docker-compose.dev.yml`               | `development` |
| E2E stack (`e2e/docker-compose.e2e.yml`) | `development` |
| Unset or any other value               | `release`     |

A typo can never ship experimental features: only the exact value
`development` turns everything on.

### Everything is tied to a flag

Pages, sidebar items, routes and their URLs live in
[`frontend/src/config/navigation.ts`](../frontend/src/config/navigation.ts); each
page names the flag that gates it. Settings tabs name theirs in
`frontend/src/components/Settings.tsx`. Turning a flag off removes the feature
from the sidebar, dashboard shortcuts, search, and direct URLs (which show a
"not enabled" page instead of the feature).

## Checks that fail the build

| Check | Where |
|-------|-------|
| In `release`, no `experimental` flag resolves on (by default, by stored override, or via the API) | `backend/src/__tests__/feature-registry.test.ts` |
| Every admin (and employee) nav item and page maps to a registered flag | `frontend/src/config/navigation.test.ts` |
| No two nav entries point to the same page; no two pages claim the same URL | `frontend/src/config/navigation.test.ts` |
| Every registered flag actually gates something | `frontend/src/config/navigation.test.ts` |
| "Coming soon" text appears only in files reachable solely through non-stable flags | `frontend/src/config/navigation.test.ts` |

## Promoting a feature to `stable`

Changing `maturity` to `stable` is a one-line change in the registry. Make it
only when the feature meets **all** of these:

1. **It has tests.** Backend behaviour covered by tests that run in CI; the
   screens it adds have at least a smoke path (Playwright where the flow is
   critical).
2. **No "coming soon" text.** No placeholder copy, disabled "not yet"
   controls, `alert('...coming soon')`, or inputs that do not save. Remove its
   entry from `PLACEHOLDERS_BEHIND_FLAGS` in `navigation.test.ts`; the test
   refuses a stable flag in that list.
3. **Docs.** A user-facing description of what it does and how to set it up.
4. **It passes the UI bar.** Follows `DESIGN-SYSTEM.md` (Lucide icons, tokens,
   spacing), works at tablet and mobile widths, has honest empty/error/loading
   states, and uses Google vocabulary on Google screens (Microsoft copy only
   when a Microsoft tenant is connected).

Demoting works the same way in reverse, and needs no checklist: if a stable
surface turns out to be broken or placeholder, demote it and say why in the PR.

## Version numbers

| Release | Contains | Schema |
|---------|----------|--------|
| Patch (1.2.x) | Fixes and dependency security updates | Additive only |
| Minor (1.x.0) | New features | Additive only |
| Major (x.0.0) | May remove or rename things | Flattened baseline plus one upgrade migration |

Installs upgrade in place through minors and patches, and one major at a time.
What that means for someone running Helios is in [UPGRADING.md](UPGRADING.md).

Before a major, every migration since the previous major is flattened into one
baseline schema for fresh installs, plus one upgrade migration from the last
minor of the previous major. Nothing before v1.0.0 has an upgrade route.

## The release gate

A version is tagged only when every row below passes **on the commit being
tagged**. A red row means no tag. Merging to `main` does not release anything:
it publishes the `edge` image, which is for testing.

| # | Check | How it runs today |
|---|-------|-------------------|
| 1 | Unit and integration tests, backend and frontend | CI, every PR and `main` |
| 2 | Fresh-install schema builds; backend SQL matches it | CI, every PR and `main` |
| 3 | Setup wizard and sign-in in a real browser, on a disposable stack | CI, every PR and `main` |
| 4 | No `experimental` feature on in the `release` profile; no placeholder text behind a stable flag | CI, every PR and `main` |
| 5 | No open dependency alert rated high or critical (`npm audit` in each package root) | By hand. Not yet a CI check. |
| 6 | **Upgrade test.** Start the previous release with seed data and an admin account, switch to the candidate image, then: migrations apply, the schema equals a fresh install's, the data is intact, the old admin signs in. Repeat from x.0.0 of the current major. | **Not built.** There is no previous release until v1.0.0. Until it exists, a PR that changes sign-in or rewrites rows must show this test done by hand in its description. |
| 7 | **Contract test** with other ObiLabs products: the calls between them, against each neighbour's current stable release | **Not built.** |
| 8 | Full pass against a real Google Workspace test tenant, following `docs/guides/GOOGLE-WORKSPACE-E2E-RUNBOOK.md`, with no open blocker | By hand, on the candidate image |
| 9 | Smoke test of the tagged image (step 4 below) | By hand |

Rows 6 and 7 must be automated before v1.1.0, because that is the first release
anyone upgrades to.

## Cutting a release

1. Review the registry: every `stable` entry meets the promotion bar above.
2. Work through [the release gate](#the-release-gate) on the commit you intend
   to tag. Every row passes, or there is no tag.
3. Tag `vX.Y.Z` on `main` (via the normal PR flow; never push `main` directly).
   The published images default to the `release` profile. Add the version's
   section to the upgrade notes in [UPGRADING.md](UPGRADING.md) in the same PR.
4. Smoke-test the tagged image with `docker compose up` and no
   `HELIOS_FEATURE_PROFILE` set: only stable features should be visible, and
   Settings > Advanced > Features should list preview features as off.
