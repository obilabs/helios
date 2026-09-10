# Freeze the training contract (requirement ownership + completion ingest + webhooks)

> **Status: BONES — Build Window 2026, Phase 02.** This change freezes the
> expensive-to-change layer of training interoperability *before* any UI exists. It ships a
> migration, a TypeScript contract module, an OpenAPI document, two routes and a freeze
> test. It ships **no UI** and the feature flag lands **disabled**. Source of record for the
> plan: `obilabs/north-star` → `BUILD-WINDOW-2026.md`.

## Why

Helios needs to hold a training requirement and its status while content and scoring live
elsewhere — in Aegis first, in a third-party awareness platform later, or in a person ticking
a box. Once a shipped installation has a customer's vendor posting completions to it, two
things can never be cheaply changed: **what a completion looks like on the wire**, and **what
we promise about duplicates**. Everything else — who assigns training, what the UI looks like,
which vendors we have connectors for — can iterate slowly in Q1.

## The decision this encodes

Define our own versioned REST + webhook contract. Borrow xAPI's *vocabulary*. Adopt no
standard. Researched 2026-09-10; the full findings are in BUILD-WINDOW-2026.md. In short:

- **No security-awareness vendor an SMB would own speaks xAPI or LTI as a protocol.** All
  bespoke REST or GraphQL. Where "xAPI/SCORM" appears on a datasheet it is content
  *packaging* — a zip a player runs — not a statement stream. Implementing it would make
  Helios a content player, which is the role this design refuses.
- **Half-adopting xAPI is worse than not adopting it.** The only conformance programme is for
  Learning Record Stores and tests 1,300+ MUST requirements. An endpoint called `/statements`
  invites integrators to assume LRS semantics and file bugs when they are absent.
- **LTI is the wrong shape** (it assumes Helios is an LMS launching content in an iframe) and
  certification routes through paid 1EdTech membership with unpublished dues.
- **No standard models the differentiator:** *why* a requirement exists, when it is due, and
  when it is overdue. That causality is the product.
- **The closest working precedent is not an LMS — it is Vanta and Drata**, compliance systems
  that own a requirement and ingest completion as evidence over plain REST, idempotent on a
  caller-supplied key. The read projection copies their `TrainingRecord` naming.

**Sequencing consequence.** Vendor APIs are read-biased: Proofpoint, Hoxhunt and Huntress
expose no assignment write path at all, KnowBe4's is indirect or behind an unpublished
top-tier GraphQL schema, and Microsoft's training-only campaign endpoint is beta. So this
change builds **completion ingest** and treats push-assignment as a per-vendor bonus, not a
contract requirement.

## What lands

| | |
|---|---|
| `backend/database/migrations/092_training_contract.sql` | requirements, append-only completions, webhook endpoints + outbox, derived-status function, read view, disabled flag |
| `backend/src/lib/training/contract.ts` | the frozen vocabulary and wire shapes, with the reasoning |
| `backend/src/lib/training/statement.ts` | the fallible edge: parsing an untrusted payload |
| `backend/src/lib/training/webhook.ts` | HMAC signing and reference verification |
| `backend/src/services/training-contract.service.ts` | requirement lifecycle, idempotent ingest, matching, outbox |
| `backend/src/routes/training-contract.routes.ts` | discovery, `POST /completions`, `GET /records` |
| `docs/api/training-contract-v1.yaml` | the published spec, with a stated deprecation policy |
| `backend/src/__tests__/training-contract.test.ts` | the freeze test, hash-pinned |

## What is deliberately NOT in this change

- **No UI.** The flag is off; there is no screen to turn it on yet.
- **No webhook delivery runner.** The outbox is written and signing is proven; the sender is
  a Phase 03 concern. The *contract* is the frozen part, not the retry schedule.
- **No vendor connectors.** CanIPhish and KnowBe4 are the first two intended mappings — one
  SMB-tier with real write endpoints, one enterprise read-only — precisely because between
  them they prove the contract survives both shapes. Neither is built here.
- **No change to the local content player.** `training_content`, `training_quiz_questions`
  and `user_training_progress` are untouched. The local player becomes one provider among
  several rather than the only way a requirement can be met.

## Risks accepted

- **Two definitions of "overdue"** — `effectiveStatus()` in TypeScript and
  `training_effective_status()` in SQL. Accepted so a report written against the view and one
  written against the API cannot disagree. The freeze test asserts they agree.
- **Evidence outlives the directory.** `training_completions.user_id` and `api_key_id` carry
  no foreign key: `ON DELETE SET NULL` would rewrite append-only evidence when an employee
  leaves or a key is rotated, and provenance that vanishes on key rotation is not provenance.
- **Erasing a customer needs an explicit flag.** `SET LOCAL helios.purge_evidence = 'on'`.
  Without it, deleting an organization fails on the immutability trigger. Explicit and
  greppable was preferred to a silent cascade that destroys evidence.
