## Context

Helios has a full external-auth layer — `middleware/api-key-auth.ts` + `utils/apiKey.ts`
with `helios_{env}_*` keys, SHA-256 hashing, a typed scope grammar (`read:users`,
`write:groups`, `sync:google-workspace`, `admin:full`), two key types (`service`,
`vendor`), and actor assertion where vendor keys require `X-Actor-Name`/`X-Actor-Email`
with optional allow-lists and IP whitelisting. What it lacks is anything MTP-shaped:
no `/api/v1/mtp/*`, no single-use time-bounded pairing, no poll/handshake, no
managed-install concept. This change adds that surface on top of the existing
machinery. The MTP side (the HeliosAdapter that consumes this) is the companion
platform change `mtp-helios-adapter`.

The Aegis MTP surface is the proven template: single-use pairing with a 15-min window
and an atomic bind, a handshake returning `{organization, pairing:{scopes},
server:{capabilities}}`, a header-free poll, and actor-asserted writes. Helios mirrors
the *security model* while diverging on *domain* (directory/security, not tickets).

## Goals / Non-Goals

**Goals:**
- A secure MTP pairing (single-use, windowed, atomic bind) as a new key type.
- Handshake + poll + action endpoints under `/api/v1/mtp/*` matching the adapter
  contract, with a Helios-domain poll aggregate.
- Reuse the existing actor-assertion + scope machinery for writes; authoritative
  revocation (g12) + capability advertisement (g18).

**Non-Goals:**
- Changing Helios's existing `service`/`vendor` key behavior.
- Building the MTP-side adapter/UI (that's the platform change).
- A full ITSM/ticket surface — Helios has no tickets to expose.
- Multi-MSP modeling on the Helios side beyond one pairing per MSP relationship.

## Decisions

**D1 — New key type, not a reused vendor key.** Add `helios-mtp-pairing` rather than
overloading `vendor`. Pairing keys are single-use and time-boxed (15-min window,
atomic first-bind); vendor keys are long-lived. Conflating them would weaken the
pairing security model. *Alternative:* a vendor key with extra flags — rejected;
muddies two very different lifecycles.

**D2 — Mirror Aegis's atomic-claim binding exactly.** The first handshake binds via a
single-statement conditional UPDATE (`... WHERE key_hash=$1 AND type='helios-mtp-pairing'
AND active AND NOT revoked AND paired_at IS NULL AND window > NOW()`). The
`paired_at IS NULL` predicate inside the UPDATE is the race guard — no
SELECT-then-UPDATE. This is the same hardened pattern Aegis uses.

**D3 — Poll aggregate is Helios-native.** Return directory/security posture (user/
group counts, suspended/at-risk accounts, security-event counts, GW sync freshness),
derived from Helios's real entities (`gw_synced_users`, groups, `security-events`,
sync state). No ticket fields, no forced union with the Aegis shape. *Alternative:*
emit the Aegis poll shape with nulls — rejected; dishonest and useless to an MSP.

**D4 — Reuse `X-Actor-*` for write assertion.** Helios already requires
`X-Actor-Name`/`X-Actor-Email` on vendor writes; MTP actions reuse it. The MTP-side
adapter maps its canonical actor to these headers (documented in the platform change,
decision D4 there). Actor email remains server-authoritative on the MTP side.

**D5 — Offboard is a scoped, audited, explicit action — not implied by revoke.**
Revoking the MSP *pairing* only ends the MSP's access to Helios; it does NOT offboard
Workspace users. Offboarding a user (suspend/transfer/delete via the existing
`user-offboarding.service`) is a distinct MTP action gated by a specific scope +
actor assertion + audit. This avoids a catastrophic "revoke access → mass-suspend
real Google accounts" coupling.

**D6 — Authoritative revocation event.** On pairing revoke, write a revocation record;
`/api/v1/mtp/*` on a revoked pairing returns an authoritative revoked signal (not a
bare 401), so the MTP can distinguish revocation from an outage (g12).

## Risks / Trade-offs

- **Destructive Workspace actions over the wire** (offboard suspends/deletes a real
  Google account) → Mitigation: dedicated scope + actor assertion + audit + the
  offboarding service's existing safeguards; never triggered by pairing-revoke (D5).
- **Leaked pairing key** → Mitigation: single-use + 15-min window bounds exposure to
  "intercepted in flight and bound before the MTP did," same as Aegis.
- **Contract drift with the MTP adapter** → Mitigation: freeze the handshake/poll Zod
  shapes here and reference them from the platform change; version via
  `server.api_version`.
- **Poll cost** (directory/security aggregate could be heavy) → Mitigation: aggregate
  from already-synced tables + cache; poll cadence is MTP-controlled (30s+).

## Migration Plan

1. DB migration: add pairing-window/paired-at/revocation fields for the new key type.
2. Add the key type + pairing service (issue window, atomic bind, revoke event).
3. Add `/api/v1/mtp/handshake` + `/api/v1/mtp/poll` (read-only).
4. Add the action endpoint(s) wired to the offboarding service, scope + actor gated.
5. Verify end-to-end against the MTP HeliosAdapter (platform change) via the harness.
6. Rollback: the surface is additive (new key type + new routes); disabling the key
   type disables pairing with no effect on existing vendor/service keys.

## Open Questions

- Exact scope name(s) for MTP actions — reuse `write:users`/add a dedicated
  `mtp:offboard`? Leaning toward a dedicated scope so MTP offboard is separately
  grantable and auditable.
- Whether the poll aggregate should include per-module health (Google Workspace,
  Microsoft 365) or stay directory/security only in v1 — start minimal, extend
  additively.
