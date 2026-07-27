# Design — API Relay Authorization

## 1. Two components: policy engine + transport

Split the relay into a **policy engine** and a **transport**, and keep them apart.

- **Policy engine** — pure function. Input: a caller (Helios identity + role +
  API-key scopes), a parsed request descriptor (cloud, resource, method, target
  subject, batch contents), and the org's rule set. Output: allow / deny + reason.
  **No network, no Google, no database calls** beyond loading the rule set.
- **Transport** — takes an already-authorized request, mints a correctly-scoped
  token, forwards it, returns the response.

~90% of the risk and all of the decision logic lives in the policy engine, and
100% of it is unit-testable offline. This is the same split that made the sibling
product's licensing package fully testable without a network. It is also the
answer to why the relay was hard to test before (it was one lump entangled with
Google).

## 2. Request descriptor — pattern, not URL

Google's admin surface is too large to allowlist by exact path. Match on a
structured descriptor the relay already partially extracts
(transparent-proxy.ts:152 extracts `admin.directory.users`):

```
{ cloud, api, resource, method, subject? }
e.g. { cloud: 'google', api: 'admin.directory', resource: 'users', method: 'GET' }
```

A rule matches on `api.resource:method` with wildcards
(`admin.directory.users:*`, `admin.directory.*:GET`). Never regex over raw URLs.

## 3. Read / write / delete asymmetry

The "unbuilt features still work" value is almost entirely a **read** story.
Nobody is excited about deleting a user through an endpoint Helios never built a
UI for. So the default posture differs by method class:

| Method class | Default | Rationale |
|---|---|---|
| Reads (`GET`, `LIST`) | allowed within granted capabilities + OAuth scopes | preserves the differentiator; low blast radius |
| Writes (`POST`, `PUT`, `PATCH`) | **deny** unless an explicit allow rule matches | mutation needs intent |
| Deletes (`DELETE`) | **deny**, not promotable by a plain admin, step-up auth recommended | one-way doors get the strongest gate |

Note: even reads are **not** open by default at install — see §7 (deny
everything until the admin configures the first bundle). The table describes the
posture *within* a granted capability.

## 4. Two layers: raw rules + capability bundles

- **Raw rules** — `{ effect: allow|deny, match: 'admin.directory.users:GET' }`.
  The implementation primitive.
- **Capability bundles** — named sets ("Read directory", "Manage group
  membership") that expand to raw rules. Admins reason about bundles; the engine
  evaluates rules.

Bundles double as sellable feature tiers later, and keep the admin UI legible.

## 4a. The endpoint library — curated catalogue the admin enables from

The admin does **not** author raw rules by hand, and does not have to see raw
denied endpoints to build the allowlist. The primary interface is a **library**:
a catalogue of endpoints the admin turns on before anything can use them.

- **Auto-generated from the full API catalogue.** The library is built from
  Google's API Discovery documents (and Microsoft Graph `$metadata`), so it
  contains **every real endpoint the cloud offers** — not a hand-picked subset.
  This is what keeps "admin must enable" from being limiting: the admin can enable
  anything Google actually supports; they simply have to turn it on first. It also
  reuses the known-endpoint catalogue already required in §8.
- **Enabling produces rules.** Turning on an endpoint + its actions, scoped to a
  group, generates the exact allow-rules the policy engine already evaluates. The
  library UI is a rule-authoring front-end; the engine is unchanged. Nothing is
  enabled at install → deny-by-default holds (§7).
- **Actions are the API's REAL operations, not just four CRUD verbs.** Modeling
  each entry as strictly Create/Read/Update/Delete is **too limiting** — Google
  has custom methods that don't fit CRUD (`users.makeAdmin`, `users.undelete`,
  password reset, `members.hasMember`, batch ops). Model each library entry on the
  actual operations the Discovery doc lists (`insert`/`get`/`list`/`patch`/
  `delete`/`undelete`/`makeAdmin`…). Present them grouped into friendly CRUD-ish
  buckets **plus an "Other / privileged actions" category** for custom methods —
  but store the precise method in the rule. The admin gets a clean CRUD-ish view;
  the rule stays exact; `makeAdmin` never hides under "Update."
- **Privileged custom methods get the strong gate.** Custom methods in the
  "privileged" category are treated like deletes — they require explicit enablement
  and compose with the subject constraints (§10), never granted by a broad toggle.

This makes discovery (§8) a *hint into the library* rather than a raw-endpoint
proposal: "users tried Groups → Delete 14× — enable it?" points the admin at a
library entry to toggle, not at an opaque descriptor to reason about.

## 4b. Catalogue currency — the library keeps itself current

Two distinct "discoveries" exist and must not be conflated:

- **Catalogue discovery (this section):** keeping the library in sync with the
  cloud's actual API surface. Source: the cloud's Discovery docs.
- **Usage discovery (§8):** observing what callers reach for. Source: denied calls.

When Google ships a new endpoint it appears in its Discovery document (the living,
canonical source). The library is therefore **refreshed on a schedule** from those
docs — not snapshotted once. Consequences:

- A new cloud endpoint flows into the library automatically and appears
  **disabled**. Deny-by-default holds, so a new endpoint is never silently
  reachable. The admin never chases a changelog or hand-adds an endpoint; they
  only *enable* one if they want it.
- **The staleness window is self-healing.** Between the cloud adding an endpoint
  and the next scheduled refresh, a call to it is "unknown to the catalogue," which
  §8 would otherwise route to the anomaly signal. To avoid mislabeling a real new
  endpoint as an attack: **repeated, same-endpoint unknown hits** (not scattered
  garbage) trigger an **on-demand catalogue refresh + re-classification**. If the
  endpoint now appears → it becomes a normal library hint. If still absent after a
  fresh pull → genuinely garbage → anomaly.
- The on-demand refresh is **debounced** (at most one refresh per API per interval)
  so hammering fake endpoints cannot turn refresh into a DoS.

Burden split: automated refresh (system) + one-click enable (admin). No manual
discover-and-add.

## 5. Precedence — deny beats allow, always

- **Deny is org-wide and absolute** — a kill switch no group grant overrides.
- **Allows are per-group and additive** — effective set = union of the caller's
  groups' allowed rules, minus org denies.
- Evaluation: if any org deny matches → deny. Else if any allow matches → allow.
  Else → deny (default).

## 6. Two hard ceilings the relay can only narrow

A relay call can never exceed either:

1. **The caller's Helios role/scopes.** An API key's issued permissions and the
   user's role cap what any rule can grant. (Depends on the api-keys/proxy
   isAdmin fix already landed — the proxy now derives admin from the key's actual
   permissions rather than hardcoding it.)
2. **The OAuth scopes actually minted.** Fix the hardcoded broad-scope JWT: mint
   a token carrying only the scopes the matched capability needs. A "read
   directory" call gets `admin.directory.user.readonly`, not write scopes.

The engine narrows; it never widens. This is the relay equivalent of the sibling
product's admin-key ceiling (audit M4).

## 7. Ship dark

- Feature flag `api_relay` (Helios already has a feature-flag system), **off by
  default**, **per-organization** opt-in.
- Enabling the relay does **not** enable writes. Writes are a second, separate
  toggle.
- On first enable, the effective rule set is **empty → the relay can do nothing**.
  The admin must enable entries from the endpoint library (§4a). "Reads within
  scope" is the
  recommended first bundle, not an implicit baseline. The install starts closed.

## 8. Shadow-mode discovery — the allowlist builds itself

The admin does not have to guess the rule set. The relay discovers it — but a
denied call is **not** automatically a proposed rule. If it were, any caller with
a valid session could flood the admin's review queue by guessing endpoints, and —
worse — the actual attack signal (someone probing) would be buried under noise
labelled "features your users want."

So the denial log feeds a **classifier**, and validity is the fork:

**Known-surface validation.** Maintain a cached catalogue of real endpoints per
cloud (Google publishes machine-readable API Discovery documents; Microsoft Graph
exposes `$metadata`). A descriptor is *valid* only if it names a real
`api.resource:method` in that catalogue. The same catalogue is what capability
bundles reference, so a rule can only ever name an endpoint that actually exists.

The denial log then routes to one of two places:

- **Discovery queue (promotable)** — denied calls to **valid, known** endpoints.
  "3 users attempted `admin.directory.groups.members:POST` 14× this week." An
  admin reviews and promotes to a group-scoped allow rule.
- **Anomaly signal (never promotable)** — denied calls to **nonexistent**
  endpoints, to **privileged subjects** (see §10), or in **high volume from one
  caller**. This is an intrusion indicator, surfaced as a security alert, and it
  can never become an allow rule. Guessing garbage lands here and only here.

**A guessed nonexistent endpoint therefore never enters the allowlist.** It is
denied by default (no rule matches), never forwarded to the cloud (validation is
for classification, not for deciding whether to proxy), and recorded as an anomaly
rather than a proposal.

Additional guards:

- **Dedupe + rate-limit by caller.** Even a *valid* endpoint can be spam-guessed,
  and the caller is authenticated (key or session), so attribute it. Store a
  count per descriptor, not one row per attempt, and cap distinct proposals per
  caller per window.
- **Human always in the loop.** Nothing auto-promotes. Discovery only *suggests*;
  an admin grants. Even a valid-endpoint guess cannot become a rule without a
  person deciding — and sensitive descriptors (deletes, privileged subjects) are
  flagged high-risk in the queue and require stronger review.
- Optional **bootstrap window** per install: run permissive on writes for a fixed
  period, logging-not-blocking, then flip to enforcing once the queue reflects
  real usage. Same discipline as a WAF or SELinux rollout. (Bootstrap still only
  queues valid endpoints as promotable; garbage still routes to anomaly.)

The console becomes an **admin point for discovered-and-allowed endpoints**, not a
discovery point. Discovery happens in the log, and only real endpoints a human
approves ever become rules.

## 9. Batch unwrapping

Google's batch API wraps N sub-requests in one HTTP call. The engine MUST unwrap
the batch and authorize each sub-request independently; the batch is allowed only
if every sub-request is allowed. If unwrapping is not implemented for a given
batch format, that batch is **denied**, not passed through.

## 10. Impersonation subject constraints

With domain-wide delegation the impersonated subject is often a parameter, not
part of the path. `users:GET` looks identical whether it targets one user or the
super-admin. Rules therefore constrain **who may be acted upon**, not only what
may be called:

- A rule may bound the subject (e.g. "not a super-admin", "within OU X").
- Acting upon a privileged subject requires an explicit rule; it is never implied
  by a resource-level grant.

### Bulk operations vs privileged subjects (the reorg case)

A legitimate question: during a company reorg, every user's department/title
changes — including the super-admin's. How does that happen if a broad grant
can't touch a privileged subject?

**By design: excluded from bulk, updated by one deliberate action.** This is a
feature, not a limitation — a reorg touching hundreds of accounts must never sweep
the break-glass account along without someone consciously deciding to.

- The bulk operation runs under a normal grant (no `allowPrivileged`). The
  super-admin sub-request is denied with `privileged-subject-requires-explicit-rule`.
- Because batch is **all-or-nothing** (§9), a batch that *includes* the super-admin
  is rejected wholesale — not silently applied to everyone else. The per-sub reason
  report tells the caller exactly which subject to exclude. The reorg tool excludes
  privileged accounts (proactively, or by reacting to the report) and resubmits.
- The super-admin is then updated by a **separate, deliberate action** using a
  capability that explicitly sets `allowPrivileged` — ideally **time-boxed** (§11)
  or step-up-authed, so no one holds standing power over the break-glass account.

All-or-nothing is the safe default: a silent partial reorg ("I thought it applied
to everyone") is more dangerous than a clear rejection. A future opt-in
"skip-and-report" bulk mode (apply allowed subs, return denied ones) is possible if
ergonomics demand it, but it stays out of the default.

**Payoff — a provable audit property:** the break-glass account can only ever be
changed by a deliberate, explicitly-authorized action, never swept up in bulk.
"Show me every change to your most privileged account" returns a clean list of
deliberate actions with zero bulk noise — a specific, strong compliance story.

## 11. Expiring grants (recommended)

Allow rules may carry an expiry. A time-boxed grant fits the product thesis
(delegated, scoped, revocable access) exactly, and stops the rule set from
silently accreting permissions nobody remembers approving.

## 12. Audit every decision

Every relay call — allowed or denied — is written to the existing audit trail
(`google_api_*` logging already exists) with: caller identity, descriptor,
decision, matched rule (or "default deny"), and for writes the acting user.
Denied calls are both the discovery-queue input and the intrusion signal, so they
are logged as loudly as allows.

## 12a. The relay is the AI's guardrail; the KB is the AI's explanation

If the AI assistant is enabled and acts **through the relay**, it is automatically
bound by the same rules as any caller — deny-by-default, ceilings, delete-explicit,
and subject constraints. So "what the AI can do to help" is not merely documented;
it is **enforced**. An AI told "reset the super-admin" gets the same
`privileged-subject-requires-explicit-rule` denial a human would. The AI physically
cannot exceed what a human with the same grant could do. **Never give the AI a
side-channel around the relay** — every AI-initiated action goes through
`evaluate()` and is audited with the AI as the acting identity.

That safety property must be paired with **KB/MCP seeding** so the model can explain
the *why*, not just fail:

- Every design decision here becomes user-facing KB content, per the KB-seeding
  discipline. That content is what an AI (RAG) or a human reads to answer
  "why can't I…" and "how do I do this the intended way."
- Seed the specific questions this design has already answered — they are the FAQ:
  deny-by-default and how enablement works; the endpoint library and how discovery
  hints work; why break-glass/privileged accounts are protected; the reorg workflow
  (excluded from bulk, updated deliberately); what a given denial reason means and
  how to resolve it.
- **Discovery never implies permission.** Whether via the endpoint library, MCP, or
  a future agent-discovery catalogue (e.g. Agentic Resource Discovery /
  `ai-catalog.json`), an agent may *find* a capability, but the relay decides
  whether it may *use* it. The KB states this explicitly so no one — human or
  agent — assumes discoverability means authorization.

The compliance framing writes itself from these: an AI-forward Workspace tool where
every action an agent takes is deny-by-default, scoped, subject-constrained, and
audited to the acting identity. That is the differentiated, security-conscious
story — and it is only credible because the authorization layer exists first.

## 13. Google ≠ Microsoft — shared engine, separate vocabularies

The policy engine is cloud-agnostic (it evaluates descriptors against rules). The
**rule vocabulary is per cloud**, because the admin models genuinely diverge:
license assignment (OU-based vs group-based), identity lifecycle, group semantics,
delegation, and audit shape all differ. Do not build one abstraction that assumes
both clouds work the same way; build one engine that evaluates two vocabularies.

## 14. Testing strategy

- **Policy engine**: exhaustive unit tests — allow/deny/precedence/ceilings/batch-
  unwrap/subject-constraints — all offline, no Google, no flake.
- **Transport**: record-and-replay fixtures. Hit a real sandbox Workspace once to
  capture responses as cassettes; replay in CI. Google is needed for *recording*,
  not for every run.
- **Fixture scrubber (build BEFORE first recording)**: cassettes capture real
  emails, names, customer IDs, OU paths, bearer tokens. Helios is AGPL and headed
  for a public repo. Redact auth headers entirely, map identities to stable fakes,
  normalize customer IDs; add a CI check that greps fixtures for anything
  resembling a token or a live domain. Recorded-then-cleaned-later leaks, because
  the raw version is already in git history.
- One manual live smoke test against a sandbox domain (a few dollars/month; also
  what the existing `test-gam-parity.ts` benchmark wants).

## 15. Relationship to existing code

- `transparent-proxy.ts` / `microsoft-transparent-proxy.ts`: the transport half.
  The combinedAuth block (already fixed to derive `isAdmin` from key permissions)
  feeds the caller identity into the engine.
- The broad hardcoded JWT scopes (transparent-proxy.ts ~336-339) are replaced by
  per-capability scope minting (§6).
- The `google_api_*` audit path (§12) is extended to record the decision + matched
  rule.
- The feature-flag system gates the whole thing (§7).
