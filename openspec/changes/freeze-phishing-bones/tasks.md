# Tasks — freeze the phishing bones

## This change (Phase 02, bones)
- [x] Migration `075_phishing_event_stream.sql` — tables, immutability trigger, projections, disabled flags
- [x] `lib/phishing/contract.ts` — closed sets, token constants, routes, Aegis v1 types + required fields
- [x] `lib/phishing/token.ts` — mint / hash / parse (`h1_`)
- [x] `lib/phishing/evidence.ts` — request → event; body dropped; IP truncated
- [x] Contract tests — closed sets, token, Aegis fields, credential-never-stored, IP minimisation
- [x] CI Seed Schema Contract — phish tables present; trigger rejects UPDATE/DELETE; redaction allowed
- [x] Verified: seed + all migrations apply on a scratch Postgres 16; full backend suite green

## Next bones (separate changes, same window)
- [ ] **L2 button → Helios ingest contract v1** — the POST payload (`.eml` + headers + indicators),
      auth model, dedupe rule; `phish_report.ingest_contract_version` is already in place
- [ ] **Rubric compiled-JSON interchange v1** — versioned bank schema Aegis consumes type-dispatched
- [ ] **Aegis side of the seam** — receiver for the two v1 events, idempotent on `event_id`, honours retraction

## Pixels (post-freeze; Q1 velocity)
- [ ] Tracking endpoints (`/c`, `/o`, `/r`, beacon, submit) using `evidence.ts`
- [ ] Classifier v1 (config-driven ASN/UA/timing/honeypot) writing `phish_event_classification`
- [ ] Outbox worker → Aegis (signed webhook over the existing MTP/licensing channel)
- [ ] Injection service with **per-call** `gmail.insert` minting (never `REQUIRED_SCOPES`)
- [ ] React: Overview / Detection / Simulation / People / Reports
