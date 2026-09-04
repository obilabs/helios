# Tasks — Add Phishing Capabilities (Detection + Simulation)

> Gated on Phase 0 research. Nothing here is started; this file captures the plan so the
> direction is recorded, not to authorise a build.

## Phase 0 — Research (the gate)
- [ ] Gmail add-on / Apps Script (L1/L2 button): capabilities + quotas for reading a
      message, showing a verdict UI, posting to a configured management URL; the
      copy-paste deploy story (L1) vs the Marketplace publish (L2).
- [ ] Workspace Marketplace: listing requirements, OAuth scopes + verification, review —
      and what an L1 copy-paste script can ship WITHOUT any of it.
- [ ] Impersonation-detection signals (L3): SPF/DKIM/DMARC alignment, display-name
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

## Phase 1 — L1: plain Apps Script button (obilabs/baitcheck), open source
- [ ] Copy-paste-deployable Apps Script: analyse-before-report, local verdict, optional
      POST to a configured management URL. No account, no Marketplace, no Helios.
- [ ] Open-source it; prove triage value in real use before building anything else.

## Phase 2 — L2: Workspace Marketplace app (free)
- [ ] Package L1 as a Marketplace add-on (OAuth verification, review).
- [ ] Admin config UI: management URL (→ Helios), bring-your-own AI API key, branding.
- [ ] One-click install + auto-updates.

## Phase 3 — L3: Helios detection module (monetization) — post-research
- [ ] Authenticated ingest endpoint + storage.
- [ ] Per-org reports dashboard (reports, verdicts, trends).
- [ ] Directory-based impersonation detection.
- [ ] Spec deltas here (`specs/`) BEFORE implementation.

## Phase 4 — Helios simulation module (Track B) — post-research
- [ ] Template builder (templates + link/landing tracking).
- [ ] Workspace-injection delivery (`insert` / `import`), no SMTP.
- [ ] Catch-rate tracking (clicked / reported / ignored), per user + org-wide.
- [ ] Org-wide admin visibility (shared campaigns/templates/results — no per-admin silos).
- [ ] Audit: every campaign attributable (who ran what against whom, when).
- [ ] Spec deltas here (`specs/`) BEFORE implementation.

## Phase 5 — MTP cross-org rollup (only on demand)
- [ ] MTP rollup of detection + simulation across managed orgs.
