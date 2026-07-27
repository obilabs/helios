# Telemetry Service Implementation Tasks

## Prerequisites

- [ ] helios-web deployed with `/api/instances/heartbeat` endpoint
- [ ] helios-web database tables created (instance_heartbeats, aggregated_metrics)

---

## Phase 1: Core Service

### 1.1 Create TelemetryService class
**File:** `backend/src/services/telemetry.service.ts`

- [ ] Create singleton TelemetryService
- [ ] Read HELIOS_TELEMETRY_ENABLED from environment
- [ ] Implement getOrCreateInstanceId()
- [ ] Create in-memory counters for api_usage, command_usage, ui_actions
- [ ] Implement trackApiCall(apiName: string)
- [ ] Implement trackCommand(commandName: string)
- [ ] Implement trackUIAction(actionName: string)

### 1.2 Implement heartbeat sending
**File:** `backend/src/services/telemetry.service.ts`

- [ ] Implement sendHeartbeat() method
- [ ] Build payload matching API contract
- [ ] Add retry logic with exponential backoff
- [ ] Reset counters after successful send
- [ ] Handle network failures gracefully (log, continue)

### 1.3 Add scheduled heartbeat
**File:** `backend/src/index.ts`

- [ ] Initialize TelemetryService on startup
- [ ] Send initial heartbeat after 5 minutes (allow startup)
- [ ] Schedule recurring heartbeat (hourly for licensed, daily for community)

---

## Phase 2: Integration Points

### 2.1 Track API relay calls
**File:** `backend/src/routes/proxy.routes.ts` (or wherever proxy is)

- [ ] Extract API name from request path
- [ ] Call telemetryService.trackApiCall() before proxying
- [ ] Map common patterns: users.list, groups.get, etc.

### 2.2 Track command execution
**Files:** Various command handlers

- [ ] Identify all command handlers (sync, deploy, export, etc.)
- [ ] Add telemetryService.trackCommand() to each
- [ ] Standardize command naming convention

### 2.3 Track UI actions (frontend)
**File:** `frontend/src/services/telemetry.service.ts` (new)

- [ ] Create frontend telemetry service
- [ ] Send actions to backend endpoint
- [ ] Track: bulk_edit, export_csv, column_sort, etc.

**File:** `backend/src/routes/telemetry.routes.ts` (new)

- [ ] Create endpoint to receive frontend telemetry
- [ ] Forward to TelemetryService

---

## Phase 3: Settings & UI

### 3.1 Add telemetry settings
**File:** `backend/src/routes/settings.routes.ts`

- [ ] Add endpoint to get/set telemetry preference
- [ ] Store in organization_settings table

**File:** `frontend/src/components/settings/PrivacySettings.tsx` (new or existing)

- [ ] Add toggle: "Help improve Helios by sharing anonymous usage data"
- [ ] Show what is/isn't collected
- [ ] Link to privacy policy
- [ ] Link to public insights dashboard

### 3.2 Show telemetry status in dashboard
**File:** `frontend/src/pages/Dashboard.tsx`

- [ ] Optional: Show "Contributing to Helios" badge if enabled
- [ ] Optional: Link to insights page

---

## Phase 4: Testing

### 4.1 Unit tests
**File:** `backend/src/services/__tests__/telemetry.service.test.ts`

- [ ] Test counter incrementing
- [ ] Test heartbeat payload structure
- [ ] Test disabled state (no sending)
- [ ] Test instance ID generation

### 4.2 Integration tests
**File:** `backend/src/__tests__/telemetry.integration.test.ts`

- [ ] Mock helios.gridworx.io endpoint
- [ ] Verify heartbeat sent correctly
- [ ] Verify counters reset after send

### 4.3 E2E tests
- [ ] With telemetry enabled: verify data sent
- [ ] With telemetry disabled: verify nothing sent
- [ ] Verify UI toggle works

---

## Phase 5: Documentation

### 5.1 Update README
- [ ] Add telemetry section
- [ ] Explain what's collected
- [ ] How to enable/disable

### 5.2 Update CLAUDE.md
- [ ] Document TelemetryService location and usage
- [ ] Note: track new commands when adding

### 5.3 In-app documentation
- [ ] Settings page explanation text
- [ ] Help widget content about telemetry

---

## Checklist Before Merge

- [ ] HELIOS_TELEMETRY_ENABLED defaults to false
- [ ] No PII in any payload
- [ ] Graceful failure on network issues
- [ ] Privacy policy link in UI
- [ ] All tests passing
- [ ] Manual test: verify data appears on helios.gridworx.io/insights
