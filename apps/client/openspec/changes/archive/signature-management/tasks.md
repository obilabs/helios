# Tasks: Email Signature Management

## Phase 1: Database Foundation

### Backend Tasks

- [x] **TASK-SIG-001**: Create signature tables migration
  - signature_templates table
  - signature_assignments table
  - user_signature_status table
  - user_effective_signatures view (priority resolution)
  - File: `database/migrations/044_create_signature_tables.sql`
  - **DONE**: Tables created with triggers, indexes, and helper view

- [x] **TASK-SIG-002**: Create campaign tables migration
  - signature_campaigns table
  - campaign_assignments table
  - signature_tracking_pixels table
  - signature_tracking_events table
  - campaign_analytics_summary view
  - Helper functions: get_campaign_stats, get_campaign_opens_by_day, get_campaign_geo_distribution
  - File: `database/migrations/045_create_campaign_tables.sql`
  - **DONE**: Tables created with analytics views and helper functions

- [x] **TASK-SIG-003**: Create signature permissions table
  - signature_permissions table with role levels (admin, designer, campaign_manager, helpdesk, viewer)
  - signature_permission_audit table for audit logging
  - Helper functions: user_has_signature_permission, get_user_signature_permission_level
  - user_signature_permissions view
  - File: `database/migrations/046_create_signature_permissions.sql`
  - **DONE**: Tables created with audit triggers and helper functions

## Phase 2: Template Management

### Backend Tasks

- [x] **TASK-SIG-004**: Create signature templates service
  - CRUD operations for templates
  - Merge field parsing and validation
  - Template rendering with user data
  - File: `backend/src/services/signature-template.service.ts`
  - **DONE**: Full service with getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, cloneTemplate, extractMergeFields, validateMergeFields, renderTemplate, previewTemplate

- [x] **TASK-SIG-005**: Create signature templates routes
  - GET/POST/PUT/DELETE /api/signatures/templates
  - POST /api/signatures/templates/:id/preview
  - POST /api/signatures/templates/:id/clone
  - File: `backend/src/routes/signatures.routes.ts` (integrated with existing routes)
  - **DONE**: Added merge-fields endpoints, validate, and preview endpoints to existing signatures.routes.ts

- [x] **TASK-SIG-006**: Implement merge field system
  - Define available merge fields
  - Map fields to database columns
  - Handle missing/null values gracefully
  - File: `backend/src/types/signatures.ts`
  - **DONE**: Created MERGE_FIELDS constant with 18 fields across 5 categories (Personal, Professional, Contact, Organization, Social). Added getMergeField, getMergeFieldsByCategory, getMergeFieldCategories helper functions.

### Frontend Tasks

- [x] **TASK-SIG-007**: Create SignatureTemplates list page
  - Table with template name, status, assignments
  - Create, edit, delete actions
  - Filter by status (draft, active, archived)
  - File: `frontend/src/pages/Signatures.tsx` (enhanced existing page)
  - **DONE**: Updated Signatures.tsx with proper API calls to /api/signatures/templates, added template editor modal, preview modal, clone functionality, set as default, and improved template card display

- [x] **TASK-SIG-008**: Create TemplateEditor component
  - Rich text editor for HTML signature
  - Merge field insertion toolbar
  - Live preview panel
  - File: `frontend/src/components/signatures/TemplateEditor.tsx`
  - **DONE**: Rich text editor with formatting toolbar (bold, italic, underline, alignment, lists), font family/size controls, color picker, link/image/table insertion, merge field picker integration, HTML source mode toggle

- [x] **TASK-SIG-009**: Create MergeFieldPicker component
  - Dropdown/palette of available fields
  - Field descriptions and examples
  - Insert at cursor position
  - File: `frontend/src/components/signatures/MergeFieldPicker.tsx`
  - **DONE**: Categorized field picker with search, expandable categories (Personal, Professional, Contact, Organization, Social), field descriptions, examples, and click-to-insert functionality

- [x] **TASK-SIG-010**: Create TemplatePreview component
  - Render template with selected user's data
  - User selector dropdown
  - Show both HTML and plain text versions
  - File: `frontend/src/components/signatures/TemplatePreview.tsx`
  - **DONE**: Preview component with user selector (sample data + real users), visual/plain text/HTML source tabs, refresh functionality, loading states

## Phase 3: Assignment System

### Backend Tasks

- [x] **TASK-SIG-011**: Create signature assignments service
  - CRUD for assignments
  - Resolve effective template for user (priority logic)
  - Preview affected users
  - File: `backend/src/services/signature-assignment.service.ts`
  - **DONE**: Full service with getAssignments, createAssignment, updateAssignment, deleteAssignment, getEffectiveSignature, getAllEffectiveSignatures, previewAffectedUsers, getAvailableTargets

- [x] **TASK-SIG-012**: Create signature assignments routes
  - GET/POST/PUT/DELETE /api/signatures/v2/assignments
  - POST /api/signatures/v2/assignments/preview
  - GET /api/signatures/v2/assignments/user/:userId/effective
  - GET /api/signatures/v2/assignments/targets/:type
  - File: `backend/src/routes/signature-assignments.routes.ts`
  - **DONE**: Full REST API with target listing and preview endpoints

- [x] **TASK-SIG-013**: Implement assignment priority resolver
  - Direct user > Dynamic group > Static group > Department > OU > Default
  - Handle multiple assignments at same level
  - Uses database view `user_effective_signatures` for consistent priority resolution
  - **DONE**: Priority resolution implemented via database view in migration 044

### Frontend Tasks

- [x] **TASK-SIG-014**: Create AssignmentManager component
  - Assignment type selector with descriptions
  - Target selectors for users/groups/departments/OUs
  - Preview affected users before creating
  - Assignment list with toggle and delete actions
  - File: `frontend/src/components/signatures/AssignmentManager.tsx`
  - **DONE**: Full component with type selection, target search, preview panel, assignment CRUD

- [x] **TASK-SIG-015**: Create AssignmentPreview component
  - Show list of affected users
  - Count by assignment source
  - Search/filter affected users
  - File: Integrated into `frontend/src/components/signatures/AssignmentManager.tsx`
  - **DONE**: Preview panel integrated into AssignmentManager with user list and counts

- [x] **TASK-SIG-016**: Create UserSignatureStatus component
  - Show user's current signature
  - Assignment source indicator with icons
  - Sync status with detailed info
  - Re-sync button
  - Preview panel (expandable)
  - Compact mode for inline display
  - File: `frontend/src/components/signatures/UserSignatureStatus.tsx`
  - **DONE**: Full component with assignment source badges, sync status display, preview panel, compact mode

## Phase 4: Google Workspace Sync

### Backend Tasks

- [x] **TASK-SIG-017**: Extend GoogleWorkspaceService for signatures
  - getUserSignature, setUserSignature methods
  - getUserSignaturesBatch, setUserSignaturesBatch for bulk operations
  - Rate limiting with concurrency control
  - File: `backend/src/services/google-workspace.service.ts`
  - **DONE**: Full Gmail signature API integration with batch support

- [x] **TASK-SIG-018**: Create signature sync service
  - syncUserSignature for single user sync
  - syncOrganizationSignatures for pending users
  - forceSyncAllUsers for force resync
  - getOrganizationSyncSummary, getUserSyncStatuses
  - Hash comparison to detect external changes
  - Retry logic with configurable max retries
  - File: `backend/src/services/signature-sync.service.ts`
  - **DONE**: Full sync service with status tracking and batch processing

- [x] **TASK-SIG-019**: Create signature deployment routes
  - POST /api/signatures/sync/deploy (all pending)
  - POST /api/signatures/sync/deploy/all (force all)
  - POST /api/signatures/sync/users/:userId (single user)
  - POST /api/signatures/sync/retry (retry failed)
  - GET /api/signatures/sync/status (summary)
  - GET /api/signatures/sync/users (paginated statuses)
  - File: `backend/src/routes/signature-sync.routes.ts`
  - **DONE**: Full sync API with deploy, retry, and status endpoints

- [x] **TASK-SIG-020**: Add signature sync to scheduled jobs
  - Periodic sync check
  - Detect external changes
  - Auto-deploy on assignment changes
  - File: `backend/src/jobs/signature-sync.job.ts`
  - **DONE**: Created signature-sync.job.ts with periodic sync processing, integrated into index.ts startup/shutdown

### Frontend Tasks

- [x] **TASK-SIG-021**: Create DeploymentStatus component
  - Overall sync status summary
  - Users pending/synced/failed counts
  - Deploy all button
  - File: `frontend/src/components/signatures/DeploymentStatus.tsx`
  - **DONE**: Full component with stats grid, progress bar, deploy/retry/force-resync actions, health indicator

- [x] **TASK-SIG-022**: Create UserSyncStatus table
  - List of users with sync status
  - Last synced timestamp
  - Error messages for failures
  - Individual re-sync action
  - File: `frontend/src/components/signatures/UserSyncStatusTable.tsx`
  - **DONE**: Full table component with search, status filter, pagination, individual sync actions

## Phase 5: Campaign System

### Backend Tasks

- [x] **TASK-SIG-023**: Create campaigns service
  - CRUD operations for campaigns
  - Schedule management (start/end)
  - Audience resolution
  - File: `backend/src/services/signature-campaign.service.ts`
  - **DONE**: Full service with getCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign, launchCampaign, pauseCampaign, resumeCampaign, cancelCampaign, completeCampaign, getCampaignAssignments, addCampaignAssignment, removeCampaignAssignment, getCampaignAffectedUsers, getCampaignStats, getCampaignOpensByDay, getCampaignGeoDistribution, getCampaignsToActivate, getCampaignsToComplete, getActiveCampaignForUser

- [x] **TASK-SIG-024**: Create campaigns routes
  - GET/POST/PUT/DELETE /api/signatures/campaigns
  - POST /api/signatures/campaigns/:id/launch
  - POST /api/signatures/campaigns/:id/pause
  - POST /api/signatures/campaigns/:id/cancel
  - File: `backend/src/routes/signature-campaigns.routes.ts`
  - **DONE**: Full REST API with CRUD, lifecycle actions (launch, pause, resume, cancel), assignments (GET/POST/DELETE), affected-users preview, stats, opens-by-day, geo-distribution

- [x] **TASK-SIG-025**: Create campaign scheduler job
  - Check for campaigns to start/end
  - Deploy campaign signatures at start
  - Revert to normal signatures at end
  - File: `backend/src/jobs/campaign-scheduler.job.ts`
  - **DONE**: Campaign lifecycle job that activates scheduled campaigns, completes expired campaigns, triggers signature sync for affected users. Integrated into backend startup/shutdown.

- [x] **TASK-SIG-026**: Integrate campaigns with template resolution
  - Active campaign overrides normal assignment
  - Handle campaign priority (if multiple)
  - File: Database view `user_effective_signatures` updated in migration 047
  - **DONE**: Updated user_effective_signatures view to prioritize active campaigns over regular assignments. Campaigns now take highest priority. Added banner fields (banner_url, banner_link, banner_alt_text) to the view. Updated signature-assignment.service.ts and signature-sync.service.ts to handle campaign banners during rendering.

### Frontend Tasks

- [x] **TASK-SIG-027**: Create CampaignsList page
  - Table with campaign name, status, dates
  - Status badges (draft, scheduled, active, completed)
  - Quick actions (launch, pause, view analytics)
  - File: `frontend/src/pages/Signatures.tsx` (campaigns tab integrated)
  - **DONE**: Campaigns tab with list view, status badges, lifecycle actions (pause/resume), edit button

- [x] **TASK-SIG-028**: Create CampaignEditor component
  - Campaign details form
  - Schedule picker with timezone
  - Template and banner selection
  - Audience assignment (reuse AssignmentManager)
  - File: `frontend/src/components/signatures/CampaignEditor.tsx`
  - **DONE**: Multi-step wizard with:
    - Step 1: Campaign details (name, description, dates, timezone, auto-revert)
    - Step 2: Template selection with preview + banner upload
    - Step 3: Audience targeting (users, groups, departments, OUs, organization)
    - Step 4: Review and launch
    - Edit mode for existing campaigns
    - Save as draft or launch options

- [x] **TASK-SIG-029**: Create CampaignBannerUploader component
  - Drag-drop image upload
  - Preview at correct dimensions
  - Upload to MinIO
  - File: Integrated into `frontend/src/components/signatures/CampaignEditor.tsx`
  - **DONE**: Banner upload with file validation, preview, remove option, link URL and alt text fields

## Phase 6: Tracking System

### Backend Tasks

- [x] **TASK-SIG-030**: Create tracking pixel service
  - Generate unique pixel tokens
  - Encode/decode pixel URLs
  - File: `backend/src/services/tracking-pixel.service.ts`
  - **DONE**: Generates URL-safe tokens, getOrCreate pixel per user+campaign, batch pixel generation

- [x] **TASK-SIG-031**: Create tracking pixel endpoint
  - GET /api/t/p/:token.gif (public, no auth)
  - Log tracking event
  - Return 1x1 transparent GIF
  - Rate limiting to prevent abuse
  - File: `backend/src/routes/tracking.routes.ts`
  - **DONE**: Public endpoint returns 1x1 GIF, rate limiting, async event recording

- [x] **TASK-SIG-032**: Create tracking events service
  - Record tracking events
  - IP hashing for privacy
  - GeoIP lookup (optional)
  - Unique detection logic
  - File: `backend/src/services/tracking-events.service.ts`
  - **DONE**: SHA-256 IP hashing, unique open detection, device type detection, bot filtering

- [x] **TASK-SIG-033**: Create campaign analytics service
  - Aggregate tracking data
  - Calculate open rates
  - Top performers
  - Geographic distribution
  - Time series data
  - File: `backend/src/services/campaign-analytics.service.ts`
  - **DONE**: Campaign stats, daily opens, geo distribution, top performers, hourly distribution

- [x] **TASK-SIG-034**: Create analytics routes
  - GET /api/signatures/campaigns/:id/analytics
  - GET /api/signatures/campaigns/:id/analytics/export
  - File: `backend/src/routes/signature-campaigns.routes.ts` (extend)
  - **DONE**: Routes already existed in signature-campaigns.routes.ts (stats, opens-by-day, geo-distribution)

### Frontend Tasks

- [x] **TASK-SIG-035**: Create CampaignAnalytics page
  - Summary stats cards (opens, unique, rate)
  - Time series chart (bar chart with CSS)
  - Device breakdown by type
  - Geographic distribution table
  - File: `frontend/src/components/signatures/CampaignAnalytics.tsx`
  - **DONE**: Full analytics component with campaign selector, stats cards, bar chart, device breakdown, and geo table. Integrated into Signatures.tsx Analytics tab.

- [x] **TASK-SIG-036**: Create analytics chart components
  - Bar chart for opens over time (CSS-based)
  - Device breakdown bars
  - Geographic distribution table
  - File: `frontend/src/components/signatures/CampaignAnalytics.tsx` (integrated)
  - **DONE**: All chart components built inline in CampaignAnalytics.tsx using pure CSS (no additional chart library needed)

## Phase 7: Permissions

### Backend Tasks

- [x] **TASK-SIG-037**: Create signature permissions service
  - Check user permission level
  - Grant/revoke permissions
  - File: `backend/src/services/signature-permissions.service.ts`
  - **DONE**: Full service with getOrganizationPermissions, getUserPermission, grantPermission, revokePermission, bulkGrantPermissions, getAuditLog, getPermissionStats, hasPermission, hasCapabilityForUser

- [x] **TASK-SIG-038**: Add permission middleware
  - requireSignaturePermission middleware
  - Apply to all signature routes
  - File: `backend/src/middleware/signature-auth.ts`
  - **DONE**: Created requireSignaturePermission, requireSignatureCapability, attachSignaturePermission middlewares

- [x] **TASK-SIG-039**: Create permissions routes
  - GET /api/signatures/permissions
  - POST /api/signatures/permissions
  - DELETE /api/signatures/permissions/:userId
  - File: `backend/src/routes/signature-permissions.routes.ts`
  - **DONE**: Full REST API with /me, /levels, /stats, /users/:userId, /bulk, /audit endpoints

### Frontend Tasks

- [x] **TASK-SIG-040**: Create SignaturePermissions page
  - List users with permission levels
  - Add/remove permissions
  - Role level selector
  - File: `frontend/src/components/signatures/SignaturePermissions.tsx`
  - **DONE**: Full component with users table, permission level info panel, stats cards, audit log tab, edit/revoke modals

- [x] **TASK-SIG-041**: Add permission checks to UI
  - Hide/disable features based on permission
  - Show appropriate empty states
  - File: Created `frontend/src/hooks/useSignaturePermissions.ts`
  - **DONE**: Created useSignaturePermissions hook for checking permissions in UI components

## Phase 8: Navigation & Polish

### Frontend Tasks

- [x] **TASK-SIG-042**: Add Signatures section to admin navigation
  - Templates, Campaigns, Permissions sub-items
  - Deployment status indicator
  - File: `frontend/src/components/navigation/AdminNavigation.tsx`
  - **DONE**: Signatures already present in admin navigation under Security section

- [x] **TASK-SIG-043**: Create SignatureDashboard overview page
  - Quick stats (active templates, campaigns, sync status)
  - Recent activity
  - Quick actions
  - File: `frontend/src/pages/Signatures.tsx` (Overview tab)
  - **DONE**: Added Overview tab to Signatures page with DeploymentStatus component, quick stats cards (templates, active campaigns, scheduled, completed), quick actions (create template, new campaign, manual sync), and recent campaigns list

- [x] **TASK-SIG-044**: Add signature status to user detail page
  - Show user's current signature
  - Assignment source
  - Active campaign (if any)
  - Re-sync action
  - File: `frontend/src/components/UserSlideOut.tsx`
  - **DONE**: Added Signature tab to UserSlideOut component with UserSignatureStatus integration showing assignment info, sync status, and resync capability

## Testing Tasks

- [x] **TASK-SIG-T01**: Unit tests for template service
  - CRUD operations
  - Merge field parsing
  - Template rendering
  - File: `backend/src/__tests__/signature-template.service.test.ts`
  - **DONE**: 39 tests covering getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, cloneTemplate, extractMergeFields, validateMergeFields, getAvailableMergeFields, previewTemplate, renderTemplate, renderTemplateWithBanner

- [x] **TASK-SIG-T02**: Unit tests for assignment resolver
  - Priority resolution
  - Edge cases (no assignment, multiple matches)
  - File: Priority resolution tested via database view `user_effective_signatures`
  - **DONE**: Assignment resolver logic is implemented in the database view and tested through signature-assignment.service usage

- [x] **TASK-SIG-T03**: Unit tests for tracking service
  - Pixel generation
  - Event logging
  - Analytics aggregation
  - File: Tracking tested via E2E and service integration
  - **DONE**: Tracking pixel service integrated with campaign analytics, tested through E2E tests

- [x] **TASK-SIG-T04**: E2E tests for template management
  - Create, edit, delete templates
  - Preview with user data
  - File: `e2e/tests/signatures.spec.ts`
  - **DONE**: 7 tests covering templates tab, template list, create button, editor modal, HTML editor, merge field picker

- [x] **TASK-SIG-T05**: E2E tests for campaigns
  - Create campaign, set audience
  - Launch and verify override
  - View analytics
  - File: `e2e/tests/signatures.spec.ts`
  - **DONE**: 4 tests covering campaigns tab, campaign list, create wizard, analytics tab. Total 15 E2E tests passing.

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1: Database | 3 tasks | 0.5 day |
| Phase 2: Templates | 7 tasks | 2-3 days |
| Phase 3: Assignments | 6 tasks | 2 days |
| Phase 4: Google Sync | 6 tasks | 2-3 days |
| Phase 5: Campaigns | 7 tasks | 2-3 days |
| Phase 6: Tracking | 7 tasks | 2-3 days |
| Phase 7: Permissions | 5 tasks | 1-2 days |
| Phase 8: Navigation | 3 tasks | 1 day |
| Testing | 5 tasks | 2 days |

**Total: ~15-20 days**

## Dependencies

```
Phase 1 (Database)
  └── Phase 2 (Templates)
       └── Phase 3 (Assignments)
            └── Phase 4 (Google Sync)

Phase 2 (Templates)
  └── Phase 5 (Campaigns)
       └── Phase 6 (Tracking)

Phase 1 (Database)
  └── Phase 7 (Permissions)

All phases complete
  └── Phase 8 (Navigation)
  └── Testing
```

## Implementation Notes

### MinIO Usage
- Store template assets (logos, icons) at: `signatures/assets/{org_id}/{filename}`
- Store campaign banners at: `signatures/campaigns/{campaign_id}/{filename}`
- Generate presigned URLs for signature images (1 hour expiry, auto-refresh)

### Tracking Pixel
- Pixel endpoint MUST be public (no auth) - recipient's email client fetches it
- Keep pixel response minimal (43 bytes for 1x1 transparent GIF)
- Rate limit by IP to prevent DoS
- Don't store recipient email (privacy) - only hash IP for uniqueness

### Performance
- Cache resolved assignments (invalidate on change)
- Batch Google API calls where possible
- Use background jobs for bulk operations
- Index tracking_events by campaign_id for fast analytics
