# Freeze the phishing bones (event stream + tracking model + wire contracts)

> **Status: BONES — Build Window 2026, Phase 02.** This change freezes the expensive-to-change
> layer of the phishing suite *before* any UI exists. It ships a migration, a TypeScript
> contract module, and failing-test contracts. It deliberately ships **no routes, no UI, no
> module registration** — both feature flags land disabled. Pixels come later, against these
> bones. Source of record for the plan: `obilabs/north-star` → `BUILD-WINDOW-2026.md`.

## Why

Once a shipped install has lure links sitting in mailboxes and events in its Postgres, three
things can never be cheaply changed: the **token URL shape**, the **event evidence** and how
verdicts are derived from it, and the **Helios → Aegis wire contract**. Everything else
(bot heuristics, scoring, route names, UI) can iterate slowly in Q1 at solo-parenting
velocity. So the window is spent here. The design comes from the Phase-0 research in
`add-phishing-reports-module/research/tracking-decision-v0.1.md` and
`design-spec-v0.1.md`; this change turns the "proposed for freeze" sections into code.

## What changes

- **Migration `075_phishing_event_stream.sql`** (idempotent, additive):
  `phish_campaign`, `phish_campaign_recipient` (one opaque token per membership, hash-only),
  `phish_report` (a real report, Track A), **`phish_event`** (append-only immutable evidence,
  shared by detection and simulation), `phish_event_classification` (derived, versioned
  verdicts), `phish_outbox` (durable, idempotent Aegis delivery), projection views
  `phish_event_latest_verdict` + `phish_recipient_state`, and two **disabled** feature flags
  `phishing.detection` / `phishing.simulation`.
- **Immutability enforced in the database**: a trigger rejects `DELETE` on `phish_event` and
  any `UPDATE` except rewriting `request_meta` (the retention redaction path).
- **`backend/src/lib/phishing/contract.ts`** — the closed sets stored as `text`, the token
  format constants, the tracking route shapes, the Aegis wire contract v1 types and its
  frozen minimum field set, row schema versions, privacy invariants.
- **`token.ts`** — mint / hash / parse for the `h1_` opaque token (raw token never persisted).
- **`evidence.ts`** — the only way a request becomes an event; drops form bodies before any
  write; truncates IPs for the durable column.
- **Failing-test contracts** (`phishing-bones.contract.test.ts` + the CI Seed Schema Contract
  job): closed-set literals, token shape, Aegis required fields, credential-never-stored,
  IP minimisation, DB immutability trigger, projection behaviour.

## What is FROZEN by this change

| Surface | Frozen | Escape hatch |
|---|---|---|
| Token URL | `h1_` + 26 base32 chars, in the **path**, per (campaign, recipient); `sha256` stored | `h2_` prefix for a future signed token, resolvable side-by-side |
| `phish_event` | append-only; identity/type/timing columns; `request_meta` jsonb | new nullable columns; new jsonb keys |
| Core event semantics | `injected`, `opened` (decorative), `clicked` (provisional), `page_viewed`, `submitted`, `reported`, `honeypot` | append new types; never shift meaning |
| Verdicts | derived + versioned in a separate table; only `human` can fail; never `opened` | new verdicts; new classifier versions |
| Aegis events | `phishing.recipient.failed` / `phishing.recipient.failure_retracted`, `schema_version: 1`, required fields | additive fields within v1; v2 for anything else |
| Privacy | credential values never stored; no PII in URLs; durable IP truncated | — |

## What is NOT in this change (deliberately)

Routes, the tracking endpoints, the classifier, the injection service, any React UI, module
rows in `modules`, Gmail scopes (`gmail.insert` must be minted **per call**, never added to
`REQUIRED_SCOPES` — see the DWD all-or-nothing gotcha), and the L2 ingest endpoint. The
**L2 button → Helios ingest contract** and the **Rubric compiled-JSON interchange** are the
next two bones, as separate changes.

## Impact

- New tables only; no existing table or wire contract is touched. Existing installs pick the
  migration up at boot via `schema_migrations`.
- The two feature flags are inserted **disabled**; nothing renders.
- `organizations` / `organization_users` gain referencing rows only (`ON DELETE CASCADE` /
  `SET NULL`), so org deletion still works.

## Open items that must pass a LIVE test before real users (from the research, unchanged)

1. Per-call `gmail.insert` minting (never blanket `REQUIRED_SCOPES`).
2. The outbox → Aegis loop end-to-end incl. idempotency and retraction (two-product test).
