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
- **Unlicensed accounts (admins, service, offboarded) go in OFF OUs.** Unlicensed
  admins require Business Standard or higher.
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

### Step 3 — Run Google's native Data Migration (Admin console)

This is the transfer itself — launched in Google's console, per data type:

1. Admin console → **Data Migration** (or the migrate.google.com onboarding tool).
2. **Source = Microsoft 365 / Exchange.** Authorize to the source tenant when
   prompted (Google connects to M365 directly — this does **not** use Helios's
   Azure app, so no extra Helios scope is required).
3. Choose the data type (**Email** first), set the date range, and provide the
   source→destination map (the CSV from Step 2).
4. Start it. Repeat for **Calendar**, **Contacts**, and **Drive** (OneDrive → My
   Drive) as needed.

**Set expectations with users:**

- **Calendar:** events copy over, but **attendees are not re-invited**. External
  guests get no new invite, and future recurring meetings must be **re-invited
  manually**. Past events land fine as a record.
- **Drive:** internal shares re-map only if *both* users are migrated; external
  shares break and must be re-shared.
- **Not covered by the native tool:** file version history, 1-to-many mailbox
  splitting, Teams, public folders, SharePoint lists/metadata, resource/room
  calendars. Those need a third-party tool (CloudFuze/ShareGate/BitTitan).

### Step 4 — Track progress

The transfer's live progress lives in Google — check it either place:

- **Admin console → Reporting → Audit and investigation → `data_migration`** —
  shows who started a migration, the data type, per-item status
  (Success/Failed/Skipped), and item counts.
- **Programmatically** (and what a future Helios migration view uses): the Admin
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
