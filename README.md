# Helios (clean monorepo)

<!--
Badges activate once this repo is public on GitHub under the company org. Replace
OWNER/REPO with the real path. Kept here so the security posture is visible on the
repo's front page — verify, don't trust.
-->
<!-- badges:start -->
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![CodeQL](https://github.com/OWNER/REPO/actions/workflows/codeql.yml/badge.svg)](../../actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/OWNER/REPO/badge)](https://securityscorecards.dev/viewer/?uri=github.com/OWNER/REPO)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Security Policy](https://img.shields.io/badge/security-policy-brightgreen.svg)](SECURITY.md)
<!-- badges:end -->

Google Workspace security & management. **This is the consolidated, single-repo
version** of Helios — built side-by-side with the old nested-repo layout so it can be
tested and swapped in without risky in-place git surgery.

> **Working name / location is temporary** (`helios-v2`). Rename to `helios` and move
> under the company org when the business/name is finalized.

## Why this exists

The previous structure was a parent `helios` repo containing separate *nested* git
repos (`helios-client`, `helios-mtp`, …) plus a large uncommitted migration — messy,
un-CI-able, and error-prone. This is the clean replacement: **one git repo, one
history, an Aegis-style `apps/` layout.**

## Layout

```
apps/
  client/            ← the Helios app (Express backend + Vite/React frontend)
    backend/
    frontend/
    database/
    docker-compose.yml
packages/            ← shared code as it emerges (e.g. the licensing client)
.github/workflows/   ← CI: typecheck + tests + build on every push/PR
```

`apps/client` is the current, working Helios client — including all the security work
(deny-by-default route auth, encryption-at-rest for service-account keys, the relay
authorization engine, and the enforcement tests). The near-empty former apps
(`mtp`, `owner`, `web`) are **not** carried over: `owner`/`web` collapse into the
**shared company control plane** (hosted separately; Helios and Aegis both point to it
for licensing/telemetry), and `mtp` is created fresh here when it's actually built.

## Provenance

Ported from `helios/helios-client` (its git history was left behind deliberately; the
*code*, with all fixes, came across). The old `helios/` tree stays untouched until this
version is verified and swapped in.

## Dev / test

Each app currently manages its own dependencies (workspace hoisting / pnpm+turbo to
fully match Aegis is a later refinement). From the repo root:

```bash
npm run typecheck:backend
npm run test:backend      # relay engine, gw-credentials, route-auth/mount coverage, …
npm run build:frontend
```

Or work inside `apps/client/backend` and `apps/client/frontend` directly.
