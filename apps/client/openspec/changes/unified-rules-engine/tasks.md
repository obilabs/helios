# Tasks: Unified Rules Engine & Workflow Architecture

## Phase 1: Rules Engine Foundation ✅ IN PROGRESS

### 1.1 Setup & Database ✅ COMPLETED
- [x] Install json-rules-engine package
- [x] Create `named_conditions` table migration
- [x] Create `automation_rules` table migration
- [x] Add indexes for performance
- [ ] Create seed data for testing

### 1.2 Core Service ✅ COMPLETED
- [x] Create `rules-engine.service.ts`
- [x] Implement rule loading from database
- [x] Implement named conditions loading and registration
- [x] Implement engine caching per organization
- [x] Add cache invalidation on rule/condition changes
- [x] Add custom operators (isUnder, isNotUnder, matchesRegex, isEmpty, etc.)

### 1.3 Validation ✅ COMPLETED
- [x] Implement nesting depth validation (max 3 levels)
- [x] Add warning at depth 2 (suggest named condition)
- [x] Validate named condition references exist
- [x] Max 20 conditions per rule validation
- [x] Prevent circular references in named conditions

### 1.4 API Endpoints - Named Conditions ✅ COMPLETED
- [x] GET /api/v1/automation/conditions - List named conditions
- [x] POST /api/v1/automation/conditions - Create named condition
- [x] PUT /api/v1/automation/conditions/:id - Update named condition
- [x] DELETE /api/v1/automation/conditions/:id - Delete (check usage first)
- [x] GET /api/v1/automation/conditions/:id/usage - Get rules using this condition

### 1.5 API Endpoints - Rules ✅ COMPLETED
- [x] GET /api/v1/automation/rules - List rules
- [x] POST /api/v1/automation/rules - Create rule
- [x] PUT /api/v1/automation/rules/:id - Update rule
- [x] DELETE /api/v1/automation/rules/:id - Delete rule
- [x] POST /api/v1/automation/rules/:id/test - Test rule with sample data
- [x] POST /api/v1/automation/rules/evaluate - Evaluate all rules for given facts

### 1.6 Migration
- [ ] Create migration script for dynamic_group_rules → automation_rules
- [ ] Update dynamic-group.service.ts to use new rules engine
- [ ] Add backwards compatibility layer

---

## Phase 2: Template Matching

### 2.1 Schema Updates
- [ ] Add `matching_conditions` JSONB to onboarding_templates
- [ ] Add `matching_conditions` JSONB to offboarding_templates
- [ ] Add `matching_priority` INTEGER to both
- [ ] Migrate existing department_id conditions to new format

### 2.2 Request Processing
- [ ] Update lifecycle-request.service.ts to evaluate template rules
- [ ] Implement template selection on request approval
- [ ] Add fallback to default template
- [ ] Log template selection decisions

### 2.3 Rule Builder UI
- [ ] Create RuleBuilder component
- [ ] Support AND/OR condition groups
- [ ] Field selector with all available user properties
- [ ] Operator selector based on field type
- [ ] Value input (text, select, multi-select)
- [ ] Nested group support
- [ ] Preview matching users

### 2.4 Template Editor Integration
- [ ] Add "Conditions" tab to OnboardingTemplateEditor
- [ ] Add "Conditions" tab to OffboardingTemplateEditor
- [ ] Show matching conditions preview
- [ ] Test button to simulate matching

---

## Phase 3: Training Assignment

### 3.1 Schema
- [ ] Create `training_assignment_rules` table
- [ ] Add `certification_expires_at` to user_training_progress
- [ ] Add `recurrence_rule_id` to user_training_progress
- [ ] Add `assignment_source` to track how training was assigned

### 3.2 Assignment Service
- [ ] Create training-assignment.service.ts
- [ ] Implement evaluateAssignmentsForUser()
- [ ] Implement assignMandatoryTraining()
- [ ] Implement processRecurringAssignments()

### 3.3 Integration Points
- [ ] Hook into user onboarding flow
- [ ] Hook into role/department change events
- [ ] Create cron job for recurring training
- [ ] Create cron job for certification expiration reminders

### 3.4 Training Rules UI
- [ ] Create TrainingRulesPage
- [ ] Create TrainingRuleEditor component
- [ ] Add training selection (multi-select)
- [ ] Add trigger configuration (on_hire, annual, etc.)
- [ ] Add due date calculation settings

---

## Phase 4: Enhanced Scheduling

### 4.1 BullMQ Setup
- [ ] Install bullmq and ioredis packages
- [ ] Create queue configuration
- [ ] Create worker processes
- [ ] Setup Redis connection handling

### 4.2 Queue Types
- [ ] lifecycle-actions queue (onboard, offboard, suspend)
- [ ] training-assignments queue (assign, remind, expire)
- [ ] notifications queue (email, in-app)
- [ ] sync queue (Google Workspace, M365)

### 4.3 Migration
- [ ] Migrate scheduled_user_actions processor to BullMQ
- [ ] Update scheduled-action.service.ts to use queues
- [ ] Add job monitoring/dashboard
- [ ] Implement graceful shutdown

### 4.4 New Trigger Types
- [ ] Implement event-based triggers (on_task_completion)
- [ ] Implement recurring triggers (annual, quarterly)
- [ ] Add trigger condition evaluation
- [ ] Create trigger testing UI

---

## Phase 5: Navigation Reorganization

### 5.1 Structure Changes
- [ ] Rename "Automation" section to "Templates & Content"
- [ ] Create new "People Operations" section
- [ ] Create new "Automation" section (scheduled only)
- [ ] Move items to correct sections

### 5.2 Feature Flags
- [ ] Add nav.section.people_operations flag
- [ ] Add nav.section.templates flag
- [ ] Add nav.automation_rules flag
- [ ] Update AdminNavigation.tsx

### 5.3 Role-Based Visibility
- [ ] Implement role-based section visibility
- [ ] Add user role checks to navigation
- [ ] Hide admin-only sections from non-admins
- [ ] Add Manager Dashboard to manager role

### 5.4 Search/Omnibar (Optional)
- [ ] Create CommandBar enhancements
- [ ] Index all navigable pages
- [ ] Add keyboard shortcut (Cmd+K)
- [ ] Show recent pages

---

## Phase 6: Testing & Documentation

### 6.1 Unit Tests
- [ ] RulesEngineService tests
- [ ] TrainingAssignmentService tests
- [ ] TemplateMatchingService tests
- [ ] Queue worker tests

### 6.2 Integration Tests
- [ ] End-to-end onboarding with template matching
- [ ] Training assignment on hire
- [ ] Recurring training renewal
- [ ] Scheduled action execution

### 6.3 Documentation
- [ ] Admin guide: Creating automation rules
- [ ] Admin guide: Training assignment rules
- [ ] Developer guide: Rules engine API
- [ ] Migration guide for existing customers

---

## Dependencies

```
Phase 1 (Foundation)
└── No dependencies

Phase 2 (Template Matching)
└── Depends on: Phase 1

Phase 3 (Training Assignment)
└── Depends on: Phase 1

Phase 4 (Scheduling)
└── Can run parallel to Phases 2-3

Phase 5 (Navigation)
└── Can run parallel to all phases

Phase 6 (Testing)
└── Depends on: All previous phases
```

## Estimated Complexity

| Phase | Components | Complexity | Risk |
|-------|------------|------------|------|
| Phase 1 | 4 | Medium | Low - Well-documented library |
| Phase 2 | 4 | Medium | Medium - UI complexity |
| Phase 3 | 4 | Medium | Low - Similar to Phase 2 |
| Phase 4 | 4 | High | Medium - Infrastructure change |
| Phase 5 | 4 | Low | Low - UI only |
| Phase 6 | 3 | Medium | Low - Standard testing |

## Key Decisions Needed

1. **Redis requirement**: BullMQ requires Redis. Confirm Redis is available in all deployment environments.

2. **Rule complexity limit**: Should we limit nesting depth or condition count for performance?

3. **Testing strategy**: How to test rules without affecting production data?

4. **Migration approach**: Big bang or gradual migration for existing customers?

5. **UI complexity**: Full rule builder or simplified presets?
