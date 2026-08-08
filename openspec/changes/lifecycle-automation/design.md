# Design: Lifecycle Automation System

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND LAYER                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ HR Dashboard │  │   Manager    │  │    User      │  │  Template   │ │
│  │   (Admin)    │  │  Dashboard   │  │   Portal     │  │   Editor    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            API LAYER                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  /api/v1/lifecycle/requests      - Request CRUD & approval              │
│  /api/v1/lifecycle/tasks         - Task assignment & completion         │
│  /api/v1/lifecycle/templates     - Enhanced templates with timeline     │
│  /api/v1/lifecycle/training      - Training content & progress          │
│  /api/v1/lifecycle/dashboard     - Aggregated dashboard data            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SERVICE LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │ RequestService  │  │  TaskService    │  │ TimelineGeneratorService│ │
│  │ - create        │  │  - assign       │  │ - generateFromTemplate  │ │
│  │ - approve       │  │  - complete     │  │ - calculateDates        │ │
│  │ - reject        │  │  - notify       │  │ - createScheduledActions│ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │TrainingService  │  │DashboardService │  │ScheduledActionService   │ │
│  │ - createContent │  │ - getHRDashboard│  │ (existing - extended)   │ │
│  │ - assignToUser  │  │ - getManagerView│  │ - processActions        │ │
│  │ - trackProgress │  │ - getUserTasks  │  │ - executeTask           │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  user_requests          - Unified onboard/offboard/transfer queue       │
│  lifecycle_tasks        - Assigned tasks for all parties                │
│  template_timeline      - Timeline entries in templates                 │
│  training_content       - Videos, docs, terms                           │
│  user_training_progress - Completion tracking                           │
│  scheduled_user_actions - (existing) Execution queue                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Model

### 1. user_requests (New Table)

Unified queue for all lifecycle requests.

```sql
CREATE TABLE user_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Request Type
  request_type VARCHAR(20) NOT NULL, -- 'onboard', 'offboard', 'transfer'

  -- Status Flow: pending → approved → in_progress → completed
  status VARCHAR(20) DEFAULT 'pending',
  -- 'pending', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'

  -- Target User Info (for new hires, before user exists)
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  personal_email VARCHAR(255), -- For pre-start communications

  -- For existing users (offboard/transfer)
  user_id UUID REFERENCES organization_users(id),

  -- Key Dates
  start_date DATE, -- For onboarding
  end_date DATE,   -- For offboarding

  -- Template & Configuration
  template_id UUID, -- References onboarding or offboarding template
  job_title VARCHAR(255),
  department_id UUID REFERENCES departments(id),
  manager_id UUID REFERENCES organization_users(id),
  location VARCHAR(255),

  -- Extended data as JSONB
  metadata JSONB DEFAULT '{}', -- Additional fields, custom data

  -- Workflow Tracking
  requested_by UUID REFERENCES organization_users(id),
  approved_by UUID REFERENCES organization_users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Progress
  tasks_total INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. lifecycle_tasks (New Table)

Tasks assigned to different parties at different stages.

```sql
CREATE TABLE lifecycle_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Link to request
  request_id UUID REFERENCES user_requests(id) ON DELETE CASCADE,

  -- Link to user (for user-facing tasks)
  user_id UUID REFERENCES organization_users(id),

  -- Task Definition
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'onboarding', 'offboarding', 'compliance', 'training'

  -- Assignment
  assignee_type VARCHAR(20) NOT NULL, -- 'user', 'manager', 'hr', 'it', 'system'
  assignee_id UUID REFERENCES organization_users(id), -- Specific person (optional)
  assignee_role VARCHAR(50), -- 'manager_of_user', 'hr_team', 'it_team'

  -- Timing
  trigger_type VARCHAR(30), -- 'on_approval', 'days_before_start', 'on_start', 'days_after_start'
  trigger_offset_days INTEGER DEFAULT 0, -- Negative for before, positive for after
  due_date DATE,

  -- Status
  status VARCHAR(20) DEFAULT 'pending',
  -- 'pending', 'in_progress', 'completed', 'skipped', 'blocked'

  -- Completion
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES organization_users(id),
  completion_notes TEXT,

  -- For system tasks
  action_type VARCHAR(50), -- 'create_account', 'add_to_group', 'send_email', etc.
  action_config JSONB,
  scheduled_action_id UUID REFERENCES scheduled_user_actions(id),

  -- Ordering
  sequence_order INTEGER DEFAULT 0,
  depends_on_task_id UUID REFERENCES lifecycle_tasks(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. training_content (New Table)

Training materials, documents, and terms.

```sql
CREATE TABLE training_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Content Info
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content_type VARCHAR(30) NOT NULL, -- 'video', 'document', 'terms', 'quiz', 'link'

  -- Content Storage
  content_url TEXT, -- External URL or S3 path
  content_data JSONB, -- For rich text, quiz questions, etc.
  duration_minutes INTEGER, -- Estimated time

  -- Categorization
  category VARCHAR(50), -- 'security', 'compliance', 'culture', 'role_specific'
  tags TEXT[],

  -- Requirements
  is_required BOOLEAN DEFAULT false,
  requires_acknowledgment BOOLEAN DEFAULT false, -- Must click "I agree"
  pass_threshold INTEGER, -- For quizzes (percentage)

  -- Targeting
  applies_to_departments UUID[], -- Empty = all
  applies_to_user_types VARCHAR(20)[], -- 'staff', 'guest', 'contact'

  -- Status
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,

  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. user_training_progress (New Table)

Track user progress through training content.

```sql
CREATE TABLE user_training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  user_id UUID NOT NULL REFERENCES organization_users(id),
  content_id UUID NOT NULL REFERENCES training_content(id),

  -- Progress
  status VARCHAR(20) DEFAULT 'not_started',
  -- 'not_started', 'in_progress', 'completed', 'failed'
  progress_percent INTEGER DEFAULT 0,

  -- Timing
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- For acknowledgments/terms
  acknowledged_at TIMESTAMPTZ,
  acknowledgment_ip VARCHAR(45),
  acknowledgment_user_agent TEXT,
  digital_signature TEXT, -- Typed name or signature data

  -- For quizzes
  attempts INTEGER DEFAULT 0,
  best_score INTEGER,
  last_attempt_at TIMESTAMPTZ,

  -- Link to task if assigned via onboarding
  task_id UUID REFERENCES lifecycle_tasks(id),

  UNIQUE(user_id, content_id)
);
```

### 5. Template Timeline Extension

Add timeline to existing `onboarding_templates` table:

```sql
ALTER TABLE onboarding_templates
ADD COLUMN timeline JSONB DEFAULT '[]';
```

Timeline JSON structure:
```json
{
  "timeline": [
    {
      "trigger": "on_approval",
      "actions": [
        {
          "type": "task",
          "assignee": "hr",
          "title": "Create employee record",
          "description": "Add to HRIS system"
        },
        {
          "type": "email",
          "template": "manager_notification",
          "to": "manager"
        }
      ]
    },
    {
      "trigger": "days_before_start",
      "offset": -3,
      "actions": [
        {
          "type": "task",
          "assignee": "it",
          "title": "Prepare workstation",
          "description": "Laptop, monitors, accessories"
        }
      ]
    },
    {
      "trigger": "days_before_start",
      "offset": -1,
      "actions": [
        {
          "type": "system",
          "action": "create_account",
          "platforms": ["google_workspace"]
        },
        {
          "type": "system",
          "action": "add_to_groups"
        },
        {
          "type": "email",
          "template": "credentials_email",
          "to": "user"
        }
      ]
    },
    {
      "trigger": "on_start_date",
      "actions": [
        {
          "type": "system",
          "action": "activate_user"
        },
        {
          "type": "task",
          "assignee": "user",
          "title": "Set up MFA",
          "category": "security"
        },
        {
          "type": "training",
          "content_ids": ["security_101", "company_policies"]
        }
      ]
    },
    {
      "trigger": "days_after_start",
      "offset": 7,
      "actions": [
        {
          "type": "task",
          "assignee": "manager",
          "title": "First week check-in"
        },
        {
          "type": "email",
          "template": "task_reminder",
          "to": "user"
        }
      ]
    }
  ]
}
```

## Service Design

### TimelineGeneratorService

Converts template timeline to lifecycle_tasks and scheduled_user_actions.

```typescript
class TimelineGeneratorService {
  async generateFromRequest(request: UserRequest): Promise<void> {
    const template = await this.getTemplate(request.template_id);
    const startDate = request.start_date;

    for (const entry of template.timeline) {
      const dueDate = this.calculateDate(startDate, entry.trigger, entry.offset);

      for (const action of entry.actions) {
        if (action.type === 'task') {
          await this.createTask(request, action, dueDate);
        } else if (action.type === 'system') {
          await this.createScheduledAction(request, action, dueDate);
        } else if (action.type === 'email') {
          await this.createEmailTask(request, action, dueDate);
        } else if (action.type === 'training') {
          await this.createTrainingAssignment(request, action, dueDate);
        }
      }
    }
  }

  private calculateDate(
    referenceDate: Date,
    trigger: string,
    offset: number = 0
  ): Date {
    const date = new Date(referenceDate);

    switch (trigger) {
      case 'on_approval':
        return new Date(); // Today
      case 'days_before_start':
        date.setDate(date.getDate() + offset); // offset is negative
        return date;
      case 'on_start_date':
        return date;
      case 'days_after_start':
        date.setDate(date.getDate() + offset);
        return date;
      default:
        return date;
    }
  }
}
```

### TaskService

Manages task assignment, completion, and notifications.

```typescript
class TaskService {
  async completeTask(
    taskId: string,
    userId: string,
    notes?: string
  ): Promise<void> {
    await db.query(`
      UPDATE lifecycle_tasks
      SET status = 'completed',
          completed_at = NOW(),
          completed_by = $2,
          completion_notes = $3
      WHERE id = $1
    `, [taskId, userId, notes]);

    // Update request progress
    await this.updateRequestProgress(taskId);

    // Check for dependent tasks
    await this.unblockDependentTasks(taskId);

    // Log completion
    await lifecycleLogService.log({...});
  }

  async getTasksForUser(userId: string): Promise<Task[]> {
    // Get tasks assigned directly to user
    // Plus tasks for roles they hold (manager_of, hr_team, etc.)
  }

  async getOverdueTasks(organizationId: string): Promise<Task[]> {
    return db.query(`
      SELECT * FROM lifecycle_tasks
      WHERE organization_id = $1
        AND status = 'pending'
        AND due_date < CURRENT_DATE
      ORDER BY due_date ASC
    `, [organizationId]);
  }
}
```

## UI Components

### Template Timeline Editor

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Edit: Standard Engineering Onboarding                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⏱️ TIMELINE                                       [+ Add Step] │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─ On Approval ──────────────────────────────────── [×] [⋮] ─┐│
│  │  📋 Task → HR: Create employee record                      ││
│  │  📧 Email → Manager: New hire notification                 ││
│  │                                           [+ Add Action]   ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ 3 Days Before Start ─────────────────────────── [×] [⋮] ─┐│
│  │  📋 Task → IT: Prepare workstation                         ││
│  │  📋 Task → Manager: Plan first week                        ││
│  │                                           [+ Add Action]   ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─ 1 Day Before Start ──────────────────────────── [×] [⋮] ─┐│
│  │  ⚡ System: Create Google Account                          ││
│  │  ⚡ System: Add to Groups                                  ││
│  │  📧 Email → User: Your credentials are ready               ││
│  │                                           [+ Add Action]   ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [+ Add Timeline Step]                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### HR Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 HR Lifecycle Dashboard                          [+ Request] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │     3      │ │     7      │ │     5      │ │     2      │   │
│  │  Pending   │ │   Active   │ │  My Tasks  │ │  Overdue   │   │
│  │  Requests  │ │ Onboardings│ │  Due Soon  │ │   Tasks    │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│                                                                 │
│  ⚠️ NEEDS ATTENTION                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🔴 Sarah Chen: IT task overdue (Prepare workstation)       ││
│  │ 🟡 James Wu: Manager orientation not completed             ││
│  │ 🟡 3 requests pending > 48 hours                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  📋 PENDING REQUESTS                                [View All]  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Marcus Johnson  │ Sales     │ Jan 22 │ [Approve] [Reject]  ││
│  │ Emily Davis     │ Marketing │ Jan 25 │ [Approve] [Reject]  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  🚀 ACTIVE ONBOARDINGS                              [View All]  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Sarah Chen      │ Jan 15 │ ████████░░ 80%  │ 2 tasks left  ││
│  │ Alex Martinez   │ Jan 22 │ ████░░░░░░ 40%  │ 5 tasks left  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Requests
```
POST   /api/v1/lifecycle/requests           - Create new request
GET    /api/v1/lifecycle/requests           - List requests (filtered)
GET    /api/v1/lifecycle/requests/:id       - Get request details
PATCH  /api/v1/lifecycle/requests/:id       - Update request
POST   /api/v1/lifecycle/requests/:id/approve - Approve request
POST   /api/v1/lifecycle/requests/:id/reject  - Reject request
DELETE /api/v1/lifecycle/requests/:id       - Cancel request
```

### Tasks
```
GET    /api/v1/lifecycle/tasks              - List tasks (my tasks, team, all)
GET    /api/v1/lifecycle/tasks/:id          - Get task details
PATCH  /api/v1/lifecycle/tasks/:id          - Update task
POST   /api/v1/lifecycle/tasks/:id/complete - Complete task
POST   /api/v1/lifecycle/tasks/:id/skip     - Skip task (with reason)
```

### Training
```
GET    /api/v1/lifecycle/training           - List training content
POST   /api/v1/lifecycle/training           - Create training content
GET    /api/v1/lifecycle/training/:id       - Get content details
PUT    /api/v1/lifecycle/training/:id       - Update content
DELETE /api/v1/lifecycle/training/:id       - Delete content
POST   /api/v1/lifecycle/training/:id/assign - Assign to users
GET    /api/v1/lifecycle/training/progress  - Get user progress
POST   /api/v1/lifecycle/training/:id/complete - Mark completed
POST   /api/v1/lifecycle/training/:id/acknowledge - Accept terms
```

### Dashboard
```
GET    /api/v1/lifecycle/dashboard/hr       - HR dashboard data
GET    /api/v1/lifecycle/dashboard/manager  - Manager dashboard data
GET    /api/v1/lifecycle/dashboard/user     - User portal data
```

## Integration Points

### With Existing Services

1. **ScheduledActionService**: Create scheduled_user_actions for system tasks
2. **UserOnboardingService**: Execute account creation, group additions
3. **EmailService**: Send notifications and templated emails
4. **LifecycleLogService**: Log all actions for audit

### With Optional Integrations

1. **Google Workspace**: Create accounts, add to groups (if enabled)
2. **Microsoft 365**: Create accounts, add to teams (if enabled)
3. **Slack**: Send notifications (future)

## Security Considerations

1. **Role-Based Access**:
   - Admins: Full access to all requests and tasks
   - HR: Create requests, view all, complete HR tasks
   - Managers: View team requests, complete manager tasks
   - Users: View own onboarding, complete user tasks

2. **Data Privacy**:
   - Personal email stored securely (for pre-start comms)
   - Training acknowledgments include IP/timestamp for compliance
   - Audit trail for all task completions

3. **Validation**:
   - Start date must be in future for new requests
   - Template must exist and be active
   - Assignee must have appropriate role
