# Tasks — Add Phishing Reports Module

> Gated on Phase 0 research. Nothing here is started; this file captures the plan so
> the direction is recorded, not to authorise a build.

## Phase 0 — Research (the gate)
- [ ] Gmail add-on / Apps Script: capabilities + quotas for reading a message,
      showing a verdict UI, and posting to an external endpoint; the publishing path.
- [ ] Workspace Marketplace: listing requirements, OAuth scopes + verification,
      review process, and what a "day-job MVP" can ship without.
- [ ] Impersonation-detection signals: SPF/DKIM/DMARC alignment, display-name
      spoofing, lookalike/homoglyph domains, reply-to mismatch — which are reliable,
      which false-positive, and which genuinely need the org directory.
- [ ] Helios module contract: how `add-itsm-module` and peers register (routes, nav,
      migrations, capability guard) + the ingest-endpoint auth model.
- [ ] Directory cross-reference: what the existing Workspace directory sync exposes
      that detection can use (names, aliases, domains).

## Phase 1 — Standalone Gmail button (obilabs/baitcheck)
- [ ] Apps Script MVP: analyse-before-report, local verdict, optional post to a
      configured Helios endpoint. Works with NO Helios.
- [ ] Prove triage value in real use before building anything server-side.

## Phase 2 — Helios Phishing Reports module (post-research)
- [ ] Authenticated ingest endpoint + storage.
- [ ] Per-org dashboard (reports, verdicts, trends).
- [ ] Directory-based impersonation detection.
- [ ] Write spec deltas here (`specs/`) BEFORE implementation.

## Phase 3 — Distribution + MTP (only on demand)
- [ ] Workspace Marketplace listing.
- [ ] MTP cross-org rollup.
