# Resources Module (Replacing IT Assets)

**Status:** Proposed
**Priority:** Medium
**Author:** AI Agent
**Date:** 2025-12-26

## Summary

Rename "IT Assets" to "Resources" and expand scope to include:
- Media files (images, videos, audio)
- Documents (PDFs, training materials)
- HTML content (internal wikis, guides)
- Training courses with completion tracking
- Onboarding resources with task integration

## Problem Statement

Current "IT Assets" is too narrow:
- Only designed for hardware/software inventory
- Doesn't support training materials
- No connection to onboarding workflows
- Can't track completion rates
- No video/media hosting

## Proposed Solution

### Resource Types

| Type | Examples | Features |
|------|----------|----------|
| **Media** | Images, videos, audio | Streaming, thumbnails, transcoding |
| **Documents** | PDFs, Word, slides | Preview, download, versioning |
| **HTML** | Wikis, guides, policies | WYSIWYG editor, internal links |
| **Training** | Courses, modules, quizzes | Progress tracking, completion certificates |
| **Links** | External resources | Bookmarking, availability check |

### Training Integration with Onboarding

```typescript
interface OnboardingTemplate {
  id: string;
  name: string;
  steps: OnboardingStep[];
}

interface OnboardingStep {
  id: string;
  type: 'task' | 'training' | 'document' | 'approval';

  // For training type
  trainingResource?: {
    resourceId: string;
    requiredCompletion: number; // 0-100%
    deadline: 'day_1' | 'day_3' | 'day_5' | 'week_1' | 'week_2' | 'custom';
  };

  // For document type
  documentResource?: {
    resourceId: string;
    requireAcknowledgment: boolean;
  };
}
```

### Example Onboarding Flow

```
Day 1: IT Setup
  ├── ✅ Task: Receive laptop
  ├── ✅ Task: Set up email
  └── 📚 Training: "Security Awareness 101" (required by Day 3)

Day 1-3: Company Orientation
  ├── 📄 Document: Employee Handbook (acknowledge)
  ├── 📄 Document: Code of Conduct (acknowledge)
  └── 📚 Training: "Company Culture" video (required by Day 5)

Week 1: Role Training
  ├── 📚 Training: "Sales Process Overview" (required by Week 2)
  └── 📚 Training: "CRM Training" (required by Week 2)

Week 2: Compliance
  └── 📚 Training: "Data Protection & GDPR" (required, certificate)
```

### Completion Tracking

```typescript
interface ResourceCompletion {
  id: string;
  userId: string;
  resourceId: string;

  // Progress
  startedAt?: Date;
  lastAccessAt?: Date;
  progressPercent: number;
  completedAt?: Date;

  // For videos
  watchedSeconds?: number;
  totalSeconds?: number;

  // For quizzes
  quizScore?: number;
  quizPassed?: boolean;

  // For documents
  acknowledged?: boolean;
  acknowledgedAt?: Date;

  // Certificate
  certificateIssued?: boolean;
  certificateUrl?: string;
}
```

### Dashboard Widgets

**Training Completion Widget:**
```
┌─────────────────────────────────────┐
│ Training Completion                 │
├─────────────────────────────────────┤
│ Security Awareness    ████████░░ 80%│
│ GDPR Training         ██████████ 100%│
│ Sales Process         ██████░░░░ 60%│
│                                     │
│ 45 users │ 38 completed │ 7 pending │
└─────────────────────────────────────┘
```

**New Hire Onboarding Widget:**
```
┌─────────────────────────────────────┐
│ New Hire Progress                   │
├─────────────────────────────────────┤
│ Jane Smith (Day 3)    ████████░░ 75%│
│   └── Pending: Security Training    │
│ Bob Jones (Day 5)     ██████████ 100%│
│   └── Complete!                     │
│ Alice Brown (Day 1)   ██░░░░░░░░ 20%│
│   └── In progress: IT Setup         │
└─────────────────────────────────────┘
```

## Database Schema

```sql
-- Resource categories
CREATE TABLE resource_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES resource_categories(id),
  icon VARCHAR(50),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Resources (files, links, training)
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Classification
  type VARCHAR(20) NOT NULL,  -- 'media', 'document', 'html', 'training', 'link'
  category_id UUID REFERENCES resource_categories(id),

  -- Metadata
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url VARCHAR(500),

  -- Storage
  storage_type VARCHAR(20),  -- 's3', 'link', 'html'
  storage_path VARCHAR(500),
  external_url VARCHAR(500),
  html_content TEXT,

  -- Media info
  file_size BIGINT,
  mime_type VARCHAR(100),
  duration_seconds INT,  -- For video/audio

  -- Training specific
  is_training BOOLEAN DEFAULT FALSE,
  training_type VARCHAR(20),  -- 'video', 'document', 'course', 'quiz'
  passing_score INT,  -- For quizzes
  certificate_template_id UUID,

  -- Access control
  visibility VARCHAR(20) DEFAULT 'organization',  -- 'organization', 'department', 'role', 'specific'
  allowed_departments TEXT[],
  allowed_roles TEXT[],
  allowed_user_ids UUID[],

  -- Status
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  -- Audit
  created_by UUID NOT NULL REFERENCES organization_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Resource completion tracking
CREATE TABLE resource_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id),
  resource_id UUID NOT NULL REFERENCES resources(id),

  -- Progress
  started_at TIMESTAMPTZ,
  last_access_at TIMESTAMPTZ,
  progress_percent INT DEFAULT 0,
  completed_at TIMESTAMPTZ,

  -- Video tracking
  watched_seconds INT DEFAULT 0,

  -- Quiz tracking
  quiz_attempts INT DEFAULT 0,
  quiz_best_score INT,
  quiz_passed BOOLEAN,

  -- Document acknowledgment
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,

  -- Certificate
  certificate_issued BOOLEAN DEFAULT FALSE,
  certificate_url VARCHAR(500),
  certificate_issued_at TIMESTAMPTZ,

  -- Onboarding context
  onboarding_instance_id UUID,
  deadline TIMESTAMPTZ,
  overdue_notified BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, resource_id)
);

-- Training courses (multi-module)
CREATE TABLE training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url VARCHAR(500),
  estimated_duration_minutes INT,
  passing_score INT DEFAULT 80,
  certificate_template_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course modules
CREATE TABLE course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES training_courses(id),
  resource_id UUID NOT NULL REFERENCES resources(id),
  title VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL,
  is_required BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Course completion
CREATE TABLE course_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id),
  course_id UUID NOT NULL REFERENCES training_courses(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  modules_completed INT DEFAULT 0,
  total_modules INT NOT NULL,
  quiz_score INT,
  certificate_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, course_id)
);

-- Onboarding template resources
CREATE TABLE onboarding_template_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES onboarding_templates(id),
  resource_id UUID REFERENCES resources(id),
  course_id UUID REFERENCES training_courses(id),

  step_order INT NOT NULL,
  step_type VARCHAR(20) NOT NULL,  -- 'training', 'document', 'acknowledge'

  deadline_type VARCHAR(20),  -- 'day_1', 'day_3', 'day_5', 'week_1', 'week_2', 'custom'
  deadline_days INT,

  is_required BOOLEAN DEFAULT TRUE,

  CHECK (resource_id IS NOT NULL OR course_id IS NOT NULL)
);
```

## UI Components

### Resources Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Resources                                    [+ Add Resource]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [All] [Media] [Documents] [Training] [Links]               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🔍 Search resources...                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Categories          │  Resources                            │
│  ─────────────────   │  ─────────────────────────────────   │
│  📁 Onboarding       │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│  📁 Training         │  │ 🎬  │ │ 📄  │ │ 🎓  │ │ 🔗  │    │
│     └─ Compliance    │  │Video│ │ Doc │ │Train│ │Link │    │
│     └─ Sales         │  └─────┘ └─────┘ └─────┘ └─────┘    │
│  📁 Policies         │                                      │
│  📁 Brand Assets     │  Security    Employee   GDPR        │
│                      │  Awareness   Handbook   Training    │
│                      │  80% done    Required   Certificate │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Training Resource View

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back                                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │                                                     │     │
│  │              [Video Player]                         │     │
│  │                                                     │     │
│  │  ▶ 0:00 ━━━━━━━━━━━○━━━━━━━━━━━ 15:30             │     │
│  │                                                     │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
│  Security Awareness Training                                 │
│  Duration: 15 minutes │ Required for: All Staff             │
│                                                              │
│  Your Progress: ████████░░ 80%                              │
│  Deadline: December 30, 2025                                │
│                                                              │
│  [Continue Watching]  [Mark Complete]                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

```
# Resources
GET    /api/v1/resources
POST   /api/v1/resources
GET    /api/v1/resources/:id
PUT    /api/v1/resources/:id
DELETE /api/v1/resources/:id
POST   /api/v1/resources/:id/upload

# Categories
GET    /api/v1/resources/categories
POST   /api/v1/resources/categories
PUT    /api/v1/resources/categories/:id
DELETE /api/v1/resources/categories/:id

# Completion Tracking
GET    /api/v1/resources/:id/progress
POST   /api/v1/resources/:id/progress
POST   /api/v1/resources/:id/acknowledge
POST   /api/v1/resources/:id/complete

# Training Courses
GET    /api/v1/training/courses
POST   /api/v1/training/courses
GET    /api/v1/training/courses/:id
PUT    /api/v1/training/courses/:id

# Reports
GET    /api/v1/training/completion-report
GET    /api/v1/training/overdue-report
GET    /api/v1/onboarding/progress-report
```

## Implementation Tasks

### Phase 1: Core Resources (Week 1)
- [ ] Rename IT Assets to Resources in UI
- [ ] Create resources database tables
- [ ] Implement file upload to MinIO
- [ ] Create resource CRUD API
- [ ] Build resource list/grid view
- [ ] Add category management

### Phase 2: Media Support (Week 1-2)
- [ ] Add video player component
- [ ] Add thumbnail generation
- [ ] Add document preview (PDF)
- [ ] Add audio player

### Phase 3: Training Module (Week 2-3)
- [ ] Add completion tracking tables
- [ ] Build training resource view
- [ ] Add progress tracking API
- [ ] Build completion widget
- [ ] Add deadline notifications

### Phase 4: Onboarding Integration (Week 3)
- [ ] Add resources to onboarding templates
- [ ] Connect completion to onboarding progress
- [ ] Build onboarding training view
- [ ] Add overdue alerts

### Phase 5: Reporting (Week 4)
- [ ] Build completion reports
- [ ] Add dashboard widgets
- [ ] Create certificate generation
- [ ] Export functionality

## Success Metrics

| Metric | Target |
|--------|--------|
| Resources uploaded | 50+ per org |
| Training completion rate | 90%+ |
| Onboarding with training | 80% of templates |
| Average training duration tracked | 95%+ accuracy |
