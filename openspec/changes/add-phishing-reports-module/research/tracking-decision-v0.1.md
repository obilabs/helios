<!-- Phase 0 tracking decision. Fable research workflow (3 dims -> decision) 2026-09-03. Proposed for the schema freeze. -->

# DECISION: Helios Phishing-Simulation — Tracking Mechanism & Freeze-Worthy Data Model

Status: proposed for freeze. Feeds the pre-Christmas schema lock. Scope: Track B (Workspace-injection sim), Helios self-hosted, per-org, React+TS+Postgres. Delivery is Gmail API `users.messages.insert` (Direct Message Injection, DMI) — no SMTP.

---

## TL;DR — the decisions

1. **Tracking = opaque per-(campaign, recipient) token in the URL *path*, event inferred from *endpoint* (GoPhish's `rid` model, hardened).** No signed/HMAC token, no owned "bad domain."
2. **Click is the only trustworthy fail signal; open is decorative.** A bare click GET is *provisional*; a **derived, re-computable "human" verdict** (passive fingerprint + optional JS/submit second-interaction) is what fails a user and triggers Aegis. Never fail or train on "opened."
3. **Landing/tracking is served from the org's own Helios instance on a `sim.` subdomain.** Data never leaves the org's Postgres. BYO look-alike domain is an optional realism dial. **A shared ObiLabs tracking domain is explicitly forbidden** (breaks the sovereignty principle; do not build it).
4. **Lock: an append-only immutable evidence log + a separate versioned derived-verdict table + `text` event types + `jsonb` escape hatches + a versioned Aegis wire contract.** That combination is what lets bot-detection, scoring, and new event kinds evolve forever with **zero breaking migration** — the founder's #1 ask.
5. **Never store submitted credential values, anywhere, ever** — enforced by a failing test. This is a North-Star security invariant, and it dodges GoPhish's plaintext-credential footgun.

The three founder concerns, answered directly:
- **(a) "own the bad domain" + per-campaign token** → Injection removes the domain requirement entirely (no SPF/DKIM/DMARC, no SEG, `From:` is whatever you compose). Default to the org's own `sim.` subdomain; go **per-recipient**, in-path, opaque — not per-campaign, not a query param.
- **(b) 1×1 pixel unreliable, open-only** → Correct and worse than he thinks (Gmail proxy prefetch + caching + Apple MPP make opens noise). Pixel is demoted to decorative QA; click + two-stage human confirmation is the signal.
- **(c) lock the model before release** → Sections 2–4 below give the frozen core and the deliberately-iterable periphery.

---

## 1. Recommended tracking mechanism

### 1.1 The delivery method is the whole game
Because Helios injects with `users.messages.insert` (writes raw RFC822 straight to the mailbox, IMAP-APPEND-style, "bypassing most scanning and classification"), the message never traverses an inbound mail gateway. **The single largest source of false clicks in SMTP-delivered sims — Microsoft Safe Links / Proofpoint URL Defense / Mimecast pre-detonating every URL — is structurally absent.** Your click data is materially cleaner than GoPhish/KnowBe4 running over SMTP. This is a real, under-appreciated advantage and it justifies a simpler design than GoPhish's.

What still generates machine hits (and must be filtered): Gmail's own **client-side, click-time Safe Browsing** check (independent of delivery path), Workspace admin "scan linked images" / shortener-expansion / "IMAP link protection", **API-based mailbox scanners** the org may run (Abnormal, Check Point Harmony/Avanan, Material, Sublime — they read the box, so they see injected mail), corporate web proxies, and **mobile link-preview**.

### 1.2 Token scheme — opaque, versioned, path-based
- **Format:** `h1_` + base32-nopad(16 CSPRNG bytes) → ~26 chars, ~128-bit. `h1_` = Helios token format v1; it is cheap insurance to introduce a different scheme (`h2_` signed) later with no migration and both resolvable side-by-side.
- **One token per (campaign, recipient).** The **endpoint decides the event type; the token decides the recipient** (GoPhish model). Bind to the *original recipient*, so a forwarded-then-clicked mail still scores the target.
- **Multi-link emails:** append a link id — `/c/<token>/<link_slug>` — so you know *which* lure was clicked without minting more recipient tokens.
- **Store `token_hash = sha256(token)`** as the unique lookup key; never store or log the raw token. A DB/backup leak then can't hand out live tokens.
- **In the path, never a query param.** Query strings are mangled/inspected by Safe Browsing, shortener-expansion, and "scan linked images," and PII-in-query-strings violates the global privacy rule. Path also avoids GoPhish's `?rid=` fingerprint.
- **Why opaque, not HMAC:** you already need a per-recipient membership row and you write an event on every hit, so "stateless verification" buys nothing on the hot path. Opaque leaks nothing, is trivially revocable, and — decisive for a self-hosted product — **needs no HMAC secret shipped/rotated across every org** (that would be an operational liability fighting the sovereignty model). Reserve `h2_` HMAC only for a future DB-less public link (transparency/unsubscribe).

### 1.3 Endpoints (all on a Helios-controlled host)

| Purpose | Route | Method | Action |
|---|---|---|---|
| Click / landing | `/c/<token>[/<link_slug>]` | GET | write `clicked` evidence → 302 to lure/landing/training |
| Landing beacon | `/c/<token>/seen` (JS) | GET/POST | write `page_viewed` (JS-executed second interaction) |
| Form submit | `/c/<token>` | POST | write `submitted` — record **that** a submit happened + which fields were populated; **drop the body before any write** |
| Open pixel | `/o/<token>.gif` | GET | write `opened` (decorative) → 1×1 gif |
| User report | `/r/<token>` | GET/POST | write `reported` (the positive signal you most want) |
| Transparency | `/c/<token>?reveal=1` (or `h2_` signed) | GET | show "this was a training test," record nothing scoring |

Hardening: **route names configurable per org** (avoid the GoPhish fingerprint); **unknown/expired token → a uniform, benign response** (a generic redirect/landing, *not* a stack-distinctive 404) so servers aren't enumerable.

### 1.4 Click = provisional; "human" = derived verdict (this is the reliability core)
Do **not** treat the bare GET as failure. Log it as provisional `clicked` evidence, then let a **classifier** promote it to `verdict = human`. Promotion signals, strongest first:
- **`submitted`** on the landing form → unambiguous human.
- **JS-executed beacon** (`page_viewed`) → beats prefetch, mobile long-press preview, and scanners that fetch but don't run your JS.
- **Passive fingerprint** (used when JS is off): `Sec-Fetch-User: ?1` present on a top-level `Sec-Fetch-Mode: navigate` / `Sec-Fetch-Dest: document`; residential (non-datacenter) ASN; plausible click-timing vs `delivered_at`; coherent UA/OS/TLS.
- **Demotions:** hit < ~2s after delivery, datacenter/vendor ASN (AWS/GCP/Azure/OVH/Hetzner/DO), missing `Sec-Fetch-User` on a top-level nav, `python-requests`/`Java`/`HeadlessChrome`/`curl` UAs, hard-coded Google `Referer`, `Via:` proxy headers, or a hit on the **honeypot link** (a hidden zero-size decoy — any hit means that client's scanner is active; retroactively downgrade the real hit from the same IP/UA/window).

The `google.com/url?q=…` rewrite that the Gmail web client applies is a **corroborating** signal only (present for prefetches too, absent for IMAP clients) — never a gate.

### 1.5 Open handling — capture, but demote
Fire the pixel, but it is a weak, decorative QA/funnel signal, **never** a pass/fail or training trigger:
- Gmail proxies + **prefetches and caches** every image on delivery → pixel fires within minutes of injection from Google IPs, before any human reads it; **re-opens never re-hit you** (cached). Apple MPP does the same. Corporate/AV scanners prefetch too.
- Classify any pixel hit < ~60s after `delivered_at`, or from a Google/Apple proxy ASN, as `prefetch`; exclude from headline metrics.
- **The authoritative "did it land" signal is the `users.messages.insert` 2xx response**, not the pixel. Store the returned message id and `delivered_at` (ms precision — needed for all timing heuristics).
- Do **not** promise open *frequency* or open IP-geo in the schema; both are unbackable given caching/proxying.

### 1.6 Landing/domain default
- **Default:** serve tracking + landing from the org's own Helios instance on a `sim.` subdomain (e.g. `https://sim.acme.ca/c/<token>`), path-based token. Single-name TLS via HTTP-01 (already handled by the Helios host). **No wildcard needed** (wildcards are only required if you embed tokens in the *hostname*, which you should not; reserve that for the BYO tier via DNS-01). Click/submit data stays in the org's Postgres — clean sovereignty, zero ObiLabs infra, and using the org's own legitimate domain avoids the fresh-look-alike Safe Browsing "deceptive site" interstitial.
- **Optional realism dial:** BYO org-owned look-alike (`acme-verify.com`), CNAME → the org's Helios, same landing route. Realism becomes configurable, not a prerequisite for the 90% who don't need it. Warn orgs to buy-and-hold any look-alike so lapsed-domain traffic doesn't reach a stranger.
- **Forbidden:** a shared ObiLabs tracking domain. It routes every org's employee click/fail data through ObiLabs (breaks the privacy + sovereignty moat), forces ObiLabs to run per-customer always-on infra, and creates a noisy-neighbor Safe-Browsing blast radius. **Do not build option (b).**

### 1.7 Credential capture — non-negotiable
Present a realistic login form for training value, but the POST handler **drops the request body before any write** — never bind it to a model. Store only the *event* + safe metadata (which fields were populated, not contents). Storing real credentials would make Helios itself a breach surface (GoPhish's documented plaintext-capture liability). Lock a **failing test**: submit `password=hunter2`, assert it appears nowhere in the DB — a textbook North-Star "security invariant enforced by a failing test."

---

## 2. Durable data model to lock

**Design principles (these are the freeze):**
1. **Append-only immutable evidence.** `phish_event` is never `UPDATE`d/`DELETE`d. It stores raw request evidence, no interpretation.
2. **Verdict is derived, versioned, re-runnable** — a *separate* table. "Human click?" is never a column you write once at click time; it is recomputed by a `classifier_version`. This lets you re-tune bot detection forever and retract late-caught false positives without touching history. (This is exactly how KnowBe4's anti-false-positive patent works: raw clicks cached, held, checked, then promoted or discarded.)
3. **`event_type` / `source` / `verdict` are `text` with an app-level allowlist, not Postgres `enum` or CHECK.** Adding a new kind is then a code change with **zero DDL**. (Enum `ADD VALUE` is only append-safe and can't rename/remove; text removes even that friction. The set is *conceptually* closed and documented as a TS constant — the storage is open.)
4. **`jsonb` escape hatches** (`request_meta`, `metadata`) absorb any new attribute (proxy vendor, geo, template variant, Sec-Fetch headers, JA3) with no migration.
5. **`schema_ver` on rows + versioned wire contracts** on the two truly expensive surfaces: the token URL shape and the Aegis payload. (Matches your own control-plane lesson: the *wire contract*, not the local table, is the costly freeze.)
6. **Status/score is a projection**, never a stored column — recompute from events + classifications.

```sql
create table phish_campaign (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  name          text not null,
  difficulty    text,                 -- text, iterable taxonomy
  template_ref  text,
  status        text not null,        -- draft/running/closed (projection-friendly)
  window_start  timestamptz,
  window_end    timestamptz,
  created_at    timestamptz not null default now()
);

-- one row per campaign membership; holds the opaque token + delivery truth
create table phish_campaign_recipient (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references phish_campaign(id),
  org_id              uuid not null,
  user_ref            text not null,          -- stable directory id, NOT just email
  email               citext not null,
  token_hash          text not null unique,   -- sha256(opaque token); raw token never stored
  injected_message_id text,                   -- from users.messages.insert response
  delivered_at        timestamptz,            -- authoritative "landed" signal (ms)
  created_at          timestamptz not null default now()
);

-- IMMUTABLE, append-only raw evidence. NEVER updated/deleted. No verdict here.
create table phish_event (
  id            bigint generated always as identity primary key,
  schema_ver    smallint not null default 1,
  org_id        uuid not null,
  campaign_id   uuid not null,
  recipient_id  uuid not null references phish_campaign_recipient(id),
  event_type    text not null,   -- 'queued','injected','opened','clicked','page_viewed',
                                  -- 'submitted','reported','honeypot','errored'  (TEXT + app allowlist)
  source        text not null,   -- 'gmail_api','pixel','redirect','form','user_report'
  occurred_at   timestamptz not null default clock_timestamp(),  -- ms precision
  request_ip_trunc inet,         -- /24 (v4) or /48 (v6) — data minimization
  request_asn   integer,         -- resolved at ingest; drives datacenter-ASN checks
  user_agent    text,
  link_slug     text,            -- which lure link, if many
  request_meta  jsonb not null default '{}'  -- Sec-Fetch-*, Referer, JA3, full-IP(TTL'd), geo, etc.
);
create index on phish_event (recipient_id, occurred_at);
create index on phish_event (campaign_id, event_type);

-- DERIVED, versioned, re-runnable verdict. Dashboards + Aegis trigger read THIS, not phish_event.
create table phish_event_classification (
  id                 bigint generated always as identity primary key,
  event_id           bigint not null references phish_event(id),
  classifier_version text not null,
  verdict            text not null,  -- 'human','bot_scanner','prefetch','link_preview','honeypot','unknown'
  reason             text,
  classified_at      timestamptz not null default now(),
  unique (event_id, classifier_version)   -- keep verdict history; latest version wins
);

-- durable outbox for the Aegis wire contract (survives Aegis downtime; idempotent)
create table phish_outbox (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  event_id       bigint not null,        -- source classification/event for idempotency
  contract_type  text not null,          -- 'phishing.recipient.failed' | '...failure_retracted'
  schema_version smallint not null,
  payload        jsonb not null,
  status         text not null default 'pending',
  attempts       int not null default 0,
  created_at     timestamptz not null default now(),
  delivered_at   timestamptz
);
```

**Recipient state** (opened / clicked / failed / reported) is a `view` or materialized `phish_recipient_state` rebuilt from `phish_event` + latest `phish_event_classification` — never a written column. Pass/fail scoring is computed downstream; no scoring column exists to break.

**IP privacy:** durable columns keep truncated IP + resolved ASN (enough for datacenter-ASN and foreign-IP checks); the full IP lives only in `request_meta` under a short retention TTL, and metadata redaction under that policy is the one explicit, logged exception to immutability (event identity/type/timing stay untouched).

---

## 3. Cross-product contract → Aegis training

**Trigger rule:** emit **only** when a `clicked` or `submitted` event has a latest **`verdict = human`**. Never on `opened`, never on unconfirmed/provisional clicks, never on `is_automated`. The trigger fires off the **classification**, so a later reclassification can retract.

Freeze **two** versioned events (the retraction is not optional — verdicts are re-runnable, so a late-caught false positive must be walk-back-able):

```json
// phishing.recipient.failed  (v1)
{
  "schema_version": 1,
  "event_id": "uuid",                 // idempotency / dedupe key
  "type": "phishing.recipient.failed",
  "org_id": "uuid",
  "occurred_at": "2026-09-04T15:04:05.123Z",
  "recipient": { "user_ref": "…", "email": "…" },
  "campaign":  { "id": "uuid", "name": "…", "difficulty": "…" },
  "failure":   { "stage": "clicked|submitted", "is_automated": false },
  "classifier_version": "clf-2026.09",
  "classified_at": "2026-09-04T15:06:00Z",
  "recommended_training": { "topic": "credential-phishing", "module_ref": null }
}
```
```json
// phishing.recipient.failure_retracted  (v1)
{
  "schema_version": 1,
  "event_id": "uuid",                 // a NEW id for the retraction
  "type": "phishing.recipient.failure_retracted",
  "org_id": "uuid",
  "retracts_event_id": "uuid",        // the original failed event
  "reason": "reclassified_bot_scanner",
  "classifier_version": "clf-2026.10",
  "occurred_at": "…Z"
}
```

Rules that make it freeze-worthy:
- **Idempotent** on `event_id` so retries don't double-assign training.
- **Versioned** (`schema_version`) and **additive-only within v1** — same wire-contract discipline as the licensing/revoke-cascade path.
- **Delivery = outbox + signed webhook/queue over the existing MTP/licensing channel**, so it survives Aegis being down. Sending a training assignment is a **gated, logged side-effect**, never silent.
- Aegis owns the remediation content, user mapping (`user_ref`/`email` → Aegis user), assignment, and completion tracking — per the product split. Helios emits the fact; Aegis decides the module.

---

## 4. FROZEN vs ITERABLE

**FROZEN (expensive/impossible to change post-release):**
- **Token URL shape** — `h1_` scheme, path-based, per-(campaign, recipient). Tokens are baked into mail already sitting in mailboxes; you can never rewrite delivered links. (The `h1_`/`h2_` prefix is the only escape.)
- **`phish_event` as append-only immutable evidence** + its identity/type/timing columns + the `jsonb` escape hatch.
- **Semantics** of the core event types (`clicked`, `submitted`, `opened`, `reported`, `injected`, `honeypot`) and verdicts (`human`, `bot_scanner`, `prefetch`) — you may add, but existing meanings must not shift.
- **The two Aegis event names, their `schema_version`, and their minimum required field set** — additive-only.
- **The credential-never-stored invariant** and **no-PII-in-URLs**.
- **The existence of the derived-verdict + classifier_version indirection** (dropping it later would force a rewrite of every consumer).

**ITERABLE (safe to change anytime — deliberately kept out of the frozen contract):**
- All bot/scanner detection: ASN lists, reverse-DNS lists, timing thresholds (the ~2s / ~60s numbers), UA blocklists, honeypot markup, Sec-Fetch/JA3 heuristics — **config/lookup tables + `classifier_version`**, re-run over immutable evidence.
- New `event_type` / `source` / `verdict` values (text + app allowlist → zero DDL).
- New keys in `request_meta` / `metadata`.
- Pass/fail scoring and recipient-state computation (projections).
- Which stage triggers training (clicked vs submitted) — policy/config.
- Route names, UI labels, funnel/open presentation, transparency page.
- Difficulty taxonomy, template variants, `recommended_training` topic mapping.

---

## 5. Open risks + what needs a LIVE test before locking

The remaining uncertainty is empirical (what real traffic on a real tenant looks like), not answerable by more research. Use the existing live tenants (gridworx.io / tmscanada.ca from prior Helios binds) as the test bed.

1. **DWD scope trap (blocking, engineering).** `users.messages.insert` needs the `gmail.insert` scope. Per your own hard-won gotcha, Google DWD is all-or-nothing and the transparent proxy mints the *full* `REQUIRED_SCOPES` on every call — so **adding `gmail.insert` to the blanket `REQUIRED_SCOPES` would silently 401 every already-connected workspace**. The phishing module MUST mint `gmail.insert` **per-call** (the `googleScopesForPath` pattern), never via the blanket set. Verify this before any live send.
2. **"Unverified sender" grey question mark.** An injected message with a spoofed `From:` can draw Gmail's "Gmail can't verify it actually came from them" banner — a realism/tip-off risk that could depress click rates. Live-test how prominent it is and whether it undermines the exercise. (Realism, not schema — but it shapes whether injection is the right delivery for high-fidelity lures.)
3. **Safe Browsing interstitial on a fresh `sim.` subdomain.** Inject, then click from real Gmail web + an IMAP client (Apple Mail/Outlook), and confirm whether the click-time check throws a "deceptive/untrusted site" warning that kills the training moment. Validates the org-own-domain default vs. needing domain warm-up.
4. **What the Gmail web client actually sends your endpoint.** Confirm the `google.com/url?q=` rewrite, and critically whether a genuine human nav carries `Sec-Fetch-User: ?1` *through* that redirect (and what IMAP clients send). This calibrates R3.3 — your strongest cheap passive signal.
5. **Which machine hits appear on a real tenant** (Google's own link/image checks, Workspace "scan linked images" / "IMAP link protection" / shortener-expansion, plus any API-based mailbox scanner the customer runs). Calibrates classifier v1 defaults (ASN/UA/timing). **Does not block the schema freeze** — detection is iterable config — but blocks confident headline metrics.
6. **Pixel prefetch window.** Measure the real Google-image-proxy fire time on the tenant to set the `opened` prefetch cutoff (start ~60s).
7. **Aegis end-to-end.** Prove the outbox → signed webhook → Aegis loop actually fires, maps `user_ref`/`email` → an Aegis user, assigns the module, is **idempotent** on `event_id`, and **honors the retraction** event — before freezing the wire contract. This is a two-product integration test, not a unit test.
8. **Consent / employee-monitoring posture (launch gate).** Phishing simulation is monitoring; the org admin should explicitly configure/consent, and data minimization (truncated/hashed IP, no credential contents) must be the default. Not a schema issue, but it must be settled before real users adopt.

Recommendation on sequencing given the one build window: **freeze Sections 2 and 3 now** (they are the durable, expensive-to-change core and are already de-risked by the append-only + derived-verdict + text-enum + versioned-wire design). Treat Section 5 items 2–6 as **calibration you run against the live tenant after the freeze** — by construction they touch only config/classifier, never the contract. Items 1 and 7 are the two that must pass a live test **before** you send to real users.
