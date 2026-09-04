# Microsoft 365 → Google Workspace Migration Guide

A guided, end-to-end runbook for moving a Microsoft 365 tenant into Google
Workspace using Helios to **orchestrate** and Google's **native Data Migration**
to do the transfer.

> **Who does what.** Helios provisions and licenses the destination accounts,
> builds the source→destination mapping, and tracks progress. Google's native
> Data Migration Service performs the actual transfer (it has no public "start"
> API, so the transfer itself is launched in the Google Admin console). Helios is
> the orchestrator and tracker, **not** the transfer engine — this is deliberate:
> Google's native tool is free, supported, and handles binary attachments, large
> mailboxes, throttling, and resumability that a home-grown engine would have to
> reinvent.

---

## Before you start: security & licensing setup

Do this **once**, before provisioning anyone. Two of these steps are Admin-console
only (Google exposes no API for them); the rest Helios can drive.

### 1. Set up administrators the right way (strongly recommended)

Bad admin hygiene is the single most common way small orgs get locked out or
breached. Follow all four:

- **At least two super admins.** A single super admin is a single point of
  failure — if that account is lost, locked, or compromised, no one can recover
  the workspace. **Never run with one admin.**
- **One dedicated break-glass ("glass-break") account.** A super-admin account
  used for nothing else, with a long unique password stored offline, MFA, and
  **no license** (see below). It exists only for emergencies.
- **Separate admin accounts from daily-driver accounts.** Each administrator
  should have *two* accounts: their normal, licensed, **non-admin** user account
  for everyday work, and a *separate* admin account. Never grant super-admin to
  the account someone reads mail and browses the web on — that account's
  compromise then compromises the whole tenant.
- **Admin accounts should be unlicensed where possible.** A break-glass or
  pure-admin account doesn't need Gmail/Drive, so it doesn't need a paid seat.
  Keeping it unlicensed reduces both cost and attack surface. This requires
  turning off automatic licensing first (next step).

### 2. Turn off automatic license assignment (Admin console — no API)

By default Google auto-assigns a license to every new user, which means you
*can't* create an unlicensed admin, and every provisioned account silently
consumes a seat. To take control:

1. Admin console → **Billing → License settings**.
2. Select the top-level org (or a specific OU).
3. Turn **Automatic licensing** from **On** to **Off** (or set it per-OU / per-SKU
   so only the OUs that should get seats do).

> Turning auto-licensing off **retains** licenses already assigned — it only stops
> *new* automatic grants. After this, licensing is explicit: assign per user
> (Helios can do this via the Licensing API), or by placing users in a
> license-enabled OU.

There is **no API** to change this setting — it must be done in the console.

### 2a. Recommended org-unit structure for licensing

Auto-licensing is set per **organizational unit** and inherited by child OUs. A
sound baseline (adapt it — OUs also carry security/policy, and no single structure
fits every org):

```
Root                    auto-licensing OFF   <- Google defaults this ON; change it
├── Licensed Users      auto-licensing ON    (your paid edition; dept sub-OUs inherit)
│     └── [dept / team sub-OUs]
├── Admins              auto-licensing OFF    (dedicated + break-glass admins, unlicensed)
├── Service Accounts    auto-licensing OFF    (automation / integration identities)
└── Offboarded          auto-licensing OFF    (departed / suspended users, off-seat)
```

Principles:

- **Root OFF is the important one.** New (and unplaced) users land in Root, so if
  Root auto-licenses, every new account silently consumes a seat. Turn it off and
  license explicitly by placing people in **Licensed Users**.
- **Unlicensed accounts (admins, service, offboarded) go in OFF OUs.** Admin
  accounts need **no paid Workspace license**: a user created with auto-licensing
  off automatically gets a free **Cloud Identity** license (site-based — no seat
  assignment needed) and can still be made super admin. (On Business Starter the
  auto-licensing-off toggle may not be exposed; enroll **Cloud Identity Free** to
  create unlicensed accounts there.)
- **Move offboarded/suspended users to an OFF OU.** Auto-licensing licenses
  suspended users too, so leaving them in a licensed OU keeps them holding seats.
  Helios's offboarding can move them via its org-unit action (`orgUnitPath`).
- **Mixed editions need OU separation** — only **one** subscription can
  auto-license per OU, so split SKUs (e.g. Business Plus vs Starter) into
  different OUs.
- Remember OUs also drive **policy** (security baselines, device management, app
  access), not just licensing — so a real org may need OUs beyond this licensing
  baseline.

### 3. Enroll Cloud Identity Free for unlicensed identities (optional, console)

If you want identity-only accounts (unlicensed admins, service accounts, shared
mailbox groups) without paying for a Workspace seat, enroll **Cloud Identity
Free**. This is a console/reseller action — **no API** — and it lets an account
exist and authenticate without consuming a paid license.

---

## The migration, step by step

### Step 1 — Provision the Google destinations (Helios)

Google's importer **never creates accounts** — both source and destination must
exist first. Helios provisions them from the reconciled M365 directory:

- Each M365 source is mapped to a **same-identity** destination when its domain is
  a verified domain of your Google workspace (e.g. a `tmscanada.ca` secondary
  domain), and skipped when it isn't (external guests, `*.onmicrosoft.com`).
- Regular users → a licensed **mailbox**. A **shared mailbox** offers a choice:
  a **delegated** licensed mailbox (keeps full history — required if you want the
  old mail migrated) or a free **Google Group** (new mail only; old mail is *not*
  migrated — a Group can't receive imported mail).
- Provisioning **writes each account through to the Helios directory immediately**
  (no wait for a sync).

> **Licensing note.** If you turned auto-licensing **off** (recommended), a
> freshly provisioned mailbox is created **unlicensed** and cannot receive mail
> until a license is assigned. Assign it per user (Helios Licensing API) or place
> the account in a license-enabled OU **before** running the import.

### Step 2 — Download the mapping CSV (Helios)

Helios emits the `Source Email,Destination Email` CSV that Google's importer
ingests (`GET /api/v1/microsoft/migration/plan/csv`). Only **ready** targets
(destination chosen *and* it exists) are included; Group destinations are
excluded (they can't receive imported mail).

### Step 3 — Run the transfer in Google's console (the real steps)

> As of **April 2026** Google renamed "Data Migration Service" to the **Data
> import** tool. The steps below are the *actual* flow (verified end-to-end
> 2026-08-31), which differs from older docs.

**Getting to it:** Admin console → **search "Data import"** → open **Data import**
→ scroll to **Import data from Microsoft** → **Exchange Online** → **Import**.
(OneDrive, SharePoint Online, and Teams are **separate** imports in the same
section.)

**In-tool Step 1 — Connect (OAuth to M365).** Click **Connect** → sign into
Microsoft as a **global administrator** → **grant consent**. What you actually
grant: an app named **"Google Workspace Migrate"** (publisher **Google LLC**),
**org-wide, read-only** — *Read mail / calendars / contacts / mailbox settings /
tasks in all mailboxes*, plus *read directory / hidden memberships / organization
info*, plus *maintain access* (token refresh). **Nothing writes to M365.** It's
**application** consent (no per-user prompts) and appears afterward as an
authorized client. Revoke later at myapps.microsoft.com / Entra → Enterprise
applications.
> **Sandboxed/embedded browsers block this OAuth** (`ERR_BLOCKED_BY_CLIENT`) —
> do the Connect step in a normal Chrome/Edge window.

**In-tool Step 2 — Select users. ⚠️ VERIFY EVERY MAPPING.** The tool **auto-maps**
each M365 user to a Google account **by the local part of the address**, and it
auto-selects the ones it matched (these will be the accounts Helios provisioned).
**The trap:** a same-local-part source on a *different domain* (e.g.
`tubears@tmslocks.ca`) with no exact-domain Google target gets **mapped onto the
wrong account** (`tubears@tmscanada.ca`) — merging two people's data. The display
**truncates the domain** (`tubears@tms…`), so you can't tell them apart at a
glance. **Before continuing, confirm every source→destination pair** (hover /
inspect the full address) and **uncheck any cross-domain mis-map** and the
`*.onmicrosoft.com` / external rows.

**In-tool Step 3 — Configure.** Defaults to **Email + Calendar + To-do tasks (all
dates) + all Contacts**. Adjust if needed, then **Start import**.

Status goes **In progress** (updates every ~10s) and Steps 2–3 lock. Per-object
events (`CREATE_GMAIL_MESSAGE`, `CREATE_CALENDAR_EVENT`, `CREATE_GMAIL_LABEL`, …)
begin immediately and are visible in Helios (Step 4).

**Set expectations with users:**

- **Calendar:** events copy over, but **attendees are not re-invited**. External
  guests get no new invite, and future recurring meetings must be **re-invited
  manually**. Past events land fine as a record.
- **Drive/OneDrive:** a **separate** import in the same tool; internal shares
  re-map only if *both* users are migrated; external shares break.
- **Not covered:** file version history, 1-to-many mailbox splitting, Teams,
  public folders, SharePoint lists/metadata, resource/room calendars. Those need
  a third-party tool (CloudFuze/ShareGate/BitTitan).

### Step 3b — OneDrive → Google Drive (a SEPARATE import)

Files are **not** part of the Exchange import — OneDrive is its own wizard (reach
it from the Exchange status page's "Go to the Microsoft OneDrive data import tool"
link, or Data import → Import data from Microsoft → **OneDrive**). It needs a
**separate Microsoft consent** (OneDrive *files* read — the Exchange consent did
not include files), and it is a **5-step** flow driven by **two CSVs**:

1. **Connect to Microsoft OneDrive** — global-admin OAuth (real browser; sandboxed
   browsers block it).
2. **Set data import scope** — **upload a source-only CSV** (single column
   `Source OneDrive User`). Helios emits it: `GET /microsoft/migration/plan/scope-csv`.
3. **Map source and target users** — **upload a mapping CSV**
   (`Source Email,Destination Email`). Helios emits it: `GET /microsoft/migration/plan/csv`
   — Google's own sample uses those exact column headers, so it's a drop-in.
4. **Data import settings** — defaults import **all files** (any date, extension,
   size); unmapped identities keep their original addresses.
5. **Start import** — status goes In progress; `CREATE_FILE` / `CREATE_FOLDER`
   events appear in the same `data_migration` tracking (Step 4).

> **Supplying an explicit mapping CSV side-steps the Step-2 auto-map trap** from the
> Exchange flow — the CSV states each source→destination pair, so there's no
> local-part guessing. Still generate the CSV from Helios (READY targets only), which
> already excludes external / `*.onmicrosoft.com` sources.

> **SharePoint** is *yet another* separate import (its own "Go to the Microsoft
> SharePoint data import tool" link) if you have SharePoint/Shared-Drive content.

> **Automation note (Helios/testing):** the CSV `<input type=file>` elements can be
> populated programmatically via a `DataTransfer` object + a dispatched `change`
> event — no OS file picker — which is how Helios can stage/drive an OneDrive import
> end-to-end in a controlled browser. The OAuth **Connect** still needs a real user
> gesture (popups are gesture-gated).

### Step 4 — Track progress

The transfer's live progress lives in Google — check it either place:

- **Admin console → Reporting → Audit and investigation → `data_migration`** —
  shows who started a migration, the data type, per-item status
  (Success/Failed/Skipped), and item counts.
- **In Helios — the Migration page** (Admin → Migration): its "Transfer progress"
  section reads the same audit stream via `GET /microsoft/migration/status` and
  shows the running counts (e.g. `CREATE_GMAIL_MESSAGE`, `CREATE_CALENDAR_EVENT`),
  a **per-user breakdown** (objects migrated and failures per destination), and
  **per-item failure detail** (source → target + reason) so you can watch the
  transfer — and see *what* failed — without leaving Helios. The endpoint pages
  through the whole audit window so the counts are true totals rather than a
  single 1000-event page; for a very large migration it caps at `maxPages`
  (default 30, override with `?maxPages=N`) and flags the result `truncated`.
- **Programmatically:** the Admin
  SDK Reports API, `Activities.list(applicationName=data_migration)`, using the
  `admin.reports.audit.readonly` scope Helios already holds. It carries setup
  events (`CREATE_CONNECTION`, `CREATE_MIGRATION_MAP`, `START_MIGRATION`) and
  per-object `MIGRATION` events (`CREATE_GMAIL_MESSAGE`, `CREATE_CALENDAR_EVENT`,
  `CREATE_CONTACT`, `CREATE_FILE`, plus `CRAWL_FAILURE`), each tagged with
  `EXECUTION_ID`, `SOURCE_IDENTIFIER`, `TARGET_IDENTIFIER`, and status.

> Google's cross-cloud migration is **console-triggered, read-only-trackable**.
> This is different from the intra-domain **user→user** transfer used during
> offboarding (below), which Helios both triggers *and* tracks via the Data
> Transfer API.

### Step 5 — Verify & reconcile (Helios)

Run a Helios sync so the directory reflects the migrated accounts, and confirm
mailbox counts / spot-check content before decommissioning the source.

---

## After migration: offboarding a source user

Once an account holds migrated data, you can offboard it. Helios drives this
directly — the **Data Transfer API** (`admin.datatransfer`) both **triggers and
tracks** the transfer, unlike the cross-cloud import:

- **Transfer to another user:** hand a departing user's Drive/Calendar to a
  manager or teammate in the same workspace (`transfers.insert`; status via
  `transfers.get`).
- **Delete** the source account (after transfer / preservation).
- **Preserve with Google Vault** (retention hold) — **Business Plus and above
  only**. Vault is *not* included in Business Starter/Standard, so Helios gates
  the Vault-preserve offboarding action to workspaces on a Vault-eligible tier.

Recommended offboarding order: **preserve (Vault, if required) → transfer owned
data → suspend → delete after a grace period**.

---

## Quick reference — API vs console

| Task | Surface |
|---|---|
| Provision + license destinations | **Helios** (Directory + Licensing API) |
| Emit source→dest CSV | **Helios** |
| Disable auto-licensing / Cloud Identity Free / license-by-OU | **Admin console only** (no API) |
| Start the cross-cloud transfer | **Admin console only** (no start API) |
| Track the cross-cloud transfer | **Read-only** — Reports API `data_migration` |
| Offboarding user→user transfer | **Helios** — Data Transfer API (trigger **and** track) |
| Vault preservation | **Helios** — Business Plus+ only |
