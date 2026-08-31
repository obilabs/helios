# Tasks — Microsoft 365 → Google Workspace Migration Workflow

Helios **orchestrates Google's native import**; it does not move data. Build order: the plan +
provisioning first (Helios's job), then the hand-off + tracking, then UI.

## Phase 0 — Foundations (DONE / shipped)

- [x] Reconcile M365 users into `organization_users` (dual-source link by email; guest/contact/
      staff classification) so they appear in the directory.
- [x] Destination-mapping plan service: generate (same-email default) / setDestination (X→Y,
      consolidation) / reconcileExistence (server checks the Google dest exists) / validate.
- [x] Persist the plan (organization_settings key/value); `GET/PUT /microsoft/migration/plan`.
- [x] **Emit Google's import CSV** (`toGoogleMigrationCsv`, `GET /microsoft/migration/plan/csv`) —
      ready targets only (both accounts must exist).
- [x] Throwaway PoC transfer script + Graph read-path fixtures — kept as a FALLBACK only.

## Phase 1 — Prerequisites (tenant owner)

- [ ] Google side: authorize Google's native Data Import (OAuth DWD as an M365 Global Admin for
      the default method, or an Entra app for the advanced method) and ensure the destination
      Workspace has enough licenses (a mailbox/Drive can't receive without one).
- [ ] Confirm Google's native pipelines are enabled for the tenant (Exchange import, OneDrive→
      Drive, SharePoint→Shared Drives).

## Phase 2 — Provisioning + orchestration (Helios's real work)

- [ ] **Provision destinations**: from the plan's targets, create the Google users that don't yet
      exist (from the M365 identity), assign a license, and set them ready to receive. Reuse the
      existing Google user-create path.
- [ ] **Recreate groups**: turn M365 distribution lists / M365 Groups into Google Groups with
      memberships (Admin SDK), since Google's importer only maps mailbox content onto groups that
      already exist.
- [ ] **Hand-off**: from a reviewed plan, produce the mapping CSV and deep-link / guide the admin
      into Google's native import (Exchange, OneDrive, SharePoint pipelines).
- [ ] **Track**: per-user migration status (provisioned → import queued → done), surfaced in the
      directory and tied to offboarding/lifecycle.
- [ ] License-aware guardrails: block provisioning a destination that has no license; warn on
      tier-gated features (see license-gating work).

## Phase 3 — UI workflow

- [ ] Directory → select M365 candidates (single / multi / all-M365).
- [ ] Provision screen: create the missing Google destinations + license them.
- [ ] Mapping screen: per user choose destination (same-email / a DIFFERENT existing account /
      consolidate), show validation; save via PUT /migration/plan; download the CSV.
- [ ] Launch/track: link to Google's native import with the CSV; show per-user status.

## Phase 4 — Explicitly out of scope (document, don't build)

- [ ] Note in-product that Teams, public folders, SharePoint lists/metadata, file version history,
      resource calendars, 1-to-many mailbox split, and long mail coexistence/delta are **not**
      covered by Google's native tool and are third-party territory (CloudFuze/ShareGate/BitTitan)
      — Helios surfaces the gap, it does not fill it.
- [ ] On-prem/hybrid Exchange → GWMME (not the native cloud import).
