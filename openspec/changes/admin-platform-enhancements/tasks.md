# Admin Platform Enhancements - Tasks

## Status: Mostly Complete (Phases -1, 0, 1, 2, 4, 5, 6 Complete; Phase 3 Deferred)

---

## Phase -1: Feature Flags System (P0 - Foundation) - COMPLETE

### -1.1 Database Schema
- [x] Create migration `052_create_feature_flags.sql`
- [x] Create simple `feature_flags` table (single-tenant, no org_id needed)
- [x] Insert default flags for all incomplete features (24 flags)
- [x] Add index on feature_key and category

**Files:**
- `database/migrations/052_create_feature_flags.sql`

### -1.2 Backend Service
- [x] Create `feature-flags.service.ts`
- [x] Implement `isEnabled(featureKey)` method (simple, no org context)
- [x] Implement `getAllFlags()` and `getAllFlagsMap()` methods
- [x] Implement `setFlag(featureKey, enabled)` method
- [x] Add caching with Redis (1 minute TTL)

**Files:**
- `backend/src/services/feature-flags.service.ts`

### -1.3 API Endpoints
- [x] Create `GET /api/v1/organization/feature-flags` endpoint
- [x] Create `GET /api/v1/organization/feature-flags/details` endpoint
- [x] Create `GET /api/v1/organization/feature-flags/categories` endpoint
- [x] Create `PUT /api/v1/organization/feature-flags/:key` (admin only)
- [x] Create `PUT /api/v1/organization/feature-flags/bulk` (admin only)
- [x] Create `POST /api/v1/organization/feature-flags` (admin only)
- [x] Create `DELETE /api/v1/organization/feature-flags/:key` (admin only)
- [x] Add OpenAPI documentation for all endpoints

**Files:**
- `backend/src/routes/feature-flags.routes.ts`
- `backend/src/index.ts`

### -1.4 Frontend Context
- [x] Create `FeatureFlagsContext` and `useFeatureFlags` hook
- [x] Create `FeatureFlagsProvider` component
- [x] Fetch flags on app load
- [x] Provide `isEnabled(key)` function to components
- [x] Provide `allEnabled()` and `anyEnabled()` for multiple flag checks
- [x] Create `FeatureGate` and `MultiFeatureGate` components

**Files:**
- `frontend/src/contexts/FeatureFlagsContext.tsx`
- `frontend/src/App.tsx` (FeatureFlagsProvider added)

### -1.5 Hide Incomplete Navigation Items
- [x] Wrap "Workflows" nav item with feature flag check (`nav.workflows`)
- [x] Wrap "Reports" nav item with feature flag check (`nav.reports`)
- [x] Wrap "Team Analytics" with feature flag check (`insights.team_analytics`)
- [x] Test navigation shows/hides correctly

**Files:**
- `frontend/src/components/navigation/AdminNavigation.tsx`

### Default Feature Flags to Create:
```
automation.offboarding_templates  = true   (UI works)
automation.offboarding_execution  = false  (TODO items remain)
automation.onboarding_templates   = true   (UI works)
automation.onboarding_execution   = false  (TODO items remain)
automation.scheduled_actions      = true   (view works)
automation.workflows              = false  (not implemented)
insights.reports                  = false  (not implemented)
console.pop_out                   = false  (not implemented)
console.pinnable_help             = false  (not implemented)
console.command_audit             = false  (not implemented)
users.export                      = false  (not implemented)
users.platform_filter             = false  (not implemented)
email_archive                     = false  (not implemented)
microsoft_365_relay               = false  (not implemented)
```

---

## Phase 0: User Offboarding Workflow (P0 - Critical)

### 0.1 Data Transfer API
- [x] Create `POST /api/v1/organization/users/:id/transfer` endpoint
- [x] Implement Google Data Transfer API integration (via transparent proxy)
- [x] Support Drive transfer to user
- [x] Support Calendar transfer to user
- [ ] Track transfer progress and status (future: poll transfer status)
- [ ] Handle partial failures gracefully

**Files:**
- `backend/src/routes/organization.routes.ts` (added)
- `backend/src/services/data-transfer.service.ts` (existing)

### 0.2 Email Forwarding & Delegation - COMPLETE
- [x] Create `GET /api/v1/organization/users/:id/email-settings` endpoint
- [x] Create `POST /api/v1/organization/users/:id/email-settings` endpoint
- [x] Implement Gmail forwarding via Admin SDK (setupEmailForwarding, disableEmailForwarding)
- [x] Implement Gmail delegation via Admin SDK (addGmailDelegate, removeGmailDelegate, listGmailDelegates)
- [x] Implement vacation responder via Admin SDK (setVacationResponder, disableVacationResponder)
- [x] Implement getEmailSettings for retrieving current settings
- [x] Enforce 25-delegate limit per Google (checked before adding delegates)

**Files:**
- `backend/src/routes/organization.routes.ts` (added email-settings endpoints)
- `backend/src/services/google-workspace.service.ts` (added delegation methods)

### 0.3 Delegate Validation
- [x] Create `GET /api/v1/organization/users/validate-delegate` endpoint
- [x] Check user exists in Google Workspace
- [x] Check user is NOT suspended
- [x] Check user is NOT archived
- [x] Check user is NOT pending deletion
- [x] Return warning if not in Helios
- [ ] Real-time validation in UI (frontend integration)

**Files:**
- `backend/src/routes/organization.routes.ts` (added)

### 0.4 Direct Reports Reassignment
- [x] Create `POST /api/v1/organization/users/:id/reassign-reports` endpoint
- [x] Support "all_to_one" mode (reassign all to single manager)
- [x] Support "individual" mode (custom assignments per report)
- [x] Add Step 2 to UserOffboarding.tsx for direct reports
- [x] Frontend calls reassign-reports API before lifecycle offboard

**Files:**
- `backend/src/routes/organization.routes.ts` (added)
- `frontend/src/pages/UserOffboarding.tsx` (updated)
- `frontend/src/pages/UserOffboarding.css` (updated)

### 0.5 Offboarding Wizard UI
- [x] Existing UserOffboarding.tsx component
- [x] Step 1: Select user
- [x] Step 2: Direct Reports reassignment (NEW)
- [x] Step 3: Template selection
- [x] Step 4: Schedule configuration
- [x] Step 5: Confirmation with summary
- [ ] Inline validation for delegate fields (DelegateValidator component)
- [ ] Progress tracking during execution

**Files:**
- `frontend/src/pages/UserOffboarding.tsx` (enhanced)
- `frontend/src/pages/UserOffboarding.css` (enhanced)

### 0.6 Bulk Access Revocation
- [x] Force sign-out via Admin SDK (in organization.routes.ts /block endpoint)
- [x] Password reset to random value (in organization.routes.ts /block endpoint)
- [x] Revoke OAuth tokens (in organization.routes.ts /block endpoint)
- [x] Remove from all groups (added to /block endpoint - gets user groups via getUserGroups, removes via removeUserFromGroup)
- [ ] Wipe mobile devices (if MDM enabled)

**Files:**
- `backend/src/routes/organization.routes.ts` (existing /block endpoint)

---

## Phase 1: Users Page Critical Fixes (P0) - PARTIAL COMPLETE

### 1.1 Fix Table Layout - COMPLETE
- [x] Change grid to flexbox for responsive columns
- [x] Set appropriate min-widths for each column
- [x] Test with long email addresses and names
- [x] Ensure table is scrollable on small screens
- [x] Progressive column hiding at breakpoints (1400px, 1200px, 1000px, 768px)

**Files:**
- `frontend/src/components/UserList.css`
- `frontend/src/components/UserList.tsx`

### 1.2 Implement Export Functionality - COMPLETE
- [x] Create backend endpoint `GET /api/v1/organization/users/export`
- [x] Support CSV and JSON formats via query param
- [x] Apply current filters (userType, status) to export
- [x] Add Export dropdown menu in UI with CSV/JSON options
- [x] Trigger file download with proper filename

**Files:**
- `backend/src/routes/organization.routes.ts` (export endpoint added)
- `frontend/src/pages/Users.tsx`
- `frontend/src/pages/Users.css`

### 1.3 Implement Actions Dropdown - COMPLETE
- [x] Create dropdown component with action items
- [x] Wire up Refresh List action
- [x] Wire up Activate Selected (shows selection hint)
- [x] Wire up Suspend Selected (shows selection hint)
- [x] Wire up Delete Selected (shows selection hint)
- [ ] Add "Sync from Google" action (future)
- [ ] Add "Import from CSV" action (future)

**Files:**
- `frontend/src/pages/Users.tsx`
- `frontend/src/pages/Users.css`

### 1.4 Add Platform Filter - COMPLETE
- [x] Add platform filter dropdown in action bar
- [x] Update `fetchUsers` to include platform filter param
- [x] Update backend to filter by platform/source
- [x] Show filter state visually
- [x] Options: All, Local Only, Google Workspace, Microsoft 365

**Files:**
- `frontend/src/pages/Users.tsx` (updated)
- `frontend/src/components/UserList.tsx` (updated)
- `frontend/src/pages/Users.css` (updated)
- `backend/src/routes/organization.routes.ts` (updated)

### 1.5 Actor Attribution in Audit Logs - COMPLETE
- [x] Create migration to add actor fields to `activity_logs` table
- [x] Add columns: actor_type, api_key_id, api_key_name, vendor_name, vendor_technician_name, vendor_technician_email, ticket_reference, service_name, service_owner, result
- [x] Add indexes for actor_type, vendor_name, api_key_id, and result
- [x] Update transparent-proxy to populate actor fields from API key context
- [ ] Enforce X-Actor-Name, X-Actor-Email headers for vendor keys with requireActorAttribution (future enhancement)
- [ ] Return 400 if vendor key requires attribution but headers missing (future enhancement)

**Files:**
- `database/migrations/053_add_actor_attribution_to_activity_logs.sql` (created)
- `backend/src/middleware/transparent-proxy.ts` (updated)
- `backend/src/services/activity-tracker.service.ts` (updated)

### 1.6 Console Command Audit Logging - COMPLETE
- [x] Create `POST /api/v1/organization/audit-logs/console` endpoint
- [x] Log command, duration, result status
- [x] Include actor_type='internal' and user context
- [x] Update DeveloperConsole to POST after each command
- [ ] Add console commands to audit log viewer (future enhancement)

**Files:**
- `backend/src/routes/audit-logs.routes.ts`
- `frontend/src/pages/DeveloperConsole.tsx`

### 1.7 Audit Log Viewer Filters - COMPLETE
- [x] Add actor_type filter dropdown (All / Internal / Service / Vendor)
- [x] Add vendor name filter (only shown when vendor selected)
- [x] Add technician filter
- [x] Add ticket reference search
- [x] Add result filter (success / failure / denied)
- [x] Update API to support new filter parameters
- [x] Display new actor attribution columns (Source, Result) in table
- [x] Add vendor-specific info display (vendor name, technician, ticket reference)
- [x] Update AuditLog type to include all new fields
- [x] Add CSS styling for new badges and filters

**Files:**
- `frontend/src/pages/AuditLogs.tsx` (updated)
- `frontend/src/pages/AuditLogs.css` (updated)
- `frontend/src/services/audit-logs.service.ts` (updated)
- `backend/src/routes/audit-logs.routes.ts` (updated)

---

## Phase 2: Developer Console UX (P1) - COMPLETE

### 2.1 Pinnable Help Panel - COMPLETE
- [x] Create `ConsoleHelpPanel` component
- [x] Add dock left/right toggle buttons
- [x] Save dock preference to localStorage
- [x] Implement search within commands
- [x] Add Insert button for each command
- [x] Style panel to match console theme
- [x] Pin/unpin functionality
- [x] Copy to clipboard feature

**Files:**
- `frontend/src/components/ConsoleHelpPanel.tsx` (created)
- `frontend/src/components/ConsoleHelpPanel.css` (created)
- `frontend/src/pages/DeveloperConsole.tsx` (updated)
- `frontend/src/pages/DeveloperConsole.css` (updated)

### 2.2 Insert Command Button - COMPLETE
- [x] Each command/example has [Insert] button
- [x] Clicking inserts template into command input
- [x] Focus input after insert
- [x] Copy button for clipboard

**Files:**
- `frontend/src/components/ConsoleHelpPanel.tsx`
- `frontend/src/pages/DeveloperConsole.tsx`

### 2.3 Add Transfer Console Commands - COMPLETE
- [x] Implement `helios gw transfer drive <from> --to=<to>` command
- [x] Implement `helios gw transfer calendar <from> --to=<to>` command
- [x] Implement `helios gw transfer all <from> --to=<to>` command (transfers Drive, Calendar, Sites)
- [x] Implement `helios gw transfer status <id>` command
- [x] Implement `helios gw transfer list` command
- [x] Implement `helios gw forwarding get/set/disable <user>` commands
- [x] Implement `helios gw vacation get/set/disable <user>` commands
- [x] Add to help modal and ConsoleHelpPanel

**Files:**
- `frontend/src/pages/DeveloperConsole.tsx`
- `frontend/src/components/ConsoleHelpPanel.tsx`

### 2.4 Add User CRUD Commands - COMPLETE (already existed)
- [x] Implement `helios gw users create` command (already existed)
- [x] Implement `helios gw users delete` command (already existed)
- [x] Implement `helios gw users reset-password` command (already existed)
- [x] Implement `helios gw users update` command (already existed)
- [x] Add to help/examples (already existed)

**Note:** These commands were already implemented in previous work.

**Files:**
- `frontend/src/pages/DeveloperConsole.tsx`

### 2.5 Add Offboarding Console Command - COMPLETE
- [x] Implement `helios gw users offboard <email>` command
- [x] Support flags: `--transfer-to`, `--forward-to`, `--suspend`, `--delete`
- [x] Support `--vacation="message"` to set out-of-office before offboarding
- [x] Support `--revoke-access` to sign out sessions and revoke OAuth tokens
- [x] Show step-by-step progress and summary with success/failure indicators
- [x] Add to help modal and ConsoleHelpPanel

**Files:**
- `frontend/src/pages/DeveloperConsole.tsx`
- `frontend/src/components/ConsoleHelpPanel.tsx`

---

## Phase 3: Email Archive Feature (P2 - Strategic)

### 3.1 Database Schema
- [ ] Create `email_archives` table
- [ ] Create `email_archive_delegates` table
- [ ] Create `email_archive_access_log` table
- [ ] Add necessary indexes

**Files:**
- `database/migrations/XXX_create_email_archives.sql`

### 3.2 Archive Storage Setup
- [ ] Configure S3 bucket for archive storage
- [ ] Set up lifecycle policies (Standard → Glacier after 90 days)
- [ ] Configure encryption at rest
- [ ] Set up IAM permissions

**Files:**
- Infrastructure/Terraform or manual setup

### 3.3 Archive Creation Service
- [ ] Implement Google Takeout API integration
- [ ] Create background job for archive processing
- [ ] Parse MBOX format to extract messages
- [ ] Upload to S3 with proper structure
- [ ] Track progress and handle failures

**Files:**
- `backend/src/services/email-archive.service.ts`
- `backend/src/jobs/archive-processor.job.ts`

### 3.4 Search Indexing
- [ ] Set up Elasticsearch (or OpenSearch)
- [ ] Create index mapping for email messages
- [ ] Index: sender, recipient, subject, body, date, attachments
- [ ] Implement search API endpoint

**Files:**
- `backend/src/services/archive-search.service.ts`
- `backend/src/routes/archives.routes.ts`

### 3.5 Archive Viewer UI
- [ ] Create archive listing page
- [ ] Create folder browser (Inbox, Sent, etc.)
- [ ] Create message list with pagination
- [ ] Create message viewer with attachments
- [ ] Create search interface with filters
- [ ] Implement export to MBOX/PST

**Files:**
- `frontend/src/pages/EmailArchives.tsx`
- `frontend/src/pages/ArchiveViewer.tsx`
- `frontend/src/components/MessageList.tsx`
- `frontend/src/components/MessageViewer.tsx`

### 3.6 Access Control
- [ ] Implement delegate management UI
- [ ] Check delegate permissions before access
- [ ] Log all archive access to audit table
- [ ] Implement retention policy enforcement
- [ ] Implement legal hold functionality

**Files:**
- `frontend/src/components/ArchiveDelegates.tsx`
- `backend/src/middleware/archive-access.ts`

---

## Phase 4: Microsoft 365 Relay (P2) - COMPLETE

### 4.1 Microsoft Graph Transparent Proxy - COMPLETE
- [x] Install `@microsoft/microsoft-graph-client` (already installed)
- [x] Create `microsoft-transparent-proxy.ts` middleware
- [x] Mount at `/api/microsoft/graph/*`
- [x] Implement authentication with tenant credentials
- [x] Forward requests to Graph API
- [x] Log all requests to audit logs (actor attribution)
- [x] Intelligent sync for users and groups

**Files:**
- `backend/src/middleware/microsoft-transparent-proxy.ts` (created)
- `backend/src/index.ts` (updated)

### 4.2 Microsoft 365 Console Commands - COMPLETE
- [x] Implement `helios m365 users list` (with table formatting)
- [x] Implement `helios m365 users get <email>` (detailed view)
- [x] Implement `helios m365 users create/update/delete`
- [x] Implement `helios m365 users reset-password/enable/disable`
- [x] Implement `helios m365 licenses list/assign/remove`
- [x] Implement `helios m365 groups list/get/create/add-member/remove-member`
- [x] Add to ConsoleHelpPanel documentation

**Files:**
- `frontend/src/pages/DeveloperConsole.tsx`
- `frontend/src/components/ConsoleHelpPanel.tsx`

### 4.3 Microsoft 365 Offboarding
- [ ] Implement OneDrive transfer (future)
- [ ] Implement mailbox conversion to shared (future)
- [ ] Implement license removal (future)
- [ ] Add to offboarding wizard (future)

**Note:** This is deferred pending full MS365 offboarding workflow implementation.

**Files:**
- `backend/src/services/microsoft-offboarding.service.ts` (future)

---

## Phase 5: Pop-out Console (P2) - COMPLETE

### 5.1 Pop-out Window Implementation - COMPLETE
- [x] Create `/console?mode=popup` route variant
- [x] Remove duplicate header/sidebar in popup mode
- [x] Implement `window.open()` for pop-out
- [x] Maintain auth state in popup (via shared localStorage token)
- [x] Add pop-out button to console toolbar
- [x] Add close button (Minimize2 icon) when in popup mode
- [x] Add CSS for popup mode (full height, no borders)
- [x] Add toolbar separator for visual separation

**Files:**
- `frontend/src/pages/DeveloperConsole.tsx` (updated)
- `frontend/src/pages/DeveloperConsole.css` (updated)
- `frontend/src/App.tsx` (added popup mode handling)
- `frontend/src/index.css` (added popup-console-app style)

---

## Phase 6: Cleanup (P3) - COMPLETE

### 6.1 User Avatars - COMPLETE
- [ ] Option A: Remove initials entirely
- [x] Option B: Implement Gravatar fallback
- [ ] Option C: Use react-avatar library
- [x] Ensure consistent sizing

**Implementation (2025-12-16):**
- Created new `UserAvatar` component (`frontend/src/components/ui/UserAvatar.tsx`)
- Uses Gravatar with MD5 hash of email
- Falls back to colorful initials if no Gravatar exists
- Consistent color palette based on email hash
- Size prop for flexible sizing

**Files:**
- `frontend/src/components/ui/UserAvatar.tsx` (new)
- `frontend/src/components/UserList.tsx` (updated to use UserAvatar)

### 6.2 Stats Bar Redesign - COMPLETE
- [ ] Option A: Remove stats bar entirely
- [x] Option B: Move to horizontal bar above tabs
- [x] Ensure stats are accurate and update on filter change

**Implementation (2025-12-16):**
- Converted vertical card-based stats to inline horizontal format
- Compact display: "28 Total | 25 Active 2 Pending 1 Suspended"
- Color-coded values: green for active, orange for pending, red for suspended
- Only shows deleted count if > 0
- Takes less vertical space, cleaner look

**Files:**
- `frontend/src/pages/Users.tsx` (updated)
- `frontend/src/pages/Users.css` (updated)

---

## Testing Checklist

### Offboarding Workflow
- [ ] Transfer initiates successfully
- [ ] Cannot delegate to suspended user (shows error)
- [ ] Cannot delegate to deleted user (shows error)
- [ ] Cannot delegate to archived user (shows error)
- [ ] Warning shown if delegate not in Helios
- [ ] Progress tracked during transfer
- [ ] Audit log created for all actions
- [ ] Email forwarding activates correctly
- [ ] License cost savings displayed accurately

### Users Page
- [ ] Table renders correctly with 0, 1, 10, 100+ users
- [ ] Long emails truncate with ellipsis
- [ ] Export downloads correct data
- [ ] Actions perform bulk operations
- [ ] Platform filter shows correct users
- [ ] Responsive on tablet and mobile

### Developer Console
- [ ] Help panel docks left and right
- [ ] Insert button populates command input
- [ ] Commands log to audit trail
- [ ] Pop-out window maintains session
- [ ] All transfer commands work
- [ ] Offboard command validates delegates

### Email Archives (if implemented)
- [ ] Archive creation completes successfully
- [ ] Search returns relevant results
- [ ] Message viewer displays content correctly
- [ ] Attachments downloadable
- [ ] Only delegates can access
- [ ] Access logged to audit table
- [ ] Legal hold prevents deletion

### Microsoft 365
- [ ] Proxy forwards requests to Graph API
- [ ] Responses are returned correctly
- [ ] Requests are logged to audit
- [ ] Console commands work

---

## Dependencies

- `@microsoft/microsoft-graph-client` for MS365 proxy
- `elasticsearch` or `@opensearch-project/opensearch` for archive search
- `mailparser` for MBOX parsing
- `@aws-sdk/client-s3` for archive storage

---

## Estimated Effort (Revised)

| Phase | Effort |
|-------|--------|
| Phase 0 (Offboarding Workflow) | 5-7 days |
| Phase 1 (Users Page) | 2-3 days |
| Phase 2 (Console UX) | 3-4 days |
| Phase 3 (Email Archives) | 8-12 days |
| Phase 4 (MS365 Relay) | 2-3 days |
| Phase 5 (Pop-out) | 1 day |
| Phase 6 (Cleanup) | 1 day |
| **Total** | **22-31 days** |

---

## Decision Points

### Email Archive Feature
- [ ] **Decision needed:** Implement email archiving in Helios?
  - Pro: Massive license savings for customers ($4-7/user/month → ~$0.02/user/month)
  - Pro: Differentiating feature
  - Con: 8-12 days development
  - Con: Ongoing infrastructure costs (S3, Elasticsearch)
  - Con: We become data custodian (compliance implications)

### User Avatars
- [ ] **Decision needed:** Remove initials or implement properly?
  - Option A: Remove entirely (simplest)
  - Option B: Gravatar integration
  - Option C: Upload custom avatar

### Stats Bar
- [ ] **Decision needed:** Remove or redesign?
  - Option A: Remove entirely
  - Option B: Horizontal bar above tabs
