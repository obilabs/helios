# Microsoft 365 → Google Workspace Migration Workflow

## Summary

Helios **orchestrates Google's native Data Migration** rather than moving data itself.
Google's native import does the actual transfer (mail/calendar/contacts/tasks from Exchange
Online, OneDrive → Drive, SharePoint → Shared Drives). Helios supplies the two things Google's
tool does **not**: **(1) provisioning the Google destination accounts + groups from the
reconciled M365 directory**, and **(2) the source→destination mapping (as the CSV Google
ingests) + hand-off + tracking**. Built on the shipped directory reconciliation and the
destination-mapping plan service (`migration-plan.service.ts`).

## Problem Statement

- **Google's native Data Migration / Data Import (2026) already does the transfer** — and
  well: Exchange Online → Gmail/Calendar/Contacts/Tasks, OneDrive → Google Drive (GA 2025,
  re-launched Aug 2026), SharePoint → Shared Drives (GA 2025). Free, supported, with a
  source-email → destination-email **CSV mapping** that includes many-to-one **consolidation**.
  A custom transfer engine would be redundant and strictly worse.
- **But Google's tool never provisions users or Google Groups — both accounts must exist
  first** — and it is a standalone admin tool, not tied to a directory/lifecycle workflow.
- Helios already reconciles M365 users into `organization_users` and has the destination-mapping
  plan. The remaining, non-redundant value is **provisioning + orchestration**, not the transfer.

## Goals

- **Provision the Google destination** from the reconciled M365 directory: create the Google
  users (from M365 identities) and recreate M365 distribution lists as Google Groups with
  memberships (Admin SDK — Helios already creates Google users/groups). This is the prerequisite
  Google's importer assumes is already done.
- **Destination mapping with choice** (same-email default, override to a different user Y,
  many-to-one consolidation) — the plan service — and **emit the Google-import CSV**
  (`toGoogleMigrationCsv`, `GET /microsoft/migration/plan/csv`). Its "destination must exist"
  validation *is* Google's hard prerequisite.
- **Hand-off + track**: deep-link / guide the admin into Google's native import (the transfer is
  **admin-started in the Google console — there is no public API to trigger it**), then **track
  progress by reading Google's `data_migration` audit stream** via the Admin SDK Reports API
  (`Activities.list(applicationName=data_migration)`, using the `admin.reports.audit.readonly`
  scope Helios already holds — no new scope). That stream carries setup events
  (`CREATE_CONNECTION`, `CREATE_MIGRATION_MAP`, `START_MIGRATION`, `STOP_MIGRATION`) and per-object
  `MIGRATION` events — `CREATE_GMAIL_MESSAGE`, `CREATE_CALENDAR_EVENT`, `CREATE_CONTACT`,
  `CREATE_FILE`, plus `CRAWL_FAILURE` — each with `EXECUTION_ID`, `SOURCE_IDENTIFIER`,
  `TARGET_IDENTIFIER`, and a status (Success/Failed/Skipped), and it **explicitly covers Exchange
  Online / OneDrive sources**. So per-user completion + failures ARE observable in-Helios; tie them
  to offboarding/lifecycle.

## Non-Goals

- **Building a transfer engine** (mail/drive/calendar/contacts import) — Google's native tool
  does it. The throwaway `scripts/migrate-m365-to-google.ts` remains a fallback only.
- The exotic gaps Google's tool does not cover — Microsoft Teams, public folders, SharePoint
  lists/metadata/workflows, file **version history**, OneNote fidelity, resource/room calendars,
  the GAL, **1-to-many mailbox splitting**, and long mail coexistence/delta re-sync — are
  third-party territory (CloudFuze/ShareGate/BitTitan), not Helios.
- On-prem/hybrid Exchange (use Google GWMME), which the new native service does not handle.

## Design notes

- **Two different Google "transfer" surfaces — do NOT conflate them.** This workflow is the
  **Data Migration Service = EXTERNAL → INTERNAL** cross-cloud import (an M365 mailbox/OneDrive
  *outside* the workspace → Gmail/Drive *inside* it): **console-triggered (no start API)**,
  **read-only** progress via the `data_migration` Reports-API audit stream. The **intra-domain
  user→user transfer** used by OFFBOARDING (a departing user's Drive/Calendar → another user in the
  *same* workspace) is a **separate** feature — the **Data Transfer API** (`admin.datatransfer`,
  which Helios already calls) — and it has a **full API**: `transfers.insert` to **trigger** AND
  `transfers.get`/`.list` to **track** (`overallTransferStatusCode` + per-application
  `applicationTransferStatus`). So offboarding transfers are fully controllable *and* trackable by
  Helios; the cross-cloud migration is orchestrate-and-observe only.
- **Reuse, don't rebuild.** The plan service already does generate/override/validate/persist and
  now emits the Google CSV. No new tables (`organization_settings` key/value).
- **Provisioning** reuses Helios's existing Google user/group creation; recreate M365 DLs as
  Google Groups (Admin SDK), since Google's importer can only map mailbox content onto Groups
  that already exist.
- **License-aware:** provisioning must assign a Google license (a mailbox/Drive can't receive
  without one), and destination-tier gating applies (see the separate license-gating work).
