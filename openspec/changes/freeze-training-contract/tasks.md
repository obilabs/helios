# Tasks

## 1. Storage
- [x] 1.1 Migration 092: requirements, append-only completions, webhook endpoints + outbox
- [x] 1.2 `training_effective_status()` and the `training_requirement_records` view
- [x] 1.3 Immutability trigger with an explicit purge path for customer erasure
- [x] 1.4 `training_contract_enabled` flag, default false

## 2. Contract
- [x] 2.1 `lib/training/contract.ts` — frozen vocabulary, verb IRIs, webhook names, signing scheme
- [x] 2.2 `lib/training/statement.ts` — parse and refuse
- [x] 2.3 `lib/training/webhook.ts` — HMAC signing + reference verification

## 3. Service and routes
- [x] 3.1 Requirement lifecycle (create, waive, cancel) with lifecycle events
- [x] 3.2 Idempotent ingest, actor resolution, requirement matching
- [x] 3.3 Read projection in Vanta `TrainingRecord` shape
- [x] 3.4 Discovery, `POST /completions`, `GET /records`; API scopes

## 4. Proof
- [x] 4.1 Freeze test, hash-pinned (34 assertions)
- [x] 4.2 Live proof against Postgres 16: immutability, idempotency, derived status, purge
- [x] 4.3 CI asserts the contract objects exist after seed + migrations

## 5. Publication
- [x] 5.1 OpenAPI document with a stated deprecation policy
- [ ] 5.2 Announce the contract publicly (waits on Helios going public)

## Deferred by design
- [ ] Webhook delivery runner (Phase 03) — the outbox and signing are proven; the sender is not the frozen part
- [ ] First two vendor mappings: CanIPhish (writes) and KnowBe4 (read-only)
- [ ] Aegis as the first producer
