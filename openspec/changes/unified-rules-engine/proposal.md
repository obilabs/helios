# Unified Rules Engine & Workflow Architecture

**Status:** Proposal
**Date:** December 2025
**Scope:** User properties, conditions engine, scheduling, training assignment, navigation

---

## Executive Summary

This proposal outlines a unified architecture for:
1. User properties and custom fields
2. Rules/conditions engine for template matching and training assignment
3. Workflow scheduling and execution
4. Navigation reorganization

The goal is to create a flexible, maintainable system that can handle complex conditional logic for onboarding, training, and automation without custom code for each use case.

---

## Part 1: User Properties & Custom Fields

### Current State

We have **two parallel systems**:
```sql
-- Option A: JSONB on user (simple, flexible)
organization_users.custom_fields JSONB DEFAULT '{}'

-- Option B: Structured tables (queryable)
custom_field_definitions (field_key, field_type, field_options...)
custom_field_values (user_id, field_definition_id, text_value, json_value...)
```

### Research Findings

Per [Martin Fowler's analysis](https://martinfowler.com/bliki/UserDefinedField.html):
- **JSONB approach**: Best for flexibility, modern databases support indexing/querying
- **EAV (Entity-Attribute-Value)**: Awkward queries with many joins
- **Pre-defined columns**: Limited scalability

Per [HR Partner guidance](https://help.hrpartner.io/article/66-creating-your-own-custom-fields):
- Cap at 20-30 custom fields for performance
- Too many fields slow down record loading

### Recommendation: Hybrid Approach

**Keep both systems, use them for different purposes:**

| System | Use Case |
|--------|----------|
| `custom_field_definitions` | Admin-defined fields, form rendering, validation rules |
| `organization_users.custom_fields` | Actual value storage (JSONB) |

**Rationale:**
- Definitions table provides UI metadata (labels, types, validation)
- JSONB storage provides query flexibility and performance
- Avoid the complexity of the `custom_field_values` EAV table

### Schema Enhancement

```sql
-- Add rule-eligible flag to custom field definitions
ALTER TABLE custom_field_definitions
ADD COLUMN is_rule_eligible BOOLEAN DEFAULT true;

COMMENT ON COLUMN custom_field_definitions.is_rule_eligible IS
  'Whether this field can be used in rules/conditions for templates and training';
```

### Standard User Properties Available for Rules

| Property | Source | Type |
|----------|--------|------|
| department_id | organization_users | UUID |
| job_title | organization_users | VARCHAR |
| manager_id | organization_users | UUID |
| location | organization_users | VARCHAR |
| employee_type/user_type | organization_users | VARCHAR |
| cost_center | organization_users | VARCHAR |
| org_unit_path | organization_users | VARCHAR |
| start_date | organization_users | DATE |
| email | organization_users | VARCHAR |
| custom_fields.* | organization_users.custom_fields | JSONB |

---

## Part 2: Rules/Conditions Engine

### Current State

We have a **custom implementation** in `dynamic-group.service.ts`:
```typescript
type DynamicGroupOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'regex'
  | 'in_list' | 'not_in_list'
  | 'is_empty' | 'is_not_empty'
  | 'is_under' | 'is_not_under';

type RuleLogic = 'AND' | 'OR';
```

### Research Findings

**Library Comparison:**

| Library | Downloads/week | Stars | Strengths |
|---------|---------------|-------|-----------|
| [json-rules-engine](https://npmtrends.com/json-logic-js-vs-json-rules-engine) | 234k | 2,907 | Full-featured, events, async facts |
| [json-logic-js](https://npmtrends.com/json-logic-js-vs-json-rules-engine) | 417k | 1,379 | Portable, lisp-like syntax |

Per [Nected analysis](https://www.nected.ai/blog/rule-engine-in-node-js-javascript):
- json-rules-engine better for complex business rule scenarios
- json-logic better for simple, portable conditions

### Recommendation: json-rules-engine

**Why:**
1. **Event-driven** - fires events when conditions match (perfect for triggering actions)
2. **Async facts** - can fetch data dynamically during evaluation
3. **Nested conditions** - supports complex AND/OR/NOT logic
4. **Extensible operators** - can add custom operators
5. **Active maintenance** - regular updates, good documentation

### Nesting Limits & Named Conditions

**Limits:**
| Aspect | Value |
|--------|-------|
| Max nesting depth | 3 levels (hard limit) |
| Warning threshold | Level 2 (suggest saved condition) |
| Max conditions per rule | 20 |

**Named Conditions:**
Instead of deep nesting, users can define reusable condition blocks:

```typescript
// Define once, reference anywhere
engine.setCondition('is_senior_engineer', {
  any: [
    { all: [
      { fact: 'department', operator: 'equal', value: 'Engineering' },
      { fact: 'job_title', operator: 'contains', value: 'Senior' }
    ]},
    { all: [
      { fact: 'department', operator: 'equal', value: 'Engineering' },
      { fact: 'years_experience', operator: 'greaterThan', value: 5 }
    ]}
  ]
});

// Use in rules - flat and readable
const rule = {
  conditions: {
    all: [
      { condition: 'is_senior_engineer' },  // Reference by name
      { condition: 'is_remote_worker' }
    ]
  },
  event: { type: 'assign_template', params: { templateId: '...' } }
};
```

### Implementation Design

```typescript
// Rule definition stored in database
interface StoredRule {
  id: string;
  name: string;
  priority: number;  // Higher = evaluated first
  conditions: {
    all?: RuleCondition[];
    any?: RuleCondition[];
  };
  event: {
    type: string;     // 'assign_template' | 'assign_training' | 'trigger_action'
    params: Record<string, any>;
  };
}

interface RuleCondition {
  fact: string;       // 'department_id' | 'job_title' | 'custom_field'
  operator: string;   // 'equal' | 'contains' | 'in' | 'greaterThan' etc.
  value: any;
  path?: string;      // For nested access: '$.custom_fields.work_type'
}

// Example: Engineering Senior template rule
{
  "name": "Senior Engineer Onboarding",
  "priority": 100,
  "conditions": {
    "all": [
      { "fact": "department_name", "operator": "equal", "value": "Engineering" },
      { "fact": "job_title", "operator": "contains", "value": "Senior" }
    ]
  },
  "event": {
    "type": "assign_template",
    "params": { "template_id": "uuid-senior-eng-template" }
  }
}

// Example: Remote worker additional training
{
  "name": "Remote Worker Security Training",
  "priority": 50,
  "conditions": {
    "any": [
      { "fact": "custom_field", "path": "$.work_location", "operator": "equal", "value": "Remote" },
      { "fact": "custom_field", "path": "$.work_location", "operator": "equal", "value": "Hybrid" }
    ]
  },
  "event": {
    "type": "assign_training",
    "params": { "training_ids": ["uuid-remote-security", "uuid-vpn-setup"] }
  }
}
```

### Database Schema for Rules

```sql
-- Named/saved conditions for reuse across rules
CREATE TABLE named_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,         -- 'is_senior_engineer' (code-friendly)
  display_name VARCHAR(255) NOT NULL, -- 'Senior Engineer'
  description TEXT,                   -- Human-readable explanation

  conditions JSONB NOT NULL,          -- The actual condition logic

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,      -- How many rules reference this

  -- Audit
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, name)
);

CREATE INDEX idx_named_conditions_org ON named_conditions(organization_id);

-- Generic rules table (replaces template-specific conditions)
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Rule metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  rule_type VARCHAR(50) NOT NULL,  -- 'template_selection', 'training_assignment', 'group_membership'
  priority INTEGER DEFAULT 0,       -- Higher = evaluated first
  is_active BOOLEAN DEFAULT true,

  -- The rule definition (json-rules-engine format)
  conditions JSONB NOT NULL,        -- { all: [...], any: [...] }
  event_type VARCHAR(100) NOT NULL, -- 'assign_template', 'assign_training', 'add_to_group'
  event_params JSONB DEFAULT '{}',  -- Template ID, training IDs, etc.

  -- Scope (what this rule applies to)
  applies_to VARCHAR(50) DEFAULT 'all',  -- 'all', 'onboarding', 'offboarding', 'transfer'

  -- Audit
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_automation_rules_org ON automation_rules(organization_id);
CREATE INDEX idx_automation_rules_type ON automation_rules(organization_id, rule_type, is_active);
CREATE INDEX idx_automation_rules_priority ON automation_rules(organization_id, priority DESC);
```

### Service Implementation

```typescript
// backend/src/services/rules-engine.service.ts
import { Engine } from 'json-rules-engine';

class RulesEngineService {
  private engines: Map<string, Engine> = new Map();

  async evaluateTemplateSelection(
    organizationId: string,
    userFacts: UserFacts
  ): Promise<string | null> {
    const engine = await this.getOrCreateEngine(organizationId, 'template_selection');
    const results = await engine.run(userFacts);

    // Return highest priority matched template
    const templateEvent = results.events
      .filter(e => e.type === 'assign_template')
      .sort((a, b) => b.params.priority - a.params.priority)[0];

    return templateEvent?.params.template_id || null;
  }

  async evaluateTrainingAssignments(
    organizationId: string,
    userFacts: UserFacts
  ): Promise<string[]> {
    const engine = await this.getOrCreateEngine(organizationId, 'training_assignment');
    const results = await engine.run(userFacts);

    // Collect all matched training IDs
    return results.events
      .filter(e => e.type === 'assign_training')
      .flatMap(e => e.params.training_ids);
  }

  private async getOrCreateEngine(orgId: string, ruleType: string): Promise<Engine> {
    const cacheKey = `${orgId}:${ruleType}`;

    if (!this.engines.has(cacheKey)) {
      const rules = await this.loadRules(orgId, ruleType);
      const engine = new Engine();
      rules.forEach(rule => engine.addRule(rule));
      this.engines.set(cacheKey, engine);
    }

    return this.engines.get(cacheKey)!;
  }

  // Invalidate cache when rules change
  invalidateCache(orgId: string) {
    for (const key of this.engines.keys()) {
      if (key.startsWith(orgId)) {
        this.engines.delete(key);
      }
    }
  }
}
```

---

## Part 3: Workflow Scheduling

### Current State

We have two systems:
1. **scheduled_user_actions** - For system actions (onboard, offboard, suspend)
2. **lifecycle_tasks** - For human tasks with due dates

### Research Findings

**Library Comparison:**

| Library | Backend | Best For |
|---------|---------|----------|
| [BullMQ](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/) | Redis | High-volume job queues, retries, priorities |
| [Agenda](https://blog.appsignal.com/2023/09/06/job-schedulers-for-node-bull-or-agenda.html) | MongoDB | Simple scheduling, cron jobs |
| [Temporal.io](https://temporal.io/blog/using-temporal-as-a-node-task-queue) | Self-hosted | Complex multi-step workflows, long-running processes |

Per [Better Stack analysis](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/):
- BullMQ: 1.6M downloads/week, best for Redis environments
- Agenda: 120K downloads/week, simpler but slower

### Recommendation: BullMQ

**Why:**
1. We already use Redis (likely for sessions/caching)
2. Better performance than MongoDB-based solutions
3. Built-in support for delayed jobs, retries, priorities
4. Rate limiting (important for API calls to Google/Microsoft)
5. Job dependencies (job B waits for job A)

### Implementation Design

```typescript
// backend/src/jobs/queue.ts
import { Queue, Worker, QueueScheduler } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);

// Queues for different job types
export const lifecycleQueue = new Queue('lifecycle', { connection });
export const trainingQueue = new Queue('training', { connection });
export const notificationQueue = new Queue('notifications', { connection });

// Schedule a lifecycle action
await lifecycleQueue.add(
  'execute-action',
  {
    actionId: 'uuid',
    actionType: 'create_google_account',
    userId: 'uuid',
    config: { ... }
  },
  {
    delay: calculateDelayMs(triggerDate),
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    priority: 1
  }
);
```

### Trigger Types (Enhanced)

```typescript
type TriggerType =
  // Time-based (existing)
  | 'on_approval'
  | 'days_before_start'
  | 'on_start_date'
  | 'days_after_start'
  // Event-based (new)
  | 'on_task_completion'      // When specific task completes
  | 'on_training_completion'  // When training is completed
  | 'on_probation_end'        // X days after start
  // Recurring (new)
  | 'annual'                  // Annual compliance training
  | 'quarterly'               // Quarterly reviews
  | 'monthly';                // Monthly check-ins
```

---

## Part 4: Training Assignment System

### Current State

Training is assigned manually via `trainingService.assignToUser()`. No automatic assignment based on rules.

### Research Findings

Per [Docebo](https://www.docebo.com/learning-network/blog/how-to-automate-compliance-training/):
- Use rules, triggers, and AI-powered recommendations
- Automatic enrollment based on job roles, departments, locations
- Certification renewals with automated reminders

Per [Absorb LMS](https://www.absorblms.com/blog/managing-compliance-training-at-scale-a-guide-to-enterprise-lms-solutions/):
- Automate enrollment into required compliance courses based on user attributes
- Manage certification renewals with automated reminders and re-assignment rules

### Recommendation: Rule-Based Training Assignment

**Training Categories:**
1. **Onboarding Training** - Assigned when user is created/onboarded
2. **Compliance Training** - Annual/recurring based on job function
3. **Role-Based Training** - Assigned based on job title/department
4. **Project Training** - Ad-hoc assignment for specific projects
5. **Remedial Training** - Assigned after incidents/failures

### Database Schema Enhancement

```sql
-- Training assignment rules
CREATE TABLE training_assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Rule definition
  name VARCHAR(255) NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  -- Conditions (json-rules-engine format)
  conditions JSONB NOT NULL,

  -- What to assign
  training_content_ids UUID[] NOT NULL,

  -- Timing
  trigger_type VARCHAR(50) NOT NULL,  -- 'on_hire', 'annual', 'on_role_change', 'on_event'
  trigger_config JSONB DEFAULT '{}',   -- { recurrence: 'yearly', due_days: 30 }

  -- Scope
  assignment_category VARCHAR(50) DEFAULT 'compliance', -- 'onboarding', 'compliance', 'role_based'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training certifications / completion tracking
ALTER TABLE user_training_progress
ADD COLUMN IF NOT EXISTS certification_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recurrence_rule_id UUID REFERENCES training_assignment_rules(id);
```

### Integration with Lifecycle

```typescript
// When a user is onboarded, evaluate training rules
async function onUserOnboarded(userId: string, orgId: string) {
  const user = await userService.getUser(userId);
  const userFacts = buildUserFacts(user);

  // Get all applicable training assignments
  const trainingIds = await rulesEngineService.evaluateTrainingAssignments(orgId, userFacts);

  // Assign each training with appropriate due dates
  for (const trainingId of trainingIds) {
    await trainingService.assignToUser(orgId, userId, trainingId, {
      dueDate: calculateDueDate(trainingId),
      assignedBy: 'system'
    });
  }
}

// Cron job for recurring training
async function processRecurringTraining() {
  // Find users with expiring certifications
  const expiringCerts = await db.query(`
    SELECT * FROM user_training_progress
    WHERE certification_expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
    AND recurrence_rule_id IS NOT NULL
  `);

  // Re-assign training for each
  for (const cert of expiringCerts) {
    await trainingService.assignToUser(cert.organization_id, cert.user_id, cert.content_id, {
      dueDate: cert.certification_expires_at,
      assignedBy: 'system'
    });
    // Send reminder notification
    await notificationService.sendTrainingReminder(cert);
  }
}
```

---

## Part 5: Navigation Reorganization

### Current State

```
Dashboard
Directory (Users, Groups, Teams, Org Chart)
Automation (catch-all: 10+ items)
Assets (IT Assets, Media Files)
Security & Insights (Mail Search, Security Events, Audit Logs, External Sharing)
Settings
```

### Research Findings

Per [Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-navigation):
- Navigation should be predictable, not clever
- Clear labeling avoids user confusion
- Different user roles need different navigation

Per [NN/G](https://www.nngroup.com/articles/ia-study-guide/):
- Group by user task, not system function
- Limit top-level items to 7±2
- Use card sorting to validate structure

### Recommendation: Task-Based Navigation

```
Dashboard                    (Home/overview)

Directory                    (Who's in the org)
├── Users
├── Groups
├── Teams
└── Org Chart

People Operations            (Daily workflow)
├── Requests                 (Pending approvals)
├── My Tasks                 (What I need to do)
├── HR Dashboard             (HR team overview)
├── Manager Dashboard        (Manager view)
└── Analytics                (Reporting)

Templates & Content          (Setup/configuration)
├── Onboarding Templates
├── Offboarding Templates
├── Training Content
├── Signatures
└── Automation Rules  (NEW: Rule builder UI)

Automation                   (Scheduled/background)
└── Scheduled Actions

Assets
├── IT Assets
└── Media Files

Security & Insights
├── Mail Search
├── Security Events
├── Audit Logs
└── External Sharing

Settings
```

### Role-Based Navigation Visibility

| Section | Admin | HR | Manager | User |
|---------|-------|-----|---------|------|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Directory | ✓ | ✓ | ✓ | Read-only |
| People Operations | ✓ | ✓ | Partial | My Tasks only |
| Templates & Content | ✓ | ✓ | ✗ | ✗ |
| Automation | ✓ | ✗ | ✗ | ✗ |
| Assets | ✓ | ✓ | ✗ | ✗ |
| Security & Insights | ✓ | ✗ | ✗ | ✗ |
| Settings | ✓ | Partial | ✗ | ✗ |

---

## Part 6: Implementation Phases

### Phase 1: Rules Engine Foundation (Week 1-2)
1. Install `json-rules-engine` package
2. Create `automation_rules` table
3. Implement `RulesEngineService` with caching
4. Add API endpoints for rule CRUD
5. Migrate existing dynamic group rules to new format

### Phase 2: Template Matching (Week 2-3)
1. Add `matching_conditions` to onboarding/offboarding templates (JSONB)
2. Integrate rules engine into request approval flow
3. Build rule builder UI component
4. Add preview/test functionality

### Phase 3: Training Assignment (Week 3-4)
1. Create `training_assignment_rules` table
2. Implement automatic training assignment on hire
3. Add recurring training support (annual compliance)
4. Build training rules management UI

### Phase 4: Enhanced Scheduling (Week 4-5)
1. Integrate BullMQ for job scheduling
2. Migrate scheduled_user_actions to BullMQ
3. Add event-based triggers
4. Implement job monitoring dashboard

### Phase 5: Navigation & Polish (Week 5-6)
1. Reorganize navigation structure
2. Implement role-based nav visibility
3. Add omnibar/search functionality
4. User testing and refinement

---

## Dependencies

```json
{
  "json-rules-engine": "^7.3.1",
  "bullmq": "^5.x",
  "ioredis": "^5.x"
}
```

---

## Open Questions

1. **Rule versioning**: Should we version rules for audit trail?
2. **Rule testing**: How to test rules before activation?
3. **Conflict resolution**: What if multiple templates match?
4. **Performance**: How many rules before performance degrades?
5. **Migration**: How to migrate existing setups to rule-based?

---

## References

- [json-rules-engine](https://github.com/CacheControl/json-rules-engine) - Rules engine library
- [BullMQ](https://docs.bullmq.io/) - Job queue documentation
- [Rippling Workflow Studio](https://www.rippling.com/workflow) - Reference implementation
- [ChiefOnboarding](https://github.com/chiefonboarding/ChiefOnboarding) - Open source onboarding
- [Martin Fowler - User Defined Fields](https://martinfowler.com/bliki/UserDefinedField.html)
- [Docebo - Automate Compliance Training](https://www.docebo.com/learning-network/blog/how-to-automate-compliance-training/)
