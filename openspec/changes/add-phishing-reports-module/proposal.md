# Add Phishing Capabilities to Helios (Detection + Simulation)

> **Status: CAPTURED — exploring, research-gated. NOT ready to implement.**
> Recorded so the direction isn't lost. Build only after Phase 0 research, and only after
> L1 (the copy-paste Apps Script button) has shipped and proven its value. Spec deltas
> (`specs/`) are intentionally deferred until research resolves the open questions in
> `tasks.md`. This change may later split into two (detection, simulation) once research
> firms the boundaries.

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

- **Workspace-native delivery, no mail server.** Helios has Workspace admin access, so it
  **injects** the simulated message straight into mailboxes via the Gmail API
  (`insert` / `import`) instead of *sending* over SMTP — no mail infra, any `From`, any link,
  and (with `insert`) no SPF/DKIM/DMARC/allowlisting gauntlet. **This is NOT a moat** —
  KnowBe4, Microsoft, and Hoxhunt already inject via API; it's table stakes. The real edge is
  **ownership + self-hosted + no per-seat + explainability**, plus foregrounding the delivery
  method in the UX where incumbents bury it. (The SMTP/allowlisting pain is real specifically
  vs **GoPhish** and other SMTP-based tools.)
- **Org-wide, directory-native visibility.** A shared org-wide view + RBAC derived from the
  Workspace directory (not from which admin connected OAuth), self-hosted, no per-seat. This
  beats **GoPhish** (siloed per login, no cross-admin view), **Google-native** (aggregate-only,
  reporters not even identified), and lightweight Marketplace add-ons — **not** KnowBe4 /
  Defender / Hoxhunt, which already share org views (don't claim otherwise). Directory-derived
  OU / department / manager roll-ups on every table are the concrete thing the siloed tools
  can't produce.

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

### Track A — Detection (open-core ladder)

Three delivery levels. Each works on its own; higher levels add **ease + integration, not
core detection** — so L1 can be free and open while L2/L3 still make sense.

- **L1 — plain Apps Script, open source, copy-paste (`obilabs/baitcheck`).** The DIY wedge:
  no account, no Marketplace, no Helios — fork it, paste into Apps Script, deploy. Fastest
  to ship and the SEO/goodwill base. **Free. This is Phase 1.**
- **L2 — Workspace Marketplace app. FREE.** The no-code easy button for non-technical
  admins: one-click install, auto-updates, and an admin config UI for a **management URL**
  (→ Helios), a **bring-your-own AI API key** (analysis runs through the org's own AI
  provider, not ObiLabs — "your data, your call"), and branding. Distribution + the funnel;
  it sells *ease*, since L1 already gives the core detection away.
- **L3 — Helios integration + dashboard.** Org-wide reports + verdict trends +
  **directory-based internal-impersonation detection**. Free, like the rest of Helios — the
  whole suite is a **wedge**, not a paid tier.

The button (L1/L2) is **never gated behind Helios** — gating the wedge would kill the funnel.

### Track B — Simulation

1. Template builder (phish templates + landing/link tracking).
2. Workspace-injection delivery (`insert` / `import`), no SMTP.
3. Catch-rate tracking (clicked / reported / ignored), per user and org-wide.
4. Org-wide admin visibility (shared campaigns / templates / results).
5. *Optional Aegis hook later* — raise a follow-up ticket for repeat clickers by
   **integrating to Aegis**, not by rebuilding ITSM in Helios.

Both Helios modules (L3 detection, and simulation) are **opt-in**, built on Helios's
existing module system — the live **Google Workspace / Microsoft 365 modules** are the
precedent (NOT `add-itsm-module`, which is stale and duplicates Aegis — see the tidy-up
backlog). Neither track is ITSM, so neither steps on Aegis.

### Layering
```
L1/L2 button              Helios (per-org, L3+)                    MTP
(per-user, standalone) →  Detection dashboard + Simulation      →  cross-org rollup (MSPs)
```

## Sequencing (deliberate — do not build all at once)

- **Phase 0 — research** (the gate; see `tasks.md`).
- **Phase 1 — L1** (plain copy-paste Apps Script, open source). The zero-friction wedge;
  prove triage value before anything else.
- **Phase 2 — L2** (Workspace Marketplace app, free, configurable: management URL, BYO AI
  key, branding).
- **Phase 3 — L3 Helios detection module** (reports + impersonation detection).
- **Phase 4 — Helios simulation module** (Track B: template builder + injection + catch
  tracking + org-wide visibility).
- **Phase 5 — MTP cross-org rollup** — only on demand.

## Impact

- **The suite is free — a wedge, not a revenue line.** L1 (open source), L2 (Marketplace),
  and L3 (Helios) are all free/community, like Helios itself. Monetization is **indirect**:
  it grows Helios adoption → grows MTP's addressable orgs (MTP is the only paid product) +
  paid setup/install services. *Open fork:* the simulation module (Track B) is
  differentiated enough to be a candidate for the first **paid** Helios module — a
  deliberate decision that would break "Helios fully free"; deferred, not assumed. (No
  hosting today.)
- New **opt-in** Helios modules; no change to existing modules or the wire contract.
- L3 reuses Helios directory sync, audit trail, and module system.
- Track B needs new Gmail scopes (`insert` / `import`) via DWD — a research + consent item
  (adding to `REQUIRED_SCOPES` is all-or-nothing across connected orgs; treat as opt-in).
- No spec/schema changes proposed yet — deferred post-research.

## Positioning (post-Phase-0 research — see `research/`)

Sharpened by the KnowBe4 + tracking research:

- **Headline differentiator = security posture, not injection.** KnowBe4 *already* ships
  `gmail.insert` injection for Google, so injection is **parity / table-stakes**, not a moat.
  What no incumbent offers: **self-hosted — the DWD credential lives in the org's own
  tenant/server**, least-privilege, per-campaign, immutable log — vs KnowBe4's DMI that
  bypasses safety features, keeps a persistent US-console connection, and lets vendor staff
  impersonate customer admins. This is Principle Product-1 (the security/compliance edge).
- **Accuracy** — no allowlisting for anything (sims / training / notifications) + scanner-
  confidence heuristics — kills the #1 KnowBe4 gripe (*"click rate measures the spam filter"*;
  Safe Links / Defender detonation inflate click rates).
- **Non-punitive** (report-rate + time-to-first-report as the headline metric, not a shame
  wall); **directory-native**; **no per-seat / no sales call**.
- **Beachhead: SMB / K-12 / nonprofits / MSP Google shops** — Workspace-first, budget-tight,
  underserved by the O365-first incumbents. NOT enterprise (KnowBe4 "Defend for Google
  Workspace" is landing there).
- **Don't fight the content library** (KnowBe4's conceded moat) — lightweight KB-article +
  **Rubric-quiz** remediation via Aegis, not a video LMS. Remediation content is authored in
  Rubric (Python, git-native Markdown); Aegis consumes the compiled-JSON bank and renders it
  type-dispatched with a graceful default (unknown types never break).
