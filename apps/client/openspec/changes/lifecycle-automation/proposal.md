# Proposal: Lifecycle Automation System

## Change ID
`lifecycle-automation`

## Summary
Implement a comprehensive user lifecycle management system with request queues, timeline-based templates, multi-party task assignment, training modules, and role-based dashboards. This system works standalone (without Google/MS integrations) while enhancing automation when integrations are enabled.

## Problem Statement

Current state:
- **Workflow Builder**: Visual UI prototype that saves diagrams but doesn't execute
- **Onboarding Templates**: Define groups/settings but lack timeline automation
- **Scheduled Actions**: Execute actions but require manual setup
- **No unified request queue**: HR can't submit requests for admin approval
- **No task tracking**: No visibility into who did what, what's pending
- **No training module**: Can't assign/track training content or policy acceptance

HR teams need:
1. Submit onboard/offboard requests → admin approval queue
2. Automatic task generation for IT, Managers, HR, and Users
3. Timeline-based triggers (X days before/after start date)
4. Training content assignment with completion tracking
5. Dashboard visibility for all stakeholders

## Goals

1. **Unified Request Queue**: Single table for onboard/offboard/transfer requests
2. **Timeline Templates**: Define actions at relative time offsets from key dates
3. **Multi-Party Tasks**: Assign tasks to IT, Manager, HR, User at each stage
4. **Training Module**: Videos, documents, terms acceptance with progress tracking
5. **Role Dashboards**: HR, Manager, and User views of pending work
6. **Standalone Value**: Works without Google/MS integrations
7. **Build on Existing**: Extend scheduled_user_actions and onboarding_templates

## Non-Goals

- Visual workflow builder execution (defer to later phase)
- Complex branching/conditional logic
- External HRIS integrations
- Approval chains (multi-level approvals)

## Success Criteria

1. HR can submit onboarding request, admin approves, tasks auto-generate
2. Each party sees their pending tasks with due dates
3. Timeline executes automatically (3 days before, on start, 7 days after)
4. New users see onboarding portal with training content
5. HR dashboard shows all in-progress onboardings with status

## Dependencies

### Existing Infrastructure
- `scheduled_user_actions` table (migration 042)
- `onboarding_templates` table (migration 040)
- `user_lifecycle_logs` table (migration 043)
- `ScheduledActionService` (backend)
- `UserOnboardingService` (backend)

### New Capabilities Required
- User request management
- Task assignment engine
- Training content storage
- Timeline action generator

## Stakeholders

- **HR Teams**: Submit requests, track progress, assign training
- **IT Admins**: Approve requests, system setup tasks
- **Managers**: Team onboarding tasks, check-ins
- **New Users**: Complete onboarding tasks, training
- **Compliance**: Audit trail of training completion

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | High | Medium | Strict phase boundaries |
| Complex date calculations | Medium | Medium | Extensive test coverage |
| Task notification fatigue | Medium | Low | Configurable notification preferences |
| Performance with many tasks | Low | Medium | Proper indexing, pagination |

## Phases

### Phase 1: Foundation (MVP)
- User requests table (unified onboard/offboard)
- Basic approval workflow
- Timeline field in templates
- Task generation from timeline

### Phase 2: Task Management
- Task assignment to different parties
- Task completion tracking
- Email notifications
- Basic dashboards

### Phase 3: User Portal & Training
- New user onboarding portal
- Training content module
- Terms acceptance with signatures
- Progress tracking

### Phase 4: Enhanced Dashboards
- HR dashboard with analytics
- Manager team view
- Compliance reporting
- Bulk operations

## Related Specs

- `hr-requests` - Basic request/approval (this supersedes)
- `workflow-builder` - Visual builder (deferred, this is alternative)
- `add-user-ux` - User creation flow (integrates with)
