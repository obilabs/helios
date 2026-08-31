# Tasks — Microsoft 365 → Google Workspace Migration Workflow

Build order: the offline-testable plan/engine first, the tenant-dependent transfer
behind fixtures, the UI last. Much of Phase 0 is already done.

## Phase 0 — Foundations (DONE / shipped)

- [x] Reconcile M365 users into `organization_users` (dual-source link by email,
      guest/contact/staff classification) so they appear in the directory.
- [x] Destination-mapping plan service: generate (same-email default) / setDestination
      (X→Y) / reconcileExistence / validate / persist (key/value) / toScriptMap.
- [x] `GET/PUT /api/v1/microsoft/migration/plan` (admin) + unit tests.
- [x] Throwaway PoC transfer script (`scripts/migrate-m365-to-google.ts`) proving the
      read (Graph $value/OneDrive content) + write (Gmail import / Drive upload) paths.
- [x] Graph record/replay fixtures for the read paths (offline testing after teardown).

## Phase 1 — Prerequisites (on the tenant owner)

- [ ] Azure: add `Mail.Read` + `Files.Read.All` (+ `Calendars.Read` / `Contacts.Read`)
      application permissions and **grant admin consent**.
- [ ] Google: add `gmail.insert` (already in scopes) + `drive` to the DWD client and
      re-consent; stand up a mail-enabled Google destination workspace.

## Phase 2 — Audited transfer engine (graduate out of the throwaway script)

- [ ] `migration-run.service.ts` consuming `toScriptMap`: per-user, per-type (mail /
      drive / calendar / contacts), checkpointed + resumable, dead-letter for failures.
- [ ] Binary-safe transfer: teach the MS Graph proxy an arraybuffer/stream passthrough
      for `$value` and OneDrive `/content`; teach the Google proxy multipart/resumable
      Drive upload — OR dedicated audited migration endpoints. Remove the direct-call
      bypass so every byte is audited through Helios.
- [ ] Provisioning: "create the Google account from the M365 identity" for unmapped /
      create-first targets (reuse the existing Google user-create path), then transfer.
- [ ] Idempotency keyed on RFC822 Message-Id (mail) + OneDrive itemId (files); a lost
      checkpoint must not double-import.
- [ ] Verification: source-vs-target counts per user after a run.
- [ ] Everything audited (activity_logs); replay fixtures for the write paths.

## Phase 3 — UI workflow

- [ ] Directory → select M365 candidates (single / multi / all-M365-users), from the
      existing platform filter.
- [ ] Mapping screen: per user, choose destination (same-email default / a DIFFERENT
      existing Google account / create-new), pick data types; show validation
      (unmapped, destination-not-yet-created). Save via PUT /migration/plan.
- [ ] Dry-run view: item counts + validation, no writes.
- [ ] Execute + monitor: per-user live status, progress, dead-letter, retry.
- [ ] Shared-mailbox handling: surface the unlicensed `contact` candidates; let the
      admin map each to a Google Group inbox or a delegated account.

## Phase 4 — Hardening / follow-ups

- [ ] Optional Exchange Online lookup to definitively flag shared mailboxes
      (RecipientTypeDetails) rather than the unlicensed heuristic.
- [ ] Rate-limit / backoff for Graph 429 + Gmail/Drive quotas on large mailboxes.
- [ ] Large-item handling (resumable > 4MB Drive uploads; chunked mail import).
