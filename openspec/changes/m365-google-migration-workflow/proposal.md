# Microsoft 365 → Google Workspace Migration Workflow

## Summary

A guided, resumable UI workflow to migrate a user's **mail / OneDrive / calendar /
contacts** from Microsoft 365 into Google Workspace: select M365 users from the
directory, map each to a **chosen Google destination** (which may be a *different*
user), dry-run, execute, and monitor. It builds directly on the destination-mapping
plan service already shipped (`migration-plan.service.ts`, `GET/PUT
/api/v1/microsoft/migration/plan`) and the directory reconciliation that surfaces
M365 users in `organization_users`.

## Problem Statement

- Helios now *sees* M365 users (reconciled into `organization_users`) and has a
  persisted destination-mapping plan, but there is **no UI to drive a migration**,
  and the actual transfer is a throwaway script
  (`scripts/migrate-m365-to-google.ts`) blocked on `Mail.Read`/`Files.Read.All` +
  a Google destination.
- Cross-cloud M365 → Google migration is the acquisition wedge; it deserves a
  first-class, non-technical-admin workflow, not CLI exile.
- Constraints surfaced by live testing against tmscanada.ca:
  - A destination Google account **must exist and be licensed** before it can
    receive (you cannot import mail into a non-existent mailbox).
  - There is **no reliable Graph flag for shared mailboxes** (Exchange Online
    `RecipientTypeDetails` only) — the "unlicensed" heuristic classifies them as
    `contact` today.
  - Binary transfer **bypasses the JSON-only proxies** today (the PoC reads Graph
    `$value`/`/content` directly and writes via a server-side Drive upload), so
    those writes are currently un-audited.

## Goals

- **Directory-driven selection.** From the M365 platform filter, pick migration
  candidates (single, multi, or "all M365 users").
- **Destination mapping with choice.** Default same-email; override to any existing
  Google account (**X → Y**); or flag "create the Google account first". Persisted
  via the plan service; per-user direction via the existing `sync_to_google` flag.
- **Per-user data-type selection** (mail / drive / calendar / contacts).
- **Dry-run** reporting item counts + plan validation (unmapped, destination-not-
  yet-created) before any write.
- **Execute** with checkpoint/resume, per-user live status, and a dead-letter for
  failed items.
- **Verify** — compare source vs target counts after a run.
- **Audit** every action through Helios.

## Non-Goals (v1)

- Live coexistence / delta sync (one-shot, re-runnable via checkpoint — not a
  continuous mirror).
- SharePoint sites, Teams, and group mailboxes beyond a user's OneDrive/mailbox.
- Google-native format conversion (import as-is).
- Automatic shared-mailbox detection beyond the unlicensed heuristic (needs
  Exchange Online); shared mailboxes map to a Google Group inbox or a delegated
  account as an explicit choice.

## Why now

- The disposable tenant (tmscanada.ca, Business Premium = real mail + drive) is
  available only until the ~Sept teardown; the workflow should be exercised
  against it once the migration scopes land.
- The plan service + directory reconciliation are already shipped, so the
  remaining work is the **transfer engine + orchestration + UI**, not the data
  model.

## Design notes

- **Reuse, don't rebuild.** The plan service already does generate / override /
  validate / persist / `toScriptMap`. No new tables — the plan lives in the
  `organization_settings` key/value store.
- **Graduate the transfer out of the throwaway script** into an audited
  migration-run service that consumes `toScriptMap`, with the two binary paths
  made streaming + audited (teach the MS Graph + Google proxies a binary-safe
  passthrough, or add dedicated migration endpoints — see the throwaway script's
  header for the exact gaps).
- **Provisioning step.** For unmapped / "create-first" targets, offer "create the
  Google account from the M365 identity" (Helios already creates Google users)
  before transfer, so the destination exists + is licensed.
