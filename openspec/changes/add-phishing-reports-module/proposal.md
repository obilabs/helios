# Add Phishing Capabilities to Helios (Detection + Simulation)

> **Status: CAPTURED — exploring, research-gated. NOT ready to implement.**
> Recorded so the direction isn't lost. Build only after Phase 0 research, and only
> after the standalone Gmail button (Track A, Phase 1) has shipped and proven its value.
> Spec deltas (`specs/`) are intentionally deferred until research resolves the open
> questions in `tasks.md`. This change may later split into two (detection, simulation)
> once research firms the boundaries.

## Why

Phishing — especially **internal impersonation / BEC** — is a top attack vector and
squarely on ObiLabs's security edge. Helios's Google Workspace admin position lets it do
two phishing things a generic tool can't do cleanly. They are **two tracks**:

**Track A — Detection (the wedge).** A Gmail "check the bait before you bite" button
(`obilabs/baitcheck`) analyses an email before a user reports it — per-user, no server. A
Helios **reports dashboard** then gives the org visibility (what was reported, verdict
trends) plus **directory-based internal-impersonation detection**: cross-reference a
sender's display name / domain / reply-to against the org's real Workspace directory to
flag "claims to be an internal person but isn't." Helios already holds that directory.

**Track B — Simulation / awareness training (the differentiator).** A Helios dashboard to
**build phishing templates and run simulated campaigns against the org's own users**, then
measure who catches them. Two things make this a moat:

- **Workspace-native delivery, no mail server.** Because Helios has Workspace admin
  access, it **injects** the simulated message straight into users' mailboxes via the
  Gmail API (`insert` / `import`) instead of *sending* over SMTP. That means no mail
  infrastructure, any `From` address, any link — and it **bypasses SPF/DKIM/DMARC, spam
  filtering, and allowlisting entirely**, which is the single biggest operational headache
  with GoPhish / KnowBe4 / Proofpoint. A Workspace-integrated tool sidesteps all of it; a
  generic one can't.
- **Org-wide visibility, not per-admin silos.** Prior tools in this space silo each admin
  ("each admin is effectively a separate tenant"), so no admin sees another's campaigns or
  setup. Helios makes campaigns, templates, and results a **single org-wide view** — the
  accountability / single-source-of-truth default, applied to security training.

**Growth funnel:** the free detection button drives Helios adoption; a larger Helios
installed base grows the pool of orgs an MSP would manage through **MTP**. Button → Helios
→ MTP.

## Non-negotiable guardrail (both tracks, especially Simulation)

The simulation tool is powerful (inject any `From` into a mailbox), so it is bounded by
design: **the org's own Workspace, its own users, admin-authorized, and fully audited**
(who ran which campaign against whom, when). It cannot target anything outside the
connected org's tenant. That boundary is what keeps it a legitimate awareness tool rather
than a weapon — and it is the accountability-first way to build it regardless.

## What Changes (proposed)

**Track A — Detection**
1. Standalone Gmail button (`obilabs/baitcheck`, Apps Script → Marketplace) — the wedge;
   works with **no Helios**, reports *to* Helios only if configured (never gated behind it
   — gating the wedge would kill the funnel).
2. Helios reports dashboard — reported emails, verdicts, trends, repeat targets/senders.
3. Directory-based internal-impersonation detection.

**Track B — Simulation**
4. Template builder (phish templates + landing/link tracking).
5. Workspace-injection delivery (`insert` / `import`), no SMTP.
6. Catch-rate tracking (clicked / reported / ignored), per user and org-wide.
7. Org-wide admin visibility (shared campaigns / templates / results).
8. *Optional Aegis hook later* — raise a follow-up ticket for repeat clickers by
   **integrating to Aegis**, not by rebuilding ITSM in Helios.

Both tracks are **opt-in Helios modules** built on Helios's existing module system — the
live **Google Workspace / Microsoft 365 modules** are the precedent (NOT
`add-itsm-module`, which is stale and duplicates Aegis — see the tidy-up backlog). Neither
track is ITSM, so neither steps on Aegis.

### Layering
```
Gmail button              Helios (per-org)                        MTP
(per-user, standalone) →  Detection dashboard + Simulation     →  cross-org rollup (MSPs)
```

## Sequencing (deliberate — do not build all at once)

- **Phase 0 — research** (the gate; see `tasks.md`).
- **Phase 1 — ship the standalone Apps Script button** (`baitcheck`, Track A wedge). Prove
  triage value before building anything server-side.
- **Phase 2 — Helios detection module** (reports + impersonation detection).
- **Phase 3 — Helios simulation module** (template builder + injection + catch tracking +
  org-wide visibility).
- **Phase 4 — distribution + MTP** (Marketplace listing, cross-org rollup) — only on demand.

## Impact

- New **opt-in** Helios modules; no change to existing modules or the wire contract.
- Track A depends on `obilabs/baitcheck` shipping first.
- Reuses Helios directory sync, audit trail, and module system.
- Track B needs new Gmail scopes (`insert` / `import`) via DWD — a research + consent item
  (adding to `REQUIRED_SCOPES` is all-or-nothing across connected orgs; treat as opt-in).
- No spec/schema changes proposed yet — deferred post-research.
