# Add Phishing Reports Module (Helios)

> **Status: CAPTURED — exploring, research-gated. NOT ready to implement.**
> Recorded so the direction isn't lost. Build only after Phase 0 research, and only
> after the standalone Gmail button (Phase 1) has shipped and proven its value. Spec
> deltas (`specs/`) are intentionally deferred until research resolves the open
> questions in `tasks.md`.

## Why

Phishing — especially **internal impersonation / BEC** ("this email claims to be the
CFO") — is a top attack vector and squarely on ObiLabs's security edge. A Gmail
"check the bait before you bite" button (`obilabs/baitcheck`) is a **low-friction
security wedge**: it analyses an email before a user reports it, works per-user, and
needs no server.

What a button alone can't give an organization is **visibility and tuning**: which
emails were reported, verdict trends, and detection that knows *who is actually
internal*. That is a per-org dashboard — and Helios is the natural place for it:

- Helios already holds the org's **real Workspace directory**, which is exactly what
  internal-impersonation detection needs (cross-reference a sender's display name /
  domain against actual users). The dashboard doesn't have to rebuild that. *(A
  standalone dashboard could read the directory too — this is a reuse/consolidation
  win, not an exclusive capability.)*
- Helios already has **self-hosting, an admin UI, an audit trail, and a module
  system** (`add-itsm-module` precedent). A "Phishing Reports" module reuses all of
  it instead of standing up a second app to host and maintain (Principle: build the
  core, rent the rest; solo-maintainer capacity).
- **Growth funnel:** a free, widely-useful phish button drives Helios adoption, and a
  larger Helios installed base grows the pool of orgs an MSP would manage through
  **MTP**. Button → Helios → MTP.

## What Changes (proposed)

A new opt-in Helios **Phishing Reports** module that:

1. **Ingests reports** from the standalone Gmail button (an authenticated endpoint;
   the button posts a report plus its own analysis).
2. **Per-org dashboard** — reported emails, verdicts, trends, repeat targets/senders.
3. **Directory-based impersonation detection** — cross-references sender display
   name, domain, and reply-to against the org's synced Workspace directory to flag
   "claims to be an internal person but isn't" (lookalike domains, display-name
   spoofing, external reply-to on an internal-looking name).
4. **Feeds MTP** later — a cross-org rollup for MSPs (Phase 3, only on demand).

**Decoupling is a hard rule.** The Gmail button stays a standalone product
(`obilabs/baitcheck`, Apps Script → Marketplace) that works with **no Helios**. It
reports *to* Helios if configured, but is never gated behind it — gating the wedge
behind Helios would kill the adoption that drives the whole funnel. "Works alone,
better together."

### Layering

```
Gmail button            Helios module                     MTP
(per-user, standalone) → (per-org dashboard + detection) → (cross-org rollup, MSPs)
```

## Sequencing (deliberate — do not build all at once)

- **Phase 0 — research** (the gate; see `tasks.md`): Apps Script / Gmail add-on
  capabilities + limits, Workspace Marketplace requirements, impersonation-detection
  signals (SPF/DKIM/DMARC, display-name spoofing, homoglyph/lookalike domains,
  reply-to mismatch), and the Helios module contract.
- **Phase 1 — ship the standalone Apps Script button** (`baitcheck`). The wedge.
  Prove the triage value with real use before building anything server-side.
- **Phase 2 — Helios module** (dashboard + directory-based detection).
- **Phase 3 — Marketplace listing + MTP rollup** — only if demand is real.

## Impact

- New **opt-in** Helios module; no change to existing modules or the wire contract.
- Depends on `obilabs/baitcheck` (the button) shipping first.
- Reuses existing Helios directory sync, audit trail, and module system.
- No spec/schema changes proposed yet — deferred to Phase 2, post-research.
