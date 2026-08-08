# Tasks: Lifecycle Automation System

## Phase 1: Foundation (MVP) ✅ COMPLETED

### 1.1 Database Schema
- [x] **Create user_requests table migration**
  - Unified table for onboard/offboard/transfer requests
  - Status workflow: pending → approved → in_progress → completed
  - Link to templates and user data
  - Migration: `database/migrations/067_create_lifecycle_automation.sql`

- [x] **Create lifecycle_tasks table migration**
  - Task assignment with assignee_type (user, manager, hr, it, system)
  - Trigger types and offset days
  - Status tracking and completion fields
  - Dependencies between tasks

- [x] **Add timeline column to onboarding_templates**
  - JSONB column for timeline entries
  - Migrate existing templates with empty timeline
  - Validation: Ensure backward compatibility

### 1.2 Backend Services

- [x] **Create RequestService**
  - CRUD operations for user_requests
  - Approval/rejection workflow
  - Status transitions with validation
  - Integration with lifecycle logging
  - File: `backend/src/services/lifecycle-request.service.ts`

- [x] **Create TimelineGeneratorService**
  - Parse template timeline
  - Calculate due dates from triggers and offsets
  - Generate lifecycle_tasks from timeline
  - Create scheduled_user_actions for system tasks
  - File: `backend/src/services/timeline-generator.service.ts`

- [x] **Create TaskService**
  - Task listing with filters (my tasks, team, overdue)
  - Task completion with notes
  - Dependency resolution (unblock dependent tasks)
  - Progress updates on parent request
  - File: `backend/src/services/lifecycle-task.service.ts`

### 1.3 API Routes

- [x] **Create lifecycle routes file**
  - `/api/v1/lifecycle/requests` - Request CRUD
  - `/api/v1/lifecycle/requests/:id/approve` - Approval endpoint
  - `/api/v1/lifecycle/requests/:id/reject` - Rejection endpoint
  - Authentication and authorization middleware
  - Added to: `backend/src/routes/lifecycle.routes.ts`

- [x] **Add task routes**
  - `/api/v1/lifecycle/tasks` - Task listing
  - `/api/v1/lifecycle/tasks/:id/complete` - Completion
  - Filter by assignee_type, status, due date

### 1.4 Frontend - Request Management

- [x] **Create RequestsPage component**
  - List pending/active/completed requests
  - Status filters and search
  - Quick approve/reject actions for admins
  - File: `frontend/src/pages/RequestsPage.tsx`

- [x] **Create NewRequestModal component**
  - Form for onboarding request
  - Fields: name, email, start date, department, manager
  - Template selection
  - Validation and submission

- [x] **Create RequestDetailView component**
  - Full request details
  - Task list with status
  - Timeline view of actions
  - Approval/rejection for admins

---

## Phase 2: Task Management ✅ COMPLETE

### 2.1 Template Timeline Editor ✅ COMPLETED

- [x] **Create TimelineEditor component**
  - Visual timeline with trigger points
  - Add/remove timeline entries
  - Configure triggers: on_approval, days_before, on_start, days_after
  - Expandable action lists per entry
  - Drag-and-drop reordering with @dnd-kit
  - File: `frontend/src/components/lifecycle/TimelineEditor.tsx`

- [x] **Create ActionEditor component**
  - Add actions to timeline entry
  - Action types: task, email, system, training
  - Configure assignee for tasks
  - Select email templates
  - Choose training content
  - File: `frontend/src/components/lifecycle/ActionEditor.tsx`

- [x] **Integrate with OnboardingTemplateEditor**
  - Add Timeline tab to existing editor
  - Save/load timeline with template
  - Preview generated tasks
  - Also integrated with OffboardingTemplateEditor

### 2.2 Task Dashboard ✅ COMPLETED

- [x] **Create MyTasksView component**
  - List tasks assigned to current user
  - Filter by category, due date, status
  - Quick complete action
  - Mark as in_progress
  - Summary cards for pending, in progress, overdue, completed
  - File: `frontend/src/pages/TasksDashboard.tsx`

- [x] **Create TaskCard component**
  - Task title and description
  - Due date with overdue indicator
  - Assignee info and category badges
  - Complete/skip/start buttons
  - File: `frontend/src/components/lifecycle/TaskCard.tsx`

- [x] **Create TaskDetailModal component**
  - Full task details
  - Completion form with notes
  - Skip with reason form
  - Link to request
  - File: `frontend/src/components/lifecycle/TaskDetailModal.tsx`

### 2.3 Notifications ✅ COMPLETED

- [x] **Create NotificationService**
  - Task assignment notifications
  - Due date reminders
  - Overdue alerts
  - Completion confirmations
  - File: `backend/src/services/lifecycle-notification.service.ts`

- [x] **Create email templates**
  - task_assigned (default template in migration)
  - task_reminder (default template in migration)
  - task_overdue (default template in migration)
  - request_approved (default template in migration)
  - request_rejected (default template in migration)
  - Migration: `database/migrations/068_add_lifecycle_notifications.sql`

- [x] **Add notification preferences**
  - User settings for notification types
  - Lifecycle notification toggles in UserSettings
  - Integrated with user_preferences JSONB column

---

## Phase 3: User Portal & Training ✅ COMPLETED

### 3.1 Training Content Module ✅ COMPLETED

- [x] **Create training_content table migration**
  - Content types: video, document, terms, quiz, link, checklist
  - Storage for URLs and embedded data
  - Categorization and targeting
  - Migration: `database/migrations/069_create_training_content.sql`

- [x] **Create user_training_progress table migration**
  - Track user progress per content
  - Acknowledgment data (timestamp, IP, signature)
  - Quiz attempts and scores
  - Migration: `database/migrations/069_create_training_content.sql`

- [x] **Create TrainingService**
  - Content CRUD operations
  - Quiz question management
  - Assignment to users
  - Progress tracking (start, complete, acknowledge, submit quiz)
  - Reporting (content stats, user summary)
  - File: `backend/src/services/training.service.ts`

### 3.2 Training Content Editor ✅ COMPLETED

- [x] **Create TrainingContentList page**
  - List all training content
  - Filter by type, category, status
  - Add/edit/delete actions
  - Stats display per content
  - File: `frontend/src/pages/TrainingContent.tsx`

- [x] **Create TrainingContentEditor component**
  - Content type selection
  - URL input
  - Description textarea
  - Duration and category fields
  - Mandatory/Active toggles
  - Inline modal in TrainingContent.tsx

- [ ] **Create TermsEditor component**
  - Rich text editor for policy content
  - Preview mode
  - Version management

### 3.3 User Onboarding Portal ✅ COMPLETED

- [x] **Create UserOnboardingPortal page**
  - Welcome message with progress circle
  - Quick stats (tasks, training, items remaining)
  - Tabbed interface (Overview, Tasks, Training)
  - Next up section with quick actions
  - File: `frontend/src/pages/UserOnboardingPortal.tsx`

- [x] **Create TrainingViewer component**
  - Video player via iframe
  - Document viewer via iframe
  - Terms acceptance with checkbox
  - External link handler
  - Quiz and checklist placeholders
  - Integrated in UserOnboardingPortal.tsx

- [x] **Create TaskChecklist component**
  - Grouped by category
  - Completion toggles with visual feedback
  - Due date with overdue indicators
  - Priority badges
  - Integrated in UserOnboardingPortal.tsx

---

## Phase 4: Enhanced Dashboards ✅ COMPLETED

### 4.1 HR Dashboard ✅ COMPLETED

- [x] **Create HRDashboardPage component**
  - Summary metrics cards (pending, active, overdue, my tasks)
  - Secondary metrics (completed this month, avg days)
  - Dashboard grid layout
  - Auto-refresh every 5 minutes
  - File: `frontend/src/pages/HRDashboard.tsx`

- [x] **Create RequestsQueue component**
  - Pending requests list
  - Quick approve/reject buttons
  - Waiting time indicator
  - View all link
  - Integrated in HRDashboard

- [x] **Create ActiveOnboardingsTable component**
  - All in-progress onboardings
  - Progress bars with status colors
  - Filter by status (on_track, at_risk, overdue)
  - Responsive table design
  - Integrated in HRDashboard

- [x] **Create AttentionAlerts component**
  - Overdue tasks with days count
  - Stale pending requests (3+ days)
  - Severity indicators (warning/critical)
  - Integrated in HRDashboard

- [x] **Create dashboard API endpoints**
  - `/api/v1/lifecycle/dashboard/metrics`
  - `/api/v1/lifecycle/dashboard/active-onboardings`
  - `/api/v1/lifecycle/dashboard/attention`
  - Added to lifecycle.routes.ts

### 4.2 Manager Dashboard ✅ COMPLETED

- [x] **Create ManagerDashboardPage component**
  - Team onboardings with progress
  - My pending tasks with quick complete
  - Upcoming start dates with countdown
  - Metrics cards (team, tasks, upcoming, overdue)
  - File: `frontend/src/pages/ManagerDashboard.tsx`

- [x] **Create manager-specific API endpoints**
  - `/api/v1/lifecycle/dashboard/manager` - Manager metrics and data
  - `/api/v1/lifecycle/dashboard/team-onboardings` - Team onboardings with progress
  - Added to lifecycle.routes.ts

### 4.3 Analytics & Reporting ✅ COMPLETED

- [x] **Create LifecycleAnalytics page**
  - Key metrics with trends (avg days, completion rate, on-time rate)
  - Monthly trends bar chart
  - Department performance table
  - Bottleneck analysis with severity indicators
  - Completion timeline distribution
  - Date range selector (30d, 90d, 6m, 1y)
  - CSV export functionality
  - File: `frontend/src/pages/LifecycleAnalytics.tsx`

- [ ] **Create ComplianceReport component** (Future enhancement)
  - Training completion rates
  - Terms acceptance audit
  - Overdue items report
  - Export to CSV

---

## Testing & Validation

### Unit Tests
- [ ] RequestService tests
- [ ] TimelineGeneratorService tests
- [ ] TaskService tests
- [ ] TrainingService tests

### Integration Tests
- [ ] Request approval flow
- [ ] Task generation from timeline
- [ ] Task completion updates
- [ ] Training progress tracking

### E2E Tests
- [ ] HR creates request → Admin approves → Tasks generated
- [ ] User completes onboarding tasks
- [ ] Training content completion flow
- [ ] Dashboard data accuracy

---

## Migration & Rollout

- [ ] **Create migration script**
  - Run all new migrations
  - Seed sample training content
  - Create default email templates

- [ ] **Update existing templates**
  - Add empty timeline to existing templates
  - Document migration path for users

- [ ] **Create documentation**
  - Admin guide for template setup
  - HR guide for request management
  - User guide for onboarding portal

---

## Dependencies

```
Phase 1 (Foundation)
├── No external dependencies
└── Uses existing: ScheduledActionService, LifecycleLogService

Phase 2 (Task Management)
├── Depends on: Phase 1
└── Uses existing: EmailService, NotificationService

Phase 3 (Training Module)
├── Depends on: Phase 1
├── Uses existing: FileStorageService (for uploads)
└── Optional: Video hosting integration

Phase 4 (Dashboards)
├── Depends on: Phases 1, 2, 3
└── Uses existing: All lifecycle services
```

## Estimated Effort

| Phase | Components | Complexity | Notes |
|-------|------------|------------|-------|
| Phase 1 | 10 | Medium | Foundation - must be solid |
| Phase 2 | 9 | Medium | Timeline editor is complex |
| Phase 3 | 8 | Medium | Training viewer needs polish |
| Phase 4 | 6 | Low | Mostly data aggregation |

## Parallelizable Work

- Phase 1: Backend and Frontend can proceed in parallel after schema
- Phase 2 & 3: Can be developed in parallel (independent features)
- Phase 4: Must wait for Phases 1-3

## Rollout Strategy

1. **Internal testing**: Phase 1 + basic Phase 2
2. **Beta users**: Full Phase 1-2
3. **GA release**: All phases
