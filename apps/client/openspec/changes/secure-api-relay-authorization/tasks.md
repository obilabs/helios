# Tasks — Secure the API Relay with an Authorization Model

**The relay is unshipped. This must land before it ships. No live exposure today,
so there is no rush to patch — there is a reason to design it correctly once.**

Build order follows the policy-engine/transport split: the offline-testable core
first, the Google-dependent parts behind fixtures.

## Phase 0 — Fixture safety (do BEFORE touching any real Workspace)

- [ ] Build the fixture scrubber: redact `Authorization` headers entirely, map real
      emails/names to stable fakes, normalize customer/tenant/OU IDs
- [ ] CI check that greps fixtures for token-shaped strings and live domains
- [ ] Stand up a sandbox Workspace + one seat (a few dollars/month; also serves the
      existing test-gam-parity benchmark)

## Phase 1 — Policy engine (pure, offline, fully tested)

- [ ] Request descriptor type: `{ cloud, api, resource, method, subject? }` and a
      parser that reuses the existing API-name extraction (transparent-proxy.ts:152)
- [ ] Rule model: `{ effect: allow|deny, match, subjectConstraint?, expiresAt? }`
      with wildcard matching on `api.resource:method`
- [ ] Capability bundles → raw rules expansion (Google vocabulary + Microsoft
      vocabulary, separate)
- [ ] Evaluation: org-deny → group-allow-union → default deny; enforce read/write/
      delete asymmetry
- [ ] Ceiling enforcement: intersect with caller role/key permissions
- [ ] Batch unwrapping + deny-on-unparseable
- [ ] Impersonation subject evaluation (privileged-subject requires explicit rule)
- [ ] Unit tests for every branch above — no network. This is the bulk of the value
      and must be exhaustive.

## Phase 2 — Transport (behind fixtures)

- [ ] Replace the hardcoded broad-scope JWT (transparent-proxy.ts ~336-339) with
      per-capability scope minting — a request gets only the scopes its rule needs
- [ ] Wire the engine decision in front of the forward: deny → return the auth
      error without forwarding; allow → mint scoped token, forward
- [ ] Record-and-replay test harness using the scrubbed fixtures
- [ ] One manual live smoke test against the sandbox

## Phase 3 — Audit + discovery

- [ ] Extend the `google_api_*` audit path to record decision + matched rule (or
      "default deny") on every call, allow and deny
- [ ] Build the known-endpoint catalogue: cache Google API Discovery documents and
      Microsoft Graph `$metadata`; expose a `isKnownEndpoint(descriptor)` check
- [ ] Generate the **endpoint library** from that catalogue: one entry per
      endpoint with its REAL operations (insert/get/list/patch/delete/undelete/
      makeAdmin…), tagged into CRUD-ish groups + an "Other / privileged actions"
      category for custom methods. Store the precise method per action.
- [ ] Admin "enable from library" UI: toggle endpoint + actions per group →
      generates the allow rules the engine consumes. Privileged custom methods
      require explicit enablement (treated like deletes; compose with subject
      constraints). Nothing enabled at install (deny-by-default holds).
- [ ] Discovery hints point INTO the library (name the entry + action to enable),
      not raw descriptors
- [ ] **Catalogue refresh job**: re-pull Discovery docs / Graph `$metadata` on a
      schedule; new endpoints appear in the library DISABLED (deny-by-default).
      Admin never hand-adds an endpoint.
- [ ] **Self-heal the staleness window**: repeated same-endpoint unknown hits
      trigger a debounced on-demand refresh (≤1 per API per interval) + re-classify;
      a now-known endpoint becomes a library hint, still-absent stays an anomaly
- [ ] Classifier: a denied call routes to the **discovery queue** only if the
      endpoint is valid+known; nonexistent endpoints, privileged-subject attempts,
      and high-volume probing route to an **anomaly signal** instead
- [ ] Discovery queue: persist valid denied descriptors as proposed rules,
      deduplicated with a count and attributed to the caller; rate-limit distinct
      proposals per caller per window
- [ ] Anomaly signal surface: nonexistent-endpoint and high-volume probing as a
      security alert, never promotable
- [ ] Rule/bundle authoring validates against the catalogue — cannot create a rule
      for an endpoint that does not exist
- [ ] Admin console: review queue (promote a valid proposal to a group-scoped
      allow; sensitive descriptors flagged high-risk), separate anomaly view.
      Nothing auto-promotes.
- [ ] Verify write attribution flows the acting user (actor-assertion) into audit

## Phase 4 — Dark-launch controls

- [ ] `api_relay` feature flag, per-org, off by default (use the existing
      feature-flag system)
- [ ] Separate writes toggle; enabling the relay does not enable writes
- [ ] Empty rule set on first enable → relay can do nothing until a bundle is added
- [ ] Optional bootstrap window (permissive-logging on writes, then flip to enforce)

## Phase 5 — Microsoft parity

- [ ] Microsoft rule vocabulary (distinct from Google — do not share semantics)
- [ ] Same engine, same audit/discovery, same dark-launch controls for
      `microsoft-transparent-proxy.ts`
- [ ] Fixtures + scrubber cover Microsoft Graph responses too

## Phase 6 — Docs, KB, and AI/MCP seeding

The design decisions in this change currently live only in the OpenSpec (an
engineering doc). They must be turned into user-facing KB content and seeded so
the running product — and its AI/MCP, if enabled — can answer these questions.

- [ ] Seed KB articles (per the KB-seeding discipline) covering the FAQ this design
      has already produced:
      - what the relay is; deny-by-default; how enabling from the endpoint library works
      - how discovery hints work (valid → library hint; garbage → anomaly)
      - why break-glass / privileged accounts are protected
      - the reorg workflow: privileged accounts excluded from bulk, updated deliberately
      - what each denial reason means and how to resolve it the intended way
- [ ] Ensure the AI assistant acts ONLY through the relay — no side-channel around
      `evaluate()`. Every AI-initiated action is authorized and audited with the AI
      as the acting identity. The relay is the AI's guardrail (design §12a).
- [ ] MCP: expose the relay capabilities such that discovery never implies
      permission — an agent may find a capability but the relay decides use.
- [ ] Document the compliance story: deny-by-default, per-decision audit, scoped
      tokens, subject constraints, break-glass audit property — the differentiated
      SOC2 / access-review narrative; belongs in an award submission.
- [ ] (Watch, not now) Agentic Resource Discovery / `ai-catalog.json`: the endpoint
      library is a natural source for a published capability catalogue if/when that
      spec stabilizes and there's a customer reason. Discovery layer only — the relay
      remains the authorization layer.

## Verification

- [ ] Policy-engine unit tests green with no network
- [ ] Replay tests green in CI with no live Google
- [ ] Fixture CI check finds no tokens or live domains
- [ ] Manual: a read within a granted bundle succeeds; a delete outside any rule is
      denied and appears in the discovery queue; an org deny overrides a group allow
- [ ] Relay is off by default on a fresh org; enabling it does not enable writes
