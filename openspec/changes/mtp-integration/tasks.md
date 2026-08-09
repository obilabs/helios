## 1. Pairing key type + single-use binding

- [x] 1.1 Migration: add `helios-mtp-pairing` support + columns (pairing_window_expires_at, paired_at, paired_from_ip, paired_user_agent, revoked_at) on the api-keys store
- [x] 1.2 Extend `utils/apiKey.ts` + `middleware/api-key-auth.ts` to recognize the new key type and enforce the pairing gates (window + bound + not-revoked)
- [x] 1.3 Pairing service: `issuePairing()` (opens 15-min window) + `completeHandshake()` (atomic single-statement conditional bind, `paired_at IS NULL` race guard)
- [x] 1.4 Pairing service: `revokePairing()` writes an authoritative revocation event

## 2. Handshake + poll endpoints

- [x] 2.1 `POST /api/v1/mtp/handshake` — complete bind; return `{organization, pairing:{scopes}, server:{api_version, capabilities, poll_endpoint}}`
- [x] 2.2 Poll-aggregate service: directory/security summary (user/group counts, suspended/at-risk accounts, security-event counts, GW sync freshness) from already-synced tables
- [x] 2.3 `GET /api/v1/mtp/poll` — header-free read; returns the aggregate; revoked pairing returns the authoritative revoked signal
- [x] 2.4 Freeze the handshake/poll Zod contract shapes; version via `server.api_version`

## 3. Actions (write-back) — scope + actor asserted

- [ ] 3.1 Define the MTP action scope(s) (dedicated `mtp:offboard` for separable grant/audit)
- [ ] 3.2 `POST /api/v1/mtp/actions/offboard-user` — require scope + `X-Actor-Email`/`X-Actor-Name`; refuse when missing
- [ ] 3.3 Wire the action to the existing `user-offboarding.service` (suspend/transfer/delete); never triggered by pairing-revoke
- [ ] 3.4 Audit-log every action with the asserted MSP technician

## 4. Verification

- [ ] 4.1 Unit: window-closed, already-paired, atomic-bind-under-concurrency, revoked-refuses
- [ ] 4.2 Contract: handshake + poll payloads match the MTP HeliosAdapter's Zod schemas
- [ ] 4.3 Action: offboard requires scope + actor; audited; unauthorized/actor-less refused
- [ ] 4.4 End-to-end via the harness with the MTP HeliosAdapter (platform change); `openspec validate mtp-integration` passes
