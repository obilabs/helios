## Why

Helios is a recognized `helios` product in the ObiLabs control plane and already runs
`@obilabs/licensing`, but it exposes **nothing** to the unified MTP — an MSP cannot
pair with, monitor, or act on a Helios install. Aegis has a mature MTP-facing surface
(`/api/v1/mtp/*` with single-use pairing, poll aggregates, JIT detail, actor
assertion); Helios has none. This change builds Helios's MTP surface so it can plug
into the MTP as a managed product (M3, seam-review g14).

Helios is not an ITSM/ticketing product — its domain is Google-Workspace directory
and security posture — so its poll payload and actions differ from Aegis's. It does,
however, already have a strong external-auth foundation to build on (typed API-key
scopes, a vendor key type, and actor assertion via `X-Actor-Name`/`X-Actor-Email`).

## What Changes

- **New `helios-mtp-pairing` API-key type** with single-use, time-bounded pairing:
  a 15-minute pairing window and an atomic single-use binding on first handshake
  (mirroring the Aegis pairing security model), distinct from Helios's existing
  long-lived vendor/service keys.
- **`POST /api/v1/mtp/handshake`** — completes the single-use binding and returns
  `{ organization, pairing:{ scopes }, server:{ api_version, capabilities, poll_endpoint } }`
  in the shape the MTP's adapter expects.
- **`GET /api/v1/mtp/poll`** — a Helios-appropriate aggregate: user/group counts,
  suspended/at-risk accounts, security-event counts, Google-Workspace sync freshness.
  No tickets.
- **Action endpoint(s)** for MTP write-back (e.g. offboard/suspend a Workspace user)
  — gated by scope AND requiring actor-assertion headers, reusing Helios's existing
  `X-Actor-*` contract; the Helios endpoint is the authority and re-checks scope.
- **Authoritative revocation** — revoking a pairing records an explicit "MSP access
  revoked" event so the MTP learns of a real revocation rather than inferring it from
  a poll 401 (seam-review g12).
- **Advertise capabilities/scopes at handshake (g18)** so the MTP can gate its UI to
  what Helios actually supports (which differs from Aegis).

## Capabilities

### New Capabilities
- `mtp-surface`: the Helios-side MTP integration surface — the `helios-mtp-pairing`
  key type + single-use time-bounded binding, the handshake/poll/action endpoints
  under `/api/v1/mtp/*`, the directory/security poll aggregate, and the authoritative
  revocation event.

### Modified Capabilities
<!-- None: this is a new surface. It reuses the existing api-key/actor-assertion
     machinery but adds a new key type + endpoints rather than changing existing
     api-key requirements. -->

## Impact

- **backend/src/routes** — new `/api/v1/mtp/*` route group (handshake, poll, actions).
- **backend/src/middleware/api-key-auth + utils/apiKey** — add the
  `helios-mtp-pairing` key type + single-use/window fields; enforce the pairing gates.
- **backend/src/services** — a pairing service (issue window + atomic bind), a poll-
  aggregate service, and wiring an offboard action onto the existing
  `user-offboarding.service`.
- **database** — migration for the new key-type columns (pairing window, paired_at,
  paired_from_ip) + a revocation-event record.
- **Consumed by** the platform change `mtp-helios-adapter` (the MTP's HeliosAdapter).
- No change to Helios's existing vendor/service key behavior or the control plane.
