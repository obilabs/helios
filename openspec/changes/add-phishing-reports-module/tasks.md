# Tasks — Add Phishing Capabilities (Detection + Simulation)

> Gated on Phase 0 research. Nothing here is started; this file captures the plan so the
> direction is recorded, not to authorise a build.

## Phase 0 — Research (the gate)
- [ ] Gmail add-on / Apps Script (Track A button): capabilities + quotas for reading a
      message, showing a verdict UI, posting to an external endpoint; the publishing path.
- [ ] Workspace Marketplace: listing requirements, OAuth scopes + verification, review.
- [ ] Impersonation-detection signals (Track A): SPF/DKIM/DMARC alignment, display-name
      spoofing, lookalike/homoglyph domains, reply-to mismatch — reliability + which need
      the org directory.
- [ ] **Gmail injection (Track B):** `gmail.insert` vs `gmail.import` behaviour (spam
      filtering, labels, threading); the exact DWD scopes required; admin-consent impact
      (adding `REQUIRED_SCOPES` is all-or-nothing across connected orgs); deliverability +
      limits; confirm arbitrary `From` / headers can be set on an injected message.
- [ ] Legal/ethics + guardrail: the own-org / authorized / audited boundary, and any
      notice/consent norms for running simulations against employees.
- [ ] Helios module contract: how the live Google/M365 modules register (routes, nav,
      migrations, capability guard) + the ingest-endpoint auth model.

## Phase 1 — Standalone Gmail button (obilabs/baitcheck) — Track A wedge
- [ ] Apps Script MVP: analyse-before-report, local verdict, optional post to a configured
      Helios endpoint. Works with NO Helios.
- [ ] Prove triage value in real use before building anything server-side.

## Phase 2 — Helios detection module (post-research)
- [ ] Authenticated ingest endpoint + storage.
- [ ] Per-org reports dashboard (reports, verdicts, trends).
- [ ] Directory-based impersonation detection.
- [ ] Spec deltas here (`specs/`) BEFORE implementation.

## Phase 3 — Helios simulation module (post-research)
- [ ] Template builder (templates + link/landing tracking).
- [ ] Workspace-injection delivery (`insert` / `import`), no SMTP.
- [ ] Catch-rate tracking (clicked / reported / ignored), per user + org-wide.
- [ ] Org-wide admin visibility (shared campaigns/templates/results — no per-admin silos).
- [ ] Audit: every campaign attributable (who ran what against whom, when).
- [ ] Spec deltas here (`specs/`) BEFORE implementation.

## Phase 4 — Distribution + MTP (only on demand)
- [ ] Workspace Marketplace listing.
- [ ] MTP cross-org rollup.
