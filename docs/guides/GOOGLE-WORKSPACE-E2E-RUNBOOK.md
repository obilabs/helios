# Google Workspace — Clean End-to-End Test Runbook

A repeatable procedure for testing the full Google Workspace integration against a
real tenant from a **clean Helios state**, **reusing the Google Cloud service
account** you already created (so you never redo the Google-side setup).

- **Google Cloud side is one-time + already documented** — project, service account,
  APIs, org-policy override, and Domain-Wide Delegation are covered in
  [GOOGLE-WORKSPACE-SETUP-GUIDE.md](GOOGLE-WORKSPACE-SETUP-GUIDE.md). You reuse the
  same JSON key and the same DWD authorization every run.
- **Helios side is what we reset** each run, so the connect → sync → verify flow is
  exercised from scratch.

> **Safety rules for the human driver (do not automate these):** never type
> passwords, API keys, or the service-account key contents into a page on someone
> else's behalf; the admin uploads the JSON key file themselves. Run destructive
> actions (suspend / delete / offboard) **only on throwaway test users**, never on
> the impersonation admin (Helios's admin-protection guard blocks the admin, but
> don't rely on it as a safety net).

---

## 0. Prerequisites — reuse identifiers

You need these from the one-time Google setup (record them in your local test-env
file so every run can reuse them):

| Item | Where it came from |
|---|---|
| Service-account **JSON key file** | Downloaded in setup Step 2.4 — keep the path handy; you re-upload this file each run |
| **Domain** | Your Google Workspace primary domain |
| **Admin email** | A Super Admin used for impersonation |
| **Client ID** (SA Unique ID) | Already authorized for all 17 scopes in DWD |

> The JSON key and the DWD authorization persist on the Google side across Helios
> resets — you do **not** re-authorize DWD or re-create the key each run.

---

## 1. Reset Helios to a clean state

Two options. **Option A** keeps the org + admin login and only resets the Google
connection (fast). **Option B** wipes the database so the setup wizard runs from
scratch (a truer end-to-end, including org + admin creation). No image rebuild is
needed for either.

### Option A — targeted reset (keep org + admin, re-run the GW wizard)

```bash
docker exec -i helios_postgres psql -U postgres -d helios <<'SQL'
BEGIN;
DELETE FROM gw_credentials;                                   -- SA binding
DELETE FROM gw_synced_users;                                  -- cached directory
DELETE FROM gw_groups;                                        -- cached groups
DELETE FROM organization_modules;                             -- per-org module enablement
DELETE FROM organization_users WHERE google_workspace_id IS NOT NULL;  -- synced users
UPDATE organization_settings
   SET value = 'false'
 WHERE key IN ('google_workspace_enabled','microsoft_365_enabled');
COMMIT;
SQL
```

Optional — also drop leftover invited/demo test users for a truly single-user state
(these are runtime artifacts from earlier Add-User testing, **not** from any seed —
a reset will not recreate them):

```bash
docker exec helios_postgres psql -U postgres -d helios -c "DELETE FROM organization_users WHERE email IN ('jane.smith@globex.test','tom.baker@globex.test');"
```

Verify the reset:

```bash
docker exec helios_postgres psql -U postgres -d helios -c "SELECT email,user_type,status FROM organization_users ORDER BY created_at;" -c "SELECT count(*) creds FROM gw_credentials;" -c "SELECT count(*) synced FROM gw_synced_users;"
```

### Option B — full clean reset (empty DB → setup wizard from scratch)

Migrations + (no-op) seeding run automatically at backend boot, so a fresh database
lands on the setup wizard with no org and no users.

```bash
# from repo root
docker compose down -v      # removes helios_postgres_data AND helios_minio_data
docker compose up -d
docker compose logs -f backend   # wait for "Database migrations complete"
```

DB-only variant (keep MinIO assets + redis):

```bash
docker compose down
docker volume rm helios_postgres_data
docker compose up -d
```

Then open http://localhost:8083 and complete the org + admin setup wizard.

> Do **not** rely on `npm run db:seed` — its target `backend/scripts/seed.js` does
> not exist, so it seeds nothing.

---

## 2. Connect Google Workspace (reuse the cert)

In Helios: **Settings → Modules → Google Workspace → Enable**, then in the wizard:

1. **Upload Service Account** — upload the **same JSON key file** from Step 0.
2. **Configure Domain** — enter the domain + the Super Admin email.
3. **Authorize API scopes** — DWD is already authorized from the one-time setup, so
   you can skip re-authorizing; if you reset the Google side too, use the wizard's
   **Copy scopes** / **Open pre-filled authorization** link (see the setup guide).
4. **Test Connection** → expect **Connection Successful**.
5. **Complete Setup** → the initial sync runs.

---

## 3. Smoke-test checklist

Verify each in the UI **and** cross-check the database (`docker exec helios_postgres
psql -U postgres -d helios -c "…"`) — the UI can report success while the data tells
a different story.

- [ ] **Sync** — `gw_synced_users` row count matches the tenant; OUs + admin flags
      populated. Dashboard "Recent Activity" shows "Synced N users".
- [ ] **Directory → Users** renders the synced users; counts (All / Active /
      Suspended) match `gw_synced_users`.
- [ ] **Module status** — Settings → Modules shows Google Workspace **Active** (see
      Known Issues #2).
- [ ] **Audit log writes AND is visible** — do an auditable action, then open
      Security → Audit Logs and confirm a row appears (see Known Issues #1). Cross-
      check: `SELECT action,outcome,timestamp FROM security_audit_logs ORDER BY
      timestamp DESC LIMIT 5;`
- [ ] **Dashboard suspended count** is sane (see Known Issues #3).
- [ ] **External Sharing** (Drive audit) loads without a 403.
- [ ] **Gmail settings** action (e.g. signature) works without `unauthorized_client`.
- [ ] **Licenses** page loads (values may be N/A on Cloud Identity Free with no paid
      licenses — that's expected, not a failure).
- [ ] **Create-user write path** — create a user in Helios; confirm it appears in the
      Google Admin console; note which audit table the action writes to.
- [ ] **Offboard / suspend** a **throwaway** user only; confirm the admin-protection
      guard refuses the same action on the impersonation admin.

---

## 4. Known issues to expect (as of 2026-08-24)

Don't be misled by these during a run — they are tracked defects, documented so a
tester can tell "known bug" from "new regression":

1. **Audit Logs page shows "No audit logs found" even though actions are audited.**
   The page reads the `activity_logs` table, but connection/setup/sync actions write
   to `security_audit_logs`. Expected: rows visible. Actual: empty unless a developer-
   console command was run. (`backend/src/routes/audit-logs.routes.ts`)
2. **Module shows "Disabled" after a successful Complete Setup.** The wizard syncs +
   validates but doesn't write `organization_modules`, and clicking **Enable** re-opens
   the whole wizard demanding the JSON key again. Functionally the integration is on
   (data flows); the chip is wrong.
3. **Dashboard may report "N suspended users in Google Workspace"** counting local
   test users on a non-Google (`@globex.test`) domain. Cross-check with the Users tab
   / `gw_synced_users` before treating it as real.

---

## Related

- [GOOGLE-WORKSPACE-SETUP-GUIDE.md](GOOGLE-WORKSPACE-SETUP-GUIDE.md) — one-time Google
  Cloud setup incl. the `iam.disableServiceAccountKeyCreation` org-policy override.
- [SECURITY-SERVICE-ACCOUNTS.md](SECURITY-SERVICE-ACCOUNTS.md) — why each org uses its
  own service account.
- [PROVIDER-SETUP-GUIDE.md](PROVIDER-SETUP-GUIDE.md) — helping a client set this up
  remotely.
